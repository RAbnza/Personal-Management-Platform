import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  purchase: vi.fn(),
  create: vi.fn(),
  cash: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/record-expense", () => ({
  recordExpense: mocks.cash,
  recordCardPurchase: mocks.purchase,
}));
vi.mock("@/modules/finance/services/credit-cards", () => ({
  createCreditCard: mocks.create,
}));
import { POST as purchasePost } from "@/app/api/v1/financial-actions/route";
import { POST as createPost } from "@/app/api/v1/credit-cards/route";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
const userId = randomUUID(),
  workspaceId = randomUUID(),
  request = (
    data: unknown,
    path = "financial-actions",
    origin = "https://app.example.test",
  ) =>
    new Request(`https://app.example.test/api/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(data),
    });
const body = () => ({
  actionKind: "card_purchase",
  clientCommandId: randomUUID(),
  cardId: randomUUID(),
  effectiveDate: "2026-10-10",
  postingDate: "2026-11-02",
  purchaseMinor: "300000",
  splits: [{ amountMinor: "300000", categoryId: null }],
  description: "Groceries",
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockImplementation((_r, requestId) => ({
    kind: "actor",
    actor: { userId, workspaceId, requestId, sessionId: randomUUID() },
  }));
  mocks.purchase.mockResolvedValue({
    actionId: randomUUID(),
    actionRevisionId: randomUUID(),
    financialRevision: "3",
  });
});
describe("card purchase and card metadata API", () => {
  it("dispatches Add Expense to the card command with server-owned context", async () => {
    const b = body(),
      response = await purchasePost(request(b));
    expect(response.status).toBe(201);
    const { actionKind: _kind, ...intent } = b;
    void _kind;
    expect(mocks.purchase).toHaveBeenCalledWith({
      ...intent,
      providerReference: null,
      acknowledgeNegativeBalance: false,
      userId,
      workspaceId,
      requestId: expect.any(String),
    });
    expect(mocks.cash).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      actionKind: "card_purchase",
      financialRevision: "3",
    });
  });
  it.each([
    { userId: randomUUID() },
    { workspaceId: randomUUID() },
    { requestId: randomUUID() },
    { fundingAccountId: randomUUID() },
    { pending: true },
    { postingDate: undefined },
  ])("rejects %j before recording", async (changes) => {
    expect(
      (await purchasePost(request({ ...body(), ...changes }))).status,
    ).toBe(422);
    expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it("rejects foreign mutation origins before authentication", async () => {
    expect(
      (
        await purchasePost(
          request(body(), "financial-actions", "https://foreign.test"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("uses the same safe unavailable response for foreign and absent cards", async () => {
    mocks.purchase.mockRejectedValue(new CreditCardUnavailableError());
    const r = await purchasePost(request(body()));
    expect(r.status).toBe(404);
    expect(JSON.stringify(await r.json())).not.toContain(workspaceId);
  });
  it("returns a command conflict without recording again", async () => {
    mocks.purchase.mockRejectedValue(new FinancialCommandConflictError());
    expect((await purchasePost(request(body()))).status).toBe(409);
  });
  it("creates card metadata with trusted actor context and excludes internal ledger identity", async () => {
    const cardId = randomUUID();
    mocks.create.mockResolvedValue({
      cardId,
      liabilityLedgerAccountId: randomUUID(),
      version: 1,
      financialRevision: "1",
    });
    const r = await createPost(
      request(
        { clientCommandId: randomUUID(), name: "BPI Visa", issuerName: "BPI" },
        "credit-cards",
      ),
    );
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({
      cardId,
      version: 1,
      financialRevision: "1",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId, workspaceId, creditLimitMinor: null }),
    );
  });
  it("rejects spoofed context and monetary effects in card metadata", async () => {
    for (const extra of [{ workspaceId }, { openingBalanceMinor: "100" }])
      expect(
        (
          await createPost(
            request(
              {
                clientCommandId: randomUUID(),
                name: "BPI",
                issuerName: "BPI",
                ...extra,
              },
              "credit-cards",
            ),
          )
        ).status,
      ).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
