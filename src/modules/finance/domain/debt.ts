import { z } from "zod";

import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const date = z
  .string()
  .refine(
    (value): boolean => isCalendarDate(value),
    "Enter a valid calendar date.",
  );
const amount = z
  .string()
  .max(12)
  .regex(/^(?:0|[1-9]\d*)$/)
  .refine(
    (value) =>
      /^(?:0|[1-9]\d*)$/.test(value) &&
      BigInt(value) <= MAX_FINANCIAL_COMPONENT_MINOR,
    "Amount exceeds the supported limit.",
  );
const positiveAmount = amount.refine(
  (value) => /^[1-9]\d*$/.test(value),
  "Enter a positive amount.",
);
const optionalAmount = amount.nullable().default(null);

export const debtTypeSchema = z.enum([
  "personal_loan",
  "installment_loan",
  "financed_purchase",
  "flexible_manual",
]);
export const liabilityComponents = [
  "principal",
  "interest",
  "fee",
  "penalty",
  "unclassified",
] as const;
export type LiabilityComponent = (typeof liabilityComponents)[number];

export const importedInstallmentSchema = z
  .object({
    dueDate: date,
    contractualMinor: positiveAmount,
    openingSatisfiedMinor: amount.default("0"),
    knownPrincipalMinor: optionalAmount,
    knownInterestMinor: optionalAmount,
    knownFeeMinor: optionalAmount,
    breakdownComplete: z.boolean().default(false),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .superRefine((row, context) => {
    const values = [
      row.contractualMinor,
      row.openingSatisfiedMinor,
      row.knownPrincipalMinor,
      row.knownInterestMinor,
      row.knownFeeMinor,
    ];
    if (
      values.some((value) => value !== null && !/^(?:0|[1-9]\d*)$/.test(value))
    )
      return;
    const known = [
      row.knownPrincipalMinor,
      row.knownInterestMinor,
      row.knownFeeMinor,
    ];
    const total = known.reduce<bigint>(
      (sum, value) => sum + BigInt(value ?? "0"),
      0n,
    );
    if (BigInt(row.openingSatisfiedMinor) > BigInt(row.contractualMinor))
      context.addIssue({
        code: "custom",
        path: ["openingSatisfiedMinor"],
        message:
          "Historical satisfaction cannot exceed the installment amount.",
      });
    if (
      total > BigInt(row.contractualMinor) ||
      (row.breakdownComplete &&
        (known.includes(null) || total !== BigInt(row.contractualMinor)))
    )
      context.addIssue({
        code: "custom",
        path: ["contractualMinor"],
        message:
          "Known components must fit the installment total; a complete breakdown must equal it.",
      });
  });

export const importDebtBodySchema = z
  .object({
    clientCommandId: z.uuid(),
    name: z.string().trim().min(1).max(200),
    lenderName: z.string().trim().min(1).max(200),
    productName: z.string().trim().min(1).max(200).nullable().default(null),
    debtType: debtTypeSchema,
    startDate: date,
    openingCutoffDate: date,
    originalPrincipalMinor: positiveAmount.nullable().default(null),
    openingLiabilityMinor: positiveAmount,
    openingComponents: z
      .array(
        z
          .object({
            kind: z.enum(liabilityComponents),
            amountMinor: positiveAmount,
          })
          .strict(),
      )
      .min(1)
      .max(5),
    installments: z.array(importedInstallmentSchema).max(360).default([]),
    scheduleReason: z.string().trim().min(1).max(2000),
    notes: z.string().trim().max(20_000).nullable().default(null),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.startDate > input.openingCutoffDate)
      context.addIssue({
        code: "custom",
        path: ["openingCutoffDate"],
        message: "The cutoff cannot be before the debt start date.",
      });
    const kinds = input.openingComponents.map((row) => row.kind);
    if (new Set(kinds).size !== kinds.length)
      context.addIssue({
        code: "custom",
        path: ["openingComponents"],
        message: "Each liability component may appear only once.",
      });
    if (
      /^[1-9]\d*$/.test(input.openingLiabilityMinor) &&
      input.openingComponents.every((row) => /^[1-9]\d*$/.test(row.amountMinor))
    ) {
      if (
        input.openingComponents.reduce(
          (sum, row) => sum + BigInt(row.amountMinor),
          0n,
        ) !== BigInt(input.openingLiabilityMinor)
      )
        context.addIssue({
          code: "custom",
          path: ["openingComponents"],
          message:
            "Opening components must equal the recognized liability exactly.",
        });
    }
    input.installments.forEach((row, index) => {
      if (row.dueDate < input.startDate)
        context.addIssue({
          code: "custom",
          path: ["installments", index, "dueDate"],
          message: "An installment cannot be due before the debt starts.",
        });
    });
  });

export type ImportDebtBody = z.input<typeof importDebtBodySchema>;
export type ValidatedImportDebt = z.output<typeof importDebtBodySchema>;
export function openingBreakdownStatus(
  components: ValidatedImportDebt["openingComponents"],
): "known" | "partial" | "unknown" {
  return components.some((row) => row.kind === "unclassified")
    ? components.length === 1
      ? "unknown"
      : "partial"
    : "known";
}

export const importDebtResultSchema = z.object({
  debtId: z.uuid(),
  openingActionId: z.uuid(),
  scheduleVersionId: z.uuid(),
  financialRevision: z.string().regex(/^\d+$/),
});
export type ImportDebtResult = z.infer<typeof importDebtResultSchema>;

export const debtReadQuerySchema = z
  .object({ after: z.uuid().optional() })
  .strict();
export const debtSummarySchema = z.object({
  debtId: z.uuid(),
  name: z.string(),
  lenderName: z.string(),
  productName: z.string().nullable(),
  debtType: debtTypeSchema,
  currency: z.string(),
  startDate: z.string(),
  openingCutoffDate: z.string().nullable(),
  originalPrincipalMinor: z.string().nullable(),
  recognizedLiabilityMinor: z.string(),
  outstandingPrincipalMinor: z.string().nullable(),
  unclassifiedLiabilityMinor: z.string(),
  breakdownStatus: z.enum(["known", "partial", "unknown"]),
  lifecycle: z.enum(["active", "settled", "settled_early", "cancelled"]),
  notes: z.string().nullable(),
  version: z.number().int(),
  remainingScheduledMinor: z.string().nullable(),
  installmentCount: z.number().int(),
  scheduleVersionId: z.uuid().nullable(),
  scheduleReason: z.string().nullable(),
});
export type DebtSummary = z.infer<typeof debtSummarySchema>;
export const debtInstallmentReadSchema = z.object({
  installmentId: z.uuid(),
  sequenceNo: z.number().int(),
  dueDate: z.string(),
  contractualMinor: z.string(),
  openingSatisfiedMinor: z.string(),
  remainingMinor: z.string(),
  knownPrincipalMinor: z.string().nullable(),
  knownInterestMinor: z.string().nullable(),
  knownFeeMinor: z.string().nullable(),
  breakdownComplete: z.boolean(),
  notes: z.string().nullable(),
});
export type DebtInstallment = z.infer<typeof debtInstallmentReadSchema>;
export type DebtListResult = {
  financialRevision: string;
  items: DebtSummary[];
  nextCursor: string | null;
};
export type DebtDetailResult = {
  financialRevision: string;
  debt: DebtSummary;
  installments: DebtInstallment[];
};
