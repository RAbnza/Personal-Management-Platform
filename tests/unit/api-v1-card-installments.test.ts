import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  record: vi.fn(),
  apply: vi.fn(),
  reverse: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  setup: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/card-installments", () => ({
  recordCardInstallmentPlan: mocks.record,
  recordInstallmentApplication: mocks.apply,
  reverseInstallmentApplication: mocks.reverse,
}));
vi.mock("@/modules/finance/services/read-card-installments", () => ({
  listCardInstallmentPlans: mocks.list,
  getCardInstallmentPlan: mocks.detail,
  getCardInstallmentSetup: mocks.setup,
}));
import {
  GET,
  POST,
} from "@/app/api/v1/credit-cards/[cardId]/installments/route";
import { GET as setup } from "@/app/api/v1/credit-cards/[cardId]/installments/setup/route";
import { GET as detail } from "@/app/api/v1/credit-cards/[cardId]/installments/[planId]/route";
import { POST as revise } from "@/app/api/v1/credit-cards/[cardId]/installments/[planId]/revisions/route";
import { POST as apply } from "@/app/api/v1/credit-cards/[cardId]/installments/[planId]/applications/route";
import { POST as reverse } from "@/app/api/v1/credit-cards/[cardId]/installments/[planId]/applications/reversals/route";
import {
  CardInstallmentConflictError,
  CardInstallmentUnavailableError,
} from "@/modules/finance/domain/card-installment";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
const cardId = randomUUID(),
  planId = randomUUID(),
  userId = randomUUID(),
  workspaceId = randomUUID(),
  context = { params: Promise.resolve({ cardId, planId }) },
  root = { params: Promise.resolve({ cardId }) };
const body = {
  clientCommandId: randomUUID(),
  purchaseActionId: randomUUID(),
  purchaseActionRevisionId: randomUUID(),
  principalMinor: "10000",
  installmentCount: 1,
  verificationSource: "Actual provider",
  verifiedDate: "2026-10-12",
  providerConfirmed: true,
  installments: [{ principalMinor: "10000" }],
};
const request = (data: unknown = body, origin = "https://app.example.test") =>
  new Request("https://app.example.test/api/v1/credit-cards/x/installments", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of [
    "record",
    "apply",
    "reverse",
    "list",
    "detail",
    "setup",
  ] as const)
    mocks[key].mockResolvedValue({});
  mocks.actor.mockImplementation((_r, requestId) => ({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId },
  }));
});
describe("A5 private HTTP boundary", () => {
  it("trusts only authenticated scope/path and never caches private evidence", async () => {
    mocks.record.mockResolvedValue({ planId });
    expect((await POST(request(), root)).status).toBe(201);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        workspaceId,
        cardId,
        requestId: expect.any(String),
        lifecycle: "active",
      }),
    );
    for (const route of [GET, setup, detail]) {
      const r = await route(new Request("https://app.example.test"), context);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.detail).toHaveBeenCalledWith(
      expect.objectContaining({ planId, userId, workspaceId, cardId }),
    );
  });
  it.each([
    { userId: randomUUID() },
    { workspaceId: randomUUID() },
    { cardId: randomUUID() },
    { planId: randomUUID() },
    { refundEvidence: [] },
    { providerConfirmed: false },
    { installmentCount: 2 },
    { principalMinor: "10001" },
    {
      installments: [
        {
          principalMinor: "10000",
          interestMinor: "1",
          feeMinor: "0",
          totalMinor: "10000",
        },
      ],
    },
    { lifecycle: "cancelled" },
  ])("rejects spoofed or inconsistent evidence %j", async (extra) => {
    expect((await POST(request({ ...body, ...extra }), root)).status).toBe(422);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("validates provider revisions/cancellation and explicit application/reversal bodies", async () => {
    expect((await revise(request(body), context)).status).toBe(422);
    mocks.record.mockResolvedValue({ planId });
    expect(
      (
        await revise(
          request({
            ...body,
            expectedVersion: 1,
            reason: "Provider cancellation",
            lifecycle: "cancelled",
          }),
          context,
        )
      ).status,
    ).toBe(201);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ planId, cardId, expectedVersion: 1 }),
    );
    const b = {
      clientCommandId: randomUUID(),
      planRevisionId: randomUUID(),
      installmentNo: 1,
      allocationId: randomUUID(),
      principalMinor: "1",
      confirmationKind: "provider",
      confirmationSource: "Actual allocation",
      confirmedDate: "2026-11-01",
    };
    expect(
      (await apply(request({ ...b, interestMinor: "1" }), context)).status,
    ).toBe(422);
    mocks.apply.mockResolvedValue({ applicationId: randomUUID() });
    expect((await apply(request(b), context)).status).toBe(201);
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({ cardId, planId, userId, workspaceId }),
    );
    expect(
      (
        await reverse(
          request({
            clientCommandId: randomUUID(),
            applicationId: randomUUID(),
            reason: "Correction",
          }),
          context,
        )
      ).status,
    ).toBe(201);
  });
  it("checks origin before auth and returns auth failure without service access", async () => {
    for (const route of [POST, revise, apply, reverse])
      expect(
        (await route(request(body, "https://evil.test"), context)).status,
      ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response(null, { status: 401 }),
    });
    expect((await POST(request(), root)).status).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("supports the complete bounded 360-line provider schedule but rejects bodies over its own limit", async () => {
    const rows = Array.from({ length: 360 }, () => ({
      principalMinor: "1",
      providerReference: "証".repeat(2000),
      notes: "証".repeat(2000),
    }));
    expect(
      (
        await POST(
          request({
            ...body,
            principalMinor: "360",
            installmentCount: 360,
            installments: rows,
          }),
          root,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await POST(
          request({ ...body, notes: "x".repeat(8 * 1024 * 1024) }),
          root,
        )
      ).status,
    ).toBe(413);
    expect(
      (await apply(request({ notes: "x".repeat(65536) }), context)).status,
    ).toBe(413);
  });
  it.each([
    "offset=-1",
    "offset=10001",
    "revisionId=bad",
    "applicationOffset=1.1",
    "choiceOffset=NaN",
  ])("bounds private read options %s", async (query) => {
    expect(
      (await detail(new Request(`https://app.example.test?${query}`), context))
        .status,
    ).toBe(422);
    expect(mocks.detail).not.toHaveBeenCalled();
  });
  it.each([
    new CardInstallmentUnavailableError(),
    new CardInstallmentConflictError(),
    new FinancialCommandConflictError(),
    new RangeError("Invalid evidence"),
  ])("maps expected unavailable/conflicting evidence", async (error) => {
    mocks.record.mockRejectedValue(error);
    const r = await POST(request(), root);
    expect(r.status).toBe(
      error instanceof CardInstallmentUnavailableError
        ? 404
        : error instanceof RangeError
          ? 422
          : 409,
    );
    expect((await r.json()).retryable).toBe(false);
  });
  it("hides existence for malformed/missing/foreign paths and does not expose SQL on uncertain outcomes", async () => {
    mocks.detail.mockRejectedValue(new CardInstallmentUnavailableError());
    const a = await detail(new Request("https://app.example.test"), {
        params: Promise.resolve({ cardId, planId: "bad" }),
      }),
      b = await detail(new Request("https://app.example.test"), context);
    expect(a.status).toBe(404);
    expect((await a.json()).message).toBe((await b.json()).message);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.record.mockRejectedValue(Error("SELECT private provider credential"));
    const r = await POST(request(), root),
      p = await r.json();
    expect(r.status).toBe(500);
    expect(p.retryable).toBe(true);
    expect(JSON.stringify(p)).not.toContain("SELECT");
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Installment command outcome unconfirmed\. requestId=[\w-]+$/,
      ),
    );
  });
});
