import { Resend } from "resend";
import { z } from "zod";

import { getEmailEnvironment } from "@/platform/env/server";

const EMAIL_DELIVERY_TIMEOUT_MS = 10_000;

const emailMessageSchema = z.object({
  to: z.email(),
  subject: z
    .string()
    .trim()
    .min(1, "Email subject must not be empty.")
    .max(200, "Email subject must not exceed 200 characters."),
  text: z.string().min(1, "Email text body must not be empty."),
  html: z.string().min(1).optional(),
});

export type EmailMessage = z.infer<typeof emailMessageSchema>;
export class EmailProviderError extends Error {
  constructor(
    public readonly outcome: "rejected" | "uncertain",
    message: string,
  ) {
    super(message);
  }
}

let resendClient: Resend | undefined;
let resendClientApiKey: string | undefined;

function getResendClient(apiKey: string) {
  if (!resendClient || resendClientApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClientApiKey = apiKey;
  }

  return resendClient;
}

async function sendWithMailpit(message: EmailMessage) {
  const environment = getEmailEnvironment();

  if (!environment.MAILPIT_API_URL) {
    throw new Error("Mailpit email delivery is not configured.");
  }

  const endpoint = new URL("/api/v1/send", environment.MAILPIT_API_URL);

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        From: {
          Email: environment.EMAIL_FROM_ADDRESS,
          Name: environment.EMAIL_FROM_NAME,
        },
        To: [
          {
            Email: message.to,
          },
        ],
        Subject: message.subject,
        Text: message.text,
        ...(message.html
          ? {
              HTML: message.html,
            }
          : {}),
      }),
      signal: AbortSignal.timeout(EMAIL_DELIVERY_TIMEOUT_MS),
    });
  } catch {
    throw new EmailProviderError(
      "uncertain",
      "Mailpit could not confirm email acceptance.",
    );
  }

  if (!response.ok) {
    throw new EmailProviderError(
      "rejected",
      `Mailpit rejected the email message with HTTP ${response.status}.`,
    );
  }
  const receipt = await response.json().catch(() => ({}));
  return {
    providerMessageId: typeof receipt.ID === "string" ? receipt.ID : null,
  };
}

async function sendWithResend(message: EmailMessage, idempotencyKey?: string) {
  const environment = getEmailEnvironment();

  if (!environment.RESEND_API_KEY) {
    throw new Error("Resend email delivery is not configured.");
  }

  const client = getResendClient(environment.RESEND_API_KEY);

  const { error, data } = await client.emails.send(
    {
      from: `${environment.EMAIL_FROM_NAME} <${environment.EMAIL_FROM_ADDRESS}>`,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html
        ? {
            html: message.html,
          }
        : {}),
    },
    {
      signal: AbortSignal.timeout(EMAIL_DELIVERY_TIMEOUT_MS),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  );

  if (error) {
    throw new EmailProviderError(
      error.name === "application_error" ? "uncertain" : "rejected",
      "Resend could not confirm email acceptance.",
    );
  }
  return { providerMessageId: data?.id ?? null };
}

/**
 * Deliver an application email through the configured provider.
 *
 * This function deliberately does not log the recipient, body or provider
 * response. Authentication emails can contain bearer URLs, so callers must not
 * leak message content into ordinary logs or error reporting.
 */
export async function sendEmail(input: EmailMessage): Promise<void> {
  await sendEmailWithReceipt(input);
}
export async function sendEmailWithReceipt(
  input: EmailMessage,
  idempotencyKey?: string,
): Promise<{ providerMessageId: string | null }> {
  const message = emailMessageSchema.parse(input);
  const environment = getEmailEnvironment();

  switch (environment.EMAIL_PROVIDER) {
    case "mailpit":
      return sendWithMailpit(message);

    case "resend":
      return sendWithResend(message, idempotencyKey);
  }
}
