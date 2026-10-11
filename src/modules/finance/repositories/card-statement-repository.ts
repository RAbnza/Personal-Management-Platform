import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import type { StatementEvidence } from "../domain/card-statement";

export type StatementSnapshot = StatementEvidence & {
  statementId: string;
  revisionId: string;
  version: number;
  reason: string | null;
  recordedByUserId: string;
  createdAt: string;
};
export async function readStatementSnapshot(
  t: ScopedTransaction,
  workspaceId: string,
  statementId: string,
  revisionId: string | null = null,
) {
  const r = await t.db.execute<{ snapshot: StatementSnapshot }>(sql`
    SELECT finance.card_statement_snapshot(r.workspace_id,r.id) || jsonb_build_object(
      'statementId',s.id,'revisionId',r.id,'version',r.revision_no,'reason',r.reason,
      'recordedByUserId',r.recorded_by_user_id,'createdAt',r.created_at) AS snapshot
    FROM finance.card_statement s JOIN finance.card_statement_revision r ON r.workspace_id=s.workspace_id AND r.statement_id=s.id
      AND r.id=COALESCE(${revisionId}::uuid,s.current_revision_id)
    WHERE s.workspace_id=${workspaceId}::uuid AND s.id=${statementId}::uuid AND r.state='verified'`);
  return r.rows[0]?.snapshot ?? null;
}
export type RecognizedStatementPurchase = {
  actionId: string;
  actionRevisionId: string;
  description: string;
  postingDate: string;
  transactionDate: string;
  amountMinor: string;
  providerReference: string | null;
  statementId: string | null;
};
export async function readStatementCandidates(
  t: ScopedTransaction,
  workspaceId: string,
  cardId: string,
  offset = 0,
  cycle: { start: string; end: string } | null = null,
) {
  const r = await t.db.execute<RecognizedStatementPurchase>(sql`
    SELECT f.id AS "actionId",r.id AS "actionRevisionId",f.description,
      d.card_posting_date::text AS "postingDate",r.primary_effective_date::text AS "transactionDate",d.purchase_minor::text AS "amountMinor",d.card_provider_reference AS "providerReference",
      (SELECT s.id FROM finance.card_statement s JOIN finance.card_statement_entry e ON e.workspace_id=s.workspace_id AND e.statement_revision_id=s.current_revision_id
       JOIN finance.action_revision source ON source.workspace_id=e.workspace_id AND source.id=e.action_revision_id
       WHERE s.workspace_id=f.workspace_id AND source.action_id=f.id LIMIT 1) AS "statementId"
    FROM finance.credit_card c JOIN finance.purchase_detail d ON d.workspace_id=c.workspace_id AND d.funding_ledger_account_id=c.liability_ledger_account_id
    JOIN finance.action_revision r ON r.workspace_id=d.workspace_id AND r.id=d.action_revision_id AND r.state='posted' AND r.action_kind='card_purchase'
    JOIN finance.financial_action f ON f.workspace_id=r.workspace_id AND f.id=r.action_id AND f.current_revision_id=r.id
    WHERE c.workspace_id=${workspaceId}::uuid AND c.id=${cardId}::uuid
      AND (${cycle?.start ?? null}::date IS NULL OR d.card_posting_date BETWEEN ${cycle?.start ?? null}::date AND ${cycle?.end ?? null}::date)
    ORDER BY d.card_posting_date DESC,r.id LIMIT 101 OFFSET ${offset}`);
  return { items: r.rows.slice(0, 100), hasMore: r.rows.length > 100 };
}
export async function countUnlinkedStatementPurchases(
  t: ScopedTransaction,
  workspaceId: string,
  cardId: string,
  start: string,
  end: string,
) {
  const r = await t.db.execute<{
    count: string;
  }>(sql`SELECT count(*)::text AS count
    FROM finance.credit_card c JOIN finance.purchase_detail d ON d.workspace_id=c.workspace_id AND d.funding_ledger_account_id=c.liability_ledger_account_id
    JOIN finance.action_revision r ON r.workspace_id=d.workspace_id AND r.id=d.action_revision_id AND r.state='posted' AND r.action_kind='card_purchase'
    JOIN finance.financial_action f ON f.workspace_id=r.workspace_id AND f.id=r.action_id AND f.current_revision_id=r.id
    WHERE c.workspace_id=${workspaceId}::uuid AND c.id=${cardId}::uuid AND d.card_posting_date BETWEEN ${start}::date AND ${end}::date
      AND NOT EXISTS(SELECT 1 FROM finance.card_statement s JOIN finance.card_statement_entry e ON e.workspace_id=s.workspace_id AND e.statement_revision_id=s.current_revision_id
        JOIN finance.action_revision source ON source.workspace_id=e.workspace_id AND source.id=e.action_revision_id
        WHERE s.workspace_id=f.workspace_id AND source.action_id=f.id)`);
  return r.rows[0]!.count;
}
export async function readStatementAssociations(
  t: ScopedTransaction,
  workspaceId: string,
  revisionId: string,
) {
  const r = await t.db.execute<{
    lineNo: number;
    actionId: string;
    actionRevisionId: string;
    currentRevisionId: string;
    changed: boolean;
  }>(sql`
    SELECT e.line_no AS "lineNo",r.action_id AS "actionId",r.id AS "actionRevisionId",f.current_revision_id AS "currentRevisionId",f.current_revision_id<>r.id AS changed
    FROM finance.card_statement_entry e JOIN finance.action_revision r ON r.workspace_id=e.workspace_id AND r.id=e.action_revision_id
    JOIN finance.financial_action f ON f.workspace_id=r.workspace_id AND f.id=r.action_id
    WHERE e.workspace_id=${workspaceId}::uuid AND e.statement_revision_id=${revisionId}::uuid ORDER BY e.line_no`);
  return r.rows;
}
export async function readStatementList(
  t: ScopedTransaction,
  workspaceId: string,
  cardId: string,
  offset: number,
) {
  const r = await t.db.execute<{
    statementId: string;
    version: number;
    cycleStart: string;
    cycleEnd: string;
    statementDate: string;
    dueDate: string;
    balanceMinor: string;
    minimumDueMinor: string;
    providerReference: string | null;
  }>(sql`
    SELECT s.id AS "statementId",s.version,r.cycle_start::text AS "cycleStart",r.cycle_end::text AS "cycleEnd",r.statement_date::text AS "statementDate",r.due_date::text AS "dueDate",r.balance_minor::text AS "balanceMinor",r.minimum_due_minor::text AS "minimumDueMinor",r.provider_reference AS "providerReference"
    FROM finance.card_statement s JOIN finance.card_statement_revision r ON r.workspace_id=s.workspace_id AND r.id=s.current_revision_id
    WHERE s.workspace_id=${workspaceId}::uuid AND s.card_id=${cardId}::uuid AND r.state='verified'
    ORDER BY r.statement_date DESC,s.id LIMIT 26 OFFSET ${offset}`);
  return { items: r.rows.slice(0, 25), hasMore: r.rows.length > 25 };
}
