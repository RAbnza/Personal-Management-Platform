import { paymentIds } from "./debt-payment";
import type {
  AdjustmentPreview,
  ReconciliationItem,
  ReconciliationPreview,
  ReconciliationSetup,
} from "@/modules/finance/domain/reconciliation";
export function reconciliationSetup(): ReconciliationSetup {
  return {
    account: {
      financialAccountId: paymentIds.account,
      name: "Daily bank",
      currency: "PHP",
      openingCutoffDate: "2026-09-30",
      archived: false,
      version: 1,
      currentBalanceMinor: "20000",
    },
    financialRevision: "4",
    history: [],
    adjustments: [],
  };
}
export function comparisonBody() {
  return {
    clientCommandId: paymentIds.command,
    expectedFinancialRevision: "4",
    expectedAccountVersion: 1,
    cutoffDate: "2026-10-08",
    observedMinor: "20100",
    reference: "STATEMENT",
    notes: "Provider comparison",
    supersedesReconciliationId: null,
  };
}
export function adjustmentBody() {
  return {
    clientCommandId: paymentIds.command,
    expectedFinancialRevision: "4",
    expectedAccountVersion: 1,
    effectiveDate: "2026-10-08",
    signedAdjustmentMinor: "100",
    reason: "Statement difference",
    reconciliationId: null,
    acknowledgeNegativeBalance: false,
  };
}
export function comparisonPreview(
  body = comparisonBody(),
): ReconciliationPreview {
  return {
    financialAccountId: paymentIds.account,
    accountName: "Daily bank",
    currency: "PHP",
    cutoffDate: body.cutoffDate,
    observedMinor: body.observedMinor,
    calculatedMinor: "20000",
    differenceMinor: (BigInt(body.observedMinor) - 20000n).toString(),
    financialRevision: "4",
    sourceJournalCount: "1",
    status: body.observedMinor === "20000" ? "verified" : "difference",
    supersedesReconciliationId: body.supersedesReconciliationId,
  };
}
export function adjustmentPreview(body = adjustmentBody()): AdjustmentPreview {
  const after = (20000n + BigInt(body.signedAdjustmentMinor)).toString();
  return {
    financialAccountId: paymentIds.account,
    accountName: "Daily bank",
    currency: "PHP",
    effectiveDate: body.effectiveDate,
    signedAdjustmentMinor: body.signedAdjustmentMinor,
    reason: body.reason,
    balanceAtDateBeforeMinor: "20000",
    balanceAtDateAfterMinor: after,
    currentBalanceBeforeMinor: "20000",
    currentBalanceAfterMinor: after,
    adjustmentEquityMinor: (-BigInt(body.signedAdjustmentMinor)).toString(),
    negativeBalance: BigInt(after) < 0n,
    financialRevision: "4",
    reconciliation: null,
  };
}
export function comparisonItem(): ReconciliationItem {
  return {
    reconciliationId: paymentIds.debt,
    cutoffDate: "2026-10-08",
    observedMinor: "20100",
    calculatedMinor: "20000",
    differenceMinor: "100",
    financialRevision: "4",
    sourceJournalCount: "1",
    currentCalculatedMinor: "20000",
    currentSourceJournalCount: "1",
    status: "difference",
    needsReview: false,
    reference: "STATEMENT",
    notes: "Observed at provider",
    supersedesReconciliationId: null,
    supersededByReconciliationId: null,
    recordedAt: "2026-10-08T10:00:00.000Z",
    adjustments: [],
  };
}
