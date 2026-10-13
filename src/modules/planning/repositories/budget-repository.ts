import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  metricExpression,
  postingFacts,
} from "@/modules/reporting/repositories/posting-facts";
import { FINANCIAL_DEFINITION_VERSION } from "@/modules/reporting/domain/period";
import {
  BUDGET_DEFINITION_VERSION,
  BudgetUnavailableError,
  compareBudget,
} from "../domain/budget";

export type BudgetEvidence = {
  id: string;
  workspace_id: string;
  category_id: string;
  start_date: string;
  end_date_exclusive: string;
  limit_minor: string;
  write_revision: string;
  basis: "net" | "gross";
  notes: string | null;
  archived_at: string | null;
  version: number;
  command_receipt_id: string;
  recorded_by_user_id: string;
  request_id: string | null;
};
export async function readBudgetEvidence(
  t: ScopedTransaction,
  workspaceId: string,
  budgetId: string,
) {
  const r = await t.db.execute<{ snapshot: BudgetEvidence }>(
    sql`SELECT planning.budget_snapshot(to_jsonb(b)) snapshot FROM planning.budget b WHERE workspace_id=${workspaceId}::uuid AND id=${budgetId}::uuid`,
  );
  if (!r.rows[0]) throw new BudgetUnavailableError();
  return r.rows[0].snapshot;
}
export type BudgetSelection = {
  budgetId?: string;
  categoryId?: string | undefined;
  cursor?: string | undefined;
  pageSize?: number;
  includeArchived?: boolean;
  startDate?: string | undefined;
  endDateExclusive?: string;
};
/** One shared posting grain per bounded page, reduced to category/date before
 * joining limits. Every comparison covers its own complete budget period. */
export async function readBudgetComparisons(
  t: ScopedTransaction,
  workspaceId: string,
  p: BudgetSelection = {},
) {
  const count = p.pageSize ?? 50;
  const selected = await t.db.execute<{
    snapshot: BudgetEvidence;
    categoryName: string;
    categoryArchived: boolean;
  }>(sql`SELECT planning.budget_snapshot(to_jsonb(b)) snapshot,c.name AS "categoryName",c.archived_at IS NOT NULL AS "categoryArchived" FROM planning.budget b JOIN core.category c ON c.workspace_id=b.workspace_id AND c.id=b.category_id WHERE b.workspace_id=${workspaceId}::uuid
    ${p.budgetId ? sql`AND b.id=${p.budgetId}::uuid` : sql``}
    ${p.categoryId ? sql`AND b.category_id=${p.categoryId}::uuid` : sql``}
    ${p.cursor ? sql`AND b.id>${p.cursor}::uuid` : sql``}
    ${p.includeArchived ? sql`` : sql`AND b.archived_at IS NULL`}
    ${p.startDate && p.endDateExclusive ? sql`AND b.start_date<${p.endDateExclusive}::date AND b.end_date_exclusive>${p.startDate}::date` : sql``}
    ORDER BY b.id LIMIT ${count + 1}`);
  const rows = selected.rows.slice(0, count);
  if (!rows.length)
    return {
      items: [],
      nextCursor: null,
      definitionVersion: BUDGET_DEFINITION_VERSION,
      financialDefinitionVersion: FINANCIAL_DEFINITION_VERSION,
    };
  const from = rows.reduce(
      (d, r) => (r.snapshot.start_date < d ? r.snapshot.start_date : d),
      rows[0]!.snapshot.start_date,
    ),
    through = rows.reduce(
      (d, r) =>
        r.snapshot.end_date_exclusive > d ? r.snapshot.end_date_exclusive : d,
      rows[0]!.snapshot.end_date_exclusive,
    );
  const totals = await t.db.execute<{
    id: string;
    grossMinor: string;
    offsetsMinor: string;
  }>(sql`${postingFacts(workspaceId)}, daily AS (
    SELECT category_id,effective_date,sum(${metricExpression("gross")}) gross,sum(${metricExpression("offsets")}) offsets FROM facts WHERE effective_date>=${from}::date AND effective_date<${through}::date AND category_id=ANY(ARRAY[${sql.join(
      rows.map((r) => sql`${r.snapshot.category_id}::uuid`),
      sql`, `,
    )}]) AND expense_class<>'none' GROUP BY category_id,effective_date
  ) SELECT b.id,COALESCE(sum(d.gross),0)::text AS "grossMinor",COALESCE(sum(d.offsets),0)::text AS "offsetsMinor" FROM planning.budget b LEFT JOIN daily d ON d.category_id=b.category_id AND d.effective_date>=b.start_date AND d.effective_date<b.end_date_exclusive WHERE b.workspace_id=${workspaceId}::uuid AND b.id=ANY(ARRAY[${sql.join(
    rows.map((r) => sql`${r.snapshot.id}::uuid`),
    sql`, `,
  )}]) GROUP BY b.id`);
  const lookup = new Map(totals.rows.map((r) => [r.id, r]));
  return {
    items: rows.map((r) => {
      const b = r.snapshot,
        n = lookup.get(b.id)!;
      return {
        ...b,
        categoryName: r.categoryName,
        categoryArchived: r.categoryArchived,
        ...compareBudget(b.limit_minor, n.grossMinor, n.offsetsMinor, b.basis),
      };
    }),
    nextCursor: selected.rows.length > count ? rows.at(-1)!.snapshot.id : null,
    definitionVersion: BUDGET_DEFINITION_VERSION,
    financialDefinitionVersion: FINANCIAL_DEFINITION_VERSION,
  };
}
