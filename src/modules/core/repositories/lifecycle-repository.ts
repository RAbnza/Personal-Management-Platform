import { sql } from "drizzle-orm";
import type {
  IdentityScopedTransaction,
  ScopedTransaction,
} from "@/platform/db";

export type LifecycleTransaction =
  IdentityScopedTransaction | ScopedTransaction;
export type DeletionState = {
  id: string;
  state: "pending" | "cancelled" | "purging" | "completed" | "failed";
  requestedAt: string;
  purgeAfter: string;
  completedAt: string | null;
};
export async function readDeletionState(
  t: LifecycleTransaction,
): Promise<DeletionState | null> {
  const r = await t.db
    .execute<DeletionState>(sql`SELECT id,state,requested_at::text AS "requestedAt",purge_after::text AS "purgeAfter",completed_at::text AS "completedAt"
    FROM ops.deletion_request WHERE target_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
    ORDER BY requested_at DESC,id DESC LIMIT 1`);
  return r.rows[0] ?? null;
}
export async function readDeletionScope(
  t: ScopedTransaction,
  actor: { userId: string; workspaceId: string },
) {
  const root = (
    await t.db.execute<{
      workspaceVersion: number;
      profileVersion: number;
      financialRevision: string;
    }>(sql`
    SELECT w.version AS "workspaceVersion",p.version AS "profileVersion",w.financial_revision::text AS "financialRevision"
    FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id
    WHERE w.id=${actor.workspaceId}::uuid AND p.user_id=${actor.userId}::uuid AND w.state='active' AND p.lifecycle='active'`)
  ).rows[0];
  if (!root) return null;
  const tables = (
    await t.db.execute<{ schema: string; table: string }>(sql`
    SELECT n.nspname AS schema,c.relname AS table FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND n.nspname IN ('core','finance','career','time','audit','ops')
      AND c.relname NOT IN ('deletion_request','deletion_tombstone')
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='workspace_id' AND NOT a.attisdropped)
    ORDER BY n.nspname,c.relname`)
  ).rows;
  const records: { area: string; kind: string; count: string }[] = [];
  for (const table of tables) {
    const r = await t.db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM ${sql.identifier(table.schema)}.${sql.identifier(table.table)} WHERE workspace_id=${actor.workspaceId}::uuid`,
    );
    records.push({
      area: table.schema,
      kind: table.table,
      count: r.rows[0]!.count,
    });
  }
  return {
    schemaVersion: 1,
    ...root,
    records,
    identity:
      "Profile, sign-in credentials, recovery tokens, encrypted security email and all sessions. Non-secret queue metadata expires separately within seven days.",
    files: "No uploaded files or server-stored CSV files in this V1 release",
    sharedHistory: "No shared workspaces or group records in this V1 release",
  };
}
