import { loadEnvFile } from "node:process";

import { defineConfig } from "drizzle-kit";
import { z } from "zod";

const testMigrationEnvironmentSchema = z
  .object({
    DATABASE_MIGRATION_URL: z.url({
      protocol: /^postgres(?:ql)?$/,
    }),
  })
  .superRefine((environment, context) => {
    const url = new URL(environment.DATABASE_MIGRATION_URL);
    const role = decodeURIComponent(url.username);
    const database = decodeURIComponent(url.pathname.slice(1));

    if (role !== "migration_owner") {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_MIGRATION_URL"],
        message:
          'Test DATABASE_MIGRATION_URL must use the PostgreSQL role "migration_owner".',
      });
    }

    if (database !== "personal_management_test") {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_MIGRATION_URL"],
        message:
          'Test DATABASE_MIGRATION_URL must target "personal_management_test".',
      });
    }
  });

function loadTestMigrationEnvironment() {
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

  const result = testMigrationEnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "environment";

        return `${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid test migration environment:\n${details}`);
  }

  return result.data;
}

const environment = loadTestMigrationEnvironment();

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
