import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import { finalizeJournal } from "./financial-write-repository";

// Internal capability, never accepted from an HTTP body. The command owning
// this context has already locked the workspace and claimed its receipt.
export type FinancialCorrectionContext = {
  actionId: string;
  actionRevisionId: string;
  previousRevisionId: string;
  receiptId: string;
  revisionNo: number;
  reason: string;
  before: Record<string, unknown>;
  paymentId?: string;
  debtId?: string;
  liabilityLedgerId?: string;
  scheduleVersionId?: string;
};

export async function readCurrentFinancialAction(
  t: ScopedTransaction,
  workspaceId: string,
  actionId: string,
) {
  const r = await t.db.execute<{
    actionId: string;
    actionRevisionId: string;
    revisionNo: number;
    actionKind: string;
    effectiveDate: string;
    currency: string;
    changeKind: string;
    financialRevision: string;
    description: string;
    reference: string | null;
    notes: string | null;
    evidence: Record<string, unknown>;
  }>(sql`SELECT a.id AS "actionId",r.id AS "actionRevisionId",r.revision_no AS "revisionNo",r.action_kind AS "actionKind",r.primary_effective_date::text AS "effectiveDate",r.currency,r.change_kind AS "changeKind",w.financial_revision::text AS "financialRevision",a.description,a.reference,a.notes,
    COALESCE((SELECT v.after_json FROM audit.private_revision v WHERE v.workspace_id=a.workspace_id AND v.subject_kind='financial_action' AND v.subject_id=a.id AND v.command_receipt_id=r.command_receipt_id ORDER BY v.created_at DESC LIMIT 1),'{}'::jsonb) AS evidence
    FROM finance.financial_action a JOIN finance.action_revision r ON r.workspace_id=a.workspace_id AND r.id=a.current_revision_id AND r.state='posted' JOIN core.workspace w ON w.id=a.workspace_id
    WHERE a.workspace_id=${workspaceId}::uuid AND a.id=${actionId}::uuid`);
  if (!r.rows[0])
    throw new RangeError("Financial action is unavailable in this workspace.");
  return r.rows[0];
}

export async function beginActionReplacement(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    userId: string;
    requestId?: string | undefined;
    receiptId: string;
    current: Awaited<ReturnType<typeof readCurrentFinancialAction>>;
    reason: string;
    effectiveDate: string;
    actionKind?: string;
    void?: boolean;
  },
): Promise<FinancialCorrectionContext> {
  const c: FinancialCorrectionContext = {
    actionId: input.current.actionId,
    actionRevisionId: randomUUID(),
    previousRevisionId: input.current.actionRevisionId,
    receiptId: input.receiptId,
    revisionNo: input.current.revisionNo + 1,
    reason: input.reason,
    before: {
      ...input.current.evidence,
      description: input.current.description,
      reference: input.current.reference,
      notes: input.current.notes,
    },
  };
  await t.db
    .execute(sql`INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,previous_revision_id,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,reason,recorded_by_user_id,actor_kind,request_id)
    VALUES(${c.actionRevisionId}::uuid,${input.workspaceId}::uuid,${c.actionId}::uuid,${c.revisionNo},${c.previousRevisionId}::uuid,${c.receiptId}::uuid,${input.void ? "void" : "replace"},${input.actionKind ?? input.current.actionKind},${input.effectiveDate}::date,${input.current.currency},${input.reason},${input.userId}::uuid,'user',${input.requestId ?? null}::uuid)`);
  await t.db.execute(
    sql`UPDATE finance.financial_action SET current_revision_id=${c.actionRevisionId}::uuid,version=version+1,updated_at=clock_timestamp() WHERE workspace_id=${input.workspaceId}::uuid AND id=${c.actionId}::uuid`,
  );
  const originals = await t.db.execute<{
    id: string;
    effective_date: string;
    currency: string;
  }>(
    sql`SELECT id,effective_date::text,currency FROM finance.journal WHERE workspace_id=${input.workspaceId}::uuid AND action_revision_id=${c.previousRevisionId}::uuid AND role='economic' AND state='posted' ORDER BY sequence_no`,
  );
  if (originals.rows.length > 1000)
    throw new RangeError("Too many journals to correct in one command.");
  for (const [index, original] of originals.rows.entries()) {
    const id = randomUUID();
    // Keep the replacement's economic sequence space available to its existing
    // recipe. Reversal sequence numbers do not encode business chronology.
    await t.db.execute(
      sql`INSERT INTO finance.journal(id,workspace_id,action_id,action_revision_id,sequence_no,effective_date,currency,role,reverses_journal_id) VALUES(${id}::uuid,${input.workspaceId}::uuid,${c.actionId}::uuid,${c.actionRevisionId}::uuid,${20000 + index},${original.effective_date}::date,${original.currency},'reversal',${original.id}::uuid)`,
    );
    await t.db
      .execute(sql`INSERT INTO finance.posting(id,workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,category_id,expense_class,income_class,cash_flow_kind,cash_flow_direction,liability_component,reverses_posting_id,memo)
      SELECT gen_random_uuid(),workspace_id,action_id,${c.actionRevisionId}::uuid,${id}::uuid,ledger_account_id,currency,line_no,-amount_minor,category_id,expense_class,income_class,cash_flow_kind,cash_flow_direction,liability_component,id,memo FROM finance.posting WHERE workspace_id=${input.workspaceId}::uuid AND journal_id=${original.id}::uuid`);
    await finalizeJournal(t, { workspaceId: input.workspaceId, journalId: id });
  }
  return c;
}

export async function readFinancialActionHistory(
  t: ScopedTransaction,
  workspaceId: string,
  actionId: string,
) {
  const r = await t.db.execute<{ item: Record<string, unknown> }>(
    sql`SELECT jsonb_build_object('actionRevisionId',r.id,'revisionNo',r.revision_no,'changeKind',r.change_kind,'effectiveDate',r.primary_effective_date::text,'reason',r.reason,'recordedAt',r.created_at,'evidence',v.after_json) AS item FROM finance.action_revision r LEFT JOIN audit.private_revision v ON v.workspace_id=r.workspace_id AND v.command_receipt_id=r.command_receipt_id AND v.subject_kind='financial_action' AND v.subject_id=r.action_id WHERE r.workspace_id=${workspaceId}::uuid AND r.action_id=${actionId}::uuid AND r.state='posted' ORDER BY r.revision_no DESC`,
  );
  return r.rows.map((r) => r.item);
}
