import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  hashCommandPayload,
  CommandReceiptConflictError,
} from "@/modules/core/domain/command";
import {
  readDeletionScope,
  readDeletionState,
  type LifecycleTransaction,
} from "@/modules/core/repositories/lifecycle-repository";
import {
  withDomainTransaction,
  withIdentityTransaction,
  type ScopedTransaction,
} from "@/platform/db";

export const deletionCommandSchema = z
  .object({
    clientCommandId: z.uuid(),
    expectedSnapshot: z.string().regex(/^[a-f0-9]{64}$/),
    confirmation: z.literal("DELETE MY WORKSPACE AND ACCOUNT"),
  })
  .strict();
export class LifecycleConflictError extends Error {
  readonly code = "STALE_VERSION";
  constructor() {
    super("The deletion scope changed. Reload and review it again.");
  }
}
export class LifecycleUnavailableError extends Error {
  constructor() {
    super("This lifecycle action is unavailable.");
  }
}
export class RecentAuthenticationRequiredError extends Error {
  constructor() {
    super("Verify your password again before this action.");
  }
}
export const lifecyclePolicy = {
  graceDays: 7,
  backupRetention:
    "Deletion removes the live workspace after the seven-day grace period through the authorized purge process. Retained backups may still contain data. Backup expiry and recovery guarantees have not yet been verified for this deployment; immediate backup removal is not promised. Global security abuse counters are separate from workspace records; the auth-only maintenance process removes counters inactive for thirty days. Its production cadence is not yet configured.",
  exportCoverage:
    "Report CSV exports cover selected records and periods. They are not a complete workspace backup.",
};
export async function assertRecentAuthentication(
  t: LifecycleTransaction,
  sessionId: string,
) {
  await t.db.execute(
    sql`SELECT set_config('app.session_id',${sessionId},true)`,
  );
  try {
    await t.db.execute(sql`SELECT ops.assert_recent_auth(${sessionId}::uuid)`);
  } catch (error) {
    const cause = error as { cause?: { code?: string }; code?: string };
    if ((cause.code ?? cause.cause?.code) === "P0001")
      throw new RecentAuthenticationRequiredError();
    throw error;
  }
}
export async function getDeletionPreview(actor: {
  userId: string;
  workspaceId: string;
}) {
  return withDomainTransaction(
    actor,
    async (t) => {
      const manifest = await readDeletionScope(t, actor);
      if (!manifest) throw new LifecycleUnavailableError();
      return {
        manifest,
        snapshot: hashCommandPayload(manifest).toString("hex"),
        policy: lifecyclePolicy,
      };
    },
    { readOnlySnapshot: true },
  );
}
export type DeletionPreview = Awaited<ReturnType<typeof getDeletionPreview>>;
export async function requestDeletionInTransaction(
  t: ScopedTransaction,
  actor: { userId: string; workspaceId: string; sessionId: string },
  raw: unknown,
) {
  const command = deletionCommandSchema.parse(raw);
  // Exclusive profile lock precedes workspace and request locks, matching every domain writer.
  const owner = (
    await t.db.execute<{ lifecycle: string }>(
      sql`SELECT lifecycle FROM core.user_profile WHERE user_id=${actor.userId}::uuid FOR UPDATE`,
    )
  ).rows[0];
  await t.db.execute(
    sql`SELECT id FROM core.workspace WHERE id=${actor.workspaceId}::uuid AND owner_user_id=${actor.userId}::uuid FOR UPDATE`,
  );
  await assertRecentAuthentication(t, actor.sessionId);
  const payloadHash = hashCommandPayload(command);
  const prior = (
    await t.db.execute<{ id: string; payload_hash: Buffer; state: string }>(
      sql`SELECT id,payload_hash,state FROM ops.deletion_request WHERE target_user_id=${actor.userId}::uuid AND client_command_id=${command.clientCommandId}::uuid`,
    )
  ).rows[0];
  if (prior) {
    if (!prior.payload_hash.equals(payloadHash))
      throw new CommandReceiptConflictError();
    if (prior.state !== "pending") throw new LifecycleUnavailableError();
    return { requestId: prior.id };
  }
  if (owner?.lifecycle !== "active") throw new LifecycleUnavailableError();
  const manifest = await readDeletionScope(t, actor);
  if (!manifest) throw new LifecycleUnavailableError();
  const scopeHash = hashCommandPayload(manifest);
  if (scopeHash.toString("hex") !== command.expectedSnapshot)
    throw new LifecycleConflictError();
  const r = await t.db.execute<{
    id: string;
  }>(sql`INSERT INTO ops.deletion_request(user_id,workspace_id,target_user_id,target_workspace_id,client_command_id,payload_hash,purge_after,scope_manifest,scope_hash)
    VALUES(${actor.userId}::uuid,${actor.workspaceId}::uuid,${actor.userId}::uuid,${actor.workspaceId}::uuid,${command.clientCommandId}::uuid,${payloadHash},transaction_timestamp()+interval '7 days',${JSON.stringify(manifest)}::jsonb,${scopeHash}) RETURNING id`);
  await t.db.execute(
    sql`UPDATE core.user_profile SET lifecycle='deletion_pending',deletion_requested_at=transaction_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE user_id=${actor.userId}::uuid`,
  );
  await t.db.execute(
    sql`UPDATE core.workspace SET state='deletion_pending',version=version+1,updated_at=clock_timestamp() WHERE id=${actor.workspaceId}::uuid`,
  );
  return { requestId: r.rows[0]!.id };
}
export async function requestDeletion(
  actor: { userId: string; workspaceId: string; sessionId: string },
  command: unknown,
  requestHeaders: Headers,
) {
  const result = await withDomainTransaction(actor, (t) =>
    requestDeletionInTransaction(t, actor, command),
  );
  // Distinct credentials/connections: pending state commits first and denies all
  // domain access. Never report initiation complete until auth revocation succeeds.
  const { auth } = await import("@/platform/auth/server");
  await auth.api.revokeSessions({ headers: requestHeaders });
  await withDomainTransaction(actor, async (t) => {
    await t.db.execute(
      sql`UPDATE ops.deletion_request SET progress_json='{"ordinarySessionsRevoked":true}'::jsonb WHERE id=${result.requestId}::uuid AND state='pending'`,
    );
  });
  return result;
}
export async function getLifecycleState(userId: string) {
  return withIdentityTransaction({ userId }, readDeletionState);
}
export async function cancelDeletionInTransaction(
  t: LifecycleTransaction,
  actor: { userId: string; sessionId: string },
  requestId: string,
) {
  z.uuid().parse(requestId);
  const owner = (
    await t.db.execute<{ lifecycle: string }>(
      sql`SELECT lifecycle FROM core.user_profile WHERE user_id=${actor.userId}::uuid FOR UPDATE`,
    )
  ).rows[0];
  await t.db.execute(
    sql`SELECT id FROM core.workspace WHERE owner_user_id=${actor.userId}::uuid FOR UPDATE`,
  );
  await assertRecentAuthentication(t, actor.sessionId);
  const row = (
    await t.db.execute<{ state: string; canCancel: boolean }>(
      sql`SELECT state,purge_after>clock_timestamp() AS "canCancel" FROM ops.deletion_request WHERE id=${requestId}::uuid AND target_user_id=${actor.userId}::uuid FOR UPDATE`,
    )
  ).rows[0];
  if (!row) throw new LifecycleUnavailableError();
  if (row.state === "cancelled" && owner?.lifecycle === "active")
    return { cancelled: true };
  if (
    row.state !== "pending" ||
    !row.canCancel ||
    owner?.lifecycle !== "deletion_pending"
  )
    throw new LifecycleUnavailableError();
  await t.db.execute(
    sql`UPDATE ops.deletion_request SET state='cancelled' WHERE id=${requestId}::uuid`,
  );
  await t.db.execute(
    sql`UPDATE core.user_profile SET lifecycle='active',deletion_requested_at=NULL,version=version+1,updated_at=clock_timestamp() WHERE user_id=${actor.userId}::uuid`,
  );
  await t.db.execute(
    sql`UPDATE core.workspace SET state='active',version=version+1,updated_at=clock_timestamp() WHERE owner_user_id=${actor.userId}::uuid`,
  );
  return { cancelled: true };
}
export async function cancelDeletion(
  actor: { userId: string; sessionId: string },
  requestId: string,
) {
  return withIdentityTransaction(actor, (t) =>
    cancelDeletionInTransaction(t, actor, requestId),
  );
}
