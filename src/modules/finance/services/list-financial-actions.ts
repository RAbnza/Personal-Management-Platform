import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
export function listFinancialActions(input: {
  userId: string;
  workspaceId: string;
}) {
  return withDomainTransaction(input, async (t) => {
    const rows = await t.db.execute<{
      actionId: string;
      description: string;
      actionKind: string;
      effectiveDate: string;
      revisionNo: number;
      changeKind: string;
    }>(
      sql`SELECT f.id AS "actionId",f.description,r.action_kind AS "actionKind",r.primary_effective_date::text AS "effectiveDate",r.revision_no AS "revisionNo",r.change_kind AS "changeKind" FROM finance.financial_action f JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted' WHERE f.workspace_id=${input.workspaceId}::uuid ORDER BY r.primary_effective_date DESC,f.id DESC LIMIT 100`,
    );
    return rows.rows;
  });
}
