import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const integer = /^(?:0|-?[1-9]\d*)$/;
export const signedBalanceSchema = z
  .string()
  .max(20)
  .regex(integer)
  .refine(
    (v) =>
      integer.test(v) &&
      BigInt(v) >= -9223372036854775808n &&
      BigInt(v) <= 9223372036854775807n,
    "Balance exceeds the supported integer range.",
  );
const date = z
  .string()
  .refine(isCalendarDate, "Enter a valid YYYY-MM-DD date.");
const versions = {
  expectedFinancialRevision: z
    .string()
    .max(19)
    .regex(/^(?:0|[1-9]\d*)$/),
  expectedAccountVersion: z.number().int().positive(),
};
export const reconcileAccountBodySchema = z
  .object({
    clientCommandId: z.uuid(),
    financialAccountId: z.uuid(),
    ...versions,
    cutoffDate: date,
    observedMinor: signedBalanceSchema,
    reference: z.string().trim().max(2000).nullable().default(null),
    notes: z.string().trim().max(20000).nullable().default(null),
    supersedesReconciliationId: z.uuid().nullable().default(null),
  })
  .strict();
export const adjustAccountBodySchema = z
  .object({
    clientCommandId: z.uuid(),
    financialAccountId: z.uuid(),
    ...versions,
    effectiveDate: date,
    signedAdjustmentMinor: signedBalanceSchema.refine(
      (v) =>
        integer.test(v) &&
        BigInt(v) !== 0n &&
        BigInt(v) >= -MAX_FINANCIAL_COMPONENT_MINOR &&
        BigInt(v) <= MAX_FINANCIAL_COMPONENT_MINOR,
      "Enter a nonzero adjustment within the supported limit.",
    ),
    reason: z.string().trim().min(1).max(2000),
    reconciliationId: z.uuid().nullable().default(null),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
export type ReconcileAccountBody = z.infer<typeof reconcileAccountBodySchema>;
export type AdjustAccountBody = z.infer<typeof adjustAccountBodySchema>;
export type ReconciliationStatus =
  "verified" | "difference" | "needs_review" | "superseded";
export type ReconciliationItem = {
  reconciliationId: string;
  cutoffDate: string;
  observedMinor: string;
  calculatedMinor: string;
  differenceMinor: string;
  financialRevision: string;
  sourceJournalCount: string;
  currentCalculatedMinor: string;
  currentSourceJournalCount: string;
  status: ReconciliationStatus;
  needsReview: boolean;
  reference: string | null;
  notes: string | null;
  supersedesReconciliationId: string | null;
  supersededByReconciliationId: string | null;
  recordedAt: string;
  adjustments: {
    actionId: string;
    effectiveDate: string;
    signedAdjustmentMinor: string;
    reason: string;
  }[];
};
export type ReconciliationSetup = {
  account: {
    financialAccountId: string;
    name: string;
    currency: string;
    openingCutoffDate: string;
    archived: boolean;
    version: number;
    currentBalanceMinor: string;
  };
  financialRevision: string;
  history: ReconciliationItem[];
  adjustments: AccountAdjustmentItem[];
};
export type AccountAdjustmentItem = {
  actionId: string;
  actionRevisionId: string;
  effectiveDate: string;
  signedAdjustmentMinor: string;
  reason: string;
  reconciliationId: string | null;
};
export type ReconciliationPreview = {
  financialAccountId: string;
  accountName: string;
  currency: string;
  cutoffDate: string;
  observedMinor: string;
  calculatedMinor: string;
  differenceMinor: string;
  financialRevision: string;
  sourceJournalCount: string;
  status: "verified" | "difference";
  supersedesReconciliationId: string | null;
};
export type AdjustmentPreview = {
  financialAccountId: string;
  accountName: string;
  currency: string;
  effectiveDate: string;
  signedAdjustmentMinor: string;
  reason: string;
  balanceAtDateBeforeMinor: string;
  balanceAtDateAfterMinor: string;
  currentBalanceBeforeMinor: string;
  currentBalanceAfterMinor: string;
  adjustmentEquityMinor: string;
  negativeBalance: boolean;
  financialRevision: string;
  reconciliation: null | {
    reconciliationId: string;
    cutoffDate: string;
    observedMinor: string;
    calculatedMinor: string;
    differenceBeforeMinor: string;
    differenceAfterMinor: string;
  };
};
export class ReconciliationPreviewStaleError extends Error {
  constructor() {
    super(
      "Account or financial sources changed. Reload and review a fresh comparison.",
    );
    this.name = "ReconciliationPreviewStaleError";
  }
}
export class ReconciliationUnavailableError extends Error {
  constructor() {
    super("The comparison is unavailable in this account.");
    this.name = "ReconciliationUnavailableError";
  }
}
export function reconciliationStatus(input: {
  observedMinor: string;
  calculatedMinor: string;
  sourceJournalCount: string;
  currentCalculatedMinor: string;
  currentSourceJournalCount: string;
  supersededByReconciliationId: string | null;
}): { status: ReconciliationStatus; needsReview: boolean } {
  const needsReview =
    input.sourceJournalCount !== input.currentSourceJournalCount ||
    input.calculatedMinor !== input.currentCalculatedMinor;
  return {
    needsReview,
    status: input.supersededByReconciliationId
      ? "superseded"
      : needsReview
        ? "needs_review"
        : input.observedMinor === input.calculatedMinor
          ? "verified"
          : "difference",
  };
}
const exactInteger = z.string().max(100).regex(integer);
const sourceVersion = z
  .string()
  .max(19)
  .regex(/^(?:0|[1-9]\d*)$/);
export const reconciliationPreviewSchema: z.ZodType<ReconciliationPreview> = z
  .object({
    financialAccountId: z.uuid(),
    accountName: z.string(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    cutoffDate: date,
    observedMinor: signedBalanceSchema,
    calculatedMinor: exactInteger,
    differenceMinor: exactInteger,
    financialRevision: sourceVersion,
    sourceJournalCount: sourceVersion,
    status: z.enum(["verified", "difference"]),
    supersedesReconciliationId: z.uuid().nullable(),
  })
  .strict();
export const adjustmentPreviewSchema: z.ZodType<AdjustmentPreview> = z
  .object({
    financialAccountId: z.uuid(),
    accountName: z.string(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    effectiveDate: date,
    signedAdjustmentMinor: exactInteger,
    reason: z.string(),
    balanceAtDateBeforeMinor: exactInteger,
    balanceAtDateAfterMinor: exactInteger,
    currentBalanceBeforeMinor: exactInteger,
    currentBalanceAfterMinor: exactInteger,
    adjustmentEquityMinor: exactInteger,
    negativeBalance: z.boolean(),
    financialRevision: sourceVersion,
    reconciliation: z
      .object({
        reconciliationId: z.uuid(),
        cutoffDate: date,
        observedMinor: signedBalanceSchema,
        calculatedMinor: exactInteger,
        differenceBeforeMinor: exactInteger,
        differenceAfterMinor: exactInteger,
      })
      .strict()
      .nullable(),
  })
  .strict();
export const reconciliationResultSchema = z
  .object({
    clientCommandId: z.uuid(),
    reconciliationId: z.uuid(),
    financialRevision: sourceVersion,
    preview: reconciliationPreviewSchema,
  })
  .strict();
export const adjustmentResultSchema = z
  .object({
    clientCommandId: z.uuid(),
    adjustmentId: z.uuid(),
    actionId: z.uuid(),
    actionRevisionId: z.uuid(),
    financialRevision: sourceVersion,
    reconciliationId: z.uuid().nullable(),
    preview: adjustmentPreviewSchema,
  })
  .strict();
