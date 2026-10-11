import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { statementIdentifierSchema as id } from "../domain/card-statement";
import { getCreditCardDetailInTransaction } from "./read-credit-cards";
import { listFinancialAccountsInTransaction } from "./list-financial-accounts";
import { listCategoriesInTransaction } from "@/modules/core/services/list-categories";
import { readCardRefundSources } from "../repositories/card-command-repository";
import { readCardCreditSources } from "../repositories/card-allocation-repository";
const schema = z
  .object({
    userId: id,
    workspaceId: id,
    cardId: id,
    purchaseActionId: id.optional(),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
export function getCardCommandSetup(input: z.input<typeof schema>) {
  const p = schema.parse(input);
  return withDomainTransaction(
    p,
    async (t) => {
      const scope = { userId: p.userId, workspaceId: p.workspaceId };
      const detail = await getCreditCardDetailInTransaction(t, {
        ...scope,
        cardId: p.cardId,
      });
      const purchases = await t.db.execute<{
        actionId: string;
        description: string;
        amountMinor: string;
        postingDate: string;
      }>(
        sql`SELECT e.action_id AS "actionId",f.description,e.amount_minor::text AS "amountMinor",e.posting_date::text AS "postingDate" FROM finance.card_recognized_evidence_v e JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id WHERE e.workspace_id=${p.workspaceId}::uuid AND e.card_id=${p.cardId}::uuid AND e.action_kind='card_purchase' ORDER BY e.posting_date DESC,e.action_id LIMIT 101 OFFSET ${p.offset}`,
      );
      return {
        ...detail,
        accounts: (await listFinancialAccountsInTransaction(t, scope)).items,
        categories: (
          await listCategoriesInTransaction(t, { ...scope, kind: "expense" })
        ).items,
        purchases: purchases.rows.slice(0, 100),
        purchasesHaveMore: purchases.rows.length > 100,
        refundSources: p.purchaseActionId
          ? (
              await readCardRefundSources(t, p.workspaceId, p.purchaseActionId)
            ).filter((s) => s.cardId === p.cardId)
          : [],
        creditSources: await readCardCreditSources(
          t,
          p.workspaceId,
          p.cardId,
          p.offset,
        ),
      };
    },
    { readOnlySnapshot: true },
  );
}
