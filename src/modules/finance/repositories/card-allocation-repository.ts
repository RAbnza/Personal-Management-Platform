import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
export async function readStatementAllocations(
  t: ScopedTransaction,
  workspaceId: string,
  revisionId: string,
  offset = 0,
) {
  const revisions = sql`SELECT historic.id FROM finance.card_statement_revision selected JOIN finance.card_statement s ON s.workspace_id=selected.workspace_id AND s.id=selected.statement_id JOIN finance.card_statement_revision historic ON historic.workspace_id=selected.workspace_id AND historic.statement_id=selected.statement_id WHERE selected.workspace_id=${workspaceId}::uuid AND selected.id=${revisionId}::uuid AND (s.current_revision_id=selected.id OR historic.id=selected.id)`;
  const totals = await t.db.execute<{
    effectiveMinor: string;
    unresolvedMinor: string;
  }>(
    sql`SELECT COALESCE(sum(x.amount_minor::numeric) FILTER(WHERE e.id IS NOT NULL),0)::text AS "effectiveMinor",COALESCE(sum(x.amount_minor::numeric) FILTER(WHERE e.id IS NULL AND x.reverses_allocation_id IS NULL AND NOT EXISTS(SELECT 1 FROM finance.card_statement_allocation u WHERE u.workspace_id=x.workspace_id AND u.reverses_allocation_id=x.id)),0)::text AS "unresolvedMinor" FROM finance.card_statement_allocation x LEFT JOIN finance.effective_card_allocation_v e ON e.workspace_id=x.workspace_id AND e.id=x.id WHERE x.workspace_id=${workspaceId}::uuid AND x.statement_revision_id IN(${revisions})`,
  );
  const history = await t.db.execute<{
    allocationId: string;
    statementVersion: number;
    sourceActionRevisionId: string;
    amountMinor: string;
    confirmationSource: string;
    confirmationKind: string;
    confirmedDate: string;
    reversesAllocationId: string | null;
    status: string;
    createdAt: string;
  }>(
    sql`SELECT x.id AS "allocationId",associated.revision_no AS "statementVersion",x.source_action_revision_id AS "sourceActionRevisionId",x.amount_minor::text AS "amountMinor",x.confirmation_source AS "confirmationSource",x.confirmation_kind AS "confirmationKind",x.confirmed_date::text AS "confirmedDate",x.reverses_allocation_id AS "reversesAllocationId",x.created_at::text AS "createdAt",CASE WHEN x.reverses_allocation_id IS NOT NULL THEN 'reversal' WHEN EXISTS(SELECT 1 FROM finance.card_statement_allocation u WHERE u.workspace_id=x.workspace_id AND u.reverses_allocation_id=x.id) THEN 'reversed' WHEN e.id IS NOT NULL THEN 'effective' ELSE 'superseded evidence — confirmation required' END AS status FROM finance.card_statement_allocation x JOIN finance.card_statement_revision associated ON associated.workspace_id=x.workspace_id AND associated.id=x.statement_revision_id LEFT JOIN finance.effective_card_allocation_v e ON e.workspace_id=x.workspace_id AND e.id=x.id WHERE x.workspace_id=${workspaceId}::uuid AND x.statement_revision_id IN(${revisions}) ORDER BY x.created_at DESC,x.id LIMIT 101 OFFSET ${offset}`,
  );
  return {
    ...totals.rows[0]!,
    items: history.rows.slice(0, 100),
    hasMore: history.rows.length > 100,
  };
}
export async function readCardCreditSources(
  t: ScopedTransaction,
  workspaceId: string,
  cardId: string,
  offset = 0,
) {
  const rows = await t.db.execute<{
    actionId: string;
    actionRevisionId: string;
    actionKind: string;
    description: string;
    amountMinor: string;
    unappliedMinor: string;
    postingDate: string;
  }>(
    sql`SELECT e.action_id AS "actionId",e.action_revision_id AS "actionRevisionId",e.action_kind AS "actionKind",f.description,e.amount_minor::text AS "amountMinor",(e.amount_minor::numeric-COALESCE((SELECT sum(x.amount_minor::numeric) FROM finance.effective_card_allocation_v x WHERE x.workspace_id=e.workspace_id AND x.source_action_revision_id=e.action_revision_id),0))::text AS "unappliedMinor",e.posting_date::text AS "postingDate" FROM finance.card_recognized_evidence_v e JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id WHERE e.workspace_id=${workspaceId}::uuid AND e.card_id=${cardId}::uuid AND e.action_kind IN('card_payment','card_refund') ORDER BY e.posting_date DESC,e.action_revision_id LIMIT 101 OFFSET ${offset}`,
  );
  return { items: rows.rows.slice(0, 100), hasMore: rows.rows.length > 100 };
}
