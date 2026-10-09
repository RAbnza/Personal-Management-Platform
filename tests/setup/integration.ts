import { loadEnvFile } from "node:process";

import { z } from "zod";

const TEST_DATABASE_NAME = "personal_management_test";

const integrationEnvironmentSchema = z
  .object({
    DATABASE_URL: z.url({
      protocol: /^postgres(?:ql)?$/,
    }),
    AUTH_DATABASE_URL: z.url({
      protocol: /^postgres(?:ql)?$/,
    }),
    DATABASE_MIGRATION_URL: z.url({
      protocol: /^postgres(?:ql)?$/,
    }),
  })
  .superRefine((environment, context) => {
    const connections = [
      {
        key: "DATABASE_URL",
        value: environment.DATABASE_URL,
        role: "app_domain",
      },
      {
        key: "AUTH_DATABASE_URL",
        value: environment.AUTH_DATABASE_URL,
        role: "auth_adapter",
      },
      {
        key: "DATABASE_MIGRATION_URL",
        value: environment.DATABASE_MIGRATION_URL,
        role: "migration_owner",
      },
    ] as const;

    for (const connection of connections) {
      const url = new URL(connection.value);
      const role = decodeURIComponent(url.username);
      const database = decodeURIComponent(url.pathname.slice(1));

      if (role !== connection.role) {
        context.addIssue({
          code: "custom",
          path: [connection.key],
          message: `${connection.key} must use PostgreSQL role "${connection.role}".`,
        });
      }

      if (database !== TEST_DATABASE_NAME) {
        context.addIssue({
          code: "custom",
          path: [connection.key],
          message: `${connection.key} must target "${TEST_DATABASE_NAME}".`,
        });
      }
    }
  });

try {
  loadEnvFile(".env.test");
} catch (error) {
  const nodeError = error as NodeJS.ErrnoException;

  if (nodeError.code === "ENOENT") {
    throw new Error(
      "Missing .env.test. Copy .env.test.example to .env.test before running integration tests.",
    );
  }

  throw error;
}

const result = integrationEnvironmentSchema.safeParse(process.env);
// Synthetic security-mail key; this setup refuses all non-test databases.
process.env.EMAIL_PAYLOAD_KEY ??= "12".repeat(32);
process.env.EMAIL_PAYLOAD_KEY_ID ??= "test-v1";
process.env.PMP_DEPLOYMENT_ENV = "test";

if (!result.success) {
  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "environment";

      return `${path}: ${issue.message}`;
    })
    .join("\n");

  throw new Error(`Invalid integration-test environment:\n${details}`);
}
