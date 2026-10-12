import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  cardInstallmentEvidenceSchema,
  CardInstallmentUnavailableError,
} from "../domain/card-installment";
export type RefundEvidence = Array<{
  actionRevisionId: string;
  amountMinor: string;
}>;
export async function readInstallmentRefundEvidence(
  t: ScopedTransaction,
  workspaceId: string,
  purchaseActionId: string,
) {
  const r = await t.db.execute<{ evidence: RefundEvidence }>(
    sql`SELECT finance.installment_refund_evidence(${workspaceId}::uuid,${purchaseActionId}::uuid) AS evidence`,
  );
  return r.rows[0]!.evidence;
}
export async function readInstallmentSnapshot(
  t: ScopedTransaction,
  workspaceId: string,
  revisionId: string,
) {
  const r = await t.db.execute<{
    snapshot: ReturnType<typeof cardInstallmentEvidenceSchema.parse> & {
      refundEvidence: RefundEvidence;
    };
  }>(
    sql`SELECT finance.card_installment_snapshot(${workspaceId}::uuid,${revisionId}::uuid) AS snapshot`,
  );
  if (!r.rows[0]?.snapshot) throw new CardInstallmentUnavailableError();
  return r.rows[0].snapshot;
}
export async function readInstallmentApplicationSnapshot(
  t: ScopedTransaction,
  workspaceId: string,
  applicationId: string,
) {
  const r = await t.db.execute<{ snapshot: Record<string, unknown> }>(
    sql`SELECT finance.card_installment_application_snapshot(${workspaceId}::uuid,${applicationId}::uuid) AS snapshot`,
  );
  if (!r.rows[0]?.snapshot) throw new CardInstallmentUnavailableError();
  return r.rows[0].snapshot;
}
export async function readInstallmentRoot(
  t: ScopedTransaction,
  workspaceId: string,
  cardId: string,
  planId: string,
) {
  const r = await t.db.execute<{
    planId: string;
    purchaseActionId: string;
    currentRevisionId: string;
    version: number;
  }>(
    sql`SELECT id AS "planId",purchase_action_id AS "purchaseActionId",current_revision_id AS "currentRevisionId",version FROM finance.card_installment_plan WHERE workspace_id=${workspaceId}::uuid AND card_id=${cardId}::uuid AND id=${planId}::uuid`,
  );
  if (!r.rows[0]) throw new CardInstallmentUnavailableError();
  return r.rows[0];
}
export async function readInstallmentPurchase(
  t: ScopedTransaction,
  workspaceId: string,
  cardId: string,
  actionId: string,
  revisionId: string,
) {
  const r = await t.db.execute<{
    amountMinor: string;
    transactionDate: string;
    current: boolean;
  }>(
    sql`SELECT e.amount_minor::text AS "amountMinor",e.transaction_date::text AS "transactionDate",f.current_revision_id=e.action_revision_id AS current FROM finance.card_recognized_evidence_v e JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id WHERE e.workspace_id=${workspaceId}::uuid AND e.card_id=${cardId}::uuid AND e.action_id=${actionId}::uuid AND e.action_revision_id=${revisionId}::uuid AND e.action_kind='card_purchase'`,
  );
  if (!r.rows[0]) throw new CardInstallmentUnavailableError();
  return r.rows[0];
}
