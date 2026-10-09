import { enqueueSecurityEmail } from "@/platform/email/enqueue";
import { getServerEnvironment } from "@/platform/env/server";

import {
  AUTH_EMAIL_LINK_EXPIRY_SECONDS,
  buildEmailVerificationLink,
  buildPasswordResetLink,
} from "./email-links";

const AUTH_EMAIL_LINK_EXPIRY_MINUTES = AUTH_EMAIL_LINK_EXPIRY_SECONDS / 60;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendAuthVerificationEmail(input: {
  userId: string;
  to: string;
  token: string;
}): Promise<void> {
  const environment = getServerEnvironment();

  const verificationLink = buildEmailVerificationLink(
    environment.BETTER_AUTH_URL,
    input.token,
  );

  await enqueueSecurityEmail({
    userId: input.userId,
    purpose: "verify_email",
    token: input.token,
    message: {
      to: input.to,
      subject: "Verify your email address",
      text: [
        "Verify your email address to finish creating your account.",
        "",
        verificationLink,
        "",
        `This link expires in ${AUTH_EMAIL_LINK_EXPIRY_MINUTES} minutes.`,
        "",
        "If you did not create this account, you can ignore this email.",
      ].join("\n"),
      html: [
        "<p>Verify your email address to finish creating your account.</p>",
        `<p><a href="${escapeHtml(verificationLink)}">Verify email address</a></p>`,
        `<p>This link expires in ${AUTH_EMAIL_LINK_EXPIRY_MINUTES} minutes.</p>`,
        "<p>If you did not create this account, you can ignore this email.</p>",
      ].join(""),
    },
  });
}

export async function sendAuthPasswordResetEmail(input: {
  userId: string;
  to: string;
  token: string;
}): Promise<void> {
  const environment = getServerEnvironment();

  const resetLink = buildPasswordResetLink(
    environment.BETTER_AUTH_URL,
    input.token,
  );

  await enqueueSecurityEmail({
    userId: input.userId,
    purpose: "password_reset",
    token: input.token,
    message: {
      to: input.to,
      subject: "Reset your password",
      text: [
        "A password reset was requested for your account.",
        "",
        resetLink,
        "",
        `This link expires in ${AUTH_EMAIL_LINK_EXPIRY_MINUTES} minutes.`,
        "",
        "If you did not request a password reset, you can ignore this email.",
      ].join("\n"),
      html: [
        "<p>A password reset was requested for your account.</p>",
        `<p><a href="${escapeHtml(resetLink)}">Reset password</a></p>`,
        `<p>This link expires in ${AUTH_EMAIL_LINK_EXPIRY_MINUTES} minutes.</p>`,
        "<p>If you did not request a password reset, you can ignore this email.</p>",
      ].join(""),
    },
  });
}
