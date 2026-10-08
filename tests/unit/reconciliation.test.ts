import { describe, expect, it } from "vitest";
import {
  adjustAccountBodySchema,
  reconcileAccountBodySchema,
  reconciliationStatus,
} from "@/modules/finance/domain/reconciliation";
import {
  adjustmentBody,
  comparisonBody,
  comparisonItem,
} from "./helpers/reconciliation";
import { paymentIds } from "./helpers/debt-payment";
describe("D11 exact signed amounts and comparison state", () => {
  it.each(["0", "-1", "9223372036854775807", "-9223372036854775808"])(
    "accepts signed provider balance %s",
    (v) =>
      expect(
        reconcileAccountBodySchema.parse({
          ...comparisonBody(),
          financialAccountId: paymentIds.account,
          observedMinor: v,
        }).observedMinor,
      ).toBe(v),
  );
  it.each([
    "-0",
    "01",
    "+1",
    "1.1",
    "1e2",
    " 100",
    "9223372036854775808",
    "-9223372036854775809",
  ])("rejects noncanonical/out-of-range provider balance %s", (v) =>
    expect(
      reconcileAccountBodySchema.safeParse({
        ...comparisonBody(),
        financialAccountId: paymentIds.account,
        observedMinor: v,
      }).success,
    ).toBe(false),
  );
  it.each(["0", "100000000001", "-100000000001"])(
    "rejects unsupported adjustment %s",
    (v) =>
      expect(
        adjustAccountBodySchema.safeParse({
          ...adjustmentBody(),
          financialAccountId: paymentIds.account,
          signedAdjustmentMinor: v,
        }).success,
      ).toBe(false),
  );
  it("requires a reason and rejects client ownership fields", () => {
    expect(
      adjustAccountBodySchema.safeParse({
        ...adjustmentBody(),
        financialAccountId: paymentIds.account,
        reason: " ",
      }).success,
    ).toBe(false);
    expect(
      reconcileAccountBodySchema.safeParse({
        ...comparisonBody(),
        financialAccountId: paymentIds.account,
        userId: paymentIds.user,
      }).success,
    ).toBe(false);
  });
  it("distinguishes exact matches, differences, source changes and supersession", () => {
    const r = comparisonItem();
    expect(reconciliationStatus(r).status).toBe("difference");
    expect(
      reconciliationStatus({ ...r, observedMinor: r.calculatedMinor }).status,
    ).toBe("verified");
    expect(
      reconciliationStatus({
        ...r,
        observedMinor: r.calculatedMinor,
        currentSourceJournalCount: "2",
      }),
    ).toEqual({ status: "needs_review", needsReview: true });
    expect(
      reconciliationStatus({ ...r, currentCalculatedMinor: "20001" }).status,
    ).toBe("needs_review");
    expect(
      reconciliationStatus({
        ...r,
        supersededByReconciliationId: paymentIds.command,
        currentSourceJournalCount: "2",
      }),
    ).toEqual({ status: "superseded", needsReview: true });
  });
});
