import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  save: vi.fn(),
  preview: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/settle-debt", () => ({
  settleDebt: mocks.save,
  previewDebtSettlement: mocks.preview,
}));
vi.mock("@/modules/finance/services/read-debt-schedules", () => ({
  getDebtWithScheduleHistory: mocks.history,
}));
import { POST, GET } from "@/app/api/v1/debts/[debtId]/settlement/route";
import { POST as PREVIEW } from "@/app/api/v1/debts/[debtId]/settlement/preview/route";
import { SettlementPreviewStaleError } from "@/modules/finance/domain/debt-settlement";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import {
  settlementBody,
  settlementResult,
  settlementPreview,
} from "./helpers/debt-settlement";
import { paymentIds } from "./helpers/debt-payment";
const context = { params: Promise.resolve({ debtId: paymentIds.debt }) };
const body = () => {
  const { debtId, ...b } = settlementBody();
  void debtId;
  return b;
};
const request = (b: unknown = body(), origin = "https://app.example.test") =>
  new Request(
    `https://app.example.test/api/v1/debts/${paymentIds.debt}/settlement`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(b),
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
  mocks.save.mockResolvedValue(settlementResult);
  mocks.preview.mockResolvedValue(settlementPreview());
});
describe.each([
  ["save", POST],
  ["preview", PREVIEW],
] as const)("settlement %s HTTP boundary", (_name, handler) => {
  it("rejects foreign origin before auth", async () => {
    expect(
      (await handler(request(undefined, "https://foreign.test"), context))
        .status,
    ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it.each([
    "userId",
    "workspaceId",
    "debtId",
    "openingSatisfiedMinor",
    "residualMinor",
  ])("rejects client %s injection", async (key) => {
    expect(
      (await handler(request({ ...body(), [key]: paymentIds.user }), context))
        .status,
    ).toBe(422);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("requires explicit allocation confirmation", async () =>
    expect(
      (
        await handler(
          request({ ...body(), allocationConfirmed: false }),
          context,
        )
      ).status,
    ).toBe(422));
  it("uses only authenticated scope and disables caching", async () => {
    const r = await handler(request(), context);
    expect(r.status).toBe(handler === POST ? 201 : 200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(handler === POST ? mocks.save : mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: paymentIds.user,
        workspaceId: paymentIds.workspace,
        debtId: paymentIds.debt,
      }),
    );
  });
  it("bounds full original-pool mapping transport", async () => {
    const r = request();
    r.headers.set("Content-Length", String(8 * 1024 * 1024 + 1));
    expect((await handler(r, context)).status).toBe(413);
  });
  it.each([
    [new SettlementPreviewStaleError(), 409, "SETTLEMENT_PREVIEW_STALE"],
    [new FinancialCommandConflictError(), 409, "IDEMPOTENCY_CONFLICT"],
    [new DebtUnavailableError(), 404, "DEBT_UNAVAILABLE"],
    [new RangeError("Residual liability"), 422, "BUSINESS_RULE_VIOLATION"],
  ])("maps safe service problem %s", async (error, status, code) => {
    (handler === POST ? mocks.save : mocks.preview).mockRejectedValue(error);
    const r = await handler(request(), context);
    expect(r.status).toBe(status);
    expect((await r.json()).code).toBe(code);
  });
});
describe("settlement read API", () => {
  it("returns only the owned debt settlement in a consistent snapshot", async () => {
    mocks.history.mockResolvedValue({
      detail: { financialRevision: "5" },
      settlement: null,
    });
    const r = await GET(
      new Request("https://app.example.test/settlement"),
      context,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      financialRevision: "5",
      settlement: null,
    });
    expect(mocks.history).toHaveBeenCalledWith({
      userId: paymentIds.user,
      workspaceId: paymentIds.workspace,
      debtId: paymentIds.debt,
    });
  });
});
