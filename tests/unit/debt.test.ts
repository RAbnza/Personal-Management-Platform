import { describe, expect, it } from "vitest";
import {
  importDebtBodySchema,
  openingBreakdownStatus,
} from "@/modules/finance/domain/debt";

const valid = {
  clientCommandId: "11111111-1111-4111-8111-111111111111",
  name: "Loan",
  lenderName: "Lender",
  debtType: "personal_loan",
  startDate: "2026-01-01",
  openingCutoffDate: "2026-10-06",
  openingLiabilityMinor: "10001",
  openingComponents: [{ kind: "unclassified", amountMinor: "10001" }],
  scheduleReason: "Unknown prior history",
};
describe("existing debt contract", () => {
  it("retains unknown history and derives breakdown without guessing", () => {
    const parsed = importDebtBodySchema.parse(valid);
    expect(parsed.originalPrincipalMinor).toBeNull();
    expect(parsed.installments).toEqual([]);
    expect(openingBreakdownStatus(parsed.openingComponents)).toBe("unknown");
  });
  it.each(["0", "-1", "1e4", "10.01", "01001", "100000000001"])(
    "rejects invalid recognized amount %s",
    (amount) => {
      expect(
        importDebtBodySchema.safeParse({
          ...valid,
          openingLiabilityMinor: amount,
        }).success,
      ).toBe(false);
    },
  );
  it("rejects duplicates, ownership injection, and mismatched totals", () => {
    for (const mutation of [
      { userId: valid.clientCommandId },
      { openingComponents: [{ kind: "principal", amountMinor: "10000" }] },
      {
        openingComponents: [
          { kind: "principal", amountMinor: "1" },
          { kind: "principal", amountMinor: "10000" },
        ],
      },
      { openingCutoffDate: "2025-12-31" },
    ])
      expect(
        importDebtBodySchema.safeParse({ ...valid, ...mutation }).success,
      ).toBe(false);
  });
  it("validates schedule totals without equating them to recognized liability", () => {
    expect(
      importDebtBodySchema.safeParse({
        ...valid,
        installments: [
          {
            dueDate: "2026-12-01",
            contractualMinor: "50000",
            openingSatisfiedMinor: "10",
          },
        ],
      }).success,
    ).toBe(true);
    for (const row of [
      { openingSatisfiedMinor: "101" },
      { breakdownComplete: true },
      { knownPrincipalMinor: "101" },
    ])
      expect(
        importDebtBodySchema.safeParse({
          ...valid,
          installments: [
            { dueDate: "2026-12-01", contractualMinor: "100", ...row },
          ],
        }).success,
      ).toBe(false);
  });
});
