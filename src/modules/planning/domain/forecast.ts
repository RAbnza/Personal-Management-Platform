import { z } from "zod";
import {
  addCalendarDays,
  FINANCIAL_DEFINITION_VERSION,
} from "@/modules/reporting/domain/period";
import { planningDate, planningId } from "./recurrence";
import { savingsMinor } from "./savings-goal";
export const FORECAST_DEFINITION_VERSION =
  "v2-e-signed-cash-explicit-sources-1";
export const forecastRangeSchema = z
  .object({
    startDate: planningDate.optional(),
    endDate: planningDate.optional(),
  })
  .strict();
const sourceKey = z
  .string()
  .max(160)
  .regex(/^(recurring|statement|installment):[a-z0-9:.-]+$/);
export const forecastScenarioSchema = forecastRangeSchema
  .extend({
    includeUnassignedRecurring: z.boolean().default(false),
    useSourceCalendarDates: z.boolean().default(false),
    confirmIndependentRecurring: z.boolean().default(false),
    exclusions: z.array(sourceKey).max(100).default([]),
    cards: z
      .array(
        z.discriminatedUnion("basis", [
          z
            .object({
              cardId: planningId,
              basis: z.literal("statement"),
              statementId: planningId,
            })
            .strict(),
          z
            .object({ cardId: planningId, basis: z.literal("installments") })
            .strict(),
        ]),
      )
      .max(100)
      .default([]),
    adjustments: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(200),
            date: planningDate,
            direction: z.enum(["inflow", "outflow"]),
            amountMinor: savingsMinor.refine((v) => v !== "0"),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.cards.map((c) => c.cardId)).size === v.cards.length &&
      new Set(v.exclusions).size === v.exclusions.length,
    "Choose each card and exclusion once.",
  );
export type ForecastScenario = z.output<typeof forecastScenarioSchema>;
export type ForecastSource = {
  key: string;
  kind:
    | "recorded_cash"
    | "recurring_income"
    | "recurring_outflow"
    | "statement"
    | "installment";
  title: string;
  date: string | null;
  amountMinor: string | null;
  href: string;
  provenance: string;
  blocker: string | null;
  timezone?: string;
  unassigned?: boolean;
  cardId?: string;
  statementId?: string;
  unmatchedMinor?: string;
};
export function forecastRange(
  today: string,
  input: z.input<typeof forecastRangeSchema>,
) {
  planningDate.parse(today);
  const q = forecastRangeSchema.parse(input),
    startDate = q.startDate ?? addCalendarDays(today, 1),
    endDate =
      q.endDate ?? [addCalendarDays(today, 30), "2199-12-31"].sort()[0]!;
  if (
    startDate <= today ||
    endDate < startDate ||
    endDate > addCalendarDays(today, 366)
  )
    throw new RangeError(
      "Forecast dates must be after today and within the next 366 days.",
    );
  return {
    startDate: planningDate.parse(startDate),
    endDate: planningDate.parse(endDate),
    projectionStart: addCalendarDays(today, 1),
  };
}
export function calculateForecast(input: {
  today: string;
  timezone: string;
  openingMinor: string;
  sources: ForecastSource[];
  scenario: ForecastScenario;
}) {
  const q = forecastScenarioSchema.parse(input.scenario),
    range = forecastRange(
      input.today,
      q.startDate || q.endDate
        ? { startDate: q.startDate, endDate: q.endDate }
        : {},
    ),
    keys = new Set(input.sources.map((s) => s.key));
  if (keys.size !== input.sources.length || keys.size > 5000)
    throw new RangeError(
      "Forecast source inventory exceeds the supported limit or contains duplicate evidence.",
    );
  if (q.exclusions.some((k) => !keys.has(k)))
    throw new RangeError(
      "Forecast sources changed. Reload and choose current owned exclusions.",
    );
  const selections = new Map(q.cards.map((c) => [c.cardId, c]));
  const unmatchedFuture = (positive: boolean) =>
    input.sources.some(
      (s) =>
        s.kind === "recorded_cash" &&
        BigInt(s.unmatchedMinor ?? "0") > 0n &&
        BigInt(s.amountMinor ?? "0") > 0n === positive,
    );
  for (const c of q.cards)
    if (
      !input.sources.some(
        (s) =>
          s.cardId === c.cardId &&
          (c.basis === "statement"
            ? s.statementId === c.statementId
            : s.kind === "installment"),
      )
    )
      throw new RangeError(
        "Choose a current owned card obligation in this forecast horizon.",
      );
  const sources = input.sources.map((s) => {
    let excludedReason = s.blocker;
    if (!excludedReason && (!s.date || s.date <= input.today))
      excludedReason = "Date missing or overdue; no new payment date inferred.";
    if (!excludedReason && s.date! > range.endDate)
      excludedReason = "Outside forecast horizon.";
    if (!excludedReason && s.amountMinor === null)
      excludedReason = "Amount unknown; not treated as confirmed zero.";
    if (!excludedReason && s.kind.startsWith("recurring")) {
      if (s.unassigned && !q.includeUnassignedRecurring)
        excludedReason = "Cash funding/receipt account unconfirmed.";
      if (s.timezone !== input.timezone && !q.useSourceCalendarDates)
        excludedReason = "Different source calendar; cash date unconfirmed.";
      if (
        ((s.kind === "recurring_outflow" &&
          (q.cards.length || unmatchedFuture(false))) ||
          (s.kind === "recurring_income" && unmatchedFuture(true))) &&
        !q.confirmIndependentRecurring
      )
        excludedReason =
          "Possible overlap with unlinked recorded future cash or card repayments; review links or confirm independent expectations.";
    }
    if (
      !excludedReason &&
      (s.kind === "statement" || s.kind === "installment")
    ) {
      const c = selections.get(s.cardId!);
      if (
        !c ||
        (s.kind === "statement"
          ? c.basis !== "statement" || c.statementId !== s.statementId
          : c.basis !== "installments")
      )
        excludedReason =
          "Card payment basis not selected; statements and installments are not added together.";
    }
    if (q.exclusions.includes(s.key))
      excludedReason = "Explicit scenario exclusion.";
    return { ...s, included: excludedReason === null, excludedReason };
  });
  const events = [
    ...sources
      .filter((s) => s.included)
      .map((s) => ({
        key: s.key,
        date: s.date!,
        amountMinor: s.amountMinor!,
        basis: s.kind === "recorded_cash" ? "recorded" : "expected",
      })),
    ...q.adjustments.map((a, i) => {
      if (a.date <= input.today || a.date > range.endDate)
        throw new RangeError(
          "Adjustment dates must fall in the projected horizon.",
        );
      return {
        key: `adjustment:${i}`,
        date: a.date,
        amountMinor: (
          BigInt(a.amountMinor) * (a.direction === "inflow" ? 1n : -1n)
        ).toString(),
        basis: "assumption",
      };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  let closing = BigInt(input.openingMinor),
    windowOpening = closing,
    expectedIn = 0n,
    expectedOut = 0n,
    recordedNet = 0n,
    assumptionNet = 0n;
  for (const e of events) {
    const n = BigInt(e.amountMinor);
    closing += n;
    if (e.date < range.startDate) windowOpening += n;
    if (e.basis === "expected") {
      if (n >= 0n) expectedIn += n;
      else expectedOut -= n;
    } else if (e.basis === "recorded") recordedNet += n;
    else assumptionNet += n;
  }
  let balance = BigInt(input.openingMinor),
    minimum = balance;
  const daily = [];
  for (
    let date = range.projectionStart;
    date <= range.endDate;
    date = addCalendarDays(date, 1)
  ) {
    const day = events.filter((e) => e.date === date),
      movement = day.reduce((n, e) => n + BigInt(e.amountMinor), 0n);
    balance += movement;
    if (balance < minimum) minimum = balance;
    daily.push({
      date,
      movementMinor: movement.toString(),
      closingMinor: balance.toString(),
      bridge: date < range.startDate,
    });
  }
  return {
    ...range,
    definitionVersion: FORECAST_DEFINITION_VERSION,
    financialDefinitionVersion: FINANCIAL_DEFINITION_VERSION,
    scenario: q,
    sources,
    events,
    daily,
    totals: {
      openingActualMinor: input.openingMinor,
      windowOpeningProjectedMinor: windowOpening.toString(),
      expectedInflowsMinor: expectedIn.toString(),
      expectedOutflowsMinor: expectedOut.toString(),
      recordedFutureNetMinor: recordedNet.toString(),
      assumptionNetMinor: assumptionNet.toString(),
      closingProjectedMinor: closing.toString(),
      minimumProjectedMinor: minimum.toString(),
    },
  };
}
