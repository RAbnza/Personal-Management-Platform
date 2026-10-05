import { describe, expect, it } from "vitest";

import {
  AUTH_EMAIL_LINK_EXPIRY_SECONDS,
  buildEmailVerificationLink,
  buildPasswordResetLink,
} from "@/platform/auth/email-links";

describe("authentication email links", () => {
  const baseUrl = "https://app.example.test";
  const token = "secret.token/value?with=special&characters";

  it("uses the documented one-hour authentication email lifetime", () => {
    expect(AUTH_EMAIL_LINK_EXPIRY_SECONDS).toBe(60 * 60);
  });

  it("keeps email verification tokens in the URL fragment", () => {
    const link = buildEmailVerificationLink(baseUrl, token);
    const url = new URL(link);

    expect(url.origin).toBe(baseUrl);
    expect(url.pathname).toBe("/auth/verify-email");
    expect(url.search).toBe("");

    const fragment = new URLSearchParams(url.hash.slice(1));

    expect(fragment.get("token")).toBe(token);
    expect(link.split("#")[0]).not.toContain(token);
  });

  it("keeps password reset tokens in the URL fragment", () => {
    const link = buildPasswordResetLink(baseUrl, token);
    const url = new URL(link);

    expect(url.origin).toBe(baseUrl);
    expect(url.pathname).toBe("/auth/reset-password");
    expect(url.search).toBe("");

    const fragment = new URLSearchParams(url.hash.slice(1));

    expect(fragment.get("token")).toBe(token);
    expect(link.split("#")[0]).not.toContain(token);
  });

  it("rejects empty authentication email tokens", () => {
    expect(() => buildEmailVerificationLink(baseUrl, "")).toThrow(
      /must not be empty/i,
    );

    expect(() => buildPasswordResetLink(baseUrl, "")).toThrow(
      /must not be empty/i,
    );
  });
});
