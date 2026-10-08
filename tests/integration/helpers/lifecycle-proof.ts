import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getAuthPool } from "@/platform/db/pools";
import type { ScopedTransaction } from "@/platform/db";
import { readDeletionScope } from "@/modules/core/repositories/lifecycle-repository";
import { requestDeletionInTransaction } from "@/modules/core/services/workspace-lifecycle";
import { hashCommandPayload } from "@/modules/core/domain/command";
/** Synthetic proof only. Product proof is written by the rate-limited Better
 * Auth password challenge. Existing tests now exercise the real transition. */
export async function makeDeletionPending(
  client: PoolClient,
  owner: { userId: string; workspaceId: string },
) {
  const sessionId = randomUUID();
  await getAuthPool().query(
    "INSERT INTO auth.session(id,user_id,token,updated_at,expires_at) VALUES($1,$2,$3,clock_timestamp(),clock_timestamp()+interval '7 days')",
    [sessionId, owner.userId, randomUUID()],
  );
  await getAuthPool().query(
    "INSERT INTO auth.session_assurance(session_id,method,verified_at) VALUES($1,'password',clock_timestamp())",
    [sessionId],
  );
  const t = { db: drizzle({ client }) } as ScopedTransaction;
  const manifest = await readDeletionScope(t, owner);
  if (!manifest) throw new Error("Fixture scope unavailable");
  return requestDeletionInTransaction(
    t,
    { ...owner, sessionId },
    {
      clientCommandId: randomUUID(),
      expectedSnapshot: hashCommandPayload(manifest).toString("hex"),
      confirmation: "DELETE MY WORKSPACE AND ACCOUNT",
    },
  );
}
