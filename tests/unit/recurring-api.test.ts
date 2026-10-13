import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  record: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  occurrence: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/planning/services/recurring", () => ({
  recordRecurringCommand: mocks.record,
}));
vi.mock("@/modules/planning/services/read-recurring", () => ({
  listRecurringObligations: mocks.list,
  getRecurringObligation: mocks.detail,
  getRecurringOccurrence: mocks.occurrence,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
import { POST, GET } from "@/app/api/v1/recurring-obligations/route";
import {
  PlanningConflictError,
  PlanningUnavailableError,
} from "@/modules/planning/domain/recurrence";
const id = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222",
  workspaceId = "33333333-3333-4333-8333-333333333333";
const body = {
  operation: "generate",
  clientCommandId: id,
  obligationId: id,
  expectedVersion: 1,
  window: { from: "2026-10-01", through: "2026-12-31" },
};
const request = (data: unknown = body, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/recurring-obligations", {
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
    obligationId: id,
    version: 1,
    reason: null,
    financialRevision: "3",
  });
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  mocks.detail.mockResolvedValue({ root: { id } });
  mocks.occurrence.mockResolvedValue({ occurrence: { id } });
});
describe("private recurring API", () => {
  it("uses server-owned actor, strict replay commands and private no-store responses", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.record).toHaveBeenCalledWith({
      ...body,
      userId,
      workspaceId,
      requestId: expect.any(String),
    });
  });
  it("rejects forged scope, ambiguous fields and foreign origin before dispatch", async () => {
    expect((await POST(request({ ...body, workspaceId }))).status).toBe(422);
    expect((await POST(request({ ...body, automaticPost: true }))).status).toBe(
      422,
    );
    expect((await POST(request(body, "https://foreign.test"))).status).toBe(
      403,
    );
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("requires authentication for reads and commands", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response("", { status: 401 }),
    });
    expect((await POST(request())).status).toBe(401);
    expect(
      (
        await GET(
          new Request("http://localhost:3000/api/v1/recurring-obligations"),
        )
      ).status,
    ).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns safe explicit conflicts and unavailable evidence", async () => {
    mocks.record.mockRejectedValueOnce(new PlanningConflictError());
    expect((await POST(request())).status).toBe(409);
    mocks.record.mockRejectedValueOnce(new PlanningUnavailableError());
    expect((await POST(request())).status).toBe(404);
  });
  it("scopes each read mode and rejects repeated/unsupported/combined identifiers", async () => {
    expect(
      (
        await GET(
          new Request(
            `http://localhost:3000/api/v1/recurring-obligations?obligationId=${id}&pageSize=20`,
          ),
        )
      ).status,
    ).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith({
      userId,
      workspaceId,
      obligationId: id,
      pageSize: 20,
    });
    expect(
      (
        await GET(
          new Request(
            `http://localhost:3000/api/v1/recurring-obligations?occurrenceId=${id}`,
          ),
        )
      ).status,
    ).toBe(200);
    expect(mocks.occurrence).toHaveBeenCalledWith({
      userId,
      workspaceId,
      occurrenceId: id,
    });
    for (const query of [
      `obligationId=${id}&occurrenceId=${id}`,
      `obligationId=${id}&obligationId=${id}`,
      `workspaceId=${workspaceId}`,
      "pageSize=101",
    ])
      expect(
        (
          await GET(
            new Request(
              `http://localhost:3000/api/v1/recurring-obligations?${query}`,
            ),
          )
        ).status,
      ).toBe(422);
  });
});
