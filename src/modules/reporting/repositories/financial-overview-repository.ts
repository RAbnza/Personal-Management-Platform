import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import type { ReportPeriod } from "../domain/period";
import { financialMetrics, type FinancialMetric } from "../domain/reports";
import {
  metricDatePredicate,
  metricExpression,
  postingFacts,
  balancePostingFacts,
} from "./posting-facts";

export async function readFinancialMetrics(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
) {
  const metrics = Object.keys(financialMetrics) as FinancialMetric[];
  const balanceMetrics = new Set<FinancialMetric>([
    "opening_cash",
    "closing_cash",
    "opening_liability",
    "closing_liability",
    "clearing",
    "tracked_net",
  ]);
  const selections = (selected: FinancialMetric[]) =>
    selected.map(
      (m) =>
        sql`COALESCE(sum(${metricExpression(m)}) FILTER (WHERE ${metricDatePredicate(m, period.startDate, period.endDateExclusive)}),0)::text AS ${sql.identifier(m)}`,
    );
  // Period classification is evaluated only for period postings. Historical
  // balances aggregate independently, without repeating charge metadata joins
  // across every year of spending. Both retain the shared metric definitions.
  const activity = await t.db.execute<Record<FinancialMetric, string>>(
    sql`${postingFacts(workspaceId)} SELECT ${sql.join(selections(metrics.filter((m) => !balanceMetrics.has(m))), sql`, `)} FROM facts
      WHERE effective_date>=${period.startDate}::date AND effective_date<${period.endDateExclusive}::date`,
  );
  const balances = await t.db.execute<Record<FinancialMetric, string>>(
    sql`${balancePostingFacts(workspaceId)} SELECT ${sql.join(selections(metrics.filter((m) => balanceMetrics.has(m))), sql`, `)} FROM facts
      WHERE effective_date<${period.endDateExclusive}::date`,
  );
  return { ...activity.rows[0]!, ...balances.rows[0]! };
}
export type FinancialContribution = {
  postingId: string;
  actionId: string;
  actionRevisionId: string;
  journalId: string;
  effectiveDate: string;
  amountMinor: string;
  ledgerName: string;
  ledgerKind: string;
  description: string;
  category: string | null;
  categoryId: string | null;
  journalRole: string;
  revisionNo: number;
  actionKind: string;
  expenseClass: string;
  incomeClass: string;
  cashFlowKind: string;
  cashFlowDirection: string;
  liabilityComponent: string | null;
};
export async function readFinancialContributions(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
  input: {
    metric: FinancialMetric;
    categoryId?: string;
    ledgerId?: string;
    flowKind?: string;
    liabilityComponent?: string;
    after?: string;
    limit?: number;
  },
) {
  const expression = metricExpression(input.metric);
  const base = sql`${postingFacts(workspaceId)}, contributions AS (SELECT *,${expression} AS contribution FROM facts
    WHERE ${metricDatePredicate(input.metric, period.startDate, period.endDateExclusive)} ${input.categoryId === "uncategorized" ? sql`AND category_id IS NULL` : input.categoryId ? sql`AND category_id=${input.categoryId}::uuid` : sql``}
      ${input.ledgerId ? sql`AND ledger_account_id=${input.ledgerId}::uuid` : sql``}
      ${input.flowKind ? sql`AND cash_flow_kind=${input.flowKind}` : sql``}
      ${input.liabilityComponent ? sql`AND liability_component=${input.liabilityComponent}` : sql``})`;
  const total = await t.db.execute<{ amountMinor: string; count: string }>(
    sql`${base} SELECT COALESCE(sum(contribution),0)::text AS "amountMinor",count(contribution)::text AS count FROM contributions`,
  );
  if (input.after) {
    const cursor = await t.db.execute(
      sql`${base} SELECT 1 FROM contributions WHERE id=${input.after}::uuid AND contribution IS NOT NULL`,
    );
    if (!cursor.rows.length) throw new RangeError("Unavailable report cursor.");
  }
  const r = await t.db.execute<FinancialContribution>(sql`${base}
    SELECT id AS "postingId",action_id AS "actionId",action_revision_id AS "actionRevisionId",journal_id AS "journalId",effective_date::text AS "effectiveDate",contribution::text AS "amountMinor",
      ledger_name AS "ledgerName",ledger_kind AS "ledgerKind",description,category,category_id AS "categoryId",journal_role AS "journalRole",revision_no AS "revisionNo",action_kind AS "actionKind",
      expense_class AS "expenseClass",income_class AS "incomeClass",cash_flow_kind AS "cashFlowKind",cash_flow_direction AS "cashFlowDirection",liability_component AS "liabilityComponent"
    FROM contributions WHERE contribution IS NOT NULL
      ${input.after ? sql`AND (effective_date,id)<(SELECT effective_date,id FROM contributions WHERE id=${input.after}::uuid)` : sql``}
    ORDER BY effective_date DESC,id DESC LIMIT ${(input.limit ?? 100) + 1}`);
  const limit = input.limit ?? 100;
  return {
    ...total.rows[0]!,
    items: r.rows.slice(0, limit),
    nextCursor: r.rows.length > limit ? r.rows[limit - 1]!.postingId : null,
  };
}
export async function readFinancialBreakdowns(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
) {
  const categories = await t.db.execute<{
    categoryId: string | null;
    category: string;
    grossMinor: string;
    offsetsMinor: string;
    netMinor: string;
  }>(sql`${postingFacts(workspaceId)}
    SELECT category_id AS "categoryId",COALESCE(category,'Uncategorized') AS category,
      COALESCE(sum(amount) FILTER(WHERE expense_class='gross'),0)::text AS "grossMinor",
      (-COALESCE(sum(amount) FILTER(WHERE expense_class IN ('refund_offset','rebate_offset','waiver_offset')),0))::text AS "offsetsMinor",
      sum(amount)::text AS "netMinor"
    FROM facts WHERE expense_class<>'none' AND effective_date>=${period.startDate}::date AND effective_date<${period.endDateExclusive}::date
    GROUP BY category_id,category ORDER BY sum(amount) DESC,category_id`);
  const trend = await t.db.execute<{
    date: string;
    incomeMinor: string;
    netMinor: string;
    cashOutMinor: string;
  }>(sql`${postingFacts(workspaceId)}
    SELECT effective_date::text AS date,COALESCE(sum(${metricExpression("income")}),0)::text AS "incomeMinor",COALESCE(sum(${metricExpression("net")}),0)::text AS "netMinor",COALESCE(sum(${metricExpression("cash_out")}),0)::text AS "cashOutMinor"
    FROM facts WHERE effective_date>=${period.startDate}::date AND effective_date<${period.endDateExclusive}::date GROUP BY effective_date ORDER BY effective_date`);
  const cash = await t.db.execute<{
    kind: string;
    direction: string;
    amountMinor: string;
  }>(sql`${postingFacts(workspaceId)}
    SELECT cash_flow_kind AS kind,cash_flow_direction AS direction,(CASE WHEN cash_flow_direction='out' THEN -sum(amount) ELSE sum(amount) END)::text AS "amountMinor"
    FROM facts WHERE cash_flow_direction<>'none' AND effective_date>=${period.startDate}::date AND effective_date<${period.endDateExclusive}::date GROUP BY cash_flow_kind,cash_flow_direction ORDER BY cash_flow_direction,cash_flow_kind`);
  return { categories: categories.rows, trend: trend.rows, cash: cash.rows };
}
export async function readReportSchedule(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
) {
  const r = await t.db.execute<{
    installmentId: string;
    debtId: string;
    name: string;
    scheduleVersionId: string;
    dueDate: string;
    contractualMinor: string;
    openingSatisfiedMinor: string;
    satisfiedMinor: string;
    remainingMinor: string;
  }>(sql`
    SELECT i.id AS "installmentId",i.debt_id AS "debtId",d.name,i.schedule_version_id AS "scheduleVersionId",i.due_date::text AS "dueDate",i.contractual_minor::text AS "contractualMinor",
      i.opening_satisfied_minor::text AS "openingSatisfiedMinor",(i.opening_satisfied_minor::numeric+i.payment_satisfied_minor)::text AS "satisfiedMinor",i.remaining_minor::text AS "remainingMinor"
    FROM finance.current_installment_due_v i JOIN finance.debt d ON d.workspace_id=i.workspace_id AND d.id=i.debt_id
    WHERE i.workspace_id=${workspaceId}::uuid AND i.disposition='scheduled' AND d.lifecycle='active' AND i.due_date>=${period.startDate}::date AND i.due_date<${period.endDateExclusive}::date ORDER BY i.due_date,i.id LIMIT 10001`);
  return r.rows;
}

export async function readLiabilityBreakdowns(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
) {
  const components = await t.db.execute<{
    component: string;
    openingMinor: string;
    increasesMinor: string;
    reductionsMinor: string;
    closingMinor: string;
  }>(sql`${postingFacts(workspaceId)}
    SELECT liability_component AS component,
      (-COALESCE(sum(amount) FILTER(WHERE effective_date<${period.startDate}::date),0))::text AS "openingMinor",
      (-COALESCE(sum(amount) FILTER(WHERE effective_date>=${period.startDate}::date AND source_amount<0),0))::text AS "increasesMinor",
      COALESCE(sum(amount) FILTER(WHERE effective_date>=${period.startDate}::date AND source_amount>0),0)::text AS "reductionsMinor",
      (-sum(amount))::text AS "closingMinor"
    FROM facts WHERE ledger_kind='debt_liability' AND effective_date<${period.endDateExclusive}::date GROUP BY liability_component ORDER BY liability_component`);
  // Aggregate to ledger grain before attaching one-to-one debt metadata.
  const debts = await t.db.execute<{
    debtId: string;
    ledgerId: string;
    name: string;
    openingMinor: string;
    closingMinor: string;
  }>(sql`${postingFacts(workspaceId)}, balances AS (
    SELECT ledger_account_id,(-COALESCE(sum(amount) FILTER(WHERE effective_date<${period.startDate}::date),0))::text AS opening,
      (-sum(amount))::text AS closing FROM facts WHERE ledger_kind='debt_liability' AND effective_date<${period.endDateExclusive}::date GROUP BY ledger_account_id)
    SELECT d.id AS "debtId",d.liability_ledger_account_id AS "ledgerId",d.name,COALESCE(b.opening,'0') AS "openingMinor",COALESCE(b.closing,'0') AS "closingMinor"
    FROM finance.debt d LEFT JOIN balances b ON b.ledger_account_id=d.liability_ledger_account_id WHERE d.workspace_id=${workspaceId}::uuid ORDER BY d.name,d.id`);
  return { liabilityComponents: components.rows, liabilityRecords: debts.rows };
}
