import type { FinancialCorrectionContext } from "./financial-correction-repository";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  actionRevision,
  adjustmentDetail,
  financialAction,
  journal,
  posting,
  reconciliation,
} from "@/platform/db/schema";
import {
  reconciliationStatus,
  type AdjustAccountBody,
  type ReconciliationItem,
  type AccountAdjustmentItem,
} from "../domain/reconciliation";
import { FinancialAccountNotFoundError } from "../services/get-account-history";

/** All posted legs, including original/reversal/replacement, at end of cutoff.
 * Finalized journals/postings cannot change or disappear. Their distinct count
 * is therefore an exact temporal source version, even for a net-zero correction.
 */
export async function readAccountBalanceAt(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    financialAccountId: string;
    cutoffDate: string;
  },
) {
  const r = await t.db.execute<{
    financialAccountId: string;
    ledgerAccountId: string;
    name: string;
    currency: string;
    openingCutoffDate: string;
    archived: boolean;
    version: number;
    financialRevision: string;
    calculatedMinor: string;
    sourceJournalCount: string;
    currentBalanceMinor: string;
  }>(sql`
    SELECT a.id AS "financialAccountId",a.ledger_account_id AS "ledgerAccountId",a.name,a.currency,a.opening_cutoff_date::text AS "openingCutoffDate",a.archived_at IS NOT NULL AS archived,a.version,w.financial_revision::text AS "financialRevision",
      COALESCE(sum(p.amount_minor::numeric) FILTER(WHERE j.effective_date<=${input.cutoffDate}::date),0)::text AS "calculatedMinor",
      count(DISTINCT j.id) FILTER(WHERE j.effective_date<=${input.cutoffDate}::date)::text AS "sourceJournalCount",
      COALESCE(sum(p.amount_minor::numeric),0)::text AS "currentBalanceMinor"
    FROM finance.financial_account a JOIN core.workspace w ON w.id=a.workspace_id
    LEFT JOIN (finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
      JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id AND ar.state='posted') ON p.workspace_id=a.workspace_id AND p.ledger_account_id=a.ledger_account_id
    WHERE a.workspace_id=${input.workspaceId}::uuid AND a.id=${input.financialAccountId}::uuid GROUP BY a.id,w.financial_revision`);
  if (!r.rows[0]) throw new FinancialAccountNotFoundError();
  return r.rows[0];
}

export async function readReconciliationHistory(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    financialAccountId: string;
    reconciliationId?: string;
  },
) {
  const idPredicate = input.reconciliationId
    ? sql`AND r.id=${input.reconciliationId}::uuid`
    : sql``;
  const rows = await t.db.execute<
    Omit<ReconciliationItem, "differenceMinor" | "status" | "needsReview">
  >(sql`
    SELECT r.id AS "reconciliationId",r.cutoff_date::text AS "cutoffDate",r.observed_minor::text AS "observedMinor",r.calculated_minor::text AS "calculatedMinor",r.financial_revision::text AS "financialRevision",r.source_journal_count::text AS "sourceJournalCount",
      COALESCE(b.amount,0)::text AS "currentCalculatedMinor",COALESCE(b.sources,0)::text AS "currentSourceJournalCount",r.reference,r.notes,r.supersedes_reconciliation_id AS "supersedesReconciliationId",s.id AS "supersededByReconciliationId",
      to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "recordedAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('actionId',d.action_id,'effectiveDate',ar.primary_effective_date::text,'signedAdjustmentMinor',d.signed_adjustment_minor::text,'reason',d.reason) ORDER BY ar.created_at,d.id) FROM finance.adjustment_detail d JOIN finance.financial_action fa ON fa.workspace_id=d.workspace_id AND fa.id=d.action_id AND fa.current_revision_id=d.action_revision_id JOIN finance.action_revision ar ON ar.workspace_id=d.workspace_id AND ar.id=d.action_revision_id AND ar.state='posted' AND ar.change_kind<>'void' WHERE d.workspace_id=r.workspace_id AND d.reconciliation_id=r.id),'[]'::jsonb) AS adjustments
    FROM finance.reconciliation r JOIN finance.financial_account a ON a.workspace_id=r.workspace_id AND a.id=r.financial_account_id
    LEFT JOIN finance.reconciliation s ON s.workspace_id=r.workspace_id AND s.supersedes_reconciliation_id=r.id
    LEFT JOIN LATERAL (SELECT sum(p.amount_minor::numeric) AS amount,count(DISTINCT j.id) AS sources FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted' JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id AND ar.state='posted' WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id=a.ledger_account_id AND j.effective_date<=r.cutoff_date) b ON TRUE
    WHERE r.workspace_id=${input.workspaceId}::uuid AND r.financial_account_id=${input.financialAccountId}::uuid ${idPredicate} ORDER BY r.cutoff_date DESC,r.created_at DESC,r.id DESC LIMIT 10001`);
  if (rows.rows.length > 10000)
    throw new RangeError(
      "Comparison history exceeds the supported review limit.",
    );
  return rows.rows.map((row) => ({
    ...row,
    differenceMinor: (
      BigInt(row.observedMinor) - BigInt(row.calculatedMinor)
    ).toString(),
    ...reconciliationStatus(row),
  }));
}
export async function insertReconciliation(
  t: ScopedTransaction,
  values: typeof reconciliation.$inferInsert,
) {
  await t.db.insert(reconciliation).values(values);
}
export async function readAccountAdjustments(
  t: ScopedTransaction,
  input: { workspaceId: string; financialAccountId: string },
) {
  const r = await t.db.execute<AccountAdjustmentItem>(
    sql`SELECT d.action_id AS "actionId",d.action_revision_id AS "actionRevisionId",ar.primary_effective_date::text AS "effectiveDate",d.signed_adjustment_minor::text AS "signedAdjustmentMinor",d.reason,d.reconciliation_id AS "reconciliationId" FROM finance.adjustment_detail d JOIN finance.financial_action a ON a.workspace_id=d.workspace_id AND a.id=d.action_id AND a.current_revision_id=d.action_revision_id JOIN finance.action_revision ar ON ar.workspace_id=d.workspace_id AND ar.id=d.action_revision_id AND ar.state='posted' AND ar.change_kind<>'void' WHERE d.workspace_id=${input.workspaceId}::uuid AND d.financial_account_id=${input.financialAccountId}::uuid ORDER BY ar.primary_effective_date DESC,ar.created_at DESC,d.id DESC LIMIT 10001`,
  );
  if (r.rows.length > 10000)
    throw new RangeError(
      "Adjustment history exceeds the supported review limit.",
    );
  return r.rows;
}

export async function insertAccountAdjustment(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    userId: string;
    requestId: string | null;
    receiptId: string;
    cashLedgerId: string;
    equityLedgerId: string;
    currency: string;
    body: AdjustAccountBody;
    correction?: FinancialCorrectionContext;
  },
) {
  const actionId = input.correction?.actionId ?? randomUUID(),
    actionRevisionId = input.correction?.actionRevisionId ?? randomUUID(),
    journalId = randomUUID(),
    adjustmentId = randomUUID();
  const scope = { workspaceId: input.workspaceId },
    actor = {
      recordedByUserId: input.userId,
      actorKind: "user",
      requestId: input.requestId,
    };
  if (!input.correction) {
    await t.db.insert(financialAction).values({
      ...scope,
      ...actor,
      id: actionId,
      originalCommandReceiptId: input.receiptId,
      currentRevisionId: actionRevisionId,
      description: "Explicit balance adjustment",
      notes: input.body.reason,
    });
    await t.db.insert(actionRevision).values({
      ...scope,
      ...actor,
      id: actionRevisionId,
      actionId,
      revisionNo: 1,
      commandReceiptId: input.receiptId,
      changeKind: "create",
      actionKind: "balance_adjustment",
      primaryEffectiveDate: input.body.effectiveDate,
      currency: input.currency,
      reason: input.body.reason,
    });
  }
  await t.db.insert(journal).values({
    ...scope,
    id: journalId,
    actionId,
    actionRevisionId,
    sequenceNo: 1,
    effectiveDate: input.body.effectiveDate,
    currency: input.currency,
    role: "economic",
  });
  const common = {
    ...scope,
    actionId,
    actionRevisionId,
    journalId,
    currency: input.currency,
  };
  await t.db.insert(posting).values([
    {
      ...common,
      id: randomUUID(),
      ledgerAccountId: input.cashLedgerId,
      lineNo: 1,
      amountMinor: BigInt(input.body.signedAdjustmentMinor),
      cashFlowKind: "adjustment",
      cashFlowDirection: "adjustment",
      memo: input.body.reason,
    },
    {
      ...common,
      id: randomUUID(),
      ledgerAccountId: input.equityLedgerId,
      lineNo: 2,
      amountMinor: -BigInt(input.body.signedAdjustmentMinor),
      memo: input.body.reason,
    },
  ]);
  await t.db.insert(adjustmentDetail).values({
    ...scope,
    id: adjustmentId,
    actionId,
    actionRevisionId,
    financialAccountId: input.body.financialAccountId,
    signedAdjustmentMinor: BigInt(input.body.signedAdjustmentMinor),
    reason: input.body.reason,
    reconciliationId: input.body.reconciliationId,
  });
  return { actionId, actionRevisionId, journalId, adjustmentId };
}
