import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
import { dashboardQuerySchema, type ReportPeriod } from "./period";

export const reportQuerySchema = dashboardQuerySchema
  .omit({ source: true })
  .extend({
    anchorDate: z.string().refine(isCalendarDate).optional(),
    asOfDate: z.string().refine(isCalendarDate).optional(),
  })
  .strict();
export type ReportQuery = z.input<typeof reportQuerySchema>;
export const REPORT_DEFINITION_VERSION = "v1-reports-signed-cohort-1";
export const CAREER_COVERAGE_NOTE =
  "Submitted-date cohort, including archived attempts. Response means an explicitly dated, noncancelled response event; stage changes do not invent responses. Outcomes use corrected effective history through the as-of date. Event counts cover the selected event-date period, including other cohorts. Snapshot knowledge is current; as-of is an effective observation cutoff, not historical database knowledge.";
export const financialMetrics = {
  income: "Recognized income",
  gross: "Gross recognized spending",
  offsets: "Refunds, rebates and eligible waivers",
  net: "Net recognized spending",
  fees: "Recognized fees (included in spending)",
  interest: "Newly recognized interest (included in spending)",
  penalties: "Newly recognized penalties (included in spending)",
  cash_in: "External cash inflows",
  cash_out: "External cash outflows",
  transfers: "Internal transfer principal (reference only)",
  internal_cash_net: "Internal transfer net cash (consolidated scope)",
  borrowing: "Cash borrowing proceeds (not income)",
  cash_refunds: "Actual cash refunds",
  debt_payments: "Actual debt payments including external fees",
  principal: "Principal repaid (not spending)",
  debt_charges: "Recognized debt charges (included in spending)",
  waivers: "Recognized liability waivers",
  baseline: "Opening cash baseline changes",
  adjustments: "Explicit cash balance adjustments (not income)",
  opening_cash: "Opening tracked liquid funds",
  closing_cash: "Closing tracked liquid funds",
  net_cash_change: "Actual net cash change",
  opening_liability: "Opening net recognized liabilities",
  liability_increases: "Recognized liability increases / baselines",
  liability_reductions: "Recognized liability reductions",
  closing_liability: "Closing net recognized liabilities",
  clearing: "Unresolved clearing at period end (excluded from net position)",
  tracked_net: "Closing tracked net position (limited coverage)",
} as const;
export type FinancialMetric = keyof typeof financialMetrics;
export const financialDetailQuerySchema = reportQuerySchema
  .extend({
    metric: z.enum(
      Object.keys(financialMetrics) as [FinancialMetric, ...FinancialMetric[]],
    ),
    categoryId: z.union([z.uuid(), z.literal("uncategorized")]).optional(),
    ledgerId: z.uuid().optional(),
    flowKind: z
      .enum([
        "income",
        "purchase",
        "transfer",
        "fee",
        "interest",
        "penalty",
        "borrowing",
        "debt_payment",
        "refund",
        "reward",
        "opening",
        "adjustment",
        "clearing",
      ])
      .optional(),
    liabilityComponent: z
      .enum(["principal", "interest", "fee", "penalty", "unclassified"])
      .optional(),
    after: z.uuid().optional(),
  })
  .strict();
export class ReportLimitError extends Error {
  constructor() {
    super("Choose a smaller range: this export exceeds 10,000 rows or 10 MiB.");
  }
}
export function exactDecimal(minor: string) {
  const value = BigInt(minor),
    abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export function reportDates(period: ReportPeriod, asOfDate?: string) {
  return new URLSearchParams({
    period: "custom",
    startDate: period.startDate,
    endDate: period.endDate,
    ...(asOfDate ? { asOfDate } : {}),
  });
}
