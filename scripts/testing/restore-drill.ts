import { recordSavingsGoalCommand } from "../../src/modules/planning/services/savings-goals";
import { stageImport } from "../../src/modules/portability/services/imports";
import { prepareWorkspaceExport } from "../../src/modules/portability/services/workspace-bundles";
import { saveNotificationPreferences } from "../../src/modules/time/services/notification-preferences";
import { createPersonalEvent } from "../../src/modules/time/services/create-personal-event";
import { scanNotificationScope } from "../../src/platform/email/notification-delivery";
import { Pool } from "pg";
import { getSavingsGoal } from "../../src/modules/planning/services/read-savings-goals";
import { readSavingsGoals } from "../../src/modules/planning/repositories/savings-goal-repository";
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
import { recordRecurringCommand } from "../../src/modules/planning/services/recurring";
import { recordBudgetCommand } from "../../src/modules/planning/services/budgets";
import { readBudgetComparisons } from "../../src/modules/planning/repositories/budget-repository";
import { listCategories } from "../../src/modules/core/services/list-categories";
import { recordExpense } from "../../src/modules/finance/services/record-expense";
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
          "planning",
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
    const actualIncome = await recordIncome({
      ...target,
      clientCommandId: randomUUID(),
      receivingAccountId: account.accountId,
      effectiveDate: "2026-10-02",
      amountMinor: "1000000",
      incomeClass: "earned",
      description: "Restore fixture salary",
    });
    const recurringBody = {
      operation: "definition" as const,
      clientCommandId: randomUUID(),
      obligationId: null,
      expectedVersion: null,
      name: "Restore recurring salary",
      kind: "income" as const,
      reason: null,
      rule: {
        effectiveFrom: "2026-10-01",
        frequency: "monthly" as const,
        intervalCount: 1,
        weekdays: null,
        dayOfMonth: 2,
        shortMonthPolicy: "last_valid_day" as const,
        endsOn: null,
        occurrenceLimit: 3,
        expectedMinor: "1000000",
        currency: "PHP" as const,
        categoryId: null,
        defaultAccountId: null,
        timezone: "Asia/Manila",
      },
      window: { from: "2026-10-01", through: "2026-12-31" },
    };
    const restoredPlan = await recordRecurringCommand({
      ...recurringBody,
      ...target,
    });
    await recordRecurringCommand({
      ...target,
      operation: "link",
      clientCommandId: randomUUID(),
      occurrenceId: restoredPlan.occurrenceIds![0]!,
      expectedVersion: 1,
      actionId: actualIncome.actionId,
      actionRevisionId: actualIncome.actionRevisionId,
      linkedMinor: "200000",
    });
    const otherPlan = await recordRecurringCommand({
      ...recurringBody,
      ...other,
      clientCommandId: randomUUID(),
    });
    const budgetCategory = (
        await listCategories({ ...target, kind: "expense" })
      ).items[0]!,
      otherBudgetCategory = (
        await listCategories({ ...other, kind: "expense" })
      ).items[0]!;
    await recordExpense({
      ...target,
      clientCommandId: randomUUID(),
      fundingAccountId: account.accountId,
      effectiveDate: "2026-10-03",
      purchaseMinor: "10000",
      splits: [{ amountMinor: "10000", categoryId: budgetCategory.categoryId }],
      description: "Restore actual budget-category expense",
    });
    const budgetBody = {
      ...target,
      operation: "save" as const,
      clientCommandId: randomUUID(),
      budgetId: null,
      expectedVersion: null,
      reason: null,
      fields: {
        categoryId: budgetCategory.categoryId,
        startDate: "2026-10-01",
        endDateExclusive: "2026-11-01",
        limitMinor: "20000",
        basis: "net" as const,
        notes: "Restored budget definition",
      },
    };
    const restoredBudget = await recordBudgetCommand(budgetBody);
    await recordBudgetCommand({
      ...budgetBody,
      budgetId: restoredBudget.budgetId,
      expectedVersion: 1,
      clientCommandId: randomUUID(),
      reason: "Confirmed limit correction",
      fields: { ...budgetBody.fields, limitMinor: "25000" },
    });
    const otherBudget = await recordBudgetCommand({
      ...budgetBody,
      ...other,
      clientCommandId: randomUUID(),
      fields: {
        ...budgetBody.fields,
        categoryId: otherBudgetCategory.categoryId,
      },
    });
    const goalBody = {
      ...target,
      operation: "save" as const,
      clientCommandId: randomUUID(),
      goalId: null,
      expectedVersion: null,
      reason: null,
      fields: {
        name: "Restored savings target",
        targetMinor: "30000",
        targetDate: null,
        notes: "Preserved conceptual reservation",
      },
    };
    const restoredGoal = await recordSavingsGoalCommand(goalBody),
      goalView = await getSavingsGoal({
        ...target,
        goalId: restoredGoal.goalId,
      });
    await recordSavingsGoalCommand({
      ...target,
      operation: "reserve",
      clientCommandId: randomUUID(),
      goalId: restoredGoal.goalId,
      expectedVersion: goalView.goal.version,
      expectedFinancialRevision: goalView.financialRevision,
      financialAccountId: account.accountId,
      reservedMinor: "20000",
      reason: "Explicit restore reservation evidence",
    });
    const otherGoal = await recordSavingsGoalCommand({
      ...goalBody,
      ...other,
      clientCommandId: randomUUID(),
      fields: { ...goalBody.fields, name: "Other preserved savings goal" },
    });
    const reminderPreferences = {
      enabled: true,
      timezone: "Asia/Manila",
      quietStart: "22:00",
      quietEnd: "07:00",
      includeDueDate: false,
    };
    await saveNotificationPreferences(target, {
      clientCommandId: randomUUID(),
      expectedVersion: 0,
      preferences: reminderPreferences,
    });
    await saveNotificationPreferences(other, {
      clientCommandId: randomUUID(),
      expectedVersion: 0,
      preferences: { ...reminderPreferences, enabled: false },
    });
    await createPersonalEvent({
      ...target,
      clientCommandId: randomUUID(),
      title: "Restored private notification source",
      temporalKind: "date",
      eventDate: "2027-01-10",
    });
    const stagedImport = (await stageImport(target, {
      clientCommandId: randomUUID(),
      csv: "date,kind,amount_minor,classification,description,reference\n2026-10-03,expense,500,expense,Recovery staged row,restore-h\n",
      assumptions: {
        sourceFormat: "pmp-cash-activity",
        formatVersion: 1,
        mapping: {
          date: "date",
          kind: "kind",
          amountMinor: "amount_minor",
          classification: "classification",
          description: "description",
          reference: "reference",
        },
        dateInterpretation: "YYYY-MM-DD",
        currency: "PHP",
        targetAccountId: account.accountId,
        cutoffStrategy: "after_opening",
        cutoffDate: "2026-09-30",
        earlierOpeningMinor: null,
        earlierOpeningDate: null,
      },
    })) as { batchId: string };
    await prepareWorkspaceExport(target, randomUUID());

    const notificationUrl = new URL(process.env.AUTH_DATABASE_URL!);
    notificationUrl.username = "worker_domain";
    notificationUrl.password = bootstrap.WORKER_DOMAIN_PASSWORD!;
    const notificationWorker = new Pool({
      connectionString: notificationUrl.toString(),
      max: 1,
    });
    try {
      await scanNotificationScope(notificationWorker, target);
    } finally {
      await notificationWorker.end();
    }

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
      assert.equal(
        (
          await restored.query(
            "SELECT count(*)::int n FROM ops.import_row WHERE batch_id=$1 AND state='ready'",
            [stagedImport.batchId],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await restored.query(
            "SELECT count(*)::int n FROM ops.export_run WHERE workspace_id=$1 AND export_kind='workspace_bundle' AND bundle_json IS NOT NULL",
            [target.workspaceId],
          )
        ).rows[0].n,
        1,
      );
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
        assert.equal(report.metrics.closing_cash, "1190000");
        const savingsView = await readSavingsGoals(
          { db: drizzle(domain) } as ScopedTransaction,
          target.workspaceId,
          { goalId: restoredGoal.goalId, includeArchived: true },
        );
        assert.equal(savingsView.items[0]!.version, 2);
        assert.equal(savingsView.items[0]!.reservedMinor, "20000");
        assert.equal(savingsView.items[0]!.minimumMinor, "20000");
        assert.equal(
          (
            await domain.query(
              "SELECT id FROM audit.private_revision WHERE workspace_id=$1 AND (subject_kind='savings_goal' OR subject_kind='goal_reservation')",
              [target.workspaceId],
            )
          ).rowCount,
          3,
        );
        assert.equal(
          (
            await domain.query(
              "SELECT id FROM planning.savings_goal WHERE id=$1",
              [otherGoal.goalId],
            )
          ).rowCount,
          0,
        );
        const budgetView = await readBudgetComparisons(
          { db: drizzle(domain) } as ScopedTransaction,
          target.workspaceId,
          { budgetId: restoredBudget.budgetId },
        );
        assert.equal(budgetView.items[0]!.version, 2);
        assert.equal(budgetView.items[0]!.netMinor, "10000");
        assert.equal(budgetView.items[0]!.remainingMinor, "15000");
        assert.equal(
          (
            await domain.query("SELECT id FROM planning.budget WHERE id=$1", [
              otherBudget.budgetId,
            ])
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await domain.query(
              "SELECT id FROM audit.private_revision WHERE workspace_id=$1 AND subject_kind='budget'",
              [target.workspaceId],
            )
          ).rowCount,
          2,
        );
        const recurringDue = await domain.query(
          "SELECT state,linked_minor::text AS linked,remaining_minor::text AS remaining FROM planning.occurrence_due_v WHERE workspace_id=$1 AND id=$2",
          [target.workspaceId, restoredPlan.occurrenceIds![0]],
        );
        assert.deepEqual(recurringDue.rows[0], {
          state: "linked",
          linked: "200000",
          remaining: "800000",
        });
        assert.equal(
          (
            await domain.query(
              "SELECT id FROM planning.recurring_obligation WHERE id=$1",
              [otherPlan.obligationId],
            )
          ).rowCount,
          0,
        );
        await domain.query("COMMIT");
        const notificationPreference = await restored.query(
          "SELECT enabled,quiet_start,quiet_end,version FROM time.notification_preference WHERE workspace_id=$1",
          [target.workspaceId],
        );
        assert.deepEqual(notificationPreference.rows, [
          {
            enabled: true,
            quiet_start: "22:00",
            quiet_end: "07:00",
            version: 1,
          },
        ]);
        assert.ok(
          (
            await restored.query(
              "SELECT id FROM time.notification_delivery WHERE workspace_id=$1",
              [target.workspaceId],
            )
          ).rowCount! > 0,
        );
      } finally {
        await domain.end();
      }
      // Offline isolated recovery administration revokes restored credentials
      // and cancels possibly accepted jobs before any runtime is reopened.
      await restored.query(
        "DELETE FROM auth.session; DELETE FROM auth.verification; UPDATE ops.email_delivery SET status='cancelled',recipient_ciphertext=decode('','hex'),payload_ciphertext=NULL,updated_at=clock_timestamp() WHERE status IN ('queued','uncertain'); DELETE FROM pgboss.job",
      );
      await restored.query(
        "UPDATE time.notification_delivery SET status='cancelled',last_error_code='restore_review' WHERE status IN('scheduled','failed') AND provider_message_id IS NULL; UPDATE time.notification_delivery SET status='uncertain',last_error_code='restore_review' WHERE status='attempted'",
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
        for (const table of [
          "recurring_obligation",
          "recurrence_version",
          "expected_occurrence",
          "occurrence_actual_link",
          "budget",
          "savings_goal",
          "goal_reservation",
        ])
          assert.equal(
            (
              await restored.query(
                `SELECT id FROM planning.${table} WHERE workspace_id=$1`,
                [target.workspaceId],
              )
            ).rowCount,
            0,
          );
        assert.equal(
          (
            await restored.query("SELECT id FROM planning.budget WHERE id=$1", [
              otherBudget.budgetId,
            ])
          ).rowCount,
          1,
        );
        assert.equal(
          (
            await restored.query(
              "SELECT id FROM planning.recurring_obligation WHERE id=$1",
              [otherPlan.obligationId],
            )
          ).rowCount,
          1,
        );
        assert.equal(
          (
            await restored.query(
              "SELECT id FROM planning.savings_goal WHERE id=$1",
              [otherGoal.goalId],
            )
          ).rowCount,
          1,
        );
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
              "durable H import staging and private portable artifact recovery",
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
            [["core", "finance", "career", "time", "audit", "ops", "planning"]],
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
