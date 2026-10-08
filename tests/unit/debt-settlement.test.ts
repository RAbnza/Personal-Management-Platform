import { describe, expect, it } from "vitest";
import {
  buildSettlementPreview,
  settleDebtBodySchema,
  SettlementPreviewStaleError,
} from "@/modules/finance/domain/debt-settlement";
import { settlementBody, settlementSetup } from "./helpers/debt-settlement";
import { paymentIds } from "./helpers/debt-payment";
const preview = () => {
  const s = settlementSetup();
  return buildSettlementPreview(
    settlementBody(),
    s,
    s.detail.debt.recognizedLiabilityComponents,
  );
};
describe("settlement contract and exact preview", () => {
  it("separates payment, avoided future charge and immutable opening evidence", () => {
    expect(preview()).toMatchObject({
      confirmedPayoffMinor: "100000",
      avoidedFutureMinor: "10000",
      recognizedWaiverMinor: "0",
      newChargesMinor: "0",
      residualMinor: "0",
      entries: [
        {
          openingSatisfiedMinor: "0",
          paymentSatisfiedMinor: "100000",
          cancelledMinor: "10000",
          disposition: "cancelled",
        },
      ],
    });
  });
  it.each(["userId", "workspaceId", "openingSatisfiedMinor", "residualMinor"])(
    "rejects injected %s",
    (key) =>
      expect(
        settleDebtBodySchema.safeParse({
          ...settlementBody(),
          [key]: paymentIds.user,
        }).success,
      ).toBe(false),
  );
  it("requires explicit contractual confirmation", () =>
    expect(
      settleDebtBodySchema.safeParse({
        ...settlementBody(),
        allocationConfirmed: false,
      }).success,
    ).toBe(false));
  it.each(["-1", "1.00", "01", "100000000001"])(
    "rejects invalid amount %s",
    (actualCashPaidMinor) =>
      expect(
        settleDebtBodySchema.safeParse({
          ...settlementBody(),
          actualCashPaidMinor,
        }).success,
      ).toBe(false),
  );
  it("excludes external fees from contractual satisfaction", () => {
    const b = settlementBody();
    b.externalFeeMinor = "1000";
    b.actualCashPaidMinor = "101000";
    const s = settlementSetup();
    expect(
      buildSettlementPreview(b, s, s.detail.debt.recognizedLiabilityComponents)
        .entries[0]?.paymentSatisfiedMinor,
    ).toBe("100000");
    expect(
      settleDebtBodySchema.safeParse({
        ...b,
        dueAllocations: [
          { installmentId: paymentIds.installment, amountMinor: "101000" },
        ],
      }).success,
    ).toBe(false);
  });
  it("requires source evidence or disclosed imported treatment for recognized waiver", () =>
    expect(
      settleDebtBodySchema.safeParse({
        ...settlementBody(),
        adjustments: [
          {
            kind: "recognized_waiver",
            liabilityComponent: "interest",
            amountMinor: "100",
            recognizedSourcePostingId: null,
            unknownOpening: false,
            categoryId: null,
            explanation: "Confirmed waiver",
            providerConfirmed: true,
          },
        ],
      }).success,
    ).toBe(false));
  it("does not allow avoided charges to create postings", () =>
    expect(
      settleDebtBodySchema.safeParse({
        ...settlementBody(),
        adjustments: [
          {
            ...settlementBody().adjustments[0]!,
            recognizedSourcePostingId: paymentIds.revision,
          },
        ],
      }).success,
    ).toBe(false));
  it("requires an explicit rounding treatment, never an inferred plug", () =>
    expect(
      settleDebtBodySchema.safeParse({
        ...settlementBody(),
        adjustments: [
          { ...settlementBody().adjustments[0]!, kind: "rounding_correction" },
        ],
      }).success,
    ).toBe(false));
  it("rejects liability mismatch in each component even when the net total is zero", () => {
    const s = settlementSetup();
    const b = settlementBody();
    b.liabilityPayments = [{ kind: "interest", amountMinor: "100000" }];
    expect(() =>
      buildSettlementPreview(b, s, s.detail.debt.recognizedLiabilityComponents),
    ).toThrow("every recognized liability component");
  });
  it.each(["version", "schedule", "financial"])(
    "rejects stale %s snapshot",
    (kind) => {
      const s = settlementSetup();
      const b = settlementBody();
      if (kind === "version") b.expectedDebtVersion = 2;
      else if (kind === "schedule")
        b.expectedScheduleVersionId = paymentIds.command;
      else b.expectedFinancialRevision = "3";
      expect(() =>
        buildSettlementPreview(
          b,
          s,
          s.detail.debt.recognizedLiabilityComponents,
        ),
      ).toThrow(SettlementPreviewStaleError);
    },
  );
  it("rejects unresolved clearing", () => {
    const s = settlementSetup();
    s.detail.debt.paymentClearingMinor = "1";
    expect(() =>
      buildSettlementPreview(
        settlementBody(),
        s,
        s.detail.debt.recognizedLiabilityComponents,
      ),
    ).toThrow("clearing");
  });
  it("avoided metadata cannot resolve recognized liability", () => {
    const b = settlementBody();
    b.adjustments[0]!.amountMinor = "10001";
    b.confirmedPayoffMinor = "99999";
    b.actualCashPaidMinor = "99999";
    b.liabilityPayments[0]!.amountMinor = "99999";
    b.dueAllocations[0]!.amountMinor = "99999";
    const s = settlementSetup();
    expect(() =>
      buildSettlementPreview(b, s, s.detail.debt.recognizedLiabilityComponents),
    ).toThrow("zero residual");
  });
  it("requires exhaustive original pools and preserves paid satisfaction", () => {
    const s = settlementSetup();
    s.pools = [
      {
        paymentRevisionId: paymentIds.revision,
        sourceAllocationId: paymentIds.command,
        amountMinor: "100",
        paymentDate: "2026-10-01",
        sourceDueDate: "2026-10-20",
        currentTargets: [
          { obligationId: paymentIds.installment, amountMinor: "100" },
        ],
      },
    ];
    expect(() =>
      buildSettlementPreview(
        settlementBody(),
        s,
        s.detail.debt.recognizedLiabilityComponents,
      ),
    ).toThrow("every original");
  });
});
