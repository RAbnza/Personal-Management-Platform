import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
import { statementIdentifierSchema as id } from "./card-statement";
import { cardAmount } from "./card-command";

const validMinor = (v: string) =>
  v.length <= 19 &&
  /^(0|[1-9]\d*)$/.test(v) &&
  BigInt(v) <= 9223372036854775807n;
export const installmentMinor = z
  .string()
  .max(19)
  .regex(/^(0|[1-9]\d*)$/)
  .refine(
    (v) => !/^(0|[1-9]\d*)$/.test(v) || validMinor(v),
    "Amount exceeds the evidence limit.",
  );
const date = z.string().refine(isCalendarDate, "Enter a real calendar date.");
const reference = z.string().trim().min(1).max(2000).nullable().default(null);
export const cardInstallmentLineSchema = z
  .object({
    dueDate: date.nullable().default(null),
    principalMinor: installmentMinor,
    interestMinor: installmentMinor.nullable().default(null),
    feeMinor: installmentMinor.nullable().default(null),
    totalMinor: installmentMinor.nullable().default(null),
    providerReference: reference,
    notes: z.string().max(2000).nullable().default(null),
  })
  .strict()
  .superRefine((v, c) => {
    const values = [
      v.principalMinor,
      v.interestMinor,
      v.feeMinor,
      v.totalMinor,
    ];
    if (values.some((n) => n !== null && !validMinor(n))) return;
    if (v.totalMinor !== null) {
      const known =
        BigInt(v.principalMinor) +
        BigInt(v.interestMinor ?? "0") +
        BigInt(v.feeMinor ?? "0");
      if (
        BigInt(v.totalMinor) < known ||
        (v.interestMinor !== null &&
          v.feeMinor !== null &&
          BigInt(v.totalMinor) !== known)
      )
        c.addIssue({
          code: "custom",
          message:
            "Provider total must agree with known principal, interest and fees.",
        });
    }
  });
export const cardInstallmentEvidenceSchema = z
  .object({
    purchaseActionId: id,
    purchaseActionRevisionId: id,
    principalMinor: cardAmount,
    installmentCount: z.number().int().min(1).max(360),
    lifecycle: z.enum(["active", "cancelled"]).default("active"),
    providerReference: reference,
    verificationSource: z.string().trim().min(1).max(2000),
    verifiedDate: date,
    providerConfirmed: z.literal(true),
    notes: z.string().max(20000).nullable().default(null),
    installments: z.array(cardInstallmentLineSchema).min(1).max(360),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.installmentCount !== v.installments.length)
      c.addIssue({
        code: "custom",
        message: "Installment count must match the complete provider schedule.",
      });
    if (
      validMinor(v.principalMinor) &&
      v.installments.every((x) => validMinor(x.principalMinor)) &&
      v.installments.reduce((s, x) => s + BigInt(x.principalMinor), 0n) !==
        BigInt(v.principalMinor)
    )
      c.addIssue({
        code: "custom",
        message:
          "The complete schedule, including settled portions, must total financed principal.",
      });
    let previous: string | null = null;
    for (const [index, line] of v.installments.entries())
      if (line.dueDate && isCalendarDate(line.dueDate)) {
        if (previous && line.dueDate < previous)
          c.addIssue({
            code: "custom",
            path: ["installments", index, "dueDate"],
            message: "Known due dates must follow provider schedule order.",
          });
        previous = line.dueDate;
      }
  });
export const cardInstallmentCommandSchema = cardInstallmentEvidenceSchema
  .safeExtend({
    cardId: id,
    clientCommandId: id,
    planId: id.optional(),
    expectedVersion: z.number().int().min(1).max(2147483646).optional(),
    reason: z.string().trim().min(1).max(20000).optional(),
  })
  .superRefine((v, c) => {
    if (
      v.planId
        ? !v.expectedVersion || !v.reason
        : v.expectedVersion !== undefined ||
          v.reason !== undefined ||
          v.lifecycle !== "active"
    )
      c.addIssue({
        code: "custom",
        message:
          "A revision/cancellation requires its plan, expected version and reason; new plans start active.",
      });
  });
export const cardInstallmentApplicationSchema = z
  .object({
    clientCommandId: id,
    planRevisionId: id,
    installmentNo: z.number().int().min(1).max(360),
    allocationId: id,
    principalMinor: installmentMinor.default("0"),
    interestMinor: installmentMinor.default("0"),
    feeMinor: installmentMinor.default("0"),
    interestActionRevisionId: id.nullable().default(null),
    feeActionRevisionId: id.nullable().default(null),
    confirmationKind: z.enum(["provider", "user"]),
    confirmationSource: z.string().trim().min(1).max(2000),
    confirmedDate: date,
  })
  .strict()
  .superRefine((v, c) => {
    if (
      [v.principalMinor, v.interestMinor, v.feeMinor].every(validMinor) &&
      BigInt(v.principalMinor) +
        BigInt(v.interestMinor) +
        BigInt(v.feeMinor) ===
        0n
    )
      c.addIssue({
        code: "custom",
        message: "Confirm a positive application amount.",
      });
    if (
      (v.interestMinor === "0") !== (v.interestActionRevisionId === null) ||
      (v.feeMinor === "0") !== (v.feeActionRevisionId === null)
    )
      c.addIssue({
        code: "custom",
        message:
          "Applied interest and fees require the exact recorded card charge; zero portions exclude charge links.",
      });
  });
export const reverseInstallmentApplicationSchema = z
  .object({
    clientCommandId: id,
    applicationId: id,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const installmentResultSchema = z.object({
  planId: id,
  revisionId: id,
  version: z.number().int().positive(),
  financialRevision: z.string().regex(/^\d+$/),
});
export class CardInstallmentUnavailableError extends Error {
  constructor() {
    super("The requested private installment evidence is unavailable.");
    this.name = "CardInstallmentUnavailableError";
  }
}
export class CardInstallmentConflictError extends Error {
  constructor(
    message = "Installment evidence changed. Reload and confirm the supported schedule or application again.",
  ) {
    super(message);
    this.name = "CardInstallmentConflictError";
  }
}
export type CardInstallmentEvidence = z.output<
  typeof cardInstallmentEvidenceSchema
>;
export function installmentProjection(
  line: z.output<typeof cardInstallmentLineSchema>,
  applied = { principalMinor: "0", interestMinor: "0", feeMinor: "0" },
) {
  const remaining = (expected: string | null, actual: string) =>
    expected === null ? null : (BigInt(expected) - BigInt(actual)).toString();
  const total =
    line.totalMinor ??
    (line.interestMinor !== null && line.feeMinor !== null
      ? (
          BigInt(line.principalMinor) +
          BigInt(line.interestMinor) +
          BigInt(line.feeMinor)
        ).toString()
      : null);
  if (
    [line.principalMinor, line.interestMinor, line.feeMinor].some((v, i) => {
      const actual = BigInt(
        [applied.principalMinor, applied.interestMinor, applied.feeMinor][i]!,
      );
      return actual < 0n || (v === null ? actual > 0n : BigInt(v) < actual);
    })
  )
    throw new RangeError("Applications exceed supported scheduled amounts.");
  const paid =
    BigInt(applied.principalMinor) +
    BigInt(applied.interestMinor) +
    BigInt(applied.feeMinor);
  if (total !== null && paid > BigInt(total))
    throw new RangeError("Applications exceed supported total.");
  return {
    remainingPrincipalMinor: remaining(
      line.principalMinor,
      applied.principalMinor,
    )!,
    remainingInterestMinor: remaining(
      line.interestMinor,
      applied.interestMinor,
    ),
    remainingFeeMinor: remaining(line.feeMinor, applied.feeMinor),
    remainingTotalMinor: remaining(total, paid.toString()),
  };
}
