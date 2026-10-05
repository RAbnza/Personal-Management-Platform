export const AUTH_EMAIL_LINK_EXPIRY_SECONDS = 60 * 60;

const EMAIL_VERIFICATION_PATH = "/auth/verify-email";
const PASSWORD_RESET_PATH = "/auth/reset-password";

function buildTokenFragmentUrl(
  baseUrl: string,
  path: string,
  token: string,
): string {
  if (!token) {
    throw new Error("Authentication email token must not be empty.");
  }

  const url = new URL(path, baseUrl);

  url.search = "";
  url.hash = new URLSearchParams({
    token,
  }).toString();

  return url.toString();
}

export function buildEmailVerificationLink(
  baseUrl: string,
  token: string,
): string {
  return buildTokenFragmentUrl(baseUrl, EMAIL_VERIFICATION_PATH, token);
}

export function buildPasswordResetLink(baseUrl: string, token: string): string {
  return buildTokenFragmentUrl(baseUrl, PASSWORD_RESET_PATH, token);
}
