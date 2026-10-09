import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  getAuthPool,
  getDomainPool,
  closeRuntimeDatabasePools,
} from "../../src/platform/db/pools";
import type { ScopedTransaction } from "../../src/platform/db/scoped-transaction";
import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import { openFinancialAccount } from "../../src/modules/finance/services/open-financial-account";
import { recordIncome } from "../../src/modules/finance/services/record-income";
import { getFinancialReportInTransaction } from "../../src/modules/reporting/services/get-reports";
import { applyRestoreDeletion } from "../../src/platform/lifecycle/restore-deletion";
import {
  encryptBackup,
  decryptBackup,
} from "../../src/platform/backup/envelope";
import { purgeDeletionStep } from "../../src/platform/lifecycle/purge";
import { runScopedTransactionOnClient } from "../../src/platform/db/scoped-transaction";
import { hashCommandPayload } from "../../src/modules/core/domain/command";
import { readDeletionScope } from "../../src/modules/core/repositories/lifecycle-repository";
import { requestDeletionInTransaction } from "../../src/modules/core/services/workspace-lifecycle";

function containerTool(args: string[], input?: Buffer): Promise<Buffer> {
  const container = process.env.PMP_TEST_POSTGRES_CONTAINER ?? "pmp-postgres";
  assert.match(container, /^[a-zA-Z0-9_-]+$/);
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", ...(input ? ["-i"] : []), container, ...args],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    const output: Buffer[] = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    let diagnostic = "";
    child.stderr.on("data", (chunk) => {
      diagnostic += String(chunk);
    });
    child.on("error", () => reject(new Error("Restore tool unavailable.")));
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(output))
        : reject(
            new Error(
              `Restore tool failed.${diagnostic.match(/violates foreign key constraint "([a-z_]+)"/)?.[1] ?? ""}`,
            ),
          ),
    );
    child.stdin.end(input);
  });
}
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
async function snapshot(client: Client) {
  const tables = (
    await client.query(
      "SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname=ANY($1) ORDER BY n.nspname,c.relname",
      [
        [
          "auth",
          "core",
          "finance",
          "career",
          "time",
          "audit",
          "ops",
          "drizzle",
          "pgboss",
        ],
      ],
    )
  ).rows;
  const counts: Record<string, string> = {};
  for (const t of tables) {
    const name = `${quote(t.schema)}.${quote(t.name)}`;
    counts[name] = (
      await client.query(`SELECT count(*)::text AS n FROM ${name}`)
    ).rows[0].n;
  }
  assert.equal(
    (
      await client.query(
        "SELECT journal_id FROM finance.posting GROUP BY journal_id,currency HAVING sum(amount_minor)<>0",
      )
    ).rows.length,
    0,
  );
  const balances = (
    await client.query(
      "SELECT ledger_account_id,sum(amount_minor)::text AS balance FROM finance.posting GROUP BY ledger_account_id ORDER BY ledger_account_id",
    )
  ).rows;
  return { counts, balances };
}
let stage = "fixture";
async function main() {
  const suffix = randomUUID().replaceAll("-", ""),
    database = `pmp_restore_${suffix}`;
  assert.match(database, /^pmp_restore_[a-f0-9]{32}$/);
  const adminSource = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  adminSource.pathname = "/personal_management_test";
  const admin = new Client({ connectionString: adminSource.toString() });
  await admin.connect();
  assert.equal(
    (await admin.query("SELECT current_database() AS name")).rows[0].name,
    "personal_management_test",
  );
  // Repair only orphaned operational rows from the previous browser fixture
  // cleanup, in the hard-guarded synthetic database, before validating a dump.
  await admin.query(
    'DELETE FROM ops.email_delivery e WHERE NOT EXISTS(SELECT 1 FROM auth."user" u WHERE u.id=e.user_id)',
  );
  await admin.query(
    "DELETE FROM auth.session_assurance a WHERE NOT EXISTS(SELECT 1 FROM auth.session s WHERE s.id=a.session_id)",
  );
  const bootstrap = parseEnv(await readFile(".env.bootstrap", "utf8"));
  const owners: { userId: string; workspaceId: string }[] = [];
  let created = false;
  async function owner() {
    const userId = randomUUID();
    await getAuthPool().query(
      "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'C5 restore fixture',$2,true)",
      [userId, `${userId}@example.test`],
    );
    const w = await provisionPersonalWorkspace({
      userId,
      displayName: "C5 restore fixture",
    });
    const o = { userId, workspaceId: w.workspaceId };
    owners.push(o);
    return o;
  }
  try {
    const target = await owner(),
      other = await owner(),
      pending = await owner();
    const pendingSession = randomUUID();
    await getAuthPool().query(
      "INSERT INTO auth.session(id,user_id,token,updated_at,expires_at) VALUES($1,$2,$3,clock_timestamp(),clock_timestamp()+interval '1 day')",
      [pendingSession, pending.userId, randomUUID()],
    );
    await getAuthPool().query(
      "INSERT INTO auth.session_assurance(session_id,method,verified_at) VALUES($1,'password',clock_timestamp())",
      [pendingSession],
    );
    const pendingClient = await getDomainPool().connect();
    let pendingRequestId: string;
    try {
      pendingRequestId = await runScopedTransactionOnClient(
        pendingClient,
        pending,
        async (t) => {
          const manifest = (await readDeletionScope(t, pending))!;
          const result = await requestDeletionInTransaction(
            t,
            { ...pending, sessionId: pendingSession },
            {
              clientCommandId: randomUUID(),
              expectedSnapshot: hashCommandPayload(manifest).toString("hex"),
              confirmation: "DELETE MY WORKSPACE AND ACCOUNT",
            },
          );
          return result.requestId;
        },
      );
    } finally {
      pendingClient.release();
    }
    // Test-fixture clock advancement only: exact synthetic root, hard-guarded
    // test database. Product and recovery purge never disable integrity.
    assert.equal(
      (
        await admin.query(
          'SELECT 1 FROM auth."user" WHERE id=$1 AND name=$2 AND email=$3',
          [
            pending.userId,
            "C5 restore fixture",
            `${pending.userId}@example.test`,
          ],
        )
      ).rowCount,
      1,
    );
    await admin.query("BEGIN");
    try {
      await admin.query("SET LOCAL session_replication_role='replica'");
      await admin.query(
        "UPDATE ops.deletion_request SET requested_at=requested_at-interval '8 days',purge_after=purge_after-interval '8 days' WHERE id=$1 AND target_user_id=$2",
        [pendingRequestId, pending.userId],
      );
      await admin.query(
        "UPDATE core.user_profile SET deletion_requested_at=(SELECT requested_at FROM ops.deletion_request WHERE id=$2) WHERE user_id=$1",
        [pending.userId, pendingRequestId],
      );
      await admin.query("COMMIT");
    } catch (e) {
      await admin.query("ROLLBACK");
      throw e;
    }
    const account = await openFinancialAccount({
      ...target,
      clientCommandId: randomUUID(),
      name: "Restore fixture BDO",
      accountType: "checking",
      openingCutoffDate: "2026-09-30",
      openingBalanceMinor: "200000",
    });
    await recordIncome({
      ...target,
      clientCommandId: randomUUID(),
      receivingAccountId: account.accountId,
      effectiveDate: "2026-10-02",
      amountMinor: "1000000",
      incomeClass: "earned",
      description: "Restore fixture salary",
    });
    await getAuthPool().query(
      "INSERT INTO auth.session(id,user_id,token,updated_at,expires_at) VALUES($1,$2,$3,clock_timestamp(),clock_timestamp()+interval '1 day')",
      [randomUUID(), target.userId, randomUUID()],
    );
    stage = "source_snapshot";
    const before = await snapshot(admin);
    stage = "dump";
    const dump = await containerTool([
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "personal_management_test",
      "--format=custom",
      "--no-publications",
      "--no-subscriptions",
    ]);
    const key = randomBytes(32).toString("hex"),
      metadata = {
        schemaVersion: 1 as const,
        backupId: randomUUID(),
        keyId: "local-drill-v1",
      };
    const encrypted = encryptBackup(dump, metadata, key);
    await mkdir("test-results/restore-drill", { recursive: true });
    const artifact = `test-results/restore-drill/${suffix}.dump.aes`;
    await writeFile(artifact, encrypted, { flag: "wx", mode: 0o600 });
    const recovered = await readFile(artifact),
      plaintext = decryptBackup(recovered, key, metadata.keyId).dump;
    assert.deepEqual(plaintext, dump);
    // This deletion occurs AFTER the backup cutoff. Its independent checkpoint
    // must prevent the older backup from resurrecting the target identity.
    const register = {
      requestId: randomUUID(),
      targetUserId: target.userId,
      targetWorkspaceId: target.workspaceId,
    };
    const registerHash = createHash("sha256")
      .update(JSON.stringify(register))
      .digest("hex");
    const registerPath = `test-results/restore-drill/${suffix}.deletion-register.json`;
    await writeFile(
      registerPath,
      JSON.stringify({ ...register, registerHash }),
      { flag: "wx", mode: 0o600 },
    );
    const pendingRegister = {
      requestId: pendingRequestId,
      targetUserId: pending.userId,
      targetWorkspaceId: pending.workspaceId,
    };
    const pendingSaved = {
      ...pendingRegister,
      registerHash: createHash("sha256")
        .update(JSON.stringify(pendingRegister))
        .digest("hex"),
    };
    const pendingRegisterPath = `test-results/restore-drill/${suffix}.pending-deletion-register.json`;
    await writeFile(pendingRegisterPath, JSON.stringify(pendingSaved), {
      flag: "wx",
      mode: 0o600,
    });
    await admin.query(`CREATE DATABASE ${quote(database)}`);
    created = true;
    stage = "restore_tool";
    await containerTool(
      ["pg_restore", "-U", "postgres", "-d", database, "--exit-on-error"],
      plaintext,
    );
    const restoreUrl = new URL(adminSource);
    restoreUrl.pathname = `/${database}`;
    const restored = new Client({ connectionString: restoreUrl.toString() });
    await restored.connect();
    try {
      stage = "restored_snapshot";
      assert.deepEqual(await snapshot(restored), before);
      const domainUrl = new URL(process.env.DATABASE_URL!);
      domainUrl.pathname = `/${database}`;
      const domain = new Client({ connectionString: domainUrl.toString() });
      await domain.connect();
      try {
        assert.equal(
          (await domain.query("SELECT id FROM finance.financial_account")).rows
            .length,
          0,
        );
        await domain.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        await domain.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
          [target.userId, target.workspaceId],
        );
        stage = "restored_report";
        const report = await getFinancialReportInTransaction(
          { db: drizzle(domain) } as ScopedTransaction,
          {
            workspaceId: target.workspaceId,
            query: {
              period: "custom",
              startDate: "2026-10-01",
              endDate: "2026-10-31",
            },
          },
        );
        assert.match(JSON.stringify(report), /1000000/);
        assert.match(JSON.stringify(report), /1200000/);
        await domain.query("COMMIT");
      } finally {
        await domain.end();
      }
      // Offline isolated recovery administration revokes restored credentials
      // and cancels possibly accepted jobs before any runtime is reopened.
      await restored.query(
        "DELETE FROM auth.session; DELETE FROM auth.verification; UPDATE ops.email_delivery SET status='cancelled',recipient_ciphertext=decode('','hex'),payload_ciphertext=NULL,updated_at=clock_timestamp() WHERE status IN ('queued','uncertain'); DELETE FROM pgboss.job",
      );
      const opUrl = new URL(restoreUrl);
      opUrl.username = "lifecycle_operator";
      opUrl.password = bootstrap.LIFECYCLE_OPERATOR_PASSWORD!;
      const operator = new Client({ connectionString: opUrl.toString() });
      await operator.connect();
      try {
        const saved = JSON.parse(await readFile(registerPath, "utf8"));
        await assert.rejects(applyRestoreDeletion(operator, saved));
        await restored.query(
          "INSERT INTO ops.restore_deletion_authorization(request_id,target_user_id,target_workspace_id,register_hash) VALUES($1,$2,$3,$4)",
          [
            saved.requestId,
            saved.targetUserId,
            saved.targetWorkspaceId,
            Buffer.from(saved.registerHash, "hex"),
          ],
        );
        stage = "restore_deletion";
        await applyRestoreDeletion(operator, saved);
        const savedPending = JSON.parse(
          await readFile(pendingRegisterPath, "utf8"),
        );
        await assert.rejects(applyRestoreDeletion(operator, savedPending));
        await restored.query(
          "INSERT INTO ops.restore_deletion_authorization(request_id,target_user_id,target_workspace_id,register_hash) VALUES($1,$2,$3,$4)",
          [
            savedPending.requestId,
            savedPending.targetUserId,
            savedPending.targetWorkspaceId,
            Buffer.from(savedPending.registerHash, "hex"),
          ],
        );
        await applyRestoreDeletion(operator, savedPending);
        assert.equal(
          (
            await restored.query(
              "SELECT lifecycle FROM core.user_profile WHERE user_id=$1",
              [pending.userId],
            )
          ).rows[0].lifecycle,
          "purging",
        );
        let pendingOutcome = { state: "purging", phase: "" };
        for (let n = 0; n < 8 && pendingOutcome.state !== "completed"; n++)
          pendingOutcome = await purgeDeletionStep(
            operator,
            savedPending.requestId,
          );
        assert.equal(pendingOutcome.state, "completed");
        await applyRestoreDeletion(operator, savedPending);
        assert.equal(
          (
            await restored.query('SELECT id FROM auth."user" WHERE id=$1', [
              pending.userId,
            ])
          ).rowCount,
          0,
        );
        await applyRestoreDeletion(operator, saved);
        stage = "purge";
        let outcome = { state: "purging", phase: "" };
        for (let n = 0; n < 8 && outcome.state !== "completed"; n++)
          outcome = await purgeDeletionStep(operator, saved.requestId);
        assert.equal(outcome.state, "completed");
        await applyRestoreDeletion(operator, saved);
        assert.equal(
          (
            await restored.query('SELECT id FROM auth."user" WHERE id=$1', [
              target.userId,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await restored.query('SELECT id FROM auth."user" WHERE id=$1', [
              other.userId,
            ])
          ).rows.length,
          1,
        );
        assert.equal(
          (await restored.query("SELECT id FROM auth.session")).rows.length,
          0,
        );
        assert.equal(
          (
            await restored.query(
              "SELECT journal_id FROM finance.posting GROUP BY journal_id,currency HAVING sum(amount_minor)<>0",
            )
          ).rows.length,
          0,
        );
      } finally {
        await operator.end();
      }
      await writeFile(
        "test-results/restore-drill/evidence.json",
        JSON.stringify(
          {
            completedAt: new Date().toISOString(),
            source: "personal_management_test",
            encryptedDumpSha256: createHash("sha256")
              .update(encrypted)
              .digest("hex"),
            migrationCount: before.counts['"drizzle"."__drizzle_migrations"'],
            relations: Object.keys(before.counts).length,
            checks: [
              "encrypted dump/decrypt",
              "actual pg_restore",
              "exact counts/ledger balances",
              "balanced journals",
              "owner-scoped report",
              "real-role RLS",
              "restored session/token revocation",
              "independent post-backup deletion reapplication",
              "pending deletion restored from backup resumes and purges",
              "deletion-register replay before and after completion",
              "other owner preserved",
            ],
            productionGuarantee: false,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(
        "Isolated encrypted restore drill passed: exact counts/balances, report, RLS, revoked credentials and independently authorized scoped deletion; other owner retained.",
      );
    } finally {
      await restored.end();
    }
  } finally {
    if (created) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [database],
      );
      await admin.query(`DROP DATABASE ${quote(database)}`);
    }
    for (const o of owners) {
      // Explicit synthetic fixture cleanup only, never used by product purge.
      assert.equal(
        (
          await admin.query(
            "SELECT 1 FROM auth.\"user\" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE u.id=$1 AND w.id=$2 AND u.name='C5 restore fixture' AND u.email=$3",
            [o.userId, o.workspaceId, `${o.userId}@example.test`],
          )
        ).rowCount,
        1,
      );
      await admin.query("BEGIN");
      try {
        await admin.query("SET LOCAL session_replication_role='replica'");
        const tables = (
          await admin.query(
            "SELECT c.table_schema,c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE' WHERE c.column_name='workspace_id' AND c.table_schema=ANY($1)",
            [["core", "finance", "career", "time", "audit", "ops"]],
          )
        ).rows;
        for (const t of tables)
          await admin.query(
            `DELETE FROM ${quote(t.table_schema)}.${quote(t.table_name)} WHERE workspace_id=$1`,
            [o.workspaceId],
          );
        await admin.query("DELETE FROM core.workspace WHERE id=$1", [
          o.workspaceId,
        ]);
        await admin.query("DELETE FROM core.user_profile WHERE user_id=$1", [
          o.userId,
        ]);
        await admin.query(
          "DELETE FROM auth.session_assurance WHERE session_id IN(SELECT id FROM auth.session WHERE user_id=$1)",
          [o.userId],
        );
        await admin.query("DELETE FROM auth.session WHERE user_id=$1", [
          o.userId,
        ]);
        await admin.query("DELETE FROM auth.account WHERE user_id=$1", [
          o.userId,
        ]);
        await admin.query('DELETE FROM auth."user" WHERE id=$1', [o.userId]);
        await admin.query("COMMIT");
      } catch (error) {
        await admin.query("ROLLBACK");
        throw error;
      }
    }
    await admin.end();
    await closeRuntimeDatabasePools();
  }
}
void main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  console.error(
    JSON.stringify({
      stage,
      ...(code && /^[A-Z0-9]{5}$/.test(code) ? { code } : {}),
      ...((error as { constraint?: string }).constraint
        ? { constraint: (error as { constraint: string }).constraint }
        : {}),
      ...((error as Error).message === "Invalid deletion scope"
        ? { guard: "deletion_scope" }
        : {}),
      ...((error as Error).message.startsWith("Restore tool failed.")
        ? {
            constraint: (error as Error).message.slice(
              "Restore tool failed.".length,
            ),
          }
        : {}),
    }),
  );
  console.error(
    "Isolated restore drill failed. No credentials, private records or tool stderr are logged.",
  );
  process.exitCode = 1;
});
