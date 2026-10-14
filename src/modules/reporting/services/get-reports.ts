import { readSavingsGoals } from "@/modules/planning/repositories/savings-goal-repository";
import { readCardSurface } from "@/modules/finance/repositories/card-surface-repository";
import { readBudgetComparisons } from "@/modules/planning/repositories/budget-repository";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  analyzeCareerEvidence,
  careerBaseQuery,
  previousCareerPeriod,
  CAREER_CALCULATION_VERSION,
  type CareerReportQuery,
} from "../domain/career-analytics";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  reportQuerySchema,
  financialDetailQuerySchema,
  REPORT_DEFINITION_VERSION,
  CAREER_COVERAGE_NOTE,
  ReportLimitError,
  type ReportQuery,
} from "../domain/reports";
import { resolveReportPeriod } from "../domain/period";
import { readReportContext } from "../repositories/report-context-repository";
import { readFinancialCoverage } from "../repositories/financial-report-repository";
import {
  readFinancialMetrics,
  readFinancialBreakdowns,
  readFinancialContributions,
  readReportSchedule,
  readLiabilityBreakdowns,
} from "../repositories/financial-overview-repository";
import { readCareerReport } from "../repositories/career-report-repository";
import { readDashboardDebts } from "@/modules/dashboard/repositories/dashboard-repository";
import type { z } from "zod";

export async function resolveReport(
  t: ScopedTransaction,
  workspaceId: string,
  raw: ReportQuery,
) {
  await t.db.execute(sql`SELECT set_config('statement_timeout','10000',true)`);
  const query = reportQuerySchema.parse(raw),
    context = await readReportContext(t, workspaceId);
  const { anchorDate, asOfDate, ...dates } = query;
  if (anchorDate && query.period === "custom")
    throw new RangeError("Custom dates cannot include an anchor date.");
  const period = resolveReportPeriod(
    dates,
    anchorDate ?? context.today,
    context.weekStart,
  );
  const asOf = asOfDate ?? context.today;
  if (asOf > context.today)
    throw new RangeError("Career as-of date cannot be in the future.");
  return {
    ...context,
    period,
    asOfDate: asOf,
    definitionVersion: REPORT_DEFINITION_VERSION,
    filters: { scope: "all_owned_records", ...query },
  };
}
export async function readReportCoverage(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReturnType<typeof resolveReportPeriod>,
) {
  const coverage = await readFinancialCoverage(t, workspaceId, period),
    debts = await readDashboardDebts(t, workspaceId, period.endDate);
  return {
    ...coverage,
    unknownSchedules: debts.filter(
      (d) => d.lifecycle === "active" && d.scheduledMinor === null,
    ).length,
    incompleteLiability: debts.some(
      (d) =>
        d.breakdownStatus !== "known" || d.unclassifiedLiabilityMinor !== "0",
    ),
    noAccounts: !coverage.cutoffs.some((c) => c.kind === "account"),
    noDebts: !coverage.cutoffs.some(
      (c) => c.kind === "debt" || c.kind === "card",
    ),
    note: "Liquid funds and recognized liability use period-end postings. Current schedules use today's finalized version and allocations, not historical schedule reconstruction. Available credit and uncertain clearing are excluded from net position.",
  };
}
export async function getFinancialReportInTransaction(
  t: ScopedTransaction,
  input: { workspaceId: string; query: ReportQuery },
) {
  const context = await resolveReport(t, input.workspaceId, input.query),
    period = context.period;
  const metrics = await readFinancialMetrics(t, input.workspaceId, period),
    breakdowns = await readFinancialBreakdowns(t, input.workspaceId, period);
  const coverage = await readReportCoverage(t, input.workspaceId, period),
    schedule = await readReportSchedule(t, input.workspaceId, period);
  const scheduledMinor = schedule
    .reduce((sum, r) => sum + BigInt(r.remainingMinor), 0n)
    .toString();
  if (schedule.length > 10000) throw new ReportLimitError();
  return {
    ...context,
    metrics,
    savingsGoals: await readSavingsGoals(t, input.workspaceId, {
      pageSize: 10,
    }),
    budgets: await readBudgetComparisons(t, input.workspaceId, {
      startDate: period.startDate,
      endDateExclusive: period.endDateExclusive,
      pageSize: 10,
    }),
    ...breakdowns,
    ...(await readLiabilityBreakdowns(t, input.workspaceId, period)),
    schedule,
    cardSurface: await readCardSurface(t, input.workspaceId, {
      today: context.today,
      startDate: period.startDate,
      endDate: period.endDate,
    }),
    scheduledMinor,
    coverage,
    identities: {
      cashMatches:
        BigInt(metrics.closing_cash) ===
        BigInt(metrics.opening_cash) +
          BigInt(metrics.cash_in) -
          BigInt(metrics.cash_out) +
          BigInt(metrics.baseline) +
          BigInt(metrics.adjustments),
      liabilityMatches:
        BigInt(metrics.closing_liability) ===
        BigInt(metrics.opening_liability) +
          BigInt(metrics.liability_increases) -
          BigInt(metrics.liability_reductions),
    },
  };
}
export async function getFinancialDetailInTransaction(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    query: z.input<typeof financialDetailQuerySchema>;
  },
) {
  const {
      metric,
      categoryId,
      ledgerId,
      cardId,
      flowKind,
      liabilityComponent,
      after,
      ...query
    } = financialDetailQuerySchema.parse(input.query),
    context = await resolveReport(t, input.workspaceId, query);
  if (categoryId) {
    if (!["income", "gross", "offsets", "net"].includes(metric))
      throw new RangeError(
        "Category filter only supports categorized income/spending.",
      );
    const r =
      categoryId === "uncategorized"
        ? { rows: [1] }
        : await t.db.execute(
            sql`SELECT 1 FROM core.category WHERE workspace_id=${input.workspaceId}::uuid AND id=${categoryId}::uuid`,
          );
    if (!r.rows.length) throw new RangeError("Unavailable category.");
  }
  if (ledgerId) {
    if (
      ![
        "opening_cash",
        "closing_cash",
        "opening_liability",
        "closing_liability",
        "clearing",
        "tracked_net",
      ].includes(metric)
    )
      throw new RangeError(
        "Ledger filter supports balance contributions only; cash movement reports remain consolidated.",
      );
    const r = await t.db.execute(
      sql`SELECT 1 FROM finance.ledger_account WHERE workspace_id=${input.workspaceId}::uuid AND id=${ledgerId}::uuid`,
    );
    if (!r.rows.length) throw new RangeError("Unavailable ledger.");
  }
  if (cardId) {
    if (
      ![
        "gross",
        "net",
        "offsets",
        "opening_liability",
        "closing_liability",
        "liability_increases",
        "liability_reductions",
        "card_payments",
        "fees",
        "interest",
      ].includes(metric)
    )
      throw new RangeError(
        "Card filters support spending and liability contributions.",
      );
    const card = await t.db.execute(
      sql`SELECT 1 FROM finance.credit_card WHERE workspace_id=${input.workspaceId}::uuid AND id=${cardId}::uuid`,
    );
    if (!card.rows.length) throw new RangeError("Unavailable card.");
  }
  return {
    ...context,
    metric,
    categoryId: categoryId ?? null,
    selection: {
      ...(cardId ? { cardId } : {}),
      ...(ledgerId ? { ledgerId } : {}),
      ...(flowKind ? { flowKind } : {}),
      ...(liabilityComponent ? { liabilityComponent } : {}),
    },
    coverage: await readFinancialCoverage(t, input.workspaceId, context.period),
    ...(await readFinancialContributions(t, input.workspaceId, context.period, {
      metric,
      ...(cardId ? { cardId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(ledgerId ? { ledgerId } : {}),
      ...(flowKind ? { flowKind } : {}),
      ...(liabilityComponent ? { liabilityComponent } : {}),
      ...(after ? { after } : {}),
    })),
  };
}
export async function getCareerReportInTransaction(
  t: ScopedTransaction,
  input: { workspaceId: string; query: CareerReportQuery },
) {
  const selection = careerBaseQuery(input.query);
  const context = await resolveReport(t, input.workspaceId, selection.query),
    data = await readCareerReport(
      t,
      input.workspaceId,
      context.period,
      context.asOfDate,
    );
  const previousPeriod = selection.compare
    ? previousCareerPeriod(context.period)
    : null;
  const previous = previousPeriod
    ? await readCareerReport(
        t,
        input.workspaceId,
        previousPeriod,
        context.asOfDate,
      )
    : null;
  const evidenceCount = (d: typeof data) =>
    d.applications.length + d.events.length + d.stages.length;
  if (evidenceCount(data) + (previous ? evidenceCount(previous) : 0) > 10000)
    throw new ReportLimitError();
  const availableSources = [
    ...new Set(
      [...data.applications, ...(previous?.applications ?? [])].map(
        (a) => a.source,
      ),
    ),
  ].sort((a, b) => (a ?? "").localeCompare(b ?? ""));
  const options = { ...context, ...selection };
  const result = analyzeCareerEvidence(data, options);
  const sourceRevision = createHash("sha256")
    .update(JSON.stringify({ data, previous }))
    .digest("hex");
  return {
    ...context,
    definitionVersion: CAREER_CALCULATION_VERSION,
    filters: { ...context.filters, ...input.query },
    ...result,
    availableSources,
    cohortInterval: selection.cohortInterval,
    comparison:
      previous && previousPeriod
        ? {
            period: previousPeriod,
            ...analyzeCareerEvidence(previous, {
              ...options,
              period: previousPeriod,
            }),
          }
        : null,
    coverage: {
      note: CAREER_COVERAGE_NOTE,
      sourceRevision,
      evidenceRows:
        evidenceCount(data) + (previous ? evidenceCount(previous) : 0),
      comparisonNote:
        "Same effective cutoff, preceding equal-length submission period. Follow-up ages differ; rates are descriptive, not adjusted predictions.",
    },
  };
}
type Actor = { userId: string; workspaceId: string; query: ReportQuery };
export const getFinancialReport = (input: Actor) =>
  withDomainTransaction(
    input,
    (t) => getFinancialReportInTransaction(t, input),
    { readOnlySnapshot: true },
  );
export const getCareerReport = (
  input: Omit<Actor, "query"> & { query: CareerReportQuery },
) =>
  withDomainTransaction(input, (t) => getCareerReportInTransaction(t, input), {
    readOnlySnapshot: true,
  });
export const getFinancialDetail = (
  input: Omit<Actor, "query"> & {
    query: z.input<typeof financialDetailQuerySchema>;
  },
) =>
  withDomainTransaction(
    input,
    (t) => getFinancialDetailInTransaction(t, input),
    { readOnlySnapshot: true },
  );
export type FinancialReport = Awaited<ReturnType<typeof getFinancialReport>>;
export type CareerReport = Awaited<ReturnType<typeof getCareerReport>>;
