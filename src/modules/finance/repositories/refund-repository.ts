import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
export type RefundSource = {
  postingId: string;
  categoryId: string | null;
  categoryName: string | null;
  ledgerAccountId: string;
  amountMinor: string;
  remainingMinor: string;
  groupRemainingMinor: string;
  allocationKind: "purchase" | "fee";
  effectiveDate: string;
  label: string | null;
};
export async function readRefundSources(
  t: ScopedTransaction,
  workspaceId: string,
  actionId: string,
  excludeRefundRevisionId?: string,
) {
  const r = await t.db.execute<RefundSource>(sql`
    WITH eligible AS (SELECT p.id,p.category_id,p.ledger_account_id,p.amount_minor,j.effective_date,p.memo,
      CASE WHEN f.expense_posting_id IS NOT NULL THEN 'fee' ELSE 'purchase' END AS kind
      FROM finance.financial_action a JOIN finance.action_revision ar ON ar.workspace_id=a.workspace_id AND ar.id=a.current_revision_id AND ar.state='posted' AND ar.change_kind<>'void'
      JOIN finance.journal j ON j.workspace_id=ar.workspace_id AND j.action_revision_id=ar.id AND j.role='economic' AND j.state='posted'
      JOIN finance.posting p ON p.workspace_id=j.workspace_id AND p.journal_id=j.id AND p.expense_class='gross' AND p.amount_minor>0
      LEFT JOIN finance.fee_component f ON f.workspace_id=p.workspace_id AND f.expense_posting_id=p.id
      WHERE a.workspace_id=${workspaceId}::uuid AND a.id=${actionId}::uuid AND (ar.action_kind='expense' OR f.id IS NOT NULL)),
    current_refunds AS (SELECT op.id AS posting_id,op.category_id,ra.allocation_kind,ra.amount_minor FROM finance.refund_detail d
      JOIN finance.financial_action a ON a.workspace_id=d.workspace_id AND a.id=d.action_id AND a.current_revision_id=d.action_revision_id
      JOIN finance.action_revision ar ON ar.workspace_id=a.workspace_id AND ar.id=a.current_revision_id AND ar.state='posted' AND ar.change_kind<>'void'
      JOIN finance.refund_allocation ra ON ra.workspace_id=d.workspace_id AND ra.action_revision_id=d.action_revision_id JOIN finance.posting op ON op.workspace_id=ra.workspace_id AND op.id=ra.original_purchase_posting_id
      WHERE d.workspace_id=${workspaceId}::uuid AND d.purchase_action_id=${actionId}::uuid ${excludeRefundRevisionId ? sql`AND d.action_revision_id<>${excludeRefundRevisionId}::uuid` : sql``}),
    used AS (SELECT category_id,allocation_kind,sum(amount_minor::numeric) AS amount FROM current_refunds GROUP BY category_id,allocation_kind),
    posting_used AS (SELECT posting_id,sum(amount_minor::numeric) AS amount FROM current_refunds GROUP BY posting_id)
    , candidates AS (SELECT * FROM eligible UNION ALL
      SELECT p.id,p.category_id,p.ledger_account_id,p.amount_minor,j.effective_date,p.memo,x.allocation_kind AS kind FROM finance.refund_allocation x JOIN finance.refund_detail d ON d.workspace_id=x.workspace_id AND d.action_revision_id=x.action_revision_id JOIN finance.posting p ON p.workspace_id=x.workspace_id AND p.id=x.original_purchase_posting_id JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id WHERE x.workspace_id=${workspaceId}::uuid AND x.action_revision_id=${excludeRefundRevisionId ?? null}::uuid AND d.purchase_action_id=${actionId}::uuid AND NOT EXISTS(SELECT 1 FROM eligible e WHERE e.id=p.id))
    SELECT e.id AS "postingId",e.category_id AS "categoryId",c.name AS "categoryName",e.ledger_account_id AS "ledgerAccountId",e.amount_minor::text AS "amountMinor",e.kind AS "allocationKind",e.effective_date::text AS "effectiveDate",e.memo AS label,
      GREATEST(0,COALESCE((SELECT sum(x.amount_minor::numeric) FROM eligible x WHERE x.category_id IS NOT DISTINCT FROM e.category_id AND x.kind=e.kind),0)-COALESCE(u.amount,0))::text AS "groupRemainingMinor",
      GREATEST(0,LEAST(e.amount_minor::numeric-COALESCE(pu.amount,0),COALESCE((SELECT sum(x.amount_minor::numeric) FROM eligible x WHERE x.category_id IS NOT DISTINCT FROM e.category_id AND x.kind=e.kind),0)-COALESCE(u.amount,0)))::text AS "remainingMinor"
    FROM candidates e LEFT JOIN used u ON u.category_id IS NOT DISTINCT FROM e.category_id AND u.allocation_kind=e.kind LEFT JOIN posting_used pu ON pu.posting_id=e.id LEFT JOIN core.category c ON c.workspace_id=${workspaceId}::uuid AND c.id=e.category_id ORDER BY e.kind,e.id`);
  return r.rows;
}
