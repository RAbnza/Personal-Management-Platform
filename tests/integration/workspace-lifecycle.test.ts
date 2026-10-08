import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  hashCommandPayload,
  CommandReceiptConflictError,
} from "@/modules/core/domain/command";
import { readDeletionScope } from "@/modules/core/repositories/lifecycle-repository";
import {
  requestDeletionInTransaction,
  cancelDeletionInTransaction,
  RecentAuthenticationRequiredError,
  LifecycleConflictError,
} from "@/modules/core/services/workspace-lifecycle";
import { updateProfileInTransaction } from "@/modules/core/services/profile";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { createJobApplication } from "@/modules/career/services/create-job-application";
import { createApplicationEvent } from "@/modules/career/services/create-application-event";
import { createPersonalEvent } from "@/modules/time/services/create-personal-event";
import { getReminder, mutateReminder } from "@/modules/time/services/reminders";
import { prepareCsvExport } from "@/modules/reporting/services/export-csv";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import {
  getAuthPool,
  getDomainPool,
  closeRuntimeDatabasePools,
} from "@/platform/db/pools";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  withFixture,
  fixture,
  scoped,
  payment,
} from "./helpers/debt-payment-fixture";
const t = (client: PoolClient) =>
  ({ db: drizzle({ client }) }) as ScopedTransaction;
async function proof(userId: string, age = "0 minutes") {
  const sessionId = randomUUID();
  await getAuthPool().query(
    "INSERT INTO auth.session(id,user_id,token,created_at,updated_at,expires_at) VALUES($1,$2,$3,clock_timestamp()-interval '1 minute',clock_timestamp(),clock_timestamp()+interval '7 days')",
    [sessionId, userId, randomUUID()],
  );
  await getAuthPool().query(
    "INSERT INTO auth.session_assurance(session_id,method,verified_at) VALUES($1,'password',clock_timestamp()-$2::interval)",
    [sessionId, age],
  );
  return sessionId;
}
async function command(
  transaction: ScopedTransaction,
  actor: { userId: string; workspaceId: string },
) {
  const manifest = (await readDeletionScope(transaction, actor))!;
  return {
    clientCommandId: randomUUID(),
    expectedSnapshot: hashCommandPayload(manifest).toString("hex"),
    confirmation: "DELETE MY WORKSPACE AND ACCOUNT" as const,
  };
}
afterAll(closeRuntimeDatabasePools);
describe("reviewed workspace lifecycle", () => {
  it("requires a recent server proof rather than a session identifier", async () =>
    withFixture(async (client, f) => {
      const actor = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        sessionId: randomUUID(),
      };
      const c = await command(t(client), actor);
      await expect(
        requestDeletionInTransaction(t(client), actor, c),
      ).rejects.toBeInstanceOf(RecentAuthenticationRequiredError);
    }));
  it("rejects a stale scope and rolls back all lifecycle evidence", async () =>
    withFixture(async (client, f) => {
      const actor = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        sessionId: await proof(f.userId),
      };
      const c = await command(t(client), actor);
      await payment(client, f);
      await expect(
        requestDeletionInTransaction(t(client), actor, c),
      ).rejects.toBeInstanceOf(LifecycleConflictError);
      expect(
        (
          await client.query(
            "SELECT lifecycle FROM core.user_profile WHERE user_id=$1",
            [f.userId],
          )
        ).rows[0].lifecycle,
      ).toBe("active");
      expect(
        (await client.query("SELECT id FROM ops.deletion_request")).rowCount,
      ).toBe(0);
    }));
  it("records exact scope, blocks domain reads/writes, replays and rejects changed payload", async () =>
    withFixture(async (client, f) => {
      const actor = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        sessionId: await proof(f.userId),
      };
      const c = await command(t(client), actor);
      const r = await requestDeletionInTransaction(t(client), actor, c);
      expect(await requestDeletionInTransaction(t(client), actor, c)).toEqual(
        r,
      );
      await expect(
        requestDeletionInTransaction(t(client), actor, {
          ...c,
          expectedSnapshot: "a".repeat(64),
        }),
      ).rejects.toBeInstanceOf(CommandReceiptConflictError);
      expect((await client.query("SELECT id FROM finance.debt")).rowCount).toBe(
        0,
      );
      await client.query("SAVEPOINT blocked");
      await expect(
        client.query(
          "INSERT INTO core.tag(workspace_id,name) VALUES($1,'Blocked')",
          [f.workspaceId],
        ),
      ).rejects.toThrow();
      await client.query("ROLLBACK TO SAVEPOINT blocked");
      for (const write of [
        "UPDATE core.user_profile SET display_name='Blocked' WHERE user_id=$1",
        "UPDATE core.workspace SET timezone='UTC' WHERE owner_user_id=$1",
      ]) {
        await client.query("SAVEPOINT pending_root");
        await expect(client.query(write, [f.userId])).rejects.toThrow();
        await client.query("ROLLBACK TO SAVEPOINT pending_root");
      }
      await client.query("SAVEPOINT fake_revocation");
      await expect(
        client.query(
          "UPDATE ops.deletion_request SET progress_json='{\"ordinarySessionsRevoked\":true}'::jsonb WHERE id=$1",
          [r.requestId],
        ),
      ).rejects.toThrow();
      await client.query("ROLLBACK TO SAVEPOINT fake_revocation");
      const row = (
        await client.query("SELECT * FROM ops.deletion_request WHERE id=$1", [
          r.requestId,
        ])
      ).rows[0];
      expect(
        row.scope_manifest.records.some(
          (v: { kind: string }) => v.kind === "reminder_occurrence",
        ),
      ).toBe(true);
      expect(
        row.scope_manifest.records.some(
          (v: { kind: string }) => v.kind === "export_run",
        ),
      ).toBe(true);
      expect(
        new Date(row.purge_after).getTime() -
          new Date(row.requested_at).getTime(),
      ).toBe(7 * 86400000);
    }));
  it("cancels only the owned pending request and preserves the original financial history", async () =>
    withFixture(async (client, f) => {
      const actor = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        sessionId: await proof(f.userId),
      };
      const c = await command(t(client), actor);
      const r = await requestDeletionInTransaction(t(client), actor, c);
      await expect(
        cancelDeletionInTransaction(t(client), actor, randomUUID()),
      ).rejects.toThrow();
      expect(
        await cancelDeletionInTransaction(t(client), actor, r.requestId),
      ).toEqual({ cancelled: true });
      expect(
        await cancelDeletionInTransaction(t(client), actor, r.requestId),
      ).toEqual({ cancelled: true });
      expect((await client.query("SELECT id FROM finance.debt")).rowCount).toBe(
        1,
      );
      expect(
        (await client.query("SELECT lifecycle FROM core.user_profile")).rows[0]
          .lifecycle,
      ).toBe("active");
    }));
  it("rejects direct ordinary lifecycle bypass and foreign workspace targets", async () =>
    withFixture(async (client, f) => {
      await client.query("SAVEPOINT direct");
      await expect(
        client.query(
          "UPDATE core.user_profile SET lifecycle='deletion_pending',deletion_requested_at=clock_timestamp() WHERE user_id=$1",
          [f.userId],
        ),
      ).rejects.toThrow();
      await client.query("ROLLBACK TO SAVEPOINT direct");
      const actor = {
        userId: f.userId,
        workspaceId: randomUUID(),
        sessionId: await proof(f.userId),
      };
      await expect(
        requestDeletionInTransaction(t(client), actor, {
          clientCommandId: randomUUID(),
          expectedSnapshot: "0".repeat(64),
          confirmation: "DELETE MY WORKSPACE AND ACCOUNT",
        }),
      ).rejects.toThrow();
      expect(
        (await client.query("SELECT lifecycle FROM core.user_profile")).rows[0]
          .lifecycle,
      ).toBe("active");
    }));
  it("preserves profile audit and command replay without changing another owner", async () =>
    withFixture(async (client, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const c = {
        clientCommandId: randomUUID(),
        expectedVersion: 1,
        displayName: "Updated display",
      };
      const r = await updateProfileInTransaction(t(client), actor, c);
      expect(r.displayName).toBe("Updated display");
      expect(await updateProfileInTransaction(t(client), actor, c)).toEqual(r);
      expect(
        (
          await client.query(
            "SELECT id FROM audit.private_revision WHERE subject_kind='user_profile'",
          )
        ).rowCount,
      ).toBe(1);
    }));
  it("rejects a proof older than five minutes", async () =>
    withFixture(async (client, f) => {
      const actor = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        sessionId: await proof(f.userId, "6 minutes"),
      };
      await expect(
        requestDeletionInTransaction(
          t(client),
          actor,
          await command(t(client), actor),
        ),
      ).rejects.toBeInstanceOf(RecentAuthenticationRequiredError);
    }));
  it("rejects a fresh proof owned by another user", async () => {
    const foreignUser = randomUUID();
    await getAuthPool().query(
      "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'Foreign proof',$2,true)",
      [foreignUser, `${foreignUser}@example.test`],
    );
    try {
      const foreignSession = await proof(foreignUser);
      await withFixture(async (client, f) => {
        const actor = {
          userId: f.userId,
          workspaceId: f.workspaceId,
          sessionId: foreignSession,
        };
        await expect(
          requestDeletionInTransaction(
            t(client),
            actor,
            await command(t(client), actor),
          ),
        ).rejects.toBeInstanceOf(RecentAuthenticationRequiredError);
      });
    } finally {
      await getAuthPool().query('DELETE FROM auth."user" WHERE id=$1', [
        foreignUser,
      ]);
    }
  });
  it("purges through the separate scoped role, survives interruption/budget failure, retains a minimal tombstone and replays completion", async () => {
    const env = parseEnv(readFileSync(".env.bootstrap", "utf8"));
    const operatorUrl = new URL(process.env.DATABASE_URL!);
    operatorUrl.username = "lifecycle_operator";
    operatorUrl.password = env.LIFECYCLE_OPERATOR_PASSWORD!;
    const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
    adminUrl.pathname = "/personal_management_test";
    const op = new Client({ connectionString: operatorUrl.toString() }),
      earlierOperator = new Client({
        connectionString: operatorUrl.toString(),
      }),
      admin = new Client({ connectionString: adminUrl.toString() });
    const userId = randomUUID(),
      email = `lifecycle-fixture-${userId}@example.test`;
    let workspaceId = "";
    await getAuthPool().query(
      "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'Lifecycle fixture',$2,true)",
      [userId, email],
    );
    await op.connect();
    await earlierOperator.connect();
    await admin.connect();
    try {
      workspaceId = (
        await provisionPersonalWorkspace({
          userId,
          displayName: "Lifecycle fixture",
        })
      ).workspaceId;
      const client = await getDomainPool().connect();
      try {
        await client.query("BEGIN");
        await scoped(client, { userId, workspaceId });
        const f = await fixture(client, { userId, workspaceId });
        await payment(client, f);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      const actor = { userId, workspaceId, sessionId: await proof(userId) };
      const app = await createJobApplication({
        userId,
        workspaceId,
        clientCommandId: randomUUID(),
        companyName: "Purge fixture company",
        roleTitle: "Test role",
        initialStageEffectiveDate: "2026-10-01",
      });
      await createApplicationEvent({
        userId,
        workspaceId,
        clientCommandId: randomUUID(),
        applicationId: app.applicationId,
        eventKind: "interview",
        title: "Test interview",
        temporalKind: "date",
        eventDate: "2026-10-21",
        setAsNextAction: true,
        expectedApplicationVersion: 1,
      });
      const event = await createPersonalEvent({
        userId,
        workspaceId,
        clientCommandId: randomUUID(),
        title: "Purge reminder fixture",
        temporalKind: "date",
        eventDate: "2026-10-20",
      });
      const target = {
        sourceKind: "personal_event" as const,
        sourceId: event.eventId,
      };
      const reminder = await getReminder({ userId, workspaceId }, target);
      await mutateReminder(
        { userId, workspaceId },
        {
          target,
          clientCommandId: randomUUID(),
          expectedSnapshot: reminder.snapshot,
          action: { kind: "dismiss", ruleKey: "0:09:00" },
        },
      );
      await prepareCsvExport({
        userId,
        workspaceId,
        kind: "report",
        query: {
          period: "custom",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        },
      });
      const preview = await withDomainTransaction(actor, (t) =>
        command(t, actor),
      );
      const r = await withDomainTransaction(actor, (t) =>
        requestDeletionInTransaction(t, actor, preview),
      );
      await expect(purgeDeletionStep(op, r.requestId)).rejects.toThrow(/grace/);
      // Test-only administrator advances this synthetic request's clock. No
      // product path can edit grace or disable guards.
      await admin.query("BEGIN");
      await admin.query("SET LOCAL session_replication_role='replica'");
      await admin.query(
        "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_user_id=$2",
        [r.requestId, userId],
      );
      await admin.query("COMMIT");
      await expect(purgeDeletionStep(admin, r.requestId)).rejects.toThrow(
        /separate/,
      );
      expect((await purgeDeletionStep(op, r.requestId)).phase).toBe(
        "projections",
      );
      expect(
        (
          await getAuthPool().query(
            "SELECT id FROM auth.session WHERE user_id=$1",
            [userId],
          )
        ).rowCount,
      ).toBe(0);
      for (let step = 0; step < 10; step++) {
        if (
          (await purgeDeletionStep(op, r.requestId)).phase === "private_graph"
        )
          break;
      }
      await expect(purgeDeletionStep(op, r.requestId, 1)).rejects.toThrow(
        /ROW_BUDGET/,
      );
      const status = (
        await op.query("SELECT state FROM ops.deletion_request WHERE id=$1", [
          r.requestId,
        ])
      ).rows[0].state;
      expect(status).toBe("failed");
      await earlierOperator.query("BEGIN");
      await earlierOperator.query(
        "SELECT set_config('ops.deletion_request_id',$1,true)",
        [r.requestId],
      );
      expect((await purgeDeletionStep(op, r.requestId, 10000)).state).toBe(
        "completed",
      );
      expect((await purgeDeletionStep(op, r.requestId)).state).toBe(
        "completed",
      );
      expect(
        (
          await earlierOperator.query(
            "SELECT ops.purge_scope_allowed($1) AS allowed",
            [workspaceId],
          )
        ).rows[0].allowed,
      ).toBe(false);
      await earlierOperator.query("COMMIT");
      expect(
        (
          await admin.query("SELECT id FROM core.workspace WHERE id=$1", [
            workspaceId,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
            userId,
          ])
        ).rowCount,
      ).toBe(0);
      const evidence = (
        await op.query(
          "SELECT scope_manifest,progress_json FROM ops.deletion_request WHERE id=$1",
          [r.requestId],
        )
      ).rows[0];
      expect(evidence).toEqual({ scope_manifest: {}, progress_json: {} });
      expect(
        (
          await op.query(
            "SELECT request_id FROM ops.deletion_tombstone WHERE target_user_id=$1",
            [userId],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      // Clean only the explicitly named synthetic owner, even if an assertion
      // fails before purge. Administrator bypass is confined to fixture cleanup.
      await admin.query("BEGIN");
      await admin.query("SET LOCAL session_replication_role='replica'");
      await admin.query(
        "DELETE FROM ops.deletion_tombstone WHERE target_user_id=$1",
        [userId],
      );
      await admin.query(
        "DELETE FROM ops.deletion_request WHERE target_user_id=$1",
        [userId],
      );
      const tables = (
        await admin.query<{ schema: string; table: string }>(
          "SELECT table_schema AS schema,table_name AS table FROM information_schema.columns WHERE column_name='workspace_id' AND table_schema IN ('core','finance','career','time','audit','ops') AND table_name NOT IN ('deletion_request') AND table_name NOT LIKE '%_v'",
        )
      ).rows;
      for (const table of tables)
        await admin.query(
          `DELETE FROM "${table.schema}"."${table.table}" WHERE workspace_id=$1`,
          [workspaceId || randomUUID()],
        );
      await admin.query("DELETE FROM core.workspace WHERE id=$1", [
        workspaceId || randomUUID(),
      ]);
      await admin.query("DELETE FROM core.user_profile WHERE user_id=$1", [
        userId,
      ]);
      await admin.query('DELETE FROM auth."user" WHERE id=$1 AND email=$2', [
        userId,
        email,
      ]);
      await admin.query("COMMIT");
      await op.end();
      await earlierOperator.end();
      await admin.end();
    }
  }, 20000);
});
