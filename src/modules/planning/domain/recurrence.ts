import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  startOfWeek,
} from "date-fns";
import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";

export const planningId = z.uuid().transform((value) => value.toLowerCase());
export const planningDate = z
  .string()
  .refine(
    (value) =>
      isCalendarDate(value) && value >= "1900-01-01" && value <= "2199-12-31",
    "Use a valid calendar date from 1900 through 2199.",
  );
export const planningAmount = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine(
    (value) => BigInt(value) <= 100_000_000_000n,
    "Amount exceeds the supported financial command limit.",
  );
export const planningReason = z.string().trim().min(1).max(2000);
export const planningTimezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return value === "UTC" || value.includes("/");
    } catch {
      return false;
    }
  }, "Select a supported named timezone.");
export const recurrenceRuleSchema = z
  .object({
    effectiveFrom: planningDate,
    frequency: z.enum(["daily", "weekly", "monthly"]),
    intervalCount: z.number().int().min(1).max(365),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).nullable(),
    dayOfMonth: z.number().int().min(1).max(31).nullable(),
    shortMonthPolicy: z.enum(["last_valid_day", "skip"]).nullable(),
    endsOn: planningDate.nullable(),
    occurrenceLimit: z.number().int().min(1).max(10_000).nullable(),
    expectedMinor: planningAmount,
    currency: z.literal("PHP").default("PHP"),
    categoryId: planningId.nullable(),
    defaultAccountId: planningId.nullable(),
    timezone: planningTimezone,
  })
  .strict()
  .superRefine((r, c) => {
    const invalid = r.endsOn !== null && r.endsOn < r.effectiveFrom;
    const grammar =
      r.frequency === "daily"
        ? r.weekdays === null &&
          r.dayOfMonth === null &&
          r.shortMonthPolicy === null
        : r.frequency === "weekly"
          ? r.intervalCount <= 52 &&
            r.weekdays !== null &&
            r.weekdays.length > 0 &&
            new Set(r.weekdays).size === r.weekdays.length &&
            r.dayOfMonth === null &&
            r.shortMonthPolicy === null
          : r.intervalCount <= 120 &&
            r.weekdays === null &&
            r.dayOfMonth !== null &&
            r.shortMonthPolicy !== null;
    if (invalid || !grammar)
      c.addIssue({
        code: "custom",
        message:
          "Recurrence fields or end date do not match the selected frequency.",
      });
  })
  .transform((r) => ({
    ...r,
    weekdays: r.weekdays?.slice().sort((a, b) => a - b) ?? null,
  }));
export type RecurrenceRule = z.output<typeof recurrenceRuleSchema>;
export const generationWindowSchema = z
  .object({ from: planningDate, through: planningDate })
  .strict()
  .refine(
    (v) =>
      v.through >= v.from &&
      differenceInCalendarDays(calendar(v.through), calendar(v.from)) <= 365,
    "Generation must cover at most 366 calendar days.",
  );
function calendar(date: string) {
  return new TZDate(`${date}T00:00:00Z`, "UTC");
}
function key(date: Date) {
  return format(date, "yyyy-MM-dd");
}
export function planningToday(timezone: string, now = new Date()) {
  return format(new TZDate(now, timezone), "yyyy-MM-dd");
}
/** Explicit calendar context: neither process timezone nor DST changes logical dates. */
export function generateRecurrenceDates(
  input: z.input<typeof recurrenceRuleSchema>,
  window: z.input<typeof generationWindowSchema>,
): string[] {
  const rule = recurrenceRuleSchema.parse(input),
    w = generationWindowSchema.parse(window);
  const anchor = calendar(rule.effectiveFrom),
    end =
      rule.endsOn !== null && rule.endsOn < w.through ? rule.endsOn : w.through;
  if (end < rule.effectiveFrom || end < w.from) return [];
  const dates: string[] = [],
    limit = rule.occurrenceLimit ?? Number.MAX_SAFE_INTEGER;
  let ordinal = 0;
  function emit(date: Date) {
    const dateKey = key(date);
    if (dateKey < rule.effectiveFrom || dateKey > end) return;
    ordinal += 1;
    if (ordinal <= limit && dateKey >= w.from) dates.push(dateKey);
  }
  if (rule.frequency === "daily") {
    const first = Math.max(
      0,
      Math.ceil(
        differenceInCalendarDays(calendar(w.from), anchor) / rule.intervalCount,
      ),
    );
    ordinal = first;
    for (let n = first; n < limit; n += 1) {
      const date = addDays(anchor, n * rule.intervalCount);
      if (key(date) > end) break;
      emit(date);
    }
  } else if (rule.frequency === "weekly") {
    const monday = startOfWeek(anchor, { weekStartsOn: 1 });
    for (
      let week = monday;
      key(week) <= end && ordinal < limit;
      week = addDays(week, 7 * rule.intervalCount)
    ) {
      for (const day of rule.weekdays!) {
        if (ordinal >= limit) break;
        emit(addDays(week, day - 1));
      }
    }
  } else {
    const firstMonth = new TZDate(
      anchor.getFullYear(),
      anchor.getMonth(),
      1,
      "UTC",
    );
    for (
      let month = firstMonth;
      key(month) <= end && ordinal < limit;
      month = addMonths(month, rule.intervalCount)
    ) {
      const max = getDaysInMonth(month),
        requested = rule.dayOfMonth!;
      if (requested <= max || rule.shortMonthPolicy === "last_valid_day")
        emit(addDays(month, Math.min(requested, max) - 1));
    }
  }
  if (dates.length > 500)
    throw new RangeError("Generation exceeds 500 occurrences.");
  return dates;
}
const command = { clientCommandId: planningId };
export const definitionCommandSchema = z
  .object({
    ...command,
    operation: z.literal("definition"),
    obligationId: planningId.nullable(),
    expectedVersion: z.number().int().positive().nullable(),
    name: z.string().trim().min(1).max(200),
    kind: z.enum(["income", "bill", "subscription"]),
    rule: recurrenceRuleSchema,
    window: generationWindowSchema,
    reason: planningReason.nullable(),
  })
  .strict()
  .refine(
    (b) =>
      b.obligationId === null
        ? b.expectedVersion === null && b.reason === null
        : b.expectedVersion !== null && b.reason !== null,
    "A future revision requires a version and reason.",
  );
export const generateCommandSchema = z
  .object({
    ...command,
    operation: z.literal("generate"),
    obligationId: planningId,
    expectedVersion: z.number().int().positive(),
    window: generationWindowSchema,
  })
  .strict();
export const archiveCommandSchema = z
  .object({
    ...command,
    operation: z.literal("archive"),
    obligationId: planningId,
    expectedVersion: z.number().int().positive(),
    reason: planningReason,
  })
  .strict();
export const occurrenceCommandSchema = z
  .object({
    ...command,
    operation: z.literal("occurrence"),
    occurrenceId: planningId,
    expectedVersion: z.number().int().positive(),
    change: z.enum(["override", "skip", "cancel"]),
    dueDate: planningDate.nullable(),
    expectedMinor: planningAmount.nullable(),
    reason: planningReason,
  })
  .strict()
  .refine(
    (b) =>
      b.change === "override"
        ? b.dueDate !== null && b.expectedMinor !== null
        : b.dueDate === null && b.expectedMinor === null,
    "Override requires an exact amount and due date.",
  );
export const linkCommandSchema = z
  .object({
    ...command,
    operation: z.literal("link"),
    occurrenceId: planningId,
    expectedVersion: z.number().int().positive(),
    actionId: planningId,
    actionRevisionId: planningId,
    linkedMinor: planningAmount,
  })
  .strict();
export const unlinkCommandSchema = z
  .object({
    ...command,
    operation: z.literal("unlink"),
    linkId: planningId,
    expectedOccurrenceVersion: z.number().int().positive(),
    reason: planningReason,
  })
  .strict();
export const planningCommandSchema = z.union([
  definitionCommandSchema,
  generateCommandSchema,
  archiveCommandSchema,
  occurrenceCommandSchema,
  linkCommandSchema,
  unlinkCommandSchema,
]);
export type PlanningCommand = z.output<typeof planningCommandSchema>;
export class PlanningConflictError extends Error {
  constructor(
    message = "This planning evidence changed. Reload and review the current occurrence and actual transaction.",
  ) {
    super(message);
    this.name = "PlanningConflictError";
  }
}
export class PlanningUnavailableError extends Error {
  constructor() {
    super("The requested private recurring record is unavailable.");
    this.name = "PlanningUnavailableError";
  }
}
