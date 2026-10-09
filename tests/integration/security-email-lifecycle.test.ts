import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { afterAll, expect, it } from "vitest";
import { getAuthPool, closeRuntimeDatabasePools } from "@/platform/db/pools";
import { withDomainTransaction } from "@/platform/db";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  getDeletionPreview,
  requestDeletionInTransaction,
  cancelDeletion,
} from "@/modules/core/services/workspace-lifecycle";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
afterAll(closeRuntimeDatabasePools);
it("security mail reads actual lifecycle through queue_broker without granting private-table access", async () => {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await getAuthPool().query(
    "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'C5 email lifecycle fixture',$2,true)",
    [userId, `${userId}@example.test`],
  );
  const workspace = await provisionPersonalWorkspace({
      userId,
      displayName: "C5 email lifecycle fixture",
    }),
    owner = { userId, workspaceId: workspace.workspaceId };
  await getAuthPool().query(
    "INSERT INTO auth.session(id,user_id,token,updated_at,expires_at) VALUES($1,$2,$3,clock_timestamp(),clock_timestamp()+interval '1 day')",
    [sessionId, userId, randomUUID()],
  );
  await getAuthPool().query(
    "INSERT INTO auth.session_assurance(session_id,method,verified_at) VALUES($1,'password',clock_timestamp())",
    [sessionId],
  );
  const secrets = parseEnv(await readFile(".env.bootstrap", "utf8")),
    url = new URL(process.env.AUTH_DATABASE_URL!);
  url.username = "queue_broker";
  url.password = secrets.QUEUE_BROKER_PASSWORD!;
  const queue = new Client({ connectionString: url.toString() });
  let requestId: string | undefined;
  await queue.connect();
  try {
    const active = async () =>
      (
        await queue.query(
          "SELECT ops.email_source_active($1,'password_reset',$2) active",
          [userId, `${userId}@example.test`],
        )
      ).rows[0].active;
    expect(await active()).toBe(true);
    const preview = await getDeletionPreview(owner);
    requestId = (
      await withDomainTransaction(owner, (t) =>
        requestDeletionInTransaction(
          t,
          { ...owner, sessionId },
          {
            clientCommandId: randomUUID(),
            expectedSnapshot: preview.snapshot,
            confirmation: "DELETE MY WORKSPACE AND ACCOUNT",
          },
        ),
      )
    ).requestId;
    expect(await active()).toBe(false);
    await expect(
      queue.query("SELECT lifecycle FROM core.user_profile"),
    ).rejects.toMatchObject({ code: "42501" });
    await cancelDeletion({ userId, sessionId }, requestId);
    requestId = undefined;
    expect(await active()).toBe(true);
  } finally {
    await queue.end();
    if (requestId) await cancelDeletion({ userId, sessionId }, requestId);
    await getAuthPool().query(
      "DELETE FROM auth.session_assurance WHERE session_id=$1",
      [sessionId],
    );
    await removeNamedFinancialFixture(owner, "C5 email lifecycle fixture");
  }
});
