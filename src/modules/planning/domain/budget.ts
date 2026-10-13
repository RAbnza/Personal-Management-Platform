import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
import { addCalendarDays } from "@/modules/reporting/domain/period";
import { parseMinorUnits } from "@/shared/money";
import { planningId } from "./recurrence";

export const BUDGET_DEFINITION_VERSION = "v2-c-category-period-signed-1";
export const MAX_BUDGET_MINOR = 9223372036854775807n;
export const budgetDate = z
  .string()
  .refine(isCalendarDate)
  .refine((v) => v >= "1900-01-01" && v <= "2199-12-31");
const exclusiveDate = z
  .string()
  .refine(isCalendarDate)
  .refine((v) => v >= "1900-01-02" && v <= "2200-01-01");
export const budgetFieldsSchema = z
  .object({
    categoryId: planningId,
    startDate: budgetDate,
    endDateExclusive: exclusiveDate,
    limitMinor: z
      .string()
      .regex(/^(0|[1-9]\d{0,18})$/)
      .refine(
        (v) => /^(0|[1-9]\d{0,18})$/.test(v) && BigInt(v) <= MAX_BUDGET_MINOR,
      ),
    basis: z.enum(["net", "gross"]).default("net"),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .refine((v) => {
    const days =
      (Date.parse(v.endDateExclusive + "T00:00:00Z") -
        Date.parse(v.startDate + "T00:00:00Z")) /
      86400000;
    return days >= 1 && days <= 366;
  }, "Choose an ordered budget period of at most 366 days.");
const reason = z.string().trim().min(1).max(2000);
export const budgetCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("save"),
      clientCommandId: planningId,
      budgetId: planningId.nullable(),
      expectedVersion: z.number().int().positive().max(2147483646).nullable(),
      reason: reason.nullable(),
      fields: budgetFieldsSchema,
    })
    .strict()
    .refine(
      (v) =>
        v.budgetId === null
          ? v.expectedVersion === null && v.reason === null
          : v.expectedVersion !== null && v.reason !== null,
      "New budgets have no prior version/reason; changes require both.",
    ),
  z
    .object({
      operation: z.enum(["archive", "restore"]),
      clientCommandId: planningId,
      budgetId: planningId,
      expectedVersion: z.number().int().positive().max(2147483646),
      reason,
    })
    .strict(),
]);
export type BudgetFields = z.output<typeof budgetFieldsSchema>;
export type BudgetCommand = z.output<typeof budgetCommandSchema>;
export function budgetEndDate(endDateExclusive: string) {
  return addCalendarDays(endDateExclusive, -1);
}
export function compareBudget(
  limitMinor: string,
  grossMinor: string,
  offsetsMinor: string,
  basis: "net" | "gross",
) {
  const limit = parseMinorUnits(limitMinor),
    gross = parseMinorUnits(grossMinor),
    offsets = parseMinorUnits(offsetsMinor),
    net = gross - offsets,
    spending = basis === "net" ? net : gross,
    remaining = limit - spending;
  return {
    grossMinor: gross.toString(),
    offsetsMinor: offsets.toString(),
    netMinor: net.toString(),
    spendingMinor: spending.toString(),
    remainingMinor: remaining.toString(),
    overspentMinor: (remaining < 0n ? -remaining : 0n).toString(),
    progressBasisPoints:
      limit === 0n
        ? null
        : (((spending > 0n ? spending : 0n) * 10000n) / limit).toString(),
    status:
      spending > limit
        ? "overspent"
        : spending === limit
          ? "at_limit"
          : "within_limit",
  } as const;
}
export class BudgetUnavailableError extends Error {
  constructor() {
    super("The private budget or expense category is unavailable.");
  }
}
export class BudgetConflictError extends Error {
  constructor(
    message = "The budget changed or its period overlaps an existing budget for this category.",
  ) {
    super(message);
  }
}
