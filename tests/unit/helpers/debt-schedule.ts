import {
  reviseDebtScheduleBodySchema,
  type ScheduleRevisionSetup,
} from "@/modules/finance/domain/debt-schedule-revision";
import { paymentDetail, paymentIds } from "./debt-payment";
export function scheduleSetup(): ScheduleRevisionSetup {
  const detail = paymentDetail();
  detail.installments[0]!.paymentSatisfiedMinor = "40000";
  detail.installments[0]!.remainingMinor = "70000";
  return {
    detail,
    frequency: "manual",
    pools: [
      {
        paymentRevisionId: paymentIds.revision,
        sourceAllocationId: paymentIds.payment,
        amountMinor: "40000",
        paymentDate: "2026-10-08",
        sourceDueDate: "2026-10-20",
        currentTargets: [
          { obligationId: paymentIds.installment, amountMinor: "40000" },
        ],
      },
    ],
  };
}
export function scheduleBody() {
  return reviseDebtScheduleBodySchema.parse({
    clientCommandId: paymentIds.command,
    debtId: paymentIds.debt,
    expectedDebtVersion: 1,
    expectedScheduleVersionId: paymentIds.schedule,
    expectedFinancialRevision: "4",
    effectiveDate: "2026-10-08",
    revisionKind: "date_correction",
    reason: "Provider corrected date",
    frequency: "manual",
    entries: [
      {
        entryKey: paymentIds.installment,
        obligationId: paymentIds.installment,
        dueDate: "2026-11-20",
        contractualMinor: "110000",
        knownPrincipalMinor: "100000",
        knownInterestMinor: "10000",
        knownFeeMinor: "0",
        breakdownComplete: true,
      },
    ],
    mappings: [
      {
        paymentRevisionId: paymentIds.revision,
        sourceAllocationId: paymentIds.payment,
        targetEntryKey: paymentIds.installment,
        amountMinor: "40000",
      },
    ],
    allocationMappingConfirmed: true,
  });
}
export const scheduleResult = {
  debtId: paymentIds.debt,
  scheduleVersionId: paymentIds.revision,
  scheduleVersionNo: 2,
  debtVersion: 2,
  financialRevision: "5",
  chargeActionId: null,
};
