import type { Client } from "pg";
import { z } from "zod";
const recordSchema = z
  .object({
    requestId: z.uuid(),
    targetUserId: z.uuid(),
    targetWorkspaceId: z.uuid(),
    registerHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
/** Requires an authorization already imported by the offline recovery
 * administrator into a uniquely named isolated restore database. */
export async function applyRestoreDeletion(
  client: Client,
  input: z.infer<typeof recordSchema>,
) {
  const r = recordSchema.parse(input);
  const identity = (
    await client.query(
      "SELECT current_user AS role,current_database() AS database",
    )
  ).rows[0];
  if (
    identity.role !== "lifecycle_operator" ||
    !/^pmp_restore_[a-f0-9]{32}$/.test(identity.database)
  )
    throw new Error("Isolated recovery operator required.");
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('ops.deletion_request_id',$1,true)", [
      r.requestId,
    ]);
    await client.query(
      `INSERT INTO ops.deletion_request(id,user_id,workspace_id,target_user_id,target_workspace_id,client_command_id,payload_hash,scope_hash,scope_manifest,state,requested_at,purge_after)
      VALUES($1,$2,$3,$2,$3,$1,$4,$4,'{}','purging',clock_timestamp()-interval '8 days',clock_timestamp()-interval '1 day') ON CONFLICT(id) DO NOTHING`,
      [
        r.requestId,
        r.targetUserId,
        r.targetWorkspaceId,
        Buffer.from(r.registerHash, "hex"),
      ],
    );
    const authorized = (
      await client.query(
        "SELECT 1 FROM ops.restore_deletion_authorization WHERE request_id=$1 AND target_user_id=$2 AND target_workspace_id=$3 AND register_hash=$4",
        [
          r.requestId,
          r.targetUserId,
          r.targetWorkspaceId,
          Buffer.from(r.registerHash, "hex"),
        ],
      )
    ).rows.length;
    if (!authorized)
      throw new Error("Independent deletion register authorization required.");
    const request = (
      await client.query(
        "SELECT target_user_id,target_workspace_id,state,purge_after<=clock_timestamp() AS due FROM ops.deletion_request WHERE id=$1 FOR UPDATE",
        [r.requestId],
      )
    ).rows[0];
    if (
      !request ||
      request.target_user_id !== r.targetUserId ||
      request.target_workspace_id !== r.targetWorkspaceId ||
      request.state === "cancelled" ||
      !request.due
    )
      throw new Error(
        "Restored deletion request does not match its authorized target.",
      );
    if (request.state === "completed") {
      await client.query("COMMIT");
      return;
    }
    // A backup may already contain a pending/failed request. Preserve its
    // immutable identity/cutoff while resuming the ordinary guarded transition.
    if (request.state !== "purging")
      await client.query(
        "UPDATE ops.deletion_request SET state='purging',last_error_code=NULL WHERE id=$1",
        [r.requestId],
      );
    await client.query(
      "UPDATE core.user_profile SET lifecycle='purging',deletion_requested_at=(SELECT requested_at FROM ops.deletion_request WHERE id=$2),version=version+1,updated_at=clock_timestamp() WHERE user_id=$1 AND lifecycle IN ('active','deletion_pending')",
      [r.targetUserId, r.requestId],
    );
    await client.query(
      "UPDATE core.workspace SET state='purging',version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND state IN ('active','deletion_pending')",
      [r.targetWorkspaceId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
