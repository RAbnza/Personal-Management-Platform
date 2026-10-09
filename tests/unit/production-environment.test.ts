import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
function deployed() {
  for (const [key, value] of Object.entries({
    PMP_DEPLOYMENT_ENV: "production",
    DATABASE_URL:
      "postgresql://app_domain:synthetic@db.example/workspace?sslmode=verify-full",
    AUTH_DATABASE_URL:
      "postgresql://auth_adapter:synthetic@db.example/workspace?sslmode=verify-full",
    BETTER_AUTH_SECRET: "synthetic-deployment-validation-secret-2026",
    BETTER_AUTH_URL: "https://workspace.example",
    EMAIL_PROVIDER: "resend",
    EMAIL_FROM_ADDRESS: "sender@example.test",
    EMAIL_FROM_NAME: "Acceptance",
    RESEND_API_KEY: "synthetic-provider-key",
    EMAIL_PAYLOAD_KEY: "ab".repeat(32),
    EMAIL_PAYLOAD_KEY_ID: "v1",
    SUPPORT_EMAIL: "support@example.test",
  }))
    vi.stubEnv(key, value);
}
describe("deployed runtime configuration", () => {
  it("accepts separate restricted roles, HTTPS, verified TLS and required operations destinations", async () => {
    deployed();
    const { getServerEnvironment } = await import("@/platform/env/server");
    expect(getServerEnvironment().PMP_DEPLOYMENT_ENV).toBe("production");
  });
  it.each([
    [
      "DATABASE_URL",
      "postgresql://postgres:synthetic@db.example/workspace?sslmode=verify-full",
    ],
    [
      "AUTH_DATABASE_URL",
      "postgresql://auth_adapter:synthetic@db.example/workspace",
    ],
    ["BETTER_AUTH_URL", "http://workspace.example"],
    ["EMAIL_PAYLOAD_KEY", ""],
    ["SUPPORT_EMAIL", ""],
  ])(
    "rejects unsafe/missing %s without including supplied secrets",
    async (key, value) => {
      deployed();
      vi.stubEnv(key, value);
      const { getServerEnvironment } = await import("@/platform/env/server");
      expect(() => getServerEnvironment()).toThrow();
      try {
        getServerEnvironment();
      } catch (error) {
        expect(String(error)).not.toContain("synthetic@");
      }
    },
  );
  it("rejects local capture in a deployed email worker", async () => {
    deployed();
    vi.stubEnv("EMAIL_PROVIDER", "mailpit");
    vi.stubEnv("MAILPIT_API_URL", "http://localhost:8025");
    const { getEmailEnvironment } = await import("@/platform/env/server");
    expect(() => getEmailEnvironment()).toThrow("not configured");
  });
});
