import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import { CreditCardUnavailableError } from "../domain/credit-card";

export async function resolvePurchaseCard(
  t: ScopedTransaction,
  workspaceId: string,
  cardId: string,
) {
  const r = await t.db.execute<{
    ledgerAccountId: string;
    currency: string;
    archived: boolean;
  }>(sql`
    SELECT liability_ledger_account_id AS "ledgerAccountId",currency,archived_at IS NOT NULL AS archived
    FROM finance.credit_card WHERE workspace_id=${workspaceId}::uuid AND id=${cardId}::uuid`);
  if (!r.rows[0]) throw new CreditCardUnavailableError();
  return r.rows[0];
}

export async function createCardPurchasePosting(
  t: ScopedTransaction,
  i: {
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    journalId: string;
    fundingLedgerAccountId: string;
    currency: string;
    purchaseMinor: bigint;
  },
) {
  await t.db
    .execute(sql`INSERT INTO finance.posting(id,workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor)
    VALUES(${randomUUID()}::uuid,${i.workspaceId}::uuid,${i.actionId}::uuid,${i.actionRevisionId}::uuid,${i.journalId}::uuid,${i.fundingLedgerAccountId}::uuid,${i.currency},1,${-i.purchaseMinor})`);
}

/** One evidence row per nonzero net revision/card movement. Purchase detail
 * independently retains provider dates even for a zero-money correction. */
export async function createCardRevisionActivity(
  t: ScopedTransaction,
  i: {
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
  },
) {
  await t.db
    .execute(sql`INSERT INTO finance.card_activity(workspace_id,action_id,action_revision_id,card_id,activity_kind,transaction_date,posting_date,provider_reference,signed_liability_minor)
    SELECT ${i.workspaceId}::uuid,${i.actionId}::uuid,${i.actionRevisionId}::uuid,c.id,'purchase',
      COALESCE(nr.primary_effective_date,pr.primary_effective_date),COALESCE(nd.card_posting_date,pd.card_posting_date),
      CASE WHEN nd.action_revision_id IS NOT NULL THEN nd.card_provider_reference ELSE pd.card_provider_reference END,
      (-sum(p.amount_minor::numeric))::bigint
    FROM finance.posting p JOIN finance.credit_card c ON c.workspace_id=p.workspace_id AND c.liability_ledger_account_id=p.ledger_account_id
    JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id
    LEFT JOIN finance.purchase_detail nd ON nd.workspace_id=c.workspace_id AND nd.action_revision_id=r.id AND nd.funding_ledger_account_id=c.liability_ledger_account_id
    LEFT JOIN finance.action_revision nr ON nr.workspace_id=nd.workspace_id AND nr.id=nd.action_revision_id
    LEFT JOIN finance.purchase_detail pd ON pd.workspace_id=c.workspace_id AND pd.action_revision_id=r.previous_revision_id AND pd.funding_ledger_account_id=c.liability_ledger_account_id
    LEFT JOIN finance.action_revision pr ON pr.workspace_id=pd.workspace_id AND pr.id=pd.action_revision_id
    WHERE p.workspace_id=${i.workspaceId}::uuid AND p.action_revision_id=${i.actionRevisionId}::uuid
    GROUP BY c.id,nr.primary_effective_date,pr.primary_effective_date,nd.action_revision_id,nd.card_posting_date,pd.card_posting_date,nd.card_provider_reference,pd.card_provider_reference
    HAVING sum(p.amount_minor::numeric)<>0`);
}
