import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  recordCardCommandBodySchema,
  cardAllocationBodySchema,
} from "@/modules/finance/domain/card-command";
import {
  deriveStatementReconciliation,
  statementEvidenceSchema,
} from "@/modules/finance/domain/card-statement";
const base = {
  clientCommandId: randomUUID(),
  cardId: randomUUID(),
  actionKind: "card_fee",
  amountMinor: "10000",
  effectiveDate: "2026-10-10",
  postingDate: "2026-10-11",
  description: "Actual provider charge",
  confirmationSource: "Provider record",
  providerConfirmed: true,
};
describe("A4 exact supported financial intents", () => {
  it.each(["card_fee", "card_interest", "card_refund"])(
    "accepts confirmed %s without cash",
    (actionKind) => {
      expect(
        recordCardCommandBodySchema.safeParse({ ...base, actionKind }).success,
      ).toBe(true);
    },
  );
  it.each(["0", "-1", "1.01", "01", "9007199254740993", "100000000001"])(
    "rejects unsupported amount %s",
    (amountMinor) => {
      expect(
        recordCardCommandBodySchema.safeParse({ ...base, amountMinor }).success,
      ).toBe(false);
    },
  );
  it("normalizes identifiers and rejects trusted ownership/balance fields", () => {
    const v = recordCardCommandBodySchema.parse({
      ...base,
      cardId: base.cardId.toUpperCase(),
    });
    expect(v.cardId).toBe(base.cardId);
    for (const extra of [
      { userId: randomUUID() },
      { workspaceId: randomUUID() },
      { liabilityMinor: "1" },
      { providerConfirmed: false },
      { confirmationSource: "" },
      { postingDate: "2026-02-30" },
    ])
      expect(
        recordCardCommandBodySchema.safeParse({ ...base, ...extra }).success,
      ).toBe(false);
  });
  it("requires payments to use only a cash source, and other kinds to exclude cash", () => {
    expect(
      recordCardCommandBodySchema.safeParse({
        ...base,
        actionKind: "card_payment",
      }).success,
    ).toBe(false);
    expect(
      recordCardCommandBodySchema.safeParse({
        ...base,
        actionKind: "card_payment",
        payingAccountId: randomUUID(),
      }).success,
    ).toBe(true);
    expect(
      recordCardCommandBodySchema.safeParse({
        ...base,
        payingAccountId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      recordCardCommandBodySchema.safeParse({
        ...base,
        actionKind: "card_payment",
        payingAccountId: randomUUID(),
        categoryId: randomUUID(),
      }).success,
    ).toBe(false);
  });
  it("requires exact distinct linked refund portions and no invented category", () => {
    const linked = {
      ...base,
      actionKind: "card_refund",
      purchaseActionId: randomUUID(),
      refundParts: [
        { originalPurchasePostingId: randomUUID(), amountMinor: "10000" },
      ],
    };
    expect(recordCardCommandBodySchema.safeParse(linked).success).toBe(true);
    for (const extra of [
      { refundParts: [] },
      { amountMinor: "9000" },
      { categoryId: randomUUID() },
      {
        refundParts: [linked.refundParts[0], linked.refundParts[0]],
        amountMinor: "20000",
      },
    ])
      expect(
        recordCardCommandBodySchema.safeParse({ ...linked, ...extra }).success,
      ).toBe(false);
  });
  it.each([
    ["decimal", "1.01"],
    ["text", "not-money"],
    ["oversized", "9".repeat(10000)],
  ])(
    "returns validation issues for malformed linked refund amounts without throwing (%s)",
    (_label, amountMinor) => {
      const linked = {
        ...base,
        actionKind: "card_refund",
        purchaseActionId: randomUUID(),
        refundParts: [
          { originalPurchasePostingId: randomUUID(), amountMinor: "10000" },
        ],
      };
      expect(
        recordCardCommandBodySchema.safeParse({ ...linked, amountMinor })
          .success,
      ).toBe(false);
      expect(
        recordCardCommandBodySchema.safeParse({
          ...linked,
          refundParts: [{ ...linked.refundParts[0], amountMinor }],
        }).success,
      ).toBe(false);
    },
  );
  it("requires explicit user/provider allocation evidence", () => {
    const v = {
      clientCommandId: randomUUID(),
      statementRevisionId: randomUUID(),
      sourceActionRevisionId: randomUUID(),
      amountMinor: "1",
      confirmationKind: "user",
      confirmationSource: "Actual allocation confirmation",
      confirmedDate: "2026-10-12",
    };
    expect(cardAllocationBodySchema.safeParse(v).success).toBe(true);
    expect(
      cardAllocationBodySchema.safeParse({
        ...v,
        confirmationKind: "guessed_fifo",
      }).success,
    ).toBe(false);
  });
  it("derives due and separate provider/excess credits with exact bigint arithmetic", () => {
    const s = statementEvidenceSchema.parse({
      cycleStart: "2026-10-01",
      cycleEnd: "2026-10-31",
      statementDate: "2026-11-01",
      dueDate: "2026-11-20",
      balanceMinor: "9007199254740993",
      minimumDueMinor: "0",
      verificationSource: "Provider PDF",
      verifiedDate: "2026-11-02",
      entries: [],
    });
    expect(
      deriveStatementReconciliation(s, "8000").recordedRemainingDueMinor,
    ).toBe("9007199254732993");
    expect(
      deriveStatementReconciliation({ ...s, balanceMinor: "-100" }, "0")
        .providerCreditMinor,
    ).toBe("100");
    const r = deriveStatementReconciliation(
      { ...s, balanceMinor: "100" },
      "125",
    );
    expect(r.recordedRemainingDueMinor).toBe("0");
    expect(r.excessCreditMinor).toBe("25");
    expect(() => deriveStatementReconciliation(s, "-1")).toThrow();
  });
});
