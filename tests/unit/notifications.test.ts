import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  defaultNotificationPreferences,
  notificationPreferencesSchema,
  notificationCommandSchema,
  notificationMessage,
} from "@/modules/time/domain/notification";
import { verifyNotificationWebhook } from "@/platform/email/notification-webhook";
import { notificationsAllowed } from "@/platform/email/notification-delivery";
const defaults = {
  enabled: false,
  timezone: null,
  quietStart: null,
  quietEnd: null,
  includeDueDate: false,
};
describe("V2-G notification contract", () => {
  it("has no implicit opt-in, address, amount, title, or unsupported cadence", () => {
    expect(defaultNotificationPreferences.enabled).toBe(false);
    for (const extra of [
      { email: "other@example.test" },
      { includeAmounts: true },
      { overdueCadenceDays: 1 },
      { workspaceId: crypto.randomUUID() },
    ])
      expect(
        notificationPreferencesSchema.safeParse({ ...defaults, ...extra })
          .success,
      ).toBe(false);
  });
  it("validates IANA timezones, paired distinct quiet endpoints and strict replay commands", () => {
    expect(
      notificationPreferencesSchema.parse({
        ...defaults,
        timezone: "Asia/Manila",
        quietStart: "22:00",
        quietEnd: "07:00",
      }),
    ).toMatchObject({ quietStart: "22:00" });
    for (const patch of [
      { timezone: "unknown-zone" },
      { quietStart: "22:00" },
      { quietStart: "07:00", quietEnd: "07:00" },
      { quietStart: "24:00", quietEnd: "07:00" },
    ])
      expect(
        notificationPreferencesSchema.safeParse({ ...defaults, ...patch })
          .success,
      ).toBe(false);
    expect(
      notificationCommandSchema.safeParse({
        preferences: defaults,
        expectedVersion: 0,
        clientCommandId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
  it("uses generic content with only an explicitly selected due date", () => {
    expect(
      notificationMessage("https://app.example.test", "2026-10-14", false).text,
    ).not.toContain("2026-10-14");
    expect(
      notificationMessage("https://app.example.test", "2026-10-14", true).text,
    ).toContain("Recorded due date: 2026-10-14");
    expect(
      notificationMessage("https://app.example.test", null, true).text,
    ).not.toContain("null");
  });
  it("keeps local and external delivery independently gated", () => {
    vi.stubEnv("NOTIFICATIONS_ENABLED", "false");
    vi.stubEnv("EMAIL_PROVIDER", "mailpit");
    expect(notificationsAllowed()).toBe(false);
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    expect(notificationsAllowed()).toBe(true);
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("NOTIFICATIONS_EXTERNAL_ENABLED", "false");
    expect(notificationsAllowed()).toBe(false);
    vi.stubEnv("NOTIFICATIONS_EXTERNAL_ENABLED", "true");
    vi.stubEnv("NOTIFICATION_WEBHOOK_SECRET", "whsec_test_gate");
    expect(notificationsAllowed()).toBe(true);
    vi.unstubAllEnvs();
  });
  it("authenticates raw signed provider evidence, rejecting tampering, stale time and malformed supported payloads", () => {
    const key = Buffer.alloc(32, 7),
      secret = "whsec_" + key.toString("base64");
    const id = "evt_test",
      timestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: {
        email_id: "provider-test",
        to: ["owner@example.test"],
        workspaceId: crypto.randomUUID(),
      },
    });
    const sign = (body: string, t = timestamp) =>
      new Headers({
        "svix-id": id,
        "svix-timestamp": t,
        "svix-signature":
          "v1," +
          createHmac("sha256", key)
            .update(`${id}.${t}.${body}`)
            .digest("base64"),
      });
    expect(
      verifyNotificationWebhook(payload, sign(payload), secret),
    ).toMatchObject({
      eventId: id,
      messageId: "provider-test",
      kind: "email.delivered",
      deliveryId: null,
    });
    expect(() =>
      verifyNotificationWebhook(payload + " ", sign(payload), secret),
    ).toThrow();
    expect(() =>
      verifyNotificationWebhook(payload, sign(payload, "1"), secret),
    ).toThrow();
    const invalid = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "unknown" },
    });
    expect(() =>
      verifyNotificationWebhook(invalid, sign(invalid), secret),
    ).toThrow();
  });
});
