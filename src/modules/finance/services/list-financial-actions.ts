import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
import { CreditCardUnavailableError } from "../domain/credit-card";
export const financialActivityFiltersSchema = z
  .object({
    cardId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    fundingSource: z.enum(["cash", "card"]).optional(),
    transactionFrom: z.string().refine(isCalendarDate).optional(),
    transactionTo: z.string().refine(isCalendarDate).optional(),
    postingFrom: z.string().refine(isCalendarDate).optional(),
    postingTo: z.string().refine(isCalendarDate).optional(),
  })
  .strict();
export function listFinancialActions(input: {
  userId: string;
  workspaceId: string;
  filters?: z.input<typeof financialActivityFiltersSchema>;
}) {
  const filters = financialActivityFiltersSchema.parse(input.filters ?? {});
  return withDomainTransaction(
    input,
    async (t) => {
      if (filters.cardId) {
        const owned = await t.db.execute(
          sql`SELECT 1 FROM finance.credit_card WHERE workspace_id=${input.workspaceId}::uuid AND id=${filters.cardId}::uuid`,
        );
        if (!owned.rows.length) throw new CreditCardUnavailableError();
      }
      const rows = await t.db.execute<{
        actionId: string;
        description: string;
        actionKind: string;
        effectiveDate: string;
        revisionNo: number;
        changeKind: string;
        cardId: string | null;
        cardName: string | null;
        postingDate: string | null;
        fundingName: string | null;
      }>(
        sql`SELECT f.id AS "actionId",f.description,r.action_kind AS "actionKind",r.primary_effective_date::text AS "effectiveDate",r.revision_no AS "revisionNo",r.change_kind AS "changeKind",
        c.id AS "cardId",c.name AS "cardName",d.card_posting_date::text AS "postingDate",COALESCE(c.name,a.name) AS "fundingName"
      FROM finance.financial_action f JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted'
      LEFT JOIN finance.purchase_detail d ON d.workspace_id=r.workspace_id AND d.action_revision_id=CASE WHEN r.change_kind='void' THEN r.previous_revision_id ELSE r.id END
      LEFT JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.liability_ledger_account_id=d.funding_ledger_account_id
      LEFT JOIN finance.financial_account a ON a.workspace_id=d.workspace_id AND a.ledger_account_id=d.funding_ledger_account_id
      WHERE f.workspace_id=${input.workspaceId}::uuid
      ${filters.cardId ? sql`AND c.id=${filters.cardId}::uuid` : sql``}
      ${filters.fundingSource ? sql`AND r.action_kind=${filters.fundingSource === "card" ? "card_purchase" : "expense"}` : sql``}
      ${filters.categoryId ? sql`AND EXISTS(SELECT 1 FROM finance.posting p WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=CASE WHEN r.change_kind='void' THEN r.previous_revision_id ELSE r.id END AND p.reverses_posting_id IS NULL AND p.category_id=${filters.categoryId}::uuid)` : sql``}
      ${filters.transactionFrom ? sql`AND r.primary_effective_date>=${filters.transactionFrom}::date` : sql``}
      ${filters.transactionTo ? sql`AND r.primary_effective_date<=${filters.transactionTo}::date` : sql``}
      ${filters.postingFrom ? sql`AND d.card_posting_date>=${filters.postingFrom}::date` : sql``}
      ${filters.postingTo ? sql`AND d.card_posting_date<=${filters.postingTo}::date` : sql``}
      ORDER BY r.primary_effective_date DESC,f.id DESC LIMIT 100`,
      );
      return rows.rows;
    },
    { readOnlySnapshot: true },
  );
}
