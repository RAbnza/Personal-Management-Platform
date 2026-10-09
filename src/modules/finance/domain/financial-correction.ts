import { z } from "zod";
export class FinancialActionUnavailableError extends Error {
  constructor() {
    super("Financial action is unavailable in this workspace.");
    this.name = "FinancialActionUnavailableError";
  }
}
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";
import {
  recordIncomeInputSchema,
  recordExpenseInputSchema,
  recordTransferInputSchema,
} from "./manual-financial-action";
import {
  recordDebtPaymentBodySchema,
  paymentAccountingComponentSchema,
} from "./debt-payment";

export const positiveCorrectionMinor = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine(
    (v) => !/^[1-9]\d*$/.test(v) || BigInt(v) <= MAX_FINANCIAL_COMPONENT_MINOR,
    "Amount exceeds the financial limit.",
  );
const date = z.string().refine(isCalendarDate);
const omitActor = {
  userId: true,
  workspaceId: true,
  requestId: true,
  clientCommandId: true,
} as const;
export const refundIntentSchema = z
  .object({
    actionKind: z.literal("refund"),
    purchaseActionId: z.uuid(),
    receivingAccountId: z.uuid(),
    effectiveDate: date,
    allocations: z
      .array(
        z
          .object({
            originalPurchasePostingId: z.uuid(),
            amountMinor: positiveCorrectionMinor,
            allocationKind: z.enum(["purchase", "fee"]),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    description: z.string().trim().min(1).max(2000),
    reference: z.string().trim().min(1).max(2000).nullable().default(null),
    notes: z.string().max(20000).nullable().default(null),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
export const borrowingCorrectionIntentSchema = z
  .object({
    actionKind: z.literal("borrowing"),
    receivingAccountId: z.uuid(),
    effectiveDate: date,
    principalMinor: positiveCorrectionMinor,
    actualReceivedMinor: positiveCorrectionMinor,
    fees: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(200),
            amountMinor: positiveCorrectionMinor,
            treatment: z.enum(["withheld", "capitalized"]),
            categoryId: z.uuid().nullable().default(null),
          })
          .strict(),
      )
      .max(20),
    description: z.string().trim().min(1).max(2000),
    reference: z.string().nullable().default(null),
    notes: z.string().max(20000).nullable().default(null),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
export const adjustmentCorrectionIntentSchema = z
  .object({
    actionKind: z.literal("balance_adjustment"),
    financialAccountId: z.uuid(),
    effectiveDate: date,
    signedAdjustmentMinor: z
      .string()
      .regex(/^-?[1-9]\d*$/)
      .refine(
        (v) =>
          !/^-?[1-9]\d*$/.test(v) ||
          (BigInt(v) >= -MAX_FINANCIAL_COMPONENT_MINOR &&
            BigInt(v) <= MAX_FINANCIAL_COMPONENT_MINOR),
      ),
    description: z.string().trim().min(1).max(2000),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
export const chargeCorrectionIntentSchema = z
  .object({
    actionKind: z.literal("debt_charge"),
    debtId: z.uuid(),
    effectiveDate: date,
    component: z.enum(["interest", "fee", "penalty"]),
    amountMinor: positiveCorrectionMinor,
    categoryId: z.uuid().nullable().default(null),
    providerConfirmed: z.literal(true),
    description: z.string().trim().min(1).max(2000),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
const openingCashCorrectionIntentSchema = z
  .object({
    actionKind: z.literal("opening_cash"),
    financialAccountId: z.uuid(),
    effectiveDate: date,
    amountMinor: positiveCorrectionMinor,
    description: z.string().trim().min(1).max(2000),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
const openingDebtCorrectionIntentSchema = z
  .object({
    actionKind: z.literal("opening_debt"),
    debtId: z.uuid(),
    effectiveDate: date,
    components: z
      .array(
        z
          .object({
            liabilityComponent: z.enum([
              "principal",
              "interest",
              "fee",
              "penalty",
              "unclassified",
            ]),
            amountMinor: positiveCorrectionMinor,
          })
          .strict(),
      )
      .min(1)
      .max(5),
    description: z.string().trim().min(1).max(2000),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
export const clearingResolutionIntentSchema = z
  .object({
    actionKind: z.literal("payment_reclassification"),
    sourceComponentId: z.uuid(),
    effectiveDate: date,
    components: z
      .array(
        paymentAccountingComponentSchema.refine(
          (c) =>
            c.disposition === "liability_reduction" ||
            c.disposition.startsWith("new_"),
          "Resolve clearing to recognized liability or a newly recognized cost.",
        ),
      )
      .min(1)
      .max(30),
    description: z.string().trim().min(1).max(2000),
    providerConfirmed: z.literal(true),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
export const resolveClearingBodySchema = clearingResolutionIntentSchema
  .omit({ actionKind: true })
  .extend({
    clientCommandId: z.uuid(),
    expectedFinancialRevision: z.string().regex(/^\d+$/),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
const { clientCommandId: _commandId, ...paymentShape } =
  recordDebtPaymentBodySchema.shape;
void _commandId;
const correctedPaymentIntentSchema = z
  .object({ ...paymentShape, actionKind: z.literal("debt_payment") })
  .strict()
  .superRefine((body, context) => {
    const { actionKind: _kind, ...intent } = body;
    void _kind;
    const result = recordDebtPaymentBodySchema.safeParse({
      ...intent,
      clientCommandId: "00000000-0000-4000-8000-000000000001",
    });
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ ...issue, path: issue.path });
  });
export const replacementIntentSchema = z.discriminatedUnion("actionKind", [
  recordIncomeInputSchema
    .omit(omitActor)
    .extend({ actionKind: z.literal("income") }),
  recordExpenseInputSchema
    .omit(omitActor)
    .extend({ actionKind: z.literal("expense") }),
  recordTransferInputSchema
    .omit(omitActor)
    .extend({ actionKind: z.literal("transfer") }),
  correctedPaymentIntentSchema,
  refundIntentSchema,
  borrowingCorrectionIntentSchema,
  adjustmentCorrectionIntentSchema,
  chargeCorrectionIntentSchema,
  openingCashCorrectionIntentSchema,
  openingDebtCorrectionIntentSchema,
  clearingResolutionIntentSchema,
]);
export const correctFinancialActionBodySchema = z
  .object({
    clientCommandId: z.uuid(),
    expectedActionRevisionId: z.uuid(),
    expectedFinancialRevision: z.string().regex(/^\d+$/),
    reason: z.string().trim().min(1).max(2000),
    replacement: replacementIntentSchema,
  })
  .strict();
export const reverseFinancialActionBodySchema = z
  .object({
    clientCommandId: z.uuid(),
    expectedActionRevisionId: z.uuid(),
    expectedFinancialRevision: z.string().regex(/^\d+$/),
    reason: z.string().trim().min(1).max(2000),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict();
export const financialMutationResultSchema = z.object({
  actionId: z.uuid(),
  actionRevisionId: z.uuid(),
  financialRevision: z.string().regex(/^\d+$/),
});
export type ReplacementIntent = z.infer<typeof replacementIntentSchema>;
export type CorrectFinancialActionBody = z.input<
  typeof correctFinancialActionBodySchema
>;
export class FinancialCorrectionStaleError extends Error {
  constructor() {
    super(
      "Financial evidence changed. Reload the current action and review the correction again.",
    );
    this.name = "FinancialCorrectionStaleError";
  }
}

export function projectReplacementIntent(current: {
  actionKind: string;
  effectiveDate: string;
  description: string;
  reference: string | null;
  notes: string | null;
  financialRevision: string;
  evidence: Record<string, unknown>;
}) {
  const schema = replacementIntentSchema.options.find(
    (s) => s.shape.actionKind.value === current.actionKind,
  );
  if (!schema) return null;
  const source = {
    ...current.evidence,
    actionKind: current.actionKind,
    effectiveDate: current.effectiveDate,
    description: current.description,
    reference: current.reference,
    notes: current.notes,
    expectedFinancialRevision: current.financialRevision,
    component: current.evidence.kind,
    financialAccountId:
      current.evidence.financialAccountId ?? current.evidence.accountId,
  };
  const projected = Object.fromEntries(
    Object.keys(schema.shape)
      .filter((key) => key in source)
      .map((key) => [key, source[key as keyof typeof source]]),
  );
  const result = schema.safeParse(projected);
  return result.success ? result.data : null;
}
