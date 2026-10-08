import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  record: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/record-debt-payment", () => ({
  recordDebtPayment: mocks.record,
}));
vi.mock("@/modules/finance/services/read-debts", async (original) => ({
  ...(await original<object>()),
  listDebtPayments: mocks.history,
}));
import {
  POST as paymentPost,
  GET,
} from "@/app/api/v1/debts/[debtId]/payments/route";
import { PaymentPreviewStaleError } from "@/modules/finance/domain/debt-payment";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { paymentBody, paymentIds, paymentResult } from "./helpers/debt-payment";
const POST = (request: Request) =>
  paymentPost(request, {
    params: Promise.resolve({ debtId: paymentIds.debt }),
  });
const apiBody = () => {
  const body: Record<string, unknown> = { ...paymentBody() };
  delete body.debtId;
  return body;
};
const request = (
  body: unknown = apiBody(),
  origin = "https://app.example.test",
) =>
  new Request(
    `https://app.example.test/api/v1/debts/${paymentIds.debt}/payments`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  mocks.record.mockResolvedValue(paymentResult);
});
describe("debt payment HTTP boundary", () => {
  it("records only authenticated ownership, returns committed IDs and prevents caching", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      actionKind: "debt_payment",
      ...paymentResult,
    });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: paymentIds.user,
        workspaceId: paymentIds.workspace,
        requestId: expect.any(String),
      }),
    );
  });
  it("rejects a foreign mutation origin before authentication or financial work", async () => {
    expect(
      (await POST(request(undefined, "https://foreign.example.test"))).status,
    ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it.each([
    "workspaceId",
    "userId",
    "requestId",
    "currency",
    "liabilityLedgerAccountId",
    "debtId",
  ])("rejects injected %s", async (field) => {
    expect(
      (
        await POST(
          request({
            ...apiBody(),
            [field]: paymentIds.user,
          }),
        )
      ).status,
    ).toBe(422);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("requires explicit due confirmation", async () => {
    expect(
      (
        await POST(
          request({
            ...apiBody(),
            dueAllocationConfirmed: false,
          }),
        )
      ).status,
    ).toBe(422);
  });
  it.each([
    [new PaymentPreviewStaleError(), 409, "PAYMENT_PREVIEW_STALE"],
    [new FinancialCommandConflictError(), 409, "IDEMPOTENCY_CONFLICT"],
    [new DebtUnavailableError(), 404, "DEBT_UNAVAILABLE"],
    [new RangeError("Allocation exceeds due"), 422, "BUSINESS_RULE_VIOLATION"],
  ] as const)("translates domain failure %#", async (error, status, code) => {
    mocks.record.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  });
  it("keeps unauthorized requests out of mutation and history services", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response("{}", { status: 401 }),
    });
    expect((await POST(request())).status).toBe(401);
    expect(
      (
        await GET(
          new Request("https://app.example.test/api/v1/debts/x/payments"),
          { params: Promise.resolve({ debtId: paymentIds.debt }) },
        )
      ).status,
    ).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("passes only owned debt and validated cursor to payment history", async () => {
    mocks.history.mockResolvedValue({
      financialRevision: "5",
      items: [],
      nextCursor: null,
    });
    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/debts/${paymentIds.debt}/payments?after=${paymentIds.revision}`,
      ),
      { params: Promise.resolve({ debtId: paymentIds.debt }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.history).toHaveBeenCalledWith({
      userId: paymentIds.user,
      workspaceId: paymentIds.workspace,
      debtId: paymentIds.debt,
      after: paymentIds.revision,
    });
  });
  it("rejects unrecognized history filters", async () => {
    expect(
      (
        await GET(
          new Request("https://app.example.test/payments?workspaceId=x"),
          { params: Promise.resolve({ debtId: paymentIds.debt }) },
        )
      ).status,
    ).toBe(422);
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
