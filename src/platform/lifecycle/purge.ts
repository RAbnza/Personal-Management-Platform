import { z } from "zod";
import type { Client } from "pg";

const requestSchema = z.uuid();
const budgetSchema = z.number().int().min(1).max(100_000);
const identifier = (s: string) => `"${s.replaceAll('"', '""')}"`;

/** Operator-only, resumable steps. No imports from the web runtime/pools.
 * A private financial graph is removed atomically with a bounded total row
 * budget. Cyclic evidence pointers remain constrained through commit.
 */
export async function purgeDeletionStep(
  client: Client,
  requestId: string,
  rowBudget = 10_000,
) {
  requestSchema.parse(requestId);
  budgetSchema.parse(rowBudget);
  const role = await client.query<{ role: string }>(
    "SELECT current_user AS role",
  );
  if (role.rows[0]?.role !== "lifecycle_operator")
    throw new Error("A separate lifecycle_operator connection is required.");
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='60s'");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query("SELECT set_config('ops.deletion_request_id',$1,true)", [
      requestId,
    ]);
    const found = await client.query<{
      target_user_id: string;
      target_workspace_id: string;
      state: string;
      due: boolean;
      progress_json: { phase?: string };
    }>(
      "SELECT target_user_id,target_workspace_id,state,purge_after<=clock_timestamp() AS due,progress_json FROM ops.deletion_request WHERE id=$1",
      [requestId],
    );
    let r = found.rows[0];
    if (!r) throw new Error("Deletion request not found.");
    if (r.state === "completed") {
      await client.query("COMMIT");
      return { state: "completed", phase: "completed" };
    }
    if (r.state === "cancelled" || !r.due)
      throw new Error("Deletion is cancelled or still within grace.");
    // Match the global lock order even when retrying a failed phase.
    await client.query(
      "SELECT user_id FROM core.user_profile WHERE user_id=$1 FOR UPDATE",
      [r.target_user_id],
    );
    await client.query("SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE", [
      r.target_workspace_id,
    ]);
    const locked = await client.query<(typeof found.rows)[number]>(
      "SELECT target_user_id,target_workspace_id,state,purge_after<=clock_timestamp() AS due,progress_json FROM ops.deletion_request WHERE id=$1 FOR UPDATE",
      [requestId],
    );
    r = locked.rows[0];
    if (!r) throw new Error("Deletion request not found.");
    if (r.state === "completed") {
      await client.query("COMMIT");
      return { state: "completed", phase: "completed" };
    }
    if (r.state === "cancelled" || !r.due)
      throw new Error("Deletion is cancelled or still within grace.");
    if (r.state !== "purging") {
      await client.query(
        "UPDATE ops.deletion_request SET state='purging',last_error_code=NULL WHERE id=$1",
        [requestId],
      );
      await client.query(
        "UPDATE core.user_profile SET lifecycle='purging',version=version+1,updated_at=clock_timestamp() WHERE user_id=$1",
        [r.target_user_id],
      );
      await client.query(
        "UPDATE core.workspace SET state='purging',version=version+1,updated_at=clock_timestamp() WHERE id=$1",
        [r.target_workspace_id],
      );
    }
    await client.query("DELETE FROM auth.session WHERE user_id=$1", [
      r.target_user_id,
    ]);
    if (!r.progress_json.phase) {
      await client.query(
        "UPDATE ops.deletion_request SET progress_json='{" +
          '"phase":"projections"' +
          "}'::jsonb WHERE id=$1",
        [requestId],
      );
      await client.query("COMMIT");
      return { state: "purging", phase: "projections" };
    }
    if (r.progress_json.phase === "projections") {
      let removed = 0;
      // Fixed child-first order; each transaction removes at most rowBudget.
      for (const table of [
        "time.reminder_occurrence",
        "time.reminder_rule",
        "time.source_reminder_setting",
        "ops.export_run",
      ]) {
        if (removed >= rowBudget) break;
        const name = table.split(".").map(identifier).join(".");
        const result = await client.query(
          `DELETE FROM ${name} WHERE ctid IN (SELECT ctid FROM ${name} WHERE workspace_id=$1 LIMIT $2)`,
          [r.target_workspace_id, rowBudget - removed],
        );
        removed += result.rowCount ?? 0;
      }
      if (!removed)
        await client.query(
          "UPDATE ops.deletion_request SET progress_json='{" +
            '"phase":"private_graph"' +
            "}'::jsonb WHERE id=$1",
          [requestId],
        );
      await client.query("COMMIT");
      return {
        state: "purging",
        phase: removed ? "projections" : "private_graph",
      };
    }
    if (r.progress_json.phase !== "private_graph")
      throw new Error("Unknown purge checkpoint.");
    const tables = (
      await client.query<{ schema: string; table: string }>(`
      SELECT n.nspname AS schema,c.relname AS table FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind='r' AND n.nspname IN ('core','finance','career','time','audit','ops')
      AND c.relname NOT IN ('deletion_request','deletion_tombstone')
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='workspace_id' AND NOT a.attisdropped)
      ORDER BY n.nspname,c.relname`)
    ).rows;
    let total = 0;
    for (const t of tables) {
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${identifier(t.schema)}.${identifier(t.table)} WHERE workspace_id=$1`,
        [r.target_workspace_id],
      );
      total += Number(count.rows[0]!.count);
      if (!Number.isSafeInteger(total) || total > rowBudget)
        throw new Error(
          "PRIVATE_GRAPH_ROW_BUDGET: Increase the reviewed operator budget before retrying (maximum 100000).",
        );
    }
    let pending = tables;
    // RESTRICT leaves are removed first. Deferred current-version pointers are
    // checked at commit; no constraints or triggers are disabled for deletion.
    while (pending.length) {
      const remaining: typeof tables = [];
      for (const t of pending) {
        await client.query("SAVEPOINT purge_table");
        try {
          await client.query(
            `DELETE FROM ${identifier(t.schema)}.${identifier(t.table)} WHERE workspace_id=$1`,
            [r.target_workspace_id],
          );
          await client.query("RELEASE SAVEPOINT purge_table");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT purge_table");
          await client.query("RELEASE SAVEPOINT purge_table");
          if ((error as { code?: string }).code !== "23503") throw error;
          remaining.push(t);
        }
      }
      if (remaining.length === pending.length)
        throw new Error(
          `PRIVATE_GRAPH_DEPENDENCY: Purge cannot resolve ${remaining.map((t) => `${t.schema}.${t.table}`).join(", ")}.`,
        );
      pending = remaining;
    }
    // Detach older cancelled requests, retaining only minimal identity evidence.
    await client.query(
      "UPDATE ops.deletion_request SET user_id=NULL,workspace_id=NULL,scope_manifest='{}'::jsonb,progress_json='{}'::jsonb WHERE target_user_id=$1 AND state='cancelled'",
      [r.target_user_id],
    );
    await client.query("DELETE FROM core.workspace WHERE id=$1", [
      r.target_workspace_id,
    ]);
    await client.query("DELETE FROM core.user_profile WHERE user_id=$1", [
      r.target_user_id,
    ]);
    // Pinned Better Auth's reset verification value is the auth user UUID.
    await client.query("DELETE FROM auth.verification WHERE value=$1", [
      r.target_user_id,
    ]);
    await client.query("DELETE FROM ops.email_delivery WHERE user_id=$1", [
      r.target_user_id,
    ]);
    await client.query("DELETE FROM auth.account WHERE user_id=$1", [
      r.target_user_id,
    ]);
    await client.query('DELETE FROM auth."user" WHERE id=$1', [
      r.target_user_id,
    ]);
    await client.query(
      "INSERT INTO ops.deletion_tombstone(target_user_id,target_workspace_id,request_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '30 days') ON CONFLICT(target_user_id,target_workspace_id) DO NOTHING",
      [r.target_user_id, r.target_workspace_id, requestId],
    );
    await client.query(
      "UPDATE ops.deletion_request SET state='completed',user_id=NULL,workspace_id=NULL,scope_manifest='{}'::jsonb,progress_json='{}'::jsonb,completed_at=clock_timestamp(),last_error_code=NULL WHERE id=$1",
      [requestId],
    );
    await client.query("COMMIT");
    return { state: "completed", phase: "completed" };
  } catch (error) {
    await client.query("ROLLBACK");
    // A durable failed checkpoint never reactivates a partly purged workspace.
    await client.query(
      "UPDATE ops.deletion_request SET state='failed',last_error_code='PURGE_STEP_FAILED' WHERE id=$1 AND state IN ('purging','failed')",
      [requestId],
    );
    throw error;
  }
}
