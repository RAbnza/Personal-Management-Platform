import { z } from "zod";

const postgresUrlSchema = z.url({
  protocol: /^postgres(?:ql)?$/,
});

const httpUrlSchema = z.url({
  protocol: /^https?$/,
});

const emailFromNameSchema = z
  .string()
  .trim()
  .min(1, "EMAIL_FROM_NAME must not be empty.")
  .max(100, "EMAIL_FROM_NAME must not exceed 100 characters.")
  .refine(
    (value) => !/[\r\n]/.test(value),
    "EMAIL_FROM_NAME must not contain line breaks.",
  );

const serverEnvironmentSchema = z
  .object({
    DATABASE_URL: postgresUrlSchema,
    AUTH_DATABASE_URL: postgresUrlSchema,

    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must contain at least 32 characters."),
    BETTER_AUTH_URL: httpUrlSchema,

    EMAIL_PROVIDER: z.enum(["mailpit", "resend"]),
    EMAIL_FROM_ADDRESS: z.email(),
    EMAIL_FROM_NAME: emailFromNameSchema,

    MAILPIT_API_URL: httpUrlSchema.optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
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

    if (
      environment.EMAIL_PROVIDER === "mailpit" &&
      !environment.MAILPIT_API_URL
    ) {
      context.addIssue({
        code: "custom",
        path: ["MAILPIT_API_URL"],
        message: "MAILPIT_API_URL is required when EMAIL_PROVIDER is mailpit.",
      });
    }

    if (
      environment.EMAIL_PROVIDER === "resend" &&
      !environment.RESEND_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when EMAIL_PROVIDER is resend.",
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
