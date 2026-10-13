import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  record: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/planning/services/savings-goals", () => ({
  recordSavingsGoalCommand: mocks.record,
}));
vi.mock(
  "@/modules/planning/services/read-savings-goals",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/modules/planning/services/read-savings-goals")
    >()),
    listSavingsGoals: mocks.list,
    getSavingsGoal: mocks.detail,
  }),
);
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
import { POST, GET } from "@/app/api/v1/savings-goals/route";
import {
  SavingsGoalConflictError,
  SavingsGoalUnavailableError,
} from "@/modules/planning/domain/savings-goal";
const id = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222",
  workspaceId = "33333333-3333-4333-8333-333333333333";
const body = {
  operation: "save",
  clientCommandId: id,
  goalId: null,
  expectedVersion: null,
  reason: null,
  fields: {
    name: "Emergency",
    targetMinor: "10000",
    targetDate: null,
    notes: null,
  },
};
const request = (data: unknown = body, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/savings-goals", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockImplementation((_: Request, requestId: string) => ({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId, sessionId: id },
  }));
  mocks.record.mockResolvedValue({
    goalId: id,
    version: 1,
    reason: null,
    financialRevision: "3",
  });
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  mocks.detail.mockResolvedValue({ goal: { id } });
});
describe("private savings goals API", () => {
  it("uses only the server actor and returns noncacheable confirmed results", async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(mocks.record).toHaveBeenCalledWith({
      ...body,
      userId,
      workspaceId,
      requestId: expect.any(String),
    });
  });
  it("rejects spoofed fields, invalid amounts, foreign origins and unauthenticated commands", async () => {
    expect((await POST(request({ ...body, workspaceId }))).status).toBe(422);
    expect(
      (
        await POST(
          request({ ...body, fields: { ...body.fields, targetMinor: "1.1" } }),
        )
      ).status,
    ).toBe(422);
    expect((await POST(request(body, "https://foreign.test"))).status).toBe(
      403,
    );
    expect(mocks.record).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response("", { status: 401 }),
    });
    expect((await POST(request())).status).toBe(401);
    expect(
      (await GET(new Request("http://localhost:3000/api/v1/savings-goals")))
        .status,
    ).toBe(401);
  });
  it("requires unambiguous bounded read queries and owned detail scope", async () => {
    for (const query of [
      "pageSize=0",
      "pageSize=101",
      "startDate=2026-10-01",
      "goalId=" + id + "&includeArchived=true",
      "pageSize=1&pageSize=2",
      "source=plans",
    ])
      expect(
        (
          await GET(
            new Request("http://localhost:3000/api/v1/savings-goals?" + query),
          )
        ).status,
      ).toBe(422);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(
      (
        await GET(
          new Request(
            "http://localhost:3000/api/v1/savings-goals?goalId=" + id,
          ),
        )
      ).status,
    ).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith({
      goalId: id,
      userId,
      workspaceId,
    });
  });
  it("distinguishes safe conflict/unavailable outcomes from identical-command retry", async () => {
    for (const [error, status] of [
      [new SavingsGoalConflictError(), 409],
      [new SavingsGoalUnavailableError(), 404],
      [new Error("sensitive database content"), 500],
    ] as const) {
      mocks.record.mockRejectedValueOnce(error);
      const r = await POST(request());
      expect(r.status).toBe(status);
      const b = await r.json();
      expect(b.retryable).toBe(status === 500);
      expect(JSON.stringify(b)).not.toContain("sensitive database content");
    }
  });
});
