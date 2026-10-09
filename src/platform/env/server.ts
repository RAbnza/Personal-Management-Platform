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

const emailFields = {
  EMAIL_PROVIDER: z.enum(["mailpit", "resend"]),
  EMAIL_FROM_ADDRESS: z.email(),
  EMAIL_FROM_NAME: emailFromNameSchema,
  MAILPIT_API_URL: httpUrlSchema.optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
};
export function getEmailEnvironment() {
  const parsed = z.object(emailFields).safeParse(process.env);
  if (
    !parsed.success ||
    (parsed.data.EMAIL_PROVIDER === "mailpit"
      ? !parsed.data.MAILPIT_API_URL
      : !parsed.data.RESEND_API_KEY) ||
    (["staging", "production"].includes(
      process.env.PMP_DEPLOYMENT_ENV ?? "local",
    ) &&
      parsed.data.EMAIL_PROVIDER !== "resend")
  )
    throw new Error("Email delivery is not configured.");
  return parsed.data;
}

const serverEnvironmentSchema = z
  .object({
    PMP_DEPLOYMENT_ENV: z
      .enum(["local", "test", "staging", "production"])
      .default("local"),
    EMAIL_PAYLOAD_KEY: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    EMAIL_PAYLOAD_KEY_ID: z
      .string()
      .regex(/^[a-z0-9_-]{1,64}$/i)
      .optional(),
    DATABASE_URL: postgresUrlSchema,
    AUTH_DATABASE_URL: postgresUrlSchema,

    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must contain at least 32 characters."),
    BETTER_AUTH_URL: httpUrlSchema,

    ...emailFields,
    SUPPORT_EMAIL: z.email().optional(),
  })
  .superRefine((environment, context) => {
    if (["staging", "production"].includes(environment.PMP_DEPLOYMENT_ENV)) {
      for (const [key, valid, message] of [
        [
          "BETTER_AUTH_URL",
          new URL(environment.BETTER_AUTH_URL).protocol === "https:",
          "Deployed authentication requires HTTPS.",
        ],
        [
          "EMAIL_PROVIDER",
          environment.EMAIL_PROVIDER === "resend",
          "Deployed email requires a verified provider; Mailpit is local only.",
        ],
        [
          "EMAIL_PAYLOAD_KEY",
          !!environment.EMAIL_PAYLOAD_KEY,
          "Deployed security mail requires an independent encryption key.",
        ],
        [
          "EMAIL_PAYLOAD_KEY_ID",
          !!environment.EMAIL_PAYLOAD_KEY_ID,
          "Deployed security mail requires a key ID.",
        ],
        [
          "SUPPORT_EMAIL",
          !!environment.SUPPORT_EMAIL,
          "Deployed Help requires a support destination.",
        ],
      ] as const)
        if (!valid) context.addIssue({ code: "custom", path: [key], message });
      for (const key of ["DATABASE_URL", "AUTH_DATABASE_URL"] as const)
        if (
          new URL(environment[key]).searchParams.get("sslmode") !==
          "verify-full"
        )
          context.addIssue({
            code: "custom",
            path: [key],
            message:
              "Deployed database connections require verified TLS (sslmode=verify-full).",
          });
    }
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
