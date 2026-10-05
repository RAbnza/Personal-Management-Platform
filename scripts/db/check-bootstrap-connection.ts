import { loadEnvFile } from "node:process";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

const bootstrapEnvironmentSchema = z.object({
  DATABASE_BOOTSTRAP_URL: z.url({
    protocol: /^postgres(?:ql)?$/,
  }),
});

function loadBootstrapEnvironment() {
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

async function main() {
  const environment = loadBootstrapEnvironment();

  const pool = new Pool({
    connectionString: environment.DATABASE_BOOTSTRAP_URL,
    application_name: "pmp-db-bootstrap-check",
    max: 1,
  });

  const db = drizzle({ client: pool });

  try {
    await db.execute(sql`select 1`);

    const result = await pool.query<{
      database_name: string;
      user_name: string;
      server_version: string;
      server_address: string | null;
      server_port: number;
    }>(`
      SELECT
        current_database() AS database_name,
        current_user AS user_name,
        current_setting('server_version') AS server_version,
        inet_server_addr()::text AS server_address,
        inet_server_port() AS server_port
    `);

    const connection = result.rows[0];

    if (!connection) {
      throw new Error("PostgreSQL returned no connection information.");
    }

    console.log("Bootstrap database connection successful.");
    console.log(`Database: ${connection.database_name}`);
    console.log(`Role: ${connection.user_name}`);
    console.log(`PostgreSQL: ${connection.server_version}`);
    console.log(
      `Server: ${connection.server_address ?? "local socket"}:${connection.server_port}`,
    );
    console.log("Drizzle ORM: connection verified.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown database connection error.";

  console.error(message);
  process.exitCode = 1;
});
