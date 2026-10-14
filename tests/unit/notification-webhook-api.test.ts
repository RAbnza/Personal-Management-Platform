import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), record: vi.fn() }));
vi.mock("@/platform/email/notification-webhook", () => ({
  verifyNotificationWebhook: mocks.verify,
  recordNotificationWebhook: mocks.record,
}));
import { POST } from "@/app/api/webhooks/notifications/route";
const request = (text = "{}", headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/webhooks/notifications", {
    method: "POST",
    headers,
    body: text,
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NOTIFICATION_WEBHOOK_SECRET", "whsec_synthetic");
  mocks.verify.mockReturnValue({ eventId: "signed-event" });
  mocks.record.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
it("fails closed without configuration, invalid signatures or oversized raw streams", async () => {
  vi.stubEnv("NOTIFICATION_WEBHOOK_SECRET", "");
  expect((await POST(request())).status).toBe(503);
  vi.stubEnv("NOTIFICATION_WEBHOOK_SECRET", "whsec_synthetic");
  mocks.verify.mockImplementationOnce(() => {
    throw new Error("signature rejected");
  });
  expect((await POST(request())).status).toBe(400);
  expect((await POST(request("x".repeat(65537)))).status).toBe(413);
  expect(mocks.record).not.toHaveBeenCalled();
});
it("records only verified evidence, acknowledges unsupported event types and returns retriable storage failure", async () => {
  const r = await POST(request("raw signed bytes"));
  expect(r.status).toBe(204);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(mocks.verify).toHaveBeenCalledWith(
    "raw signed bytes",
    expect.any(Headers),
    "whsec_synthetic",
  );
  expect(mocks.record).toHaveBeenCalledWith({ eventId: "signed-event" });
  mocks.verify.mockReturnValueOnce(null);
  expect((await POST(request())).status).toBe(204);
  expect(mocks.record).toHaveBeenCalledTimes(1);
  mocks.record.mockRejectedValueOnce(new Error("private payload"));
  const failed = await POST(request());
  expect(failed.status).toBe(503);
  expect(await failed.text()).toBe("");
});
