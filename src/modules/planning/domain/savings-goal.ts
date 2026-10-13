import { z } from "zod";
import { planningId } from "./recurrence";
import { budgetDate, MAX_BUDGET_MINOR } from "./budget";
export const SAVINGS_DEFINITION_VERSION = "v2-d-owned-cash-supported-bounds-1";
export const savingsMinor = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .refine(
    (v) => /^(0|[1-9]\d{0,18})$/.test(v) && BigInt(v) <= MAX_BUDGET_MINOR,
  );
const positiveMinor = savingsMinor.refine((v) => v !== "0");
const version = z.number().int().positive().max(2147483646);
const revision = z.string().regex(/^(0|[1-9]\d*)$/);
const reason = z.string().trim().min(1).max(2000);
export const goalFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    targetMinor: positiveMinor,
    targetDate: budgetDate.nullable().default(null),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();
const commandBase = {
  clientCommandId: planningId,
  goalId: planningId,
  expectedVersion: version,
  reason,
};
export const savingsGoalCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("save"),
      clientCommandId: planningId,
      goalId: planningId.nullable(),
      expectedVersion: version.nullable(),
      reason: reason.nullable(),
      fields: goalFieldsSchema,
    })
    .strict()
    .refine(
      (v) =>
        v.goalId === null
          ? v.expectedVersion === null && v.reason === null
          : v.expectedVersion !== null && v.reason !== null,
      "Changes require a version and reason.",
    ),
  z
    .object({
      operation: z.enum(["complete", "archive", "reopen"]),
      ...commandBase,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reserve"),
      ...commandBase,
      expectedFinancialRevision: revision,
      financialAccountId: planningId,
      reservedMinor: savingsMinor,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reallocate"),
      ...commandBase,
      expectedFinancialRevision: revision,
      sourceAccountId: planningId,
      targetAccountId: planningId,
      targetGoalId: planningId,
      expectedTargetVersion: version,
      amountMinor: positiveMinor,
    })
    .strict()
    .refine(
      (v) =>
        v.goalId !== v.targetGoalId || v.sourceAccountId !== v.targetAccountId,
      "Choose a different goal or account.",
    )
    .refine(
      (v) =>
        v.goalId !== v.targetGoalId ||
        v.expectedVersion === v.expectedTargetVersion,
      "Use the current goal version.",
    ),
]);
export type SavingsGoalCommand = z.output<typeof savingsGoalCommandSchema>;
export class SavingsGoalConflictError extends Error {
  constructor(
    message = "Savings evidence changed or exceeds supported cash. Reload and review again.",
  ) {
    super(message);
  }
}
export class SavingsGoalUnavailableError extends Error {
  constructor() {
    super("The private savings goal or owned cash account is unavailable.");
  }
}
export function supportedReservation(
  reservedMinor: string,
  totalMinor: string,
  capacityMinor: string,
) {
  const r = BigInt(reservedMinor),
    t = BigInt(totalMinor),
    c = BigInt(capacityMinor),
    max = r < c ? r : c,
    raw = c - (t - r),
    min = raw < 0n ? 0n : raw > r ? r : raw;
  return {
    minimumMinor: min.toString(),
    maximumMinor: max.toString(),
    atRisk: t > c && r > 0n,
  };
}
export function savingsProgress(
  targetMinor: string,
  reservedMinor: string,
  minimumMinor: string,
  maximumMinor: string,
) {
  const target = BigInt(targetMinor),
    reserved = BigInt(reservedMinor),
    min = BigInt(minimumMinor),
    max = BigInt(maximumMinor);
  return {
    remainingTargetMinor: (target > reserved
      ? target - reserved
      : 0n
    ).toString(),
    excessReservedMinor: (reserved > target
      ? reserved - target
      : 0n
    ).toString(),
    progressBasisPoints: ((reserved * 10000n) / target).toString(),
    fundingHealth:
      min >= target
        ? ("funded" as const)
        : max === 0n
          ? ("unfunded" as const)
          : max < target
            ? ("partial" as const)
            : ("shared_shortfall" as const),
  };
}
