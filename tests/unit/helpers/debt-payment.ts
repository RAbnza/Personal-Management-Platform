import type { DebtDetailResult } from "@/modules/finance/domain/debt";
import type { RecordDebtPaymentBody } from "@/modules/finance/domain/debt-payment";
import type { FinancialAccountListItem } from "@/modules/finance/services/list-financial-accounts";
import { parseCalendarDate } from "@/shared/calendar-date";

export const paymentIds = {
  user: "11111111-1111-4111-8111-111111111111",
  workspace: "22222222-2222-4222-8222-222222222222",
  debt: "33333333-3333-4333-8333-333333333333",
  account: "44444444-4444-4444-8444-444444444444",
  schedule: "55555555-5555-4555-8555-555555555555",
  installment: "66666666-6666-4666-8666-666666666666",
  command: "77777777-7777-4777-8777-777777777777",
  payment: "88888888-8888-4888-8888-888888888888",
  revision: "99999999-9999-4999-8999-999999999999",
};
export const paymentBody = (): RecordDebtPaymentBody => ({
  clientCommandId: paymentIds.command,
  debtId: paymentIds.debt,
  payingAccountId: paymentIds.account,
  paymentDate: "2026-10-08",
  scheduleVersionId: paymentIds.schedule,
  expectedFinancialRevision: "4",
  actualPaidMinor: "111000",
  contractualMinor: "110000",
  externalFeeMinor: "1000",
  allocationCertainty: "known_components",
  components: [
    {
      disposition: "liability_reduction",
      liabilityComponent: "principal",
      amountMinor: "100000",
      label: "Principal",
    },
    {
      disposition: "new_interest",
      amountMinor: "10000",
      label: "New interest",
    },
  ],
  dueAllocations: [
    { installmentId: paymentIds.installment, amountMinor: "110000" },
  ],
  unappliedContractualMinor: "0",
  dueAllocationConfirmed: true,
  confirmationSource: "user",
  description: "Provider payment",
});
export const paymentResult = {
  debtId: paymentIds.debt,
  paymentId: paymentIds.payment,
  paymentRevisionId: paymentIds.revision,
  actionId: paymentIds.command,
  actionRevisionId: paymentIds.revision,
  financialRevision: "5",
};
export const paymentAccount: FinancialAccountListItem = {
  accountId: paymentIds.account,
  name: "Checking",
  accountType: "checking",
  institutionName: null,
  currency: "PHP",
  openingCutoffDate: parseCalendarDate("2026-09-30"),
  notes: null,
  archived: false,
  currentBalanceMinor: "500000",
  version: 1,
};
export function paymentDetail(): DebtDetailResult {
  return {
    financialRevision: "4",
    debt: {
      debtId: paymentIds.debt,
      name: "Personal loan",
      lenderName: "Provider",
      productName: null,
      debtType: "personal_loan",
      currency: "PHP",
      startDate: "2026-01-01",
      openingCutoffDate: "2026-09-30",
      originalPrincipalMinor: "100000",
      recognizedLiabilityMinor: "100000",
      outstandingPrincipalMinor: "100000",
      unclassifiedLiabilityMinor: "0",
      recognizedLiabilityComponents: {
        principal: "100000",
        interest: "0",
        fee: "0",
        penalty: "0",
        unclassified: "0",
      },
      breakdownStatus: "known",
      lifecycle: "active",
      notes: null,
      version: 1,
      remainingScheduledMinor: "110000",
      installmentCount: 1,
      scheduleVersionId: paymentIds.schedule,
      scheduleReason: "Provider terms",
      paymentClearingMinor: "0",
      unappliedContractualMinor: "0",
    },
    installments: [
      {
        installmentId: paymentIds.installment,
        sequenceNo: 1,
        dueDate: "2026-10-20",
        contractualMinor: "110000",
        openingSatisfiedMinor: "0",
        paymentSatisfiedMinor: "0",
        disposition: "scheduled",
        remainingMinor: "110000",
        knownPrincipalMinor: "100000",
        knownInterestMinor: "10000",
        knownFeeMinor: "0",
        breakdownComplete: true,
        notes: null,
      },
    ],
    payments: [],
    nextPaymentCursor: null,
  };
}
