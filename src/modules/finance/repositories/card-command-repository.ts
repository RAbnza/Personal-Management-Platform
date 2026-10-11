import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";

export async function readCardRefundSources(
  t: ScopedTransaction,
  workspaceId: string,
  purchaseActionId: string,
  excludeRevisionId?: string,
) {
  const r = await t.db.execute<{
    postingId: string;
    categoryId: string | null;
    ledgerAccountId: string;
    remainingMinor: string;
    groupRemainingMinor: string;
    categoryName: string | null;
    effectiveDate: string;
    cardId: string;
  }>(sql`
 WITH eligible AS (SELECT p.*,r.primary_effective_date,c.id AS card_id FROM finance.financial_action f
 JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted' AND r.change_kind<>'void' AND r.action_kind='card_purchase'
 JOIN finance.purchase_detail d ON d.workspace_id=r.workspace_id AND d.action_revision_id=r.id
 JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.liability_ledger_account_id=d.funding_ledger_account_id
 JOIN finance.posting p ON p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND p.expense_class='gross'
 WHERE f.workspace_id=${workspaceId}::uuid AND f.id=${purchaseActionId}::uuid),
 current_refunds AS (SELECT op.id AS posting_id,op.category_id,x.amount_minor FROM finance.card_refund_part x
 JOIN finance.card_action_detail d ON d.workspace_id=x.workspace_id AND d.action_revision_id=x.action_revision_id
 JOIN finance.financial_action f ON f.workspace_id=d.workspace_id AND f.id=d.action_id AND f.current_revision_id=d.action_revision_id
 JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id
 WHERE d.workspace_id=${workspaceId}::uuid AND d.purchase_action_id=${purchaseActionId}::uuid AND d.action_revision_id IS DISTINCT FROM ${excludeRevisionId ?? null}::uuid),
 used AS(SELECT category_id,sum(amount_minor::numeric) AS amount FROM current_refunds GROUP BY category_id),
 posting_used AS(SELECT posting_id,sum(amount_minor::numeric) AS amount FROM current_refunds GROUP BY posting_id),
 candidates AS(SELECT * FROM eligible UNION ALL SELECT op.*,r.primary_effective_date,c.id AS card_id FROM finance.card_refund_part x JOIN finance.card_action_detail d ON d.workspace_id=x.workspace_id AND d.action_revision_id=x.action_revision_id JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id JOIN finance.action_revision r ON r.workspace_id=op.workspace_id AND r.id=op.action_revision_id JOIN finance.purchase_detail pd ON pd.workspace_id=r.workspace_id AND pd.action_revision_id=r.id JOIN finance.credit_card c ON c.workspace_id=pd.workspace_id AND c.liability_ledger_account_id=pd.funding_ledger_account_id WHERE x.workspace_id=${workspaceId}::uuid AND x.action_revision_id=${excludeRevisionId ?? null}::uuid AND d.purchase_action_id=${purchaseActionId}::uuid AND NOT EXISTS(SELECT 1 FROM eligible e WHERE e.id=op.id))
 SELECT e.id AS "postingId",e.category_id AS "categoryId",e.ledger_account_id AS "ledgerAccountId",e.primary_effective_date::text AS "effectiveDate",e.card_id AS "cardId",
 GREATEST(0,LEAST(e.amount_minor::numeric-COALESCE(pu.amount,0),COALESCE((SELECT sum(p.amount_minor::numeric) FROM eligible p WHERE p.category_id IS NOT DISTINCT FROM e.category_id),0)-COALESCE(u.amount,0)))::text AS "remainingMinor",
 GREATEST(0,COALESCE((SELECT sum(p.amount_minor::numeric) FROM eligible p WHERE p.category_id IS NOT DISTINCT FROM e.category_id),0)-COALESCE(u.amount,0))::text AS "groupRemainingMinor",cat.name AS "categoryName"
 FROM candidates e LEFT JOIN used u ON u.category_id IS NOT DISTINCT FROM e.category_id LEFT JOIN posting_used pu ON pu.posting_id=e.id LEFT JOIN core.category cat ON cat.workspace_id=e.workspace_id AND cat.id=e.category_id ORDER BY e.line_no`);
  return r.rows;
}
export async function createCardCommandActivity(
  t: ScopedTransaction,
  i: { workspaceId: string; actionId: string; actionRevisionId: string },
) {
  await t.db
    .execute(sql`INSERT INTO finance.card_activity(workspace_id,action_id,action_revision_id,card_id,activity_kind,transaction_date,posting_date,provider_reference,signed_liability_minor)
 SELECT r.workspace_id,r.action_id,r.id,c.id,replace(r.action_kind,'card_',''),COALESCE(nr.primary_effective_date,pr.primary_effective_date),COALESCE(nd.posting_date,pd.posting_date),CASE WHEN nd.action_revision_id IS NOT NULL THEN nd.provider_reference ELSE pd.provider_reference END,(-sum(p.amount_minor::numeric))::bigint
 FROM finance.action_revision r JOIN finance.posting p ON p.workspace_id=r.workspace_id AND p.action_revision_id=r.id
 JOIN finance.credit_card c ON c.workspace_id=p.workspace_id AND c.liability_ledger_account_id=p.ledger_account_id
 LEFT JOIN finance.card_action_detail nd ON nd.workspace_id=r.workspace_id AND nd.action_revision_id=r.id AND nd.card_id=c.id
 LEFT JOIN finance.action_revision nr ON nr.workspace_id=nd.workspace_id AND nr.id=nd.action_revision_id
 LEFT JOIN finance.card_action_detail pd ON pd.workspace_id=r.workspace_id AND pd.action_revision_id=r.previous_revision_id AND pd.card_id=c.id
 LEFT JOIN finance.action_revision pr ON pr.workspace_id=pd.workspace_id AND pr.id=pd.action_revision_id
 WHERE r.workspace_id=${i.workspaceId}::uuid AND r.id=${i.actionRevisionId}::uuid
 GROUP BY r.workspace_id,r.action_id,r.id,c.id,nr.primary_effective_date,pr.primary_effective_date,nd.action_revision_id,nd.posting_date,pd.posting_date,nd.provider_reference,pd.provider_reference HAVING sum(p.amount_minor::numeric)<>0`);
}

/** The database repeats this proof at commit; callers give a useful correction error. */
export async function assertCardPurchaseRefundCapacity(
  t: ScopedTransaction,
  workspaceId: string,
  actionId: string,
  proposal?: {
    cardId: string;
    effectiveDate: string;
    splits: Array<{
      categoryId?: string | null | undefined;
      amountMinor: string;
    }>;
  },
) {
  const rows = await t.db.execute<{
    categoryId: string | null;
    cardId: string;
    amountMinor: string;
    firstRefund: string;
  }>(
    sql`SELECT op.category_id AS "categoryId",d.card_id AS "cardId",sum(x.amount_minor::numeric)::text AS "amountMinor",min(r.primary_effective_date)::text AS "firstRefund" FROM finance.card_action_detail d JOIN finance.financial_action f ON f.workspace_id=d.workspace_id AND f.id=d.action_id AND f.current_revision_id=d.action_revision_id JOIN finance.action_revision r ON r.workspace_id=d.workspace_id AND r.id=d.action_revision_id JOIN finance.card_refund_part x ON x.workspace_id=d.workspace_id AND x.action_revision_id=d.action_revision_id JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id WHERE d.workspace_id=${workspaceId}::uuid AND d.purchase_action_id=${actionId}::uuid GROUP BY op.category_id,d.card_id`,
  );
  for (const r of rows.rows) {
    const eligible =
      proposal?.splits
        .filter((s) => (s.categoryId ?? null) === r.categoryId)
        .reduce((sum, s) => sum + BigInt(s.amountMinor), 0n) ?? 0n;
    if (
      !proposal ||
      proposal.cardId !== r.cardId ||
      proposal.effectiveDate > r.firstRefund ||
      eligible < BigInt(r.amountMinor)
    )
      throw new RangeError(
        "Resolve dependent card refunds before reversing or reducing their original purchase classifications.",
      );
  }
}
