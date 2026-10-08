import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  save: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/revise-debt-schedule", () => ({
  reviseDebtSchedule: mocks.save,
}));
vi.mock("@/modules/finance/services/read-debt-schedules", () => ({
  listDebtSchedules: mocks.history,
}));
import {
  POST,
  GET,
} from "@/app/api/v1/debts/[debtId]/schedule-revisions/route";
import { SchedulePreviewStaleError } from "@/modules/finance/domain/debt-schedule-revision";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { scheduleBody, scheduleResult } from "./helpers/debt-schedule";
import { paymentIds } from "./helpers/debt-payment";
const context = { params: Promise.resolve({ debtId: paymentIds.debt }) };
const body = () => {
  const body: Record<string, unknown> = { ...scheduleBody() };
  delete body.debtId;
  return body;
};
const request = (data: unknown = body(), origin = "https://app.example.test") =>
  new Request(
    `https://app.example.test/api/v1/debts/${paymentIds.debt}/schedule-revisions`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockImplementation((_r: Request, requestId: string) => ({
    kind: "authenticated",
    actor: {
      userId: paymentIds.user,
      workspaceId: paymentIds.workspace,
      requestId,
    },
  }));
  mocks.save.mockResolvedValue(scheduleResult);
});
describe("schedule revision HTTP boundary", () => {
  it("accepts the supported 360-entry revision above the shared 64 KB limit", async () => {
    const b = scheduleBody();
    b.revisionKind = "renegotiation";
    const first = b.entries[0]!;
    b.entries = [
      first,
      ...Array.from({ length: 359 }, () => ({
        ...first,
        entryKey: randomUUID(),
        obligationId: null,
      })),
    ];
    const { debtId, ...intent } = b;
    expect(debtId).toBe(paymentIds.debt);
    expect(
      new TextEncoder().encode(JSON.stringify(intent)).byteLength,
    ).toBeGreaterThan(64 * 1024);
    expect((await POST(request(intent), context)).status).toBe(201);
    expect(mocks.save).toHaveBeenCalled();
  });
  it("retains a bounded server-owned revision transport limit", async () => {
    const r = request();
    r.headers.set("Content-Length", String(8 * 1024 * 1024 + 1));
    expect((await POST(r, context)).status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses authenticated scope and returns committed result without caching", async () => {
    const r = await POST(request(), context);
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual(scheduleResult);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: paymentIds.user,
        workspaceId: paymentIds.workspace,
        debtId: paymentIds.debt,
      }),
    );
  });
  it("rejects foreign origin before auth and mutation", async () => {
    expect(
      (await POST(request(undefined, "https://foreign.test"), context)).status,
    ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(["userId", "workspaceId", "debtId", "openingSatisfiedMinor"])(
    "rejects client %s injection",
    async (key) => {
      expect(
        (await POST(request({ ...body(), [key]: paymentIds.user }), context))
          .status,
      ).toBe(422);
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );
  it.each([
    [new SchedulePreviewStaleError(), 409, "SCHEDULE_PREVIEW_STALE"],
    [new FinancialCommandConflictError(), 409, "IDEMPOTENCY_CONFLICT"],
    [new DebtUnavailableError(), 404, "DEBT_UNAVAILABLE"],
    [new RangeError("Incomplete mapping"), 422, "BUSINESS_RULE_VIOLATION"],
  ])("maps safe service problem %s", async (error, status, code) => {
    mocks.save.mockRejectedValue(error);
    const r = await POST(request(), context);
    expect(r.status).toBe(status);
    expect((await r.json()).code).toBe(code);
  });
  it("paginates only the owned debt history", async () => {
    mocks.history.mockResolvedValue({
      financialRevision: "4",
      items: [],
      nextCursor: null,
    });
    const r = await GET(
      new Request(
        `https://app.example.test/schedules?after=${paymentIds.schedule}`,
      ),
      context,
    );
    expect(r.status).toBe(200);
    expect(mocks.history).toHaveBeenCalledWith({
      userId: paymentIds.user,
      workspaceId: paymentIds.workspace,
      debtId: paymentIds.debt,
      after: paymentIds.schedule,
    });
  });
  it("blocks unknown history filters and unauthorized sessions", async () => {
    expect(
      (
        await GET(
          new Request("https://app.example.test/schedules?workspaceId=x"),
          context,
        )
      ).status,
    ).toBe(422);
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response(null, { status: 401 }),
    });
    expect((await POST(request(), context)).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
