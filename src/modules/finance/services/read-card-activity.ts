import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { getCreditCardDetailInTransaction } from "./read-credit-cards";

const inputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    cardId: z.uuid(),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
/** Immutable revision history, including provider-only corrections. Economic
 * amounts are shown separately from net activity movement. No balance mutation. */
export async function getCardActivity(input: z.input<typeof inputSchema>) {
  const i = inputSchema.parse(input);
  return withDomainTransaction(
    i,
    async (t) => {
      const detail = await getCreditCardDetailInTransaction(t, {
        userId: i.userId,
        workspaceId: i.workspaceId,
        cardId: i.cardId,
      });
      const r = await t.db.execute<{
        actionId: string;
        actionRevisionId: string;
        description: string;
        revisionNo: number;
        changeKind: string;
        current: boolean;
        transactionDate: string;
        postingDate: string;
        providerReference: string | null;
        purchaseMinor: string | null;
        signedLiabilityMinor: string;
        reason: string | null;
      }>(sql`
      WITH revisions AS (
        SELECT r.*,d.purchase_minor,d.card_posting_date,d.card_provider_reference,a.signed_liability_minor,a.transaction_date,a.posting_date,a.provider_reference
        FROM finance.action_revision r
        JOIN finance.credit_card c ON c.workspace_id=r.workspace_id AND c.id=${i.cardId}::uuid
        LEFT JOIN finance.purchase_detail d ON d.workspace_id=r.workspace_id AND d.action_revision_id=r.id AND d.funding_ledger_account_id=c.liability_ledger_account_id
        LEFT JOIN finance.card_activity a ON a.workspace_id=r.workspace_id AND a.action_revision_id=r.id AND a.card_id=c.id
        WHERE r.workspace_id=${i.workspaceId}::uuid AND r.state='posted' AND (d.action_revision_id IS NOT NULL OR a.id IS NOT NULL)
      )
      SELECT r.action_id AS "actionId",r.id AS "actionRevisionId",f.description,r.revision_no AS "revisionNo",r.change_kind AS "changeKind",f.current_revision_id=r.id AS current,
        COALESCE(r.transaction_date,r.primary_effective_date)::text AS "transactionDate",COALESCE(r.posting_date,r.card_posting_date)::text AS "postingDate",
        CASE WHEN r.purchase_minor IS NOT NULL THEN r.card_provider_reference ELSE r.provider_reference END AS "providerReference",
        r.purchase_minor::text AS "purchaseMinor",COALESCE(r.signed_liability_minor,0)::text AS "signedLiabilityMinor",r.reason
      FROM revisions r JOIN finance.financial_action f ON f.workspace_id=r.workspace_id AND f.id=r.action_id
      ORDER BY COALESCE(r.posting_date,r.card_posting_date) DESC,r.created_at DESC,r.id DESC LIMIT 101 OFFSET ${i.offset}`);
      return {
        ...detail,
        items: r.rows.slice(0, 100),
        hasMore: r.rows.length > 100,
      };
    },
    { readOnlySnapshot: true },
  );
}
