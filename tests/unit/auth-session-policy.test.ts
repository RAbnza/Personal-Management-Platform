import { describe, expect, it } from "vitest";

import {
  getSessionAbsoluteExpiresAt,
  isSessionWithinAbsoluteLifetime,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_EXPIRY_SECONDS,
  SESSION_FRESH_AGE_SECONDS,
  SESSION_REFRESH_AGE_SECONDS,
} from "@/platform/auth/session-policy";

describe("authentication session policy", () => {
  it("uses the documented session timing policy", () => {
    expect(SESSION_EXPIRY_SECONDS).toBe(60 * 60 * 24 * 7);
    expect(SESSION_REFRESH_AGE_SECONDS).toBe(60 * 60 * 24);
    expect(SESSION_FRESH_AGE_SECONDS).toBe(60 * 5);
    expect(SESSION_ABSOLUTE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it("calculates the absolute session expiration from original creation", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");

    expect(getSessionAbsoluteExpiresAt(createdAt).toISOString()).toBe(
      "2026-01-31T00:00:00.000Z",
    );
  });

  it("accepts a session immediately before the absolute limit", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-30T23:59:59.999Z");

    expect(isSessionWithinAbsoluteLifetime(createdAt, now)).toBe(true);
  });

  it("rejects a session exactly at the absolute limit", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-31T00:00:00.000Z");

    expect(isSessionWithinAbsoluteLifetime(createdAt, now)).toBe(false);
  });

  it("rejects an invalid session creation timestamp", () => {
    expect(isSessionWithinAbsoluteLifetime(new Date(Number.NaN))).toBe(false);
  });
});
