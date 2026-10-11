import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { recordCardPurchaseBodySchema } from "@/modules/finance/domain/card-purchase";
import { replacementIntentSchema } from "@/modules/finance/domain/financial-correction";
const body = () => ({
  clientCommandId: randomUUID(),
  cardId: randomUUID(),
  effectiveDate: "2026-10-10",
  postingDate: "2026-11-02",
  purchaseMinor: "300000",
  splits: [{ amountMinor: "300000" }],
  description: "Groceries",
});
describe("posted card purchase intent", () => {
  it("preserves separate provider dates and exact minor strings", () => {
    expect(
      recordCardPurchaseBodySchema.parse({
        ...body(),
        providerReference: "  statement line 123  ",
      }),
    ).toMatchObject({
      effectiveDate: "2026-10-10",
      postingDate: "2026-11-02",
      providerReference: "statement line 123",
      purchaseMinor: "300000",
    });
  });
  it.each([
    { postingDate: undefined },
    { postingDate: "2026-02-30" },
    { effectiveDate: "2026-02-30" },
    { purchaseMinor: 300000 },
    { purchaseMinor: "0300000" },
    { purchaseMinor: "0" },
    { purchaseMinor: "100000000001" },
    { splits: [{ amountMinor: "100000000001" }] },
    { splits: [] },
    { providerReference: " " },
    { providerReference: "x".repeat(2001) },
    { state: "pending" },
    { pending: true },
    { liabilityLedgerAccountId: randomUUID() },
    { fundingAccountId: randomUUID() },
    { userId: randomUUID() },
    { workspaceId: randomUUID() },
    { requestId: randomUUID() },
  ])("rejects invalid or untrusted input %j", (changes) =>
    expect(
      recordCardPurchaseBodySchema.safeParse({ ...body(), ...changes }).success,
    ).toBe(false),
  );
  it("supports strict card replacement intent without leaking actor fields", () => {
    const { clientCommandId: _id, ...intent } = body();
    void _id;
    expect(
      replacementIntentSchema.parse({ ...intent, actionKind: "card_purchase" }),
    ).toMatchObject({ actionKind: "card_purchase", postingDate: "2026-11-02" });
  });
});
