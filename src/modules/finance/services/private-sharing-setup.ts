import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
export type PrivateSharingSetup = {
  financialRevision: string;
  accounts: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  purchases: {
    id: string;
    revisionId: string;
    description: string;
    date: string;
    amountMinor: string;
  }[];
};
export function getPrivateSharingSetup(actor: {
  userId: string;
  workspaceId: string;
}): Promise<PrivateSharingSetup> {
  return withDomainTransaction(
    actor,
    async (t) => {
      const financialRevision = (
        await t.db.execute<{ version: string }>(
          sql`SELECT financial_revision::text AS version FROM core.workspace WHERE id=${actor.workspaceId}::uuid`,
        )
      ).rows[0]!.version;
      const accounts = (
        await t.db.execute<PrivateSharingSetup["accounts"][number]>(
          sql`SELECT id,name FROM finance.financial_account WHERE archived_at IS NULL ORDER BY name,id LIMIT 100`,
        )
      ).rows;
      const cards = (
        await t.db.execute<PrivateSharingSetup["cards"][number]>(
          sql`SELECT id,name FROM finance.credit_card WHERE archived_at IS NULL ORDER BY name,id LIMIT 100`,
        )
      ).rows;
      const categories = (
        await t.db.execute<PrivateSharingSetup["categories"][number]>(
          sql`SELECT id,name FROM core.category WHERE kind='expense' AND archived_at IS NULL ORDER BY name,id LIMIT 100`,
        )
      ).rows;
      const purchases = (
        await t.db.execute<PrivateSharingSetup["purchases"][number]>(
          sql`SELECT f.id,r.id AS "revisionId",f.description,r.primary_effective_date::text AS date,d.purchase_minor::text AS "amountMinor" FROM finance.financial_action f JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted' AND r.change_kind<>'void' AND r.action_kind IN('expense','card_purchase') JOIN finance.purchase_detail d ON d.workspace_id=r.workspace_id AND d.action_revision_id=r.id WHERE NOT EXISTS(SELECT 1 FROM finance.private_group_link l WHERE l.workspace_id=f.workspace_id AND l.action_id=f.id) ORDER BY r.primary_effective_date DESC,f.id LIMIT 100`,
        )
      ).rows;
      return { financialRevision, accounts, cards, categories, purchases };
    },
    { readOnlySnapshot: true },
  );
}
