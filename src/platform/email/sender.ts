import { Resend } from "resend";
import { z } from "zod";

import { getServerEnvironment } from "@/platform/env/server";

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
  const environment = getServerEnvironment();

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
    throw new Error("Mailpit could not accept the email message.");
  }

  if (!response.ok) {
    throw new Error(
      `Mailpit rejected the email message with HTTP ${response.status}.`,
    );
  }
}

async function sendWithResend(message: EmailMessage) {
  const environment = getServerEnvironment();

  if (!environment.RESEND_API_KEY) {
    throw new Error("Resend email delivery is not configured.");
  }

  const client = getResendClient(environment.RESEND_API_KEY);

  const { error } = await client.emails.send(
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
    },
  );

  if (error) {
    throw new Error("Resend rejected the email message.");
  }
}

/**
 * Deliver an application email through the configured provider.
 *
 * This function deliberately does not log the recipient, body or provider
 * response. Authentication emails can contain bearer URLs, so callers must not
 * leak message content into ordinary logs or error reporting.
 */
export async function sendEmail(input: EmailMessage): Promise<void> {
  const message = emailMessageSchema.parse(input);
  const environment = getServerEnvironment();

  switch (environment.EMAIL_PROVIDER) {
    case "mailpit":
      await sendWithMailpit(message);
      return;

    case "resend":
      await sendWithResend(message);
      return;
  }
}
