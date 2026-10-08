import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  correct: vi.fn(),
  reverse: vi.fn(),
  detail: vi.fn(),
  refund: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/correct-financial-action", () => ({
  correctFinancialAction: mocks.correct,
  reverseFinancialAction: mocks.reverse,
  getFinancialActionDetail: mocks.detail,
}));
vi.mock("@/modules/finance/services/record-refund", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/finance/services/record-refund")
  >("@/modules/finance/services/record-refund");
  return { ...actual, recordRefund: mocks.refund };
});
vi.mock("@/modules/finance/services/resolve-payment-clearing", () => ({
  resolvePaymentClearing: mocks.resolve,
}));
import { GET } from "@/app/api/v1/financial-actions/[actionId]/route";
import { POST } from "@/app/api/v1/financial-actions/[actionId]/corrections/route";
import { POST as REVERSE } from "@/app/api/v1/financial-actions/[actionId]/reversals/route";
import { POST as REFUND } from "@/app/api/v1/refunds/route";
import { FinancialCorrectionStaleError } from "@/modules/finance/domain/financial-correction";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { paymentIds as ids } from "./helpers/debt-payment";
const context = { params: Promise.resolve({ actionId: ids.payment }) };
const body = () => ({
  clientCommandId: ids.command,
  expectedActionRevisionId: ids.revision,
  expectedFinancialRevision: "4",
  reason: "Wrong purchase amount",
  replacement: {
    actionKind: "expense",
    fundingAccountId: ids.account,
    effectiveDate: "2026-10-08",
    purchaseMinor: "100",
    splits: [{ amountMinor: "100" }],
    description: "Corrected purchase",
    acknowledgeNegativeBalance: true,
  },
});
const request = (value: unknown, origin = "https://app.example.test") =>
  new Request(
    "https://app.example.test/api/v1/financial-actions/a/corrections",
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(value),
    },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockImplementation((_r: Request, requestId: string) => ({
    kind: "authenticated",
    actor: { userId: ids.user, workspaceId: ids.workspace, requestId },
  }));
  mocks.correct.mockResolvedValue({
    actionId: ids.payment,
    actionRevisionId: ids.revision,
    financialRevision: "5",
  });
  mocks.reverse.mockResolvedValue({ actionId: ids.payment });
  mocks.detail.mockResolvedValue({ current: {} });
  mocks.refund.mockResolvedValue({ actionId: ids.payment });
});
describe("financial correction API", () => {
  it("binds actor and path while preserving durable acknowledgement and reason", async () => {
    const r = await POST(request(body()), context);
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(mocks.correct).toHaveBeenCalledWith(
      expect.objectContaining({
        ...body(),
        actionId: ids.payment,
        userId: ids.user,
        workspaceId: ids.workspace,
        requestId: expect.any(String),
      }),
    );
  });
  it("reads current evidence in the authenticated workspace", async () => {
    expect(
      (
        await GET(
          new Request("https://app.example.test/api/v1/financial-actions/a"),
          context,
        )
      ).status,
    ).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: ids.payment,
        workspaceId: ids.workspace,
        userId: ids.user,
      }),
    );
  });
  it.each(["userId", "workspaceId", "actionId"])(
    "rejects injected %s",
    async (field) => {
      expect(
        (await POST(request({ ...body(), [field]: ids.debt }), context)).status,
      ).toBe(422);
      expect(mocks.correct).not.toHaveBeenCalled();
    },
  );
  it("rejects a missing reason and cross-origin command before writing", async () => {
    expect(
      (await POST(request({ ...body(), reason: "" }), context)).status,
    ).toBe(422);
    expect(
      (await POST(request(body(), "https://foreign.example.test"), context))
        .status,
    ).toBe(403);
    expect(mocks.correct).not.toHaveBeenCalled();
  });
  it.each([
    new FinancialCorrectionStaleError(),
    new FinancialCommandConflictError(),
  ])("returns a conflict for stale or changed payload", async (error) => {
    mocks.correct.mockRejectedValueOnce(error);
    expect((await POST(request(body()), context)).status).toBe(409);
  });
  it("exposes explicit reversal and a genuine refund separately", async () => {
    const { replacement: _r, ...intent } = body();
    void _r;
    expect((await REVERSE(request(intent), context)).status).toBe(201);
    expect(
      (
        await REFUND(
          request({
            clientCommandId: ids.command,
            purchaseActionId: ids.payment,
            receivingAccountId: ids.account,
            effectiveDate: "2026-10-09",
            allocations: [
              {
                originalPurchasePostingId: ids.installment,
                amountMinor: "100",
                allocationKind: "purchase",
              },
            ],
            description: "Provider refund",
          }),
        )
      ).status,
    ).toBe(201);
    expect(mocks.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveDate: "2026-10-09",
        userId: ids.user,
      }),
    );
  });
  it("masks unexpected private persistence errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.correct.mockRejectedValueOnce(
      new Error("private bank record and SQL"),
    );
    const r = await POST(request(body()), context);
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("private bank record");
    log.mockRestore();
  });
});
