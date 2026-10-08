import {
  settleDebtBodySchema,
  buildSettlementPreview,
} from "@/modules/finance/domain/debt-settlement";
import type { getDebtSettlementSetup } from "@/modules/finance/services/settle-debt";
import { paymentAccount, paymentDetail, paymentIds } from "./debt-payment";
export function settlementSetup(): Awaited<
  ReturnType<typeof getDebtSettlementSetup>
> {
  return {
    detail: paymentDetail(),
    frequency: "manual",
    versionNo: 1,
    pools: [],
    accounts: { financialRevision: "4", items: [paymentAccount] },
    categories: { items: [] },
    chargeSources: [],
  };
}
export function settlementBody() {
  return settleDebtBodySchema.parse({
    clientCommandId: paymentIds.command,
    debtId: paymentIds.debt,
    expectedDebtVersion: 1,
    expectedScheduleVersionId: paymentIds.schedule,
    expectedFinancialRevision: "4",
    settlementDate: "2026-10-08",
    settlementKind: "early",
    payingAccountId: paymentIds.account,
    actualCashPaidMinor: "100000",
    confirmedPayoffMinor: "100000",
    externalFeeMinor: "0",
    externalFeeLabel: "External settlement fee",
    externalFeeCategoryId: null,
    liabilityPayments: [{ kind: "principal", amountMinor: "100000" }],
    adjustments: [
      {
        kind: "avoided_future_charge",
        liabilityComponent: null,
        amountMinor: "10000",
        recognizedSourcePostingId: null,
        unknownOpening: false,
        categoryId: null,
        explanation: "Future interest avoided",
        providerConfirmed: true,
      },
    ],
    dueAllocations: [
      { installmentId: paymentIds.installment, amountMinor: "100000" },
    ],
    unappliedContractualMinor: "0",
    poolMappings: [],
    unappliedResolutionNote: null,
    allocationConfirmed: true,
    confirmationSource: "provider",
    confirmationNote: "Provider confirmed payoff",
    acknowledgeNegativeBalance: false,
    providerReference: "CONFIRMED",
    reason: "Confirmed early payoff",
  });
}
export function settlementPreview() {
  const s = settlementSetup();
  return {
    ...buildSettlementPreview(
      settlementBody(),
      s,
      s.detail.debt.recognizedLiabilityComponents,
    ),
    payingBalanceBeforeMinor: "500000",
    payingBalanceAfterMinor: "400000",
  };
}
export const settlementResult = {
  debtId: paymentIds.debt,
  settlementId: paymentIds.command,
  actionId: paymentIds.command,
  actionRevisionId: paymentIds.revision,
  paymentId: paymentIds.payment,
  closingScheduleVersionId: paymentIds.revision,
  debtVersion: 2,
  financialRevision: "5",
  lifecycle: "settled_early",
};
