import { loadEnvFile } from "node:process";

import { Client } from "pg";
import { z } from "zod";

const databaseUrlSchema = z.url({
  protocol: /^postgres(?:ql)?$/,
});

const rolePasswordSchema = z
  .string()
  .min(20, "Database role passwords must contain at least 20 characters.");

const bootstrapEnvironmentSchema = z.object({
  DATABASE_BOOTSTRAP_URL: databaseUrlSchema,
  MIGRATION_OWNER_PASSWORD: rolePasswordSchema,
  APP_DOMAIN_PASSWORD: rolePasswordSchema,
  AUTH_ADAPTER_PASSWORD: rolePasswordSchema,
  QUEUE_BROKER_PASSWORD: rolePasswordSchema,
  WORKER_DOMAIN_PASSWORD: rolePasswordSchema,
  LIFECYCLE_OPERATOR_PASSWORD: rolePasswordSchema,
});

type BootstrapEnvironment = z.infer<typeof bootstrapEnvironmentSchema>;

const roles = [
  {
    name: "migration_owner",
    passwordKey: "MIGRATION_OWNER_PASSWORD",
    mayCreateDatabaseObjects: true,
  },
  {
    name: "app_domain",
    passwordKey: "APP_DOMAIN_PASSWORD",
    mayCreateDatabaseObjects: false,
  },
  {
    name: "auth_adapter",
    passwordKey: "AUTH_ADAPTER_PASSWORD",
    mayCreateDatabaseObjects: false,
  },
  {
    name: "queue_broker",
    passwordKey: "QUEUE_BROKER_PASSWORD",
    mayCreateDatabaseObjects: false,
  },
  {
    name: "worker_domain",
    passwordKey: "WORKER_DOMAIN_PASSWORD",
    mayCreateDatabaseObjects: false,
  },
  {
    name: "lifecycle_operator",
    passwordKey: "LIFECYCLE_OPERATOR_PASSWORD",
    mayCreateDatabaseObjects: false,
  },
] as const;

function loadBootstrapEnvironment(): BootstrapEnvironment {
  try {
    loadEnvFile(".env.bootstrap");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      throw new Error(
        "Missing .env.bootstrap. Copy .env.bootstrap.example to .env.bootstrap first.",
      );
    }

    throw error;
  }

  const result = bootstrapEnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "environment";

        return `${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid bootstrap database environment:\n${details}`);
  }

  return result.data;
}

function createRoleConnectionString(
  bootstrapConnectionString: string,
  roleName: string,
  password: string,
) {
  const url = new URL(bootstrapConnectionString);

  url.username = roleName;
  url.password = password;

  return url.toString();
}

async function verifyBootstrapPrivileges(client: Client) {
  const result = await client.query<{
    user_name: string;
    is_superuser: boolean;
    can_create_roles: boolean;
    owns_database: boolean;
  }>(`
    SELECT
      current_user AS user_name,
      role.rolsuper AS is_superuser,
      role.rolcreaterole AS can_create_roles,
      database.datdba = role.oid AS owns_database
    FROM pg_roles AS role
    JOIN pg_database AS database
      ON database.datname = current_database()
    WHERE role.rolname = current_user
  `);

  const bootstrapRole = result.rows[0];

  if (!bootstrapRole) {
    throw new Error("Could not inspect the PostgreSQL bootstrap role.");
  }

  const mayManageRoles =
    bootstrapRole.is_superuser || bootstrapRole.can_create_roles;

  const mayManageDatabase =
    bootstrapRole.is_superuser || bootstrapRole.owns_database;

  if (!mayManageRoles || !mayManageDatabase) {
    throw new Error(
      `Bootstrap role "${bootstrapRole.user_name}" does not have the privileges required to provision database roles.`,
    );
  }
}

async function provisionRoles(
  client: Client,
  environment: BootstrapEnvironment,
) {
  await client.query("BEGIN");

  try {
    for (const role of roles) {
      const password = environment[role.passwordKey];
      const settingName = `pmp.bootstrap.${role.name}_password`;

      await client.query("SELECT set_config($1, $2, true)", [
        settingName,
        password,
      ]);
    }

    await client.query(`
      DO $provision$
      DECLARE
        database_name text := current_database();
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'migration_owner'
        ) THEN
          CREATE ROLE migration_owner;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'app_domain'
        ) THEN
          CREATE ROLE app_domain;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'auth_adapter'
        ) THEN
          CREATE ROLE auth_adapter;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'queue_broker'
        ) THEN
          CREATE ROLE queue_broker;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'worker_domain'
        ) THEN
          CREATE ROLE worker_domain;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'lifecycle_operator'
        ) THEN
          CREATE ROLE lifecycle_operator;
        END IF;

        ALTER ROLE migration_owner
          WITH LOGIN
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;

        ALTER ROLE app_domain
          WITH LOGIN
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;

        ALTER ROLE auth_adapter
          WITH LOGIN
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;

        ALTER ROLE queue_broker
          WITH LOGIN
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;

        ALTER ROLE worker_domain
          WITH LOGIN
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;

        ALTER ROLE lifecycle_operator
          WITH LOGIN
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOINHERIT
          NOREPLICATION
          NOBYPASSRLS;

        EXECUTE format(
          'ALTER ROLE migration_owner PASSWORD %L',
          current_setting('pmp.bootstrap.migration_owner_password')
        );

        EXECUTE format(
          'ALTER ROLE app_domain PASSWORD %L',
          current_setting('pmp.bootstrap.app_domain_password')
        );

        EXECUTE format(
          'ALTER ROLE auth_adapter PASSWORD %L',
          current_setting('pmp.bootstrap.auth_adapter_password')
        );

        EXECUTE format(
          'ALTER ROLE queue_broker PASSWORD %L',
          current_setting('pmp.bootstrap.queue_broker_password')
        );

        EXECUTE format(
          'ALTER ROLE worker_domain PASSWORD %L',
          current_setting('pmp.bootstrap.worker_domain_password')
        );

        EXECUTE format(
          'ALTER ROLE lifecycle_operator PASSWORD %L',
          current_setting('pmp.bootstrap.lifecycle_operator_password')
        );

        /*
         * Make database connection privileges explicit rather than relying on
         * PostgreSQL's default PUBLIC CONNECT/TEMPORARY grants.
         */
        EXECUTE format(
          'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC',
          database_name
        );

        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON DATABASE %I FROM migration_owner',
          database_name
        );

        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON DATABASE %I FROM app_domain',
          database_name
        );

        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON DATABASE %I FROM auth_adapter',
          database_name
        );

        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON DATABASE %I FROM queue_broker',
          database_name
        );

        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON DATABASE %I FROM worker_domain',
          database_name
        );

        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON DATABASE %I FROM lifecycle_operator',
          database_name
        );

        EXECUTE format(
          'GRANT CONNECT, CREATE ON DATABASE %I TO migration_owner',
          database_name
        );

        EXECUTE format(
          'GRANT CONNECT ON DATABASE %I TO app_domain',
          database_name
        );

        EXECUTE format(
          'GRANT CONNECT ON DATABASE %I TO auth_adapter',
          database_name
        );

        EXECUTE format(
          'GRANT CONNECT ON DATABASE %I TO queue_broker',
          database_name
        );

        EXECUTE format(
          'GRANT CONNECT ON DATABASE %I TO worker_domain',
          database_name
        );

        EXECUTE format(
          'GRANT CONNECT ON DATABASE %I TO lifecycle_operator',
          database_name
        );

        /*
         * Application objects must live in explicit owned schemas rather than
         * being created accidentally in the default public schema.
         */
        REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      END
      $provision$;
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function verifyRoleAttributes(client: Client) {
  const roleNames = roles.map((role) => role.name);

  const result = await client.query<{
    rolname: string;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolinherit: boolean;
    rolcanlogin: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    can_connect: boolean;
    can_create: boolean;
    can_temporary: boolean;
  }>(
    `
      SELECT
        role.rolname,
        role.rolsuper,
        role.rolcreatedb,
        role.rolcreaterole,
        role.rolinherit,
        role.rolcanlogin,
        role.rolreplication,
        role.rolbypassrls,
        has_database_privilege(
          role.rolname,
          current_database(),
          'CONNECT'
        ) AS can_connect,
        has_database_privilege(
          role.rolname,
          current_database(),
          'CREATE'
        ) AS can_create,
        has_database_privilege(
          role.rolname,
          current_database(),
          'TEMPORARY'
        ) AS can_temporary
      FROM pg_roles AS role
      WHERE role.rolname = ANY($1::text[])
      ORDER BY role.rolname
    `,
    [roleNames],
  );

  if (result.rows.length !== roles.length) {
    throw new Error("One or more required database roles were not created.");
  }

  for (const role of roles) {
    const actual = result.rows.find((row) => row.rolname === role.name);

    if (!actual) {
      throw new Error(`Database role "${role.name}" was not found.`);
    }

    const hasDangerousAttribute =
      actual.rolsuper ||
      actual.rolcreatedb ||
      actual.rolcreaterole ||
      actual.rolreplication ||
      actual.rolbypassrls;

    if (hasDangerousAttribute) {
      throw new Error(
        `Database role "${role.name}" has an unexpected elevated PostgreSQL attribute.`,
      );
    }

    if (!actual.rolcanlogin) {
      throw new Error(`Database role "${role.name}" cannot log in.`);
    }

    if (actual.rolinherit) {
      throw new Error(
        `Database role "${role.name}" unexpectedly inherits role memberships.`,
      );
    }

    if (!actual.can_connect) {
      throw new Error(
        `Database role "${role.name}" cannot connect to the application database.`,
      );
    }

    if (actual.can_temporary) {
      throw new Error(
        `Database role "${role.name}" unexpectedly has TEMPORARY database privileges.`,
      );
    }

    if (actual.can_create !== role.mayCreateDatabaseObjects) {
      throw new Error(
        `Database role "${role.name}" has an unexpected database CREATE privilege.`,
      );
    }
  }
}

async function verifyNoRoleMemberships(client: Client) {
  const roleNames = roles.map((role) => role.name);

  const result = await client.query<{
    member_name: string;
    granted_role_name: string;
  }>(
    `
      SELECT
        member.rolname AS member_name,
        granted.rolname AS granted_role_name
      FROM pg_auth_members AS membership
      JOIN pg_roles AS member
        ON member.oid = membership.member
      JOIN pg_roles AS granted
        ON granted.oid = membership.roleid
      WHERE member.rolname = ANY($1::text[])
      ORDER BY member.rolname, granted.rolname
    `,
    [roleNames],
  );

  if (result.rows.length > 0) {
    const memberships = result.rows
      .map(
        (membership) =>
          `${membership.member_name} -> ${membership.granted_role_name}`,
      )
      .join(", ");

    throw new Error(
      `Runtime database roles must not inherit or switch into other roles. Found memberships: ${memberships}`,
    );
  }
}

async function verifyRoleLogins(environment: BootstrapEnvironment) {
  for (const role of roles) {
    const connectionString = createRoleConnectionString(
      environment.DATABASE_BOOTSTRAP_URL,
      role.name,
      environment[role.passwordKey],
    );

    const client = new Client({
      connectionString,
      application_name: `pmp-role-check-${role.name}`,
    });

    try {
      await client.connect();

      const result = await client.query<{
        user_name: string;
        database_name: string;
      }>(`
        SELECT
          current_user AS user_name,
          current_database() AS database_name
      `);

      const connection = result.rows[0];

      if (!connection || connection.user_name !== role.name) {
        throw new Error(
          `Login verification failed for database role "${role.name}".`,
        );
      }
    } finally {
      await client.end();
    }
  }
}

async function main() {
  const environment = loadBootstrapEnvironment();

  const bootstrapClient = new Client({
    connectionString: environment.DATABASE_BOOTSTRAP_URL,
    application_name: "pmp-db-role-provisioner",
  });

  try {
    await bootstrapClient.connect();

    await verifyBootstrapPrivileges(bootstrapClient);
    await provisionRoles(bootstrapClient, environment);
    await verifyRoleAttributes(bootstrapClient);
    await verifyNoRoleMemberships(bootstrapClient);
  } finally {
    await bootstrapClient.end();
  }

  await verifyRoleLogins(environment);

  console.log("Database roles provisioned and verified.");
  console.log(
    "migration_owner: LOGIN, CONNECT, CREATE; no elevated PostgreSQL attributes.",
  );
  console.log(
    "app_domain: LOGIN, CONNECT only; no elevated PostgreSQL attributes.",
  );
  console.log(
    "auth_adapter: LOGIN, CONNECT only; no elevated PostgreSQL attributes.",
  );
  console.log(
    "queue_broker: LOGIN, CONNECT only; no elevated PostgreSQL attributes.",
  );
  console.log(
    "worker_domain: LOGIN, CONNECT only; no elevated PostgreSQL attributes.",
  );
  console.log(
    "lifecycle_operator: LOGIN, CONNECT only; no elevated PostgreSQL attributes.",
  );
}

main().catch(() => {
  console.error("Database role provisioning failed.");
  process.exitCode = 1;
});
