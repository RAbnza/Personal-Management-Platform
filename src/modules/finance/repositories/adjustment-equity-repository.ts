import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";

export async function getOrCreateAdjustmentEquityLedger(
  t: ScopedTransaction,
  input: { workspaceId: string; currency: string },
) {
  await t.db.execute(
    sql`INSERT INTO finance.ledger_account(workspace_id,code,name,kind,currency) VALUES(${input.workspaceId}::uuid,'adjustment:shared','Disclosed adjustments','adjustment_equity',${input.currency}) ON CONFLICT(workspace_id,code) DO NOTHING`,
  );
  const r = await t.db.execute<{ id: string }>(
    sql`SELECT id FROM finance.ledger_account WHERE workspace_id=${input.workspaceId}::uuid AND code='adjustment:shared' AND kind='adjustment_equity' AND currency=${input.currency} AND archived_at IS NULL`,
  );
  if (!r.rows[0])
    throw new RangeError("The disclosed adjustment ledger is unavailable.");
  return r.rows[0].id;
}
