import { z } from "zod";
export const scheduleHistoryItemSchema = z.object({
  scheduleVersionId: z.uuid(),
  versionNo: z.number().int(),
  previousVersionId: z.uuid().nullable(),
  effectiveDate: z.string(),
  revisionKind: z.enum([
    "initial",
    "date_correction",
    "renegotiation",
    "allocation_correction",
    "settlement",
  ]),
  reason: z.string(),
  frequency: z.string(),
  finalizedAt: z.iso.datetime(),
  recordedByUserId: z.uuid().nullable(),
  current: z.boolean(),
  chargeActionId: z.uuid().nullable(),
  entries: z.array(
    z.object({
      installmentId: z.uuid(),
      obligationId: z.uuid(),
      sequenceNo: z.number().int(),
      dueDate: z.string(),
      contractualMinor: z.string(),
      openingSatisfiedMinor: z.string(),
      disposition: z.string(),
      cancellationReason: z.string().nullable(),
      knownPrincipalMinor: z.string().nullable(),
      knownInterestMinor: z.string().nullable(),
      knownFeeMinor: z.string().nullable(),
      breakdownComplete: z.boolean(),
      notes: z.string().nullable(),
    }),
  ),
  mappings: z.array(
    z.object({
      paymentRevisionId: z.uuid(),
      sourceAllocationId: z.uuid().nullable(),
      targetInstallmentId: z.uuid().nullable(),
      amountMinor: z.string(),
    }),
  ),
});
export const scheduleHistoryResultSchema = z.object({
  financialRevision: z.string(),
  items: z.array(scheduleHistoryItemSchema),
  nextCursor: z.uuid().nullable(),
});
export type ScheduleHistoryResult = z.infer<typeof scheduleHistoryResultSchema>;
