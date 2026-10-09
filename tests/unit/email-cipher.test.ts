import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptEmailSecret,
  encryptEmailSecret,
} from "@/platform/email/cipher";
afterEach(() => vi.unstubAllEnvs());
describe("short-lived security email encryption", () => {
  it("uses unique nonces and rejects tampering and cross-delivery substitution", () => {
    vi.stubEnv("EMAIL_PAYLOAD_KEY", "12".repeat(32));
    const plaintext = "private bearer token",
      first = encryptEmailSecret(plaintext, "delivery-a");
    expect(first.equals(encryptEmailSecret(plaintext, "delivery-a"))).toBe(
      false,
    );
    expect(first.toString()).not.toContain(plaintext);
    expect(decryptEmailSecret(first, "delivery-a")).toBe(plaintext);
    expect(() => decryptEmailSecret(first, "delivery-b")).toThrow();
    first[15] = first[15]! ^ 1;
    expect(() => decryptEmailSecret(first, "delivery-a")).toThrow();
  });
  it("fails closed without a valid key", () => {
    vi.stubEnv("EMAIL_PAYLOAD_KEY", "");
    expect(() => encryptEmailSecret("token", "delivery")).toThrow(
      "not configured",
    );
  });
});
