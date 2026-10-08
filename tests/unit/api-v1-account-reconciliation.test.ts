import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  compare: vi.fn(),
  adjust: vi.fn(),
  comparePreview: vi.fn(),
  adjustPreview: vi.fn(),
  setup: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/reconcile-account", () => ({
  reconcileAccount: mocks.compare,
  adjustAccountBalance: mocks.adjust,
  previewAccountReconciliation: mocks.comparePreview,
  previewAccountAdjustment: mocks.adjustPreview,
  getAccountReconciliationSetup: mocks.setup,
}));
import {
  GET,
  POST,
} from "@/app/api/v1/accounts/[accountId]/reconciliations/route";
import { POST as COMPARE_PREVIEW } from "@/app/api/v1/accounts/[accountId]/reconciliations/preview/route";
import { POST as ADJUST } from "@/app/api/v1/accounts/[accountId]/adjustments/route";
import { POST as ADJUST_PREVIEW } from "@/app/api/v1/accounts/[accountId]/adjustments/preview/route";
import {
  ReconciliationPreviewStaleError,
  ReconciliationUnavailableError,
} from "@/modules/finance/domain/reconciliation";
import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "@/modules/finance/domain/financial-command";
import {
  comparisonBody,
  adjustmentBody,
  comparisonPreview,
  adjustmentPreview,
  reconciliationSetup,
} from "./helpers/reconciliation";
import { paymentIds } from "./helpers/debt-payment";
const context = { params: Promise.resolve({ accountId: paymentIds.account }) };
const request = (
  b: unknown = comparisonBody(),
  origin = "https://app.example.test",
) =>
  new Request("https://app.example.test/api/v1/accounts/a/reconciliations", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockImplementation((_r: Request, requestId: string) => ({
    kind: "authenticated",
    actor: {
      userId: paymentIds.user,
      workspaceId: paymentIds.workspace,
      requestId,
    },
  }));
  mocks.compare.mockResolvedValue({ reconciliationId: paymentIds.debt });
  mocks.adjust.mockResolvedValue({ actionId: paymentIds.debt });
  mocks.comparePreview.mockResolvedValue(comparisonPreview());
  mocks.adjustPreview.mockResolvedValue(adjustmentPreview());
  mocks.setup.mockResolvedValue(reconciliationSetup());
});
describe("account reconciliation API", () => {
  it.each([
    [POST, mocks.compare, comparisonBody, 201],
    [COMPARE_PREVIEW, mocks.comparePreview, comparisonBody, 200],
    [ADJUST, mocks.adjust, adjustmentBody, 201],
    [ADJUST_PREVIEW, mocks.adjustPreview, adjustmentBody, 200],
  ] as const)(
    "binds account and actor for a command/preview",
    async (route, mock, body, status) => {
      const res = await route(request(body()), context);
      expect(res.status).toBe(status);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({
          ...body(),
          userId: paymentIds.user,
          workspaceId: paymentIds.workspace,
          financialAccountId: paymentIds.account,
          requestId: expect.any(String),
        }),
      );
    },
  );
  it("reads only the authenticated account history", async () => {
    const res = await GET(
      new Request("https://app.example.test/api/v1/accounts/a/reconciliations"),
      context,
    );
    expect(res.status).toBe(200);
    expect(mocks.setup).toHaveBeenCalledWith({
      userId: paymentIds.user,
      workspaceId: paymentIds.workspace,
      financialAccountId: paymentIds.account,
    });
  });
  it("rejects cross-origin writes before authentication", async () => {
    expect(
      (
        await POST(
          request(comparisonBody(), "https://foreign.example.test"),
          context,
        )
      ).status,
    ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it.each(["userId", "workspaceId", "financialAccountId"])(
    "rejects body-injected %s",
    async (field) => {
      expect(
        (
          await POST(
            request({ ...comparisonBody(), [field]: paymentIds.debt }),
            context,
          )
        ).status,
      ).toBe(422);
      expect(mocks.compare).not.toHaveBeenCalled();
    },
  );
  it("bounds JSON transport", async () => {
    const r = request();
    r.headers.set("Content-Length", "65537");
    expect((await POST(r, context)).status).toBe(413);
  });
  it.each([
    [
      new ReconciliationPreviewStaleError(),
      409,
      "RECONCILIATION_PREVIEW_STALE",
    ],
    [
      new ReconciliationUnavailableError(),
      404,
      "ACCOUNT_COMPARISON_UNAVAILABLE",
    ],
    [new FinancialCommandConflictError(), 409, "IDEMPOTENCY_CONFLICT"],
    [new FinancialCommandStateError("private"), 503, "TEMPORARY_UNAVAILABLE"],
    [new RangeError("Review date"), 422, "BUSINESS_RULE_VIOLATION"],
  ])("maps safe business conflicts", async (error, status, code) => {
    mocks.adjust.mockRejectedValueOnce(error);
    const res = await ADJUST(request(adjustmentBody()), context);
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });
  it("masks unexpected database details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.compare.mockRejectedValueOnce(
        new Error("private SQL connection password"),
      );
      const res = await POST(request(), context);
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain("password");
    } finally {
      log.mockRestore();
    }
  });
  it("returns authentication failures without calling finance", async () => {
    mocks.actor.mockResolvedValueOnce({
      kind: "response",
      response: new Response("", { status: 401 }),
    });
    expect((await POST(request(), context)).status).toBe(401);
    expect(mocks.compare).not.toHaveBeenCalled();
  });
});
