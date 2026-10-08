import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import {
  lockActivePrivateWorkspace,
  PrivateDomainWriteUnavailableError,
} from "@/modules/core/repositories/private-domain-write-repository";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  withDomainTransaction,
  withIdentityTransaction,
  type ScopedTransaction,
} from "@/platform/db";
import { LifecycleConflictError } from "./workspace-lifecycle";

export const profileCommandSchema = z
  .object({
    clientCommandId: z.uuid(),
    expectedVersion: z.number().int().positive().max(2147483647),
    displayName: z.string().trim().min(1).max(100),
  })
  .strict();
export type Profile = {
  displayName: string;
  version: number;
  lifecycle: string;
};
export async function getIdentityProfile(
  userId: string,
): Promise<Profile | null> {
  return withIdentityTransaction(
    { userId },
    async (t) =>
      (
        await t.db.execute<Profile>(
          sql`SELECT display_name AS "displayName",version,lifecycle FROM core.user_profile WHERE user_id=${userId}::uuid`,
        )
      ).rows[0] ?? null,
  );
}
export async function updateProfileInTransaction(
  t: ScopedTransaction,
  actor: { userId: string; workspaceId: string; requestId?: string },
  raw: unknown,
) {
  const c = profileCommandSchema.parse(raw);
  const locked = (
    await t.db.execute<Profile>(
      sql`SELECT display_name AS "displayName",version,lifecycle FROM core.user_profile WHERE user_id=${actor.userId}::uuid AND lifecycle='active' FOR UPDATE`,
    )
  ).rows[0];
  if (!locked) throw new PrivateDomainWriteUnavailableError();
  await lockActivePrivateWorkspace(t, actor);
  const receipt = await claimCommandReceipt(t, {
    workspaceId: actor.workspaceId,
    clientCommandId: c.clientCommandId,
    commandType: "core.update_profile",
    payloadHash: hashCommandPayload(c),
  });
  if (receipt.kind === "replay")
    return receipt.result as { displayName: string; version: number };
  const before = (
    await t.db.execute<Profile>(
      sql`SELECT display_name AS "displayName",version,lifecycle FROM core.user_profile WHERE user_id=${actor.userId}::uuid FOR UPDATE`,
    )
  ).rows[0];
  if (!before) throw new PrivateDomainWriteUnavailableError();
  if (before.version !== c.expectedVersion) throw new LifecycleConflictError();
  const result = { displayName: c.displayName, version: before.version + 1 };
  await t.db.execute(
    sql`UPDATE core.user_profile SET display_name=${c.displayName},version=version+1,updated_at=clock_timestamp() WHERE user_id=${actor.userId}::uuid`,
  );
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: actor.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "user_profile",
    subjectId: actor.userId,
    subjectVersion: result.version,
    operation: "update",
    beforeJson: { displayName: before.displayName },
    afterJson: result,
    reason: null,
    effectiveDate: null,
    recordedByUserId: actor.userId,
    actorKind: "user",
    requestId: actor.requestId ?? null,
  });
  await completeCommandReceipt(t, {
    workspaceId: actor.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  return result;
}
export async function updateProfile(
  actor: { userId: string; workspaceId: string; requestId?: string },
  raw: unknown,
) {
  return withDomainTransaction(actor, (t) =>
    updateProfileInTransaction(t, actor, raw),
  );
}
