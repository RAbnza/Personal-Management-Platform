import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import type { ReportPeriod } from "../domain/period";

export async function readFinancialCoverage(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
) {
  const r = await t.db.execute<{
    kind: string;
    recordId: string;
    name: string;
    cutoffDate: string | null;
  }>(sql`
    SELECT 'account'::text AS kind,id AS "recordId",name,opening_cutoff_date::text AS "cutoffDate" FROM finance.financial_account WHERE workspace_id=${workspaceId}::uuid
    UNION ALL
    SELECT 'debt'::text,id,name,opening_cutoff_date::text FROM finance.debt WHERE workspace_id=${workspaceId}::uuid
    ORDER BY kind,name,"recordId"
  `);
  return {
    scope:
      "Tracked posted records only; unrecorded financial activity remains unknown.",
    cutoffs: r.rows,
    periodBeforeCutoff: r.rows.some(
      (row) => row.cutoffDate !== null && period.startDate <= row.cutoffDate,
    ),
  };
}

/** Signed immutable evidence, including every correction leg. No joins to
 * categories, schedules or current revisions can multiply or discard money. */
export async function readSpendingSummary(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
) {
  const result = await t.db.execute<{
    grossMinor: string;
    offsetsMinor: string;
    netMinor: string;
    baselineMinor: string;
  }>(sql`
    SELECT COALESCE(sum(p.amount_minor::numeric) FILTER (WHERE p.expense_class='gross'),0)::text AS "grossMinor",
      (-COALESCE(sum(p.amount_minor::numeric) FILTER (WHERE p.expense_class IN ('refund_offset','rebate_offset','waiver_offset')),0))::text AS "offsetsMinor",
      COALESCE(sum(p.amount_minor::numeric) FILTER (WHERE p.expense_class<>'none'),0)::text AS "netMinor",
      COALESCE(sum(p.amount_minor::numeric) FILTER (WHERE p.cash_flow_kind='opening'),0)::text AS "baselineMinor"
    FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
    JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
    WHERE p.workspace_id=${workspaceId}::uuid AND j.effective_date>=${period.startDate}::date AND j.effective_date<${period.endDateExclusive}::date
  `);
  return result.rows[0]!;
}

export async function readSpendingContributions(
  t: ScopedTransaction,
  input: { workspaceId: string; period: ReportPeriod; after?: string },
) {
  const result = await t.db.execute<{
    postingId: string;
    actionId: string;
    description: string;
    effectiveDate: string;
    amountMinor: string;
    expenseClass: string;
    category: string | null;
    journalRole: string;
    revisionNo: number;
  }>(sql`
    SELECT p.id AS "postingId",p.action_id AS "actionId",f.description,j.effective_date::text AS "effectiveDate",p.amount_minor::text AS "amountMinor",
      p.expense_class AS "expenseClass",c.name AS category,j.role AS "journalRole",r.revision_no AS "revisionNo"
    FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
    JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
    JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id
    LEFT JOIN core.category c ON c.workspace_id=p.workspace_id AND c.id=p.category_id
    WHERE p.workspace_id=${input.workspaceId}::uuid AND p.expense_class<>'none'
      AND j.effective_date>=${input.period.startDate}::date AND j.effective_date<${input.period.endDateExclusive}::date
      ${input.after ? sql`AND (j.effective_date,p.id)<(SELECT cj.effective_date,cp.id FROM finance.posting cp JOIN finance.journal cj ON cj.workspace_id=cp.workspace_id AND cj.id=cp.journal_id WHERE cp.workspace_id=${input.workspaceId}::uuid AND cp.id=${input.after}::uuid AND cp.expense_class<>'none' AND cj.effective_date>=${input.period.startDate}::date AND cj.effective_date<${input.period.endDateExclusive}::date)` : sql``}
    ORDER BY j.effective_date DESC,p.id DESC LIMIT 101
  `);
  return {
    items: result.rows.slice(0, 100),
    nextCursor: result.rows.length > 100 ? result.rows[99]!.postingId : null,
  };
}
