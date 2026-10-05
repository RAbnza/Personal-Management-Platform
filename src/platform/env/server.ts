import { z } from "zod";

const postgresUrlSchema = z.url({
  protocol: /^postgres(?:ql)?$/,
});

const serverEnvironmentSchema = z
  .object({
    DATABASE_URL: postgresUrlSchema,
    AUTH_DATABASE_URL: postgresUrlSchema,
  })
  .superRefine((environment, context) => {
    const domainRole = decodeURIComponent(
      new URL(environment.DATABASE_URL).username,
    );

    if (domainRole !== "app_domain") {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message:
          'DATABASE_URL must use the restricted PostgreSQL role "app_domain".',
      });
    }

    const authRole = decodeURIComponent(
      new URL(environment.AUTH_DATABASE_URL).username,
    );

    if (authRole !== "auth_adapter") {
      context.addIssue({
        code: "custom",
        path: ["AUTH_DATABASE_URL"],
        message:
          'AUTH_DATABASE_URL must use the restricted PostgreSQL role "auth_adapter".',
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let cachedServerEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  if (cachedServerEnvironment) {
    return cachedServerEnvironment;
  }

  const result = serverEnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "environment";

        return `${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid server environment:\n${details}`);
  }

  cachedServerEnvironment = result.data;

  return cachedServerEnvironment;
}
