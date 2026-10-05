import { loadEnvFile } from "node:process";

import { defineConfig } from "drizzle-kit";
import { z } from "zod";

const migrationEnvironmentSchema = z.object({
  DATABASE_MIGRATION_URL: z.url({
    protocol: /^postgres(?:ql)?$/,
  }),
});

function loadMigrationEnvironment() {
  try {
    loadEnvFile(".env.migration");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      throw new Error(
        "Missing .env.migration. Copy .env.migration.example to .env.migration first.",
      );
    }

    throw error;
  }

  const result = migrationEnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "environment";

        return `${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid migration database environment:\n${details}`);
  }

  return result.data;
}

const environment = loadMigrationEnvironment();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/platform/db/schema/index.ts",
  out: "./src/platform/db/migrations",
  dbCredentials: {
    url: environment.DATABASE_MIGRATION_URL,
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  breakpoints: true,
  verbose: true,
});
