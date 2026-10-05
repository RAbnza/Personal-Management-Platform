import { loadEnvFile } from "node:process";

import { Client } from "pg";
import { z } from "zod";

const TEST_DATABASE_NAME = "personal_management_test";

const requiredRoles = [
  "migration_owner",
  "app_domain",
  "auth_adapter",
  "queue_broker",
  "worker_domain",
  "lifecycle_operator",
] as const;

const testEnvironmentSchema = z.object({
  TEST_DATABASE_ADMIN_URL: z.url({
    protocol: /^postgres(?:ql)?$/,
  }),
});

type TestEnvironment = z.infer<typeof testEnvironmentSchema>;

function loadTestEnvironment(): TestEnvironment {
  try {
    loadEnvFile(".env.test");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      throw new Error(
        "Missing .env.test. Copy .env.test.example to .env.test first.",
      );
    }

    throw error;
  }

  const result = testEnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "environment";

        return `${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid test database environment:\n${details}`);
  }

  return result.data;
}

function createDatabaseConnectionString(
  connectionString: string,
  databaseName: string,
) {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

async function verifyAdministratorPrivileges(client: Client) {
  const result = await client.query<{
    user_name: string;
    is_superuser: boolean;
    can_create_database: boolean;
  }>(`
    SELECT
      current_user AS user_name,
      rolsuper AS is_superuser,
      rolcreatedb AS can_create_database
    FROM pg_roles
    WHERE rolname = current_user
  `);

  const administrator = result.rows[0];

  if (!administrator) {
    throw new Error("Could not inspect the PostgreSQL administrator role.");
  }

  if (!administrator.is_superuser && !administrator.can_create_database) {
    throw new Error(
      `PostgreSQL role "${administrator.user_name}" cannot create the integration-test database.`,
    );
  }
}

async function createTestDatabaseIfMissing(client: Client) {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_database
        WHERE datname = $1
      ) AS exists
    `,
    [TEST_DATABASE_NAME],
  );

  if (result.rows[0]?.exists) {
    console.log(`Test database "${TEST_DATABASE_NAME}" already exists.`);
    return;
  }

  await client.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);

  console.log(`Created test database "${TEST_DATABASE_NAME}".`);
}

async function verifyRequiredRoles(client: Client) {
  const result = await client.query<{
    rolname: string;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolinherit: boolean;
    rolcanlogin: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
  }>(
    `
      SELECT
        rolname,
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolinherit,
        rolcanlogin,
        rolreplication,
        rolbypassrls
      FROM pg_roles
      WHERE rolname = ANY($1::text[])
      ORDER BY rolname
    `,
    [requiredRoles],
  );

  if (result.rows.length !== requiredRoles.length) {
    throw new Error(
      "One or more application database roles are missing. Run pnpm db:provision:roles against the development database first.",
    );
  }

  for (const role of result.rows) {
    const hasDangerousAttribute =
      role.rolsuper ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      role.rolreplication ||
      role.rolbypassrls;

    if (hasDangerousAttribute) {
      throw new Error(
        `Database role "${role.rolname}" has an unexpected elevated PostgreSQL attribute.`,
      );
    }

    if (!role.rolcanlogin) {
      throw new Error(`Database role "${role.rolname}" cannot log in.`);
    }

    if (role.rolinherit) {
      throw new Error(
        `Database role "${role.rolname}" unexpectedly inherits role memberships.`,
      );
    }
  }
}

async function provisionTestDatabase(client: Client) {
  await client.query("BEGIN");

  try {
    await client.query(`
      REVOKE CONNECT, TEMPORARY
      ON DATABASE personal_management_test
      FROM PUBLIC;

      REVOKE ALL PRIVILEGES
      ON DATABASE personal_management_test
      FROM migration_owner;

      REVOKE ALL PRIVILEGES
      ON DATABASE personal_management_test
      FROM app_domain;

      REVOKE ALL PRIVILEGES
      ON DATABASE personal_management_test
      FROM auth_adapter;

      REVOKE ALL PRIVILEGES
      ON DATABASE personal_management_test
      FROM queue_broker;

      REVOKE ALL PRIVILEGES
      ON DATABASE personal_management_test
      FROM worker_domain;

      REVOKE ALL PRIVILEGES
      ON DATABASE personal_management_test
      FROM lifecycle_operator;

      GRANT CONNECT, CREATE
      ON DATABASE personal_management_test
      TO migration_owner;

      GRANT CONNECT
      ON DATABASE personal_management_test
      TO app_domain;

      GRANT CONNECT
      ON DATABASE personal_management_test
      TO auth_adapter;

      GRANT CONNECT
      ON DATABASE personal_management_test
      TO queue_broker;

      GRANT CONNECT
      ON DATABASE personal_management_test
      TO worker_domain;

      GRANT CONNECT
      ON DATABASE personal_management_test
      TO lifecycle_operator;

      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function verifyTestDatabasePrivileges(client: Client) {
  const result = await client.query<{
    rolname: string;
    can_connect: boolean;
    can_create: boolean;
    can_temporary: boolean;
  }>(
    `
      SELECT
        role.rolname,
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
    [requiredRoles],
  );

  for (const role of result.rows) {
    if (!role.can_connect) {
      throw new Error(
        `Database role "${role.rolname}" cannot connect to the test database.`,
      );
    }

    const shouldCreate = role.rolname === "migration_owner";

    if (role.can_create !== shouldCreate) {
      throw new Error(
        `Database role "${role.rolname}" has an unexpected CREATE privilege on the test database.`,
      );
    }

    if (role.can_temporary) {
      throw new Error(
        `Database role "${role.rolname}" unexpectedly has TEMPORARY privileges on the test database.`,
      );
    }
  }
}

async function main() {
  const environment = loadTestEnvironment();

  const administrator = new Client({
    connectionString: environment.TEST_DATABASE_ADMIN_URL,
    application_name: "pmp-test-database-creator",
  });

  try {
    await administrator.connect();
    await verifyAdministratorPrivileges(administrator);
    await verifyRequiredRoles(administrator);
    await createTestDatabaseIfMissing(administrator);
  } finally {
    await administrator.end();
  }

  const testDatabaseAdministrator = new Client({
    connectionString: createDatabaseConnectionString(
      environment.TEST_DATABASE_ADMIN_URL,
      TEST_DATABASE_NAME,
    ),
    application_name: "pmp-test-database-provisioner",
  });

  try {
    await testDatabaseAdministrator.connect();
    await provisionTestDatabase(testDatabaseAdministrator);
    await verifyTestDatabasePrivileges(testDatabaseAdministrator);
  } finally {
    await testDatabaseAdministrator.end();
  }

  console.log("Integration-test database provisioned and verified.");
  console.log(`Database: ${TEST_DATABASE_NAME}`);
  console.log("migration_owner: CONNECT, CREATE");
  console.log("Runtime roles: CONNECT only");
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown test database provisioning error.";

  console.error(message);
  process.exitCode = 1;
});
