import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
/** Capture source revision, generation time and date boundaries in the same
 * read-only REPEATABLE READ transaction as every report contribution. */
export async function readReportContext(
  t: ScopedTransaction,
  workspaceId: string,
) {
  const r = await t.db.execute<{
    timezone: string;
    currency: string;
    weekStart: number;
    today: string;
    generatedAt: string;
    financialRevision: string;
  }>(sql`
    SELECT w.timezone,w.currency,w.week_start AS "weekStart",(transaction_timestamp() AT TIME ZONE w.timezone)::date::text AS today,
      to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "generatedAt",w.financial_revision::text AS "financialRevision"
    FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id AND u.lifecycle='active'
    WHERE w.id=${workspaceId}::uuid AND w.state='active'
  `);
  if (!r.rows[0]) throw new Error("Workspace unavailable");
  return r.rows[0];
}
