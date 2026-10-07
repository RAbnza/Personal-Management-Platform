import { z } from "zod";

import { debtTypeSchema } from "@/modules/finance/domain/debt";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const integerMinorPattern = /^(?:0|[1-9]\d*)$/;
const positiveMinorPattern = /^[1-9]\d*$/;

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Enter a valid YYYY-MM-DD calendar date.",
});

const amountMinorSchema = z
  .string()
  .regex(integerMinorPattern, {
    message: "Amount must be an exact non-negative minor-unit integer string.",
  })
  .refine(
    (value) =>
      integerMinorPattern.test(value) &&
      BigInt(value) <= MAX_FINANCIAL_COMPONENT_MINOR,
    {
      message: "Amount exceeds the supported financial component limit.",
    },
  );

const positiveAmountMinorSchema = amountMinorSchema.refine(
  (value) => positiveMinorPattern.test(value),
  {
    message: "Enter a positive amount.",
  },
);

const optionalAmountMinorSchema = amountMinorSchema.nullable().default(null);

/**
 * A cash borrowing produces actual proceeds.
 *
 * `financed_purchase` is intentionally excluded. A financed purchase has its
 * own coherent-V1 action recipe because it recognizes a purchase without a
 * cash receipt.
 */
export const borrowingDebtTypeSchema = debtTypeSchema.exclude([
  "financed_purchase",
]);

export const borrowingFeeTreatmentSchema = z.enum(["withheld", "capitalized"]);

export type BorrowingFeeTreatment = z.infer<typeof borrowingFeeTreatmentSchema>;

export const borrowingFeeSchema = z
  .object({
    label: z.string().trim().min(1).max(200),

    amountMinor: positiveAmountMinorSchema,

    treatment: borrowingFeeTreatmentSchema,

    /**
     * Optional reporting category for the recognized fee expense.
     *
     * The service layer must resolve this as an owned, active expense
     * category before any financial evidence is created.
     */
    categoryId: z.uuid().nullable().default(null),
  })
  .strict();

export const borrowingInstallmentSchema = z
  .object({
    dueDate: calendarDateSchema,

    contractualMinor: positiveAmountMinorSchema,

    knownPrincipalMinor: optionalAmountMinorSchema,
    knownInterestMinor: optionalAmountMinorSchema,
    knownFeeMinor: optionalAmountMinorSchema,

    breakdownComplete: z.boolean().default(false),

    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .superRefine((installment, context) => {
    const knownComponents = [
      installment.knownPrincipalMinor,
      installment.knownInterestMinor,
      installment.knownFeeMinor,
    ];

    // Field checks can report nonfatal issues before cross-field refinements.
    // Leave malformed amounts to those checks before doing exact arithmetic.
    if (
      !integerMinorPattern.test(installment.contractualMinor) ||
      knownComponents.some(
        (value) => value !== null && !integerMinorPattern.test(value),
      )
    ) {
      return;
    }

    const knownTotalMinor = knownComponents.reduce<bigint>(
      (total, value) => total + BigInt(value ?? "0"),
      0n,
    );

    const contractualMinor = BigInt(installment.contractualMinor);

    if (knownTotalMinor > contractualMinor) {
      context.addIssue({
        code: "custom",
        path: ["contractualMinor"],
        message:
          "Known installment components cannot exceed the contractual amount.",
      });
    }

    if (
      installment.breakdownComplete &&
      (knownComponents.includes(null) || knownTotalMinor !== contractualMinor)
    ) {
      context.addIssue({
        code: "custom",
        path: ["contractualMinor"],
        message:
          "A complete installment breakdown must provide every component and equal the contractual amount exactly.",
      });
    }
  });

export const recordBorrowingBodySchema = z
  .object({
    clientCommandId: z.uuid(),

    name: z.string().trim().min(1).max(200),

    lenderName: z.string().trim().min(1).max(200),

    productName: z.string().trim().min(1).max(200).nullable().default(null),

    debtType: borrowingDebtTypeSchema,

    borrowingDate: calendarDateSchema,

    receivingAccountId: z.uuid(),

    /**
     * Contractual principal before any borrowing fee treatment.
     */
    principalMinor: positiveAmountMinorSchema,

    /**
     * Cash actually deposited into the receiving account.
     *
     * This must equal principal minus fees whose treatment is `withheld`.
     * Capitalized fees increase the recognized debt instead of reducing this
     * cash receipt.
     */
    actualReceivedMinor: positiveAmountMinorSchema,

    fees: z.array(borrowingFeeSchema).max(20).default([]),

    /**
     * A new borrowing may start without provider due dates. In that case the
     * service still creates the initial empty manual schedule version required
     * by the debt-payment model.
     */
    installments: z.array(borrowingInstallmentSchema).max(360).default([]),

    scheduleReason: z.string().trim().min(1).max(2000),

    description: z.string().trim().min(1).max(2000),

    reference: z.string().trim().min(1).max(2000).nullable().default(null),

    notes: z.string().max(20_000).nullable().default(null),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      !integerMinorPattern.test(input.principalMinor) ||
      !integerMinorPattern.test(input.actualReceivedMinor) ||
      input.fees.some((fee) => !integerMinorPattern.test(fee.amountMinor))
    ) {
      return;
    }

    const principalMinor = BigInt(input.principalMinor);

    const withheldFeeMinor = input.fees.reduce(
      (total, fee) =>
        fee.treatment === "withheld" ? total + BigInt(fee.amountMinor) : total,
      0n,
    );

    if (withheldFeeMinor >= principalMinor) {
      context.addIssue({
        code: "custom",
        path: ["fees"],
        message:
          "Total withheld borrowing fees must be less than the contractual principal because a cash borrowing must produce positive proceeds.",
      });

      return;
    }

    const expectedActualReceivedMinor = principalMinor - withheldFeeMinor;

    if (BigInt(input.actualReceivedMinor) !== expectedActualReceivedMinor) {
      context.addIssue({
        code: "custom",
        path: ["actualReceivedMinor"],
        message:
          "Actual cash received must equal principal minus withheld fees. Capitalized fees do not reduce the cash receipt.",
      });
    }

    input.installments.forEach((installment, index) => {
      if (installment.dueDate < input.borrowingDate) {
        context.addIssue({
          code: "custom",
          path: ["installments", index, "dueDate"],
          message:
            "A new borrowing installment cannot be due before the borrowing date.",
        });
      }
    });
  });

export type RecordBorrowingBody = z.input<typeof recordBorrowingBodySchema>;

export type ValidatedRecordBorrowing = z.output<
  typeof recordBorrowingBodySchema
>;

export type BorrowingPlanFee = {
  label: string;
  amountMinor: bigint;
  treatment: BorrowingFeeTreatment;
  categoryId: string | null;
};

export type BorrowingLiabilityComponent = {
  kind: "principal" | "fee";
  amountMinor: bigint;
  label: string | null;
};

export type BorrowingPlan = {
  principalMinor: bigint;

  actualReceivedMinor: bigint;

  withheldFeeMinor: bigint;
  capitalizedFeeMinor: bigint;

  totalFeeExpenseMinor: bigint;

  recognizedLiabilityMinor: bigint;

  fees: BorrowingPlanFee[];

  /**
   * These are the exact debt-liability postings required by the command.
   *
   * Principal remains principal. Every capitalized provider fee is kept as a
   * separate fee component instead of being silently folded into principal.
   */
  liabilityComponents: BorrowingLiabilityComponent[];
};

/**
 * Convert one validated borrowing command into its exact accounting amounts.
 *
 * No JavaScript Number conversion is permitted here. These values later drive
 * both the service posting plan and the database recipe assertions.
 */
export function buildBorrowingPlan(input: RecordBorrowingBody): BorrowingPlan {
  const parsed = recordBorrowingBodySchema.parse(input);

  const principalMinor = BigInt(parsed.principalMinor);
  const actualReceivedMinor = BigInt(parsed.actualReceivedMinor);

  const fees = parsed.fees.map((fee): BorrowingPlanFee => ({
    label: fee.label,
    amountMinor: BigInt(fee.amountMinor),
    treatment: fee.treatment,
    categoryId: fee.categoryId,
  }));

  const withheldFeeMinor = fees.reduce(
    (total, fee) =>
      fee.treatment === "withheld" ? total + fee.amountMinor : total,
    0n,
  );

  const capitalizedFeeMinor = fees.reduce(
    (total, fee) =>
      fee.treatment === "capitalized" ? total + fee.amountMinor : total,
    0n,
  );

  const totalFeeExpenseMinor = withheldFeeMinor + capitalizedFeeMinor;

  const recognizedLiabilityMinor = principalMinor + capitalizedFeeMinor;

  const liabilityComponents: BorrowingLiabilityComponent[] = [
    {
      kind: "principal",
      amountMinor: principalMinor,
      label: null,
    },

    ...fees
      .filter((fee) => fee.treatment === "capitalized")
      .map((fee): BorrowingLiabilityComponent => ({
        kind: "fee",
        amountMinor: fee.amountMinor,
        label: fee.label,
      })),
  ];

  return {
    principalMinor,
    actualReceivedMinor,

    withheldFeeMinor,
    capitalizedFeeMinor,

    totalFeeExpenseMinor,

    recognizedLiabilityMinor,

    fees,
    liabilityComponents,
  };
}
