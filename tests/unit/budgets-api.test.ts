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
vi.mock("@/modules/planning/services/budgets", () => ({
  recordBudgetCommand: mocks.record,
}));
vi.mock("@/modules/planning/services/read-budgets", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/planning/services/read-budgets")
  >()),
  listBudgets: mocks.list,
  getBudget: mocks.detail,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
import { POST, GET } from "@/app/api/v1/budgets/route";
import {
  BudgetConflictError,
  BudgetUnavailableError,
} from "@/modules/planning/domain/budget";
const id = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222",
  workspaceId = "33333333-3333-4333-8333-333333333333";
const body = {
  operation: "save",
  clientCommandId: id,
  budgetId: null,
  expectedVersion: null,
  reason: null,
  fields: {
    categoryId: id,
    startDate: "2026-10-01",
    endDateExclusive: "2026-11-01",
    limitMinor: "0",
    basis: "net",
    notes: null,
  },
};
const request = (data: unknown = body, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/budgets", {
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
    budgetId: id,
    version: 1,
    reason: null,
    financialRevision: "3",
  });
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  mocks.detail.mockResolvedValue({ budget: { id } });
});
describe("private budgets API", () => {
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
          request({ ...body, fields: { ...body.fields, limitMinor: "1.1" } }),
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
      (await GET(new Request("http://localhost:3000/api/v1/budgets"))).status,
    ).toBe(401);
  });
  it("requires unambiguous bounded read queries and owned detail scope", async () => {
    for (const query of [
      "pageSize=0",
      "pageSize=101",
      "startDate=2026-10-01",
      "budgetId=" + id + "&includeArchived=true",
      "pageSize=1&pageSize=2",
      "source=plans",
    ])
      expect(
        (
          await GET(
            new Request("http://localhost:3000/api/v1/budgets?" + query),
          )
        ).status,
      ).toBe(422);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(
      (
        await GET(
          new Request("http://localhost:3000/api/v1/budgets?budgetId=" + id),
        )
      ).status,
    ).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith({
      budgetId: id,
      userId,
      workspaceId,
    });
  });
  it("distinguishes safe conflict/unavailable outcomes from identical-command retry", async () => {
    for (const [error, status] of [
      [new BudgetConflictError(), 409],
      [new BudgetUnavailableError(), 404],
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
