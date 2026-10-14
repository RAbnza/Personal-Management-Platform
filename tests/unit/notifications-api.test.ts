import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/time/services/notification-preferences", () => ({
  getNotificationSettings: mocks.read,
  saveNotificationPreferences: mocks.save,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
import { GET, PATCH } from "@/app/api/v1/settings/notifications/route";
import {
  NotificationConflictError,
  NotificationIdentityError,
} from "@/modules/time/domain/notification";
const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
};
const command = {
  clientCommandId: "33333333-3333-4333-8333-333333333333",
  expectedVersion: 0,
  preferences: {
    enabled: true,
    timezone: null,
    quietStart: null,
    quietEnd: null,
    includeDueDate: false,
  },
};
const request = (body: unknown = command, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/settings/notifications", {
    method: "PATCH",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ kind: "authenticated", actor });
  mocks.read.mockResolvedValue({
    preferences: command.preferences,
    deliveries: [],
  });
  mocks.save.mockResolvedValue({ saved: true });
});
it("reads private no-store evidence using the authenticated scope", async () => {
  const r = await GET(
    new Request("http://localhost:3000/api/v1/settings/notifications"),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(mocks.read).toHaveBeenCalledWith(actor);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects unauthenticated, caller-owned scope, arbitrary recipient and cross-origin commands", async () => {
  expect(
    (await PATCH(request(command, "https://other.example.test"))).status,
  ).toBe(403);
  expect(mocks.actor).not.toHaveBeenCalled();
  for (const extra of [
    { workspaceId: actor.workspaceId },
    { recipient: "other@example.test" },
  ])
    expect((await PATCH(request({ ...command, ...extra }))).status).toBe(422);
  expect(
    (
      await GET(
        new Request(
          "http://localhost:3000/api/v1/settings/notifications?workspaceId=other",
        ),
      )
    ).status,
  ).toBe(422);
  mocks.actor.mockResolvedValue({
    kind: "response",
    response: new Response(null, { status: 401 }),
  });
  expect((await PATCH(request())).status).toBe(401);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("preserves normalized replay input and safe conflict/identity/uncertainty responses", async () => {
  expect((await PATCH(request())).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(actor, command);
  mocks.save.mockRejectedValueOnce(new NotificationConflictError());
  expect((await PATCH(request())).status).toBe(409);
  mocks.save.mockRejectedValueOnce(new NotificationIdentityError());
  expect((await PATCH(request())).status).toBe(422);
  mocks.save.mockRejectedValueOnce(new Error("private provider payload"));
  const r = await PATCH(request());
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("private provider");
});
