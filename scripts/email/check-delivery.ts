import { loadEnvFile } from "node:process";

import { sendEmail } from "@/platform/email";
import { getServerEnvironment } from "@/platform/env/server";

function loadRuntimeEnvironment() {
  try {
    loadEnvFile(".env");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      throw new Error(
        "Missing .env. Copy .env.example to .env before checking email delivery.",
      );
    }

    throw error;
  }
}

async function main() {
  loadRuntimeEnvironment();

  const environment = getServerEnvironment();

  if (environment.EMAIL_PROVIDER !== "mailpit") {
    throw new Error(
      "email:check is intentionally restricted to the local Mailpit provider.",
    );
  }

  await sendEmail({
    to: "auth-smoke@example.test",
    subject: "Local email delivery check",
    text: [
      "Local email delivery is working.",
      "",
      "This message was sent through the application's email adapter and captured by Mailpit.",
    ].join("\n"),
    html: [
      "<p><strong>Local email delivery is working.</strong></p>",
      "<p>This message was sent through the application's email adapter and captured by Mailpit.</p>",
    ].join(""),
  });

  console.log("Local email delivery accepted by Mailpit.");
  console.log("Inspect the captured message in the Mailpit web UI.");
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown email delivery error.";

  console.error(message);
  process.exitCode = 1;
});
