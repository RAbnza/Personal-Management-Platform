import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/time/services/reminders", () => ({
  getReminder: mocks.read,
  mutateReminder: mocks.write,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
import { GET, POST } from "@/app/api/v1/reminders/route";
import {
  ReminderConflictError,
  ReminderUnavailableError,
} from "@/modules/time/domain/reminder";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
const userId = "11111111-1111-4111-8111-111111111111",
  workspaceId = "22222222-2222-4222-8222-222222222222",
  sourceId = "33333333-3333-4333-8333-333333333333";
const command = {
  target: { sourceKind: "personal_event", sourceId },
  clientCommandId: "44444444-4444-4444-8444-444444444444",
  expectedSnapshot: "a".repeat(64),
  action: { kind: "dismiss", ruleKey: "0:09:00" },
};
const request = (body: unknown = command, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/reminders", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockImplementation((_: Request, requestId: string) => ({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId, sessionId: sourceId },
  }));
  mocks.read.mockResolvedValue({ rules: [] });
  mocks.write.mockResolvedValue({ saved: true });
});
describe("owner-scoped reminder API", () => {
  it("reads only an authenticated source with no-store", async () => {
    const r = await GET(
      new Request(
        `http://localhost:3000/api/v1/reminders?sourceKind=personal_event&sourceId=${sourceId}`,
      ),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mocks.read).toHaveBeenCalledWith(
      { userId, workspaceId, requestId: expect.any(String) },
      command.target,
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("supports module-default reads", async () => {
    expect(
      (
        await GET(
          new Request(
            "http://localhost:3000/api/v1/reminders?moduleKey=career",
          ),
        )
      ).status,
    ).toBe(200);
  });
  it("uses authenticated ownership for mutations", async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(
      { userId, workspaceId, requestId: expect.any(String) },
      command,
    );
  });
  it("rejects cross-origin writes before actor resolution", async () => {
    expect(
      (await POST(request(command, "https://foreign.example"))).status,
    ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("rejects caller ownership and external delivery channels", async () => {
    expect((await POST(request({ ...command, workspaceId }))).status).toBe(422);
    expect(
      (
        await POST(
          request({
            ...command,
            action: {
              kind: "settings",
              mode: "override",
              rules: [{ offsetDays: 0, localTime: "09:00", channel: "email" }],
            },
          }),
        )
      ).status,
    ).toBe(422);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rejects duplicate times and invalid offsets", async () => {
    const rules = [
      { offsetDays: 1, localTime: "09:00" },
      { offsetDays: 1, localTime: "09:00" },
    ];
    expect(
      (
        await POST(
          request({
            ...command,
            action: { kind: "settings", mode: "override", rules },
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await POST(
          request({
            ...command,
            action: {
              kind: "settings",
              mode: "override",
              rules: [{ offsetDays: -1, localTime: "24:00" }],
            },
          }),
        )
      ).status,
    ).toBe(422);
  });
  it.each([new ReminderConflictError(), new CommandReceiptConflictError()])(
    "returns conflict requiring review",
    async (error) => {
      mocks.write.mockRejectedValue(error);
      const r = await POST(request());
      expect(r.status).toBe(409);
      expect((await r.json()).retryable).toBe(false);
    },
  );
  it("conceals foreign or resolved sources", async () => {
    mocks.read.mockRejectedValue(new ReminderUnavailableError());
    expect(
      (
        await GET(
          new Request(
            `http://localhost:3000/api/v1/reminders?sourceKind=personal_event&sourceId=${sourceId}`,
          ),
        )
      ).status,
    ).toBe(404);
  });
  it("keeps authentication failures intact", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response(null, { status: 401 }),
    });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
