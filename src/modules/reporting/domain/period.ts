import { z } from "zod";
import { isCalendarDate, parseCalendarDate } from "@/shared/calendar-date";

export const dashboardQuerySchema = z
  .object({
    period: z
      .enum(["week", "month", "quarter", "year", "custom"])
      .default("month"),
    startDate: z.string().refine(isCalendarDate).optional(),
    endDate: z.string().refine(isCalendarDate).optional(),
    source: z.enum(["all", "money", "career", "time"]).default("all"),
  })
  .strict();
export type DashboardQuery = z.input<typeof dashboardQuerySchema>;
export type ReportPeriod = {
  kind: string;
  startDate: string;
  endDate: string;
  endDateExclusive: string;
};
export const FINANCIAL_DEFINITION_VERSION = "v1-posted-signed-1";

export function addCalendarDays(value: string, days: number): string {
  parseCalendarDate(value);
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return parseCalendarDate(date.toISOString().slice(0, 10));
}

export function resolveReportPeriod(
  query: DashboardQuery,
  today: string,
  weekStart: number,
): ReportPeriod {
  const input = dashboardQuerySchema.parse(query);
  parseCalendarDate(today);
  let startDate: string;
  let endDateExclusive: string;
  if (input.period === "custom") {
    if (!input.startDate || !input.endDate)
      throw new RangeError("Custom periods require both dates.");
    startDate = input.startDate;
    endDateExclusive = addCalendarDays(input.endDate, 1);
  } else {
    if (input.startDate || input.endDate)
      throw new RangeError("Choose Custom to supply period dates.");
    const y = Number(today.slice(0, 4)),
      m = Number(today.slice(5, 7));
    if (input.period === "week") {
      if (!Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6)
        throw new RangeError("Invalid week start.");
      startDate = addCalendarDays(
        today,
        -((new Date(`${today}T00:00:00Z`).getUTCDay() - weekStart + 7) % 7),
      );
      endDateExclusive = addCalendarDays(startDate, 7);
    } else {
      const month =
        input.period === "year"
          ? 1
          : input.period === "quarter"
            ? Math.floor((m - 1) / 3) * 3 + 1
            : m;
      const span =
        input.period === "year" ? 12 : input.period === "quarter" ? 3 : 1;
      startDate = `${String(y).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
      const next = new Date(`${startDate}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + span);
      endDateExclusive = parseCalendarDate(next.toISOString().slice(0, 10));
    }
  }
  const days =
    (Date.parse(`${endDateExclusive}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
    86400000;
  if (days < 1 || days > 366)
    throw new RangeError("Select an ordered period of at most 366 days.");
  return {
    kind: input.period,
    startDate,
    endDate: addCalendarDays(endDateExclusive, -1),
    endDateExclusive,
  };
}

export function spendingHref(period: ReportPeriod): string {
  return `/dashboard/spending?${new URLSearchParams({ startDate: period.startDate, endDate: period.endDate })}`;
}
