import { z } from "zod";

import { liabilityComponents } from "@/modules/finance/domain/debt";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const integer = /^(?:0|[1-9]\d*)$/;
const amount = z
  .string()
  .max(12)
  .regex(integer)
  .refine(
    (value) =>
      integer.test(value) && BigInt(value) <= MAX_FINANCIAL_COMPONENT_MINOR,
    "Amount exceeds the supported limit.",
  );
const positive = amount.refine(
  (value) => /^[1-9]\d*$/.test(value),
  "Enter a positive amount.",
);

export const paymentDispositions = [
  "liability_reduction",
  "new_interest",
  "new_fee",
  "new_penalty",
  "clearing",
  "advance",
] as const;
export const paymentDispositionLabels = {
  liability_reduction: "Repay recognized liability",
  new_interest: "New interest expense",
  new_fee: "New provider fee expense",
  new_penalty: "New penalty expense",
  clearing: "Pending accounting classification",
  advance: "Confirmed advance",
  external_fee: "External payment fee",
} as const;

export const paymentAccountingComponentSchema = z
  .object({
    disposition: z.enum(paymentDispositions),
    amountMinor: positive,
    liabilityComponent: z.enum(liabilityComponents).nullable().default(null),
    categoryId: z.uuid().nullable().default(null),
    label: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      (row.disposition === "liability_reduction") !==
      (row.liabilityComponent !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["liabilityComponent"],
        message:
          "Only a liability reduction must identify its recognized liability component.",
      });
    }
    if (!row.disposition.startsWith("new_") && row.categoryId !== null) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Only new expenses use expense categories.",
      });
    }
  });

export const recordDebtPaymentBodySchema = z
  .object({
    clientCommandId: z.uuid(),
    debtId: z.uuid(),
    payingAccountId: z.uuid(),
    paymentDate: z
      .string()
      .refine(isCalendarDate, "Enter a valid payment date."),
    scheduleVersionId: z.uuid(),
    expectedFinancialRevision: z.string().max(20).regex(integer),
    actualPaidMinor: positive,
    contractualMinor: positive,
    externalFeeMinor: amount.default("0"),
    externalFeeLabel: z.string().trim().min(1).max(200).default("Payment fee"),
    externalFeeCategoryId: z.uuid().nullable().default(null),
    allocationCertainty: z.enum([
      "known_components",
      "confirmed_total",
      "unresolved",
    ]),
    components: z.array(paymentAccountingComponentSchema).min(1).max(30),
    dueAllocations: z
      .array(
        z.object({ installmentId: z.uuid(), amountMinor: positive }).strict(),
      )
      .max(360),
    unappliedContractualMinor: amount,
    dueAllocationConfirmed: z.literal(true, {
      error: "Confirm the contractual allocations and unapplied amount.",
    }),
    confirmationSource: z.enum(["user", "provider"]),
    confirmationNote: z.string().trim().max(2000).nullable().default(null),
    acknowledgeNegativeBalance: z.boolean().default(false),
    description: z.string().trim().min(1).max(2000),
    reference: z.string().trim().max(2000).nullable().default(null),
    notes: z.string().trim().max(20_000).nullable().default(null),
  })
  .strict()
  .superRefine((body, context) => {
    const values = [
      body.actualPaidMinor,
      body.contractualMinor,
      body.externalFeeMinor,
      body.unappliedContractualMinor,
      ...body.components.map((c) => c.amountMinor),
      ...body.dueAllocations.map((a) => a.amountMinor),
    ];
    if (values.some((value) => !integer.test(value))) return;
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (
      BigInt(body.actualPaidMinor) !==
      BigInt(body.contractualMinor) + BigInt(body.externalFeeMinor)
    ) {
      issue(
        "actualPaidMinor",
        "Actual cash paid must equal the contractual portion plus the external fee.",
      );
    }
    if (
      body.components.reduce((sum, c) => sum + BigInt(c.amountMinor), 0n) !==
      BigInt(body.contractualMinor)
    ) {
      issue(
        "components",
        "Accounting components must equal the contractual portion exactly.",
      );
    }
    if (
      body.dueAllocations.reduce((sum, a) => sum + BigInt(a.amountMinor), 0n) +
        BigInt(body.unappliedContractualMinor) !==
      BigInt(body.contractualMinor)
    ) {
      issue(
        "dueAllocations",
        "Due allocations plus explicit unapplied must equal the contractual portion, excluding external fees.",
      );
    }
    if (
      new Set(body.dueAllocations.map((a) => a.installmentId)).size !==
      body.dueAllocations.length
    ) {
      issue("dueAllocations", "An installment can appear only once.");
    }
    if (
      body.allocationCertainty === "confirmed_total" &&
      body.components.some(
        (c) =>
          c.disposition === "liability_reduction" &&
          c.liabilityComponent !== "unclassified",
      )
    ) {
      issue(
        "components",
        "A confirmed reduction with unknown composition must reduce recognized unclassified liability.",
      );
    }
    const hasClearing = body.components.some(
      (c) => c.disposition === "clearing",
    );
    if (hasClearing !== (body.allocationCertainty === "unresolved")) {
      issue(
        "allocationCertainty",
        "Unresolved accounting requires an explicit clearing component; known accounting cannot use clearing.",
      );
    }
    if (body.confirmationSource === "provider" && !body.confirmationNote) {
      issue(
        "confirmationNote",
        "Describe the provider confirmation or reference.",
      );
    }
  });

export type RecordDebtPaymentBody = z.input<typeof recordDebtPaymentBodySchema>;
export type ValidatedDebtPayment = z.output<typeof recordDebtPaymentBodySchema>;
export const recordDebtPaymentResultSchema = z
  .object({
    debtId: z.uuid(),
    paymentId: z.uuid(),
    paymentRevisionId: z.uuid(),
    actionId: z.uuid(),
    actionRevisionId: z.uuid(),
    financialRevision: z.string().regex(/^\d+$/),
  })
  .strict();
export type RecordDebtPaymentResult = z.infer<
  typeof recordDebtPaymentResultSchema
>;

/** This preview uses the same normalized command as the transactional recipe. */
export function buildDebtPaymentPreview(body: ValidatedDebtPayment) {
  return {
    actualPaidMinor: BigInt(body.actualPaidMinor),
    contractualMinor: BigInt(body.contractualMinor),
    externalFeeMinor: BigInt(body.externalFeeMinor),
    liabilityReductionMinor: body.components
      .filter((c) => c.disposition === "liability_reduction")
      .reduce((sum, c) => sum + BigInt(c.amountMinor), 0n),
    newExpenseMinor: body.components
      .filter((c) => c.disposition.startsWith("new_"))
      .reduce(
        (sum, c) => sum + BigInt(c.amountMinor),
        BigInt(body.externalFeeMinor),
      ),
    clearingMinor: body.components
      .filter(
        (c) => c.disposition === "clearing" || c.disposition === "advance",
      )
      .reduce((sum, c) => sum + BigInt(c.amountMinor), 0n),
    dueSatisfiedMinor: body.dueAllocations.reduce(
      (sum, a) => sum + BigInt(a.amountMinor),
      0n,
    ),
    unappliedMinor: BigInt(body.unappliedContractualMinor),
  };
}

export class PaymentPreviewStaleError extends Error {
  constructor() {
    super(
      "Financial information changed since this payment was reviewed. Refresh the debt and review a new payment command.",
    );
    this.name = "PaymentPreviewStaleError";
  }
}
