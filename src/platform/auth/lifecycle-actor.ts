import { sql } from "drizzle-orm";
import { withIdentityTransaction } from "@/platform/db";
import { getVerifiedAuthenticatedSession } from "./session-boundary";

/** Pending accounts can inspect/cancel lifecycle only; this does not produce
 * an ActorContext for ordinary domain access. Never accept an owner from JSON. */
export async function resolveLifecycleActor(requestHeaders: Headers) {
  const current = await getVerifiedAuthenticatedSession(requestHeaders);
  if (!current) return null;
  const root = await withIdentityTransaction(
    { userId: current.user.id },
    async (t) =>
      (
        await t.db.execute<{ id: string }>(
          sql`SELECT id FROM core.workspace WHERE owner_user_id=${current.user.id}::uuid AND kind='personal'`,
        )
      ).rows[0],
  );
  if (!root) return null;
  return {
    userId: current.user.id,
    workspaceId: root.id,
    sessionId: current.session.id,
  };
}
