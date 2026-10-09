import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  getAuthPool,
  getDomainPool,
  closeRuntimeDatabasePools,
} from "../../src/platform/db/pools";
import type { ScopedTransaction } from "../../src/platform/db/scoped-transaction";
import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import { openFinancialAccountInTransaction } from "../../src/modules/finance/services/open-financial-account";
import { importExistingDebtInTransaction } from "../../src/modules/finance/services/import-existing-debt";
import { getAccountHistoryInTransaction } from "../../src/modules/finance/services/get-account-history";
import {
  listDebtsInTransaction,
  getDebtDetailInTransaction,
} from "../../src/modules/finance/services/read-debts";
import { createJobApplicationInTransaction } from "../../src/modules/career/services/create-job-application";
import { createApplicationEventInTransaction } from "../../src/modules/career/services/create-application-event";
import { listJobApplicationsInTransaction } from "../../src/modules/career/services/list-job-applications";
import { getJobApplicationDetailInTransaction } from "../../src/modules/career/services/get-job-application-detail";
import { listAgendaItemsInTransaction } from "../../src/modules/time/services/list-agenda-items";
import { getDashboardInTransaction } from "../../src/modules/dashboard/services/get-dashboard";
import {
  getFinancialReportInTransaction,
  getCareerReportInTransaction,
} from "../../src/modules/reporting/services/get-reports";
import { seedExpenseHistory } from "../../tests/integration/helpers/large-expense-history";
import { seedPerformanceScheduleHistory } from "../../tests/integration/helpers/performance-schedule-history";
import {
  recordExpenseInTransaction,
  recordExpense,
} from "../../src/modules/finance/services/record-expense";
import { getAccountHistory } from "../../src/modules/finance/services/get-account-history";
import { removeNamedFinancialFixture } from "../../tests/integration/helpers/named-financial-fixture";

let phase = "configuration";
async function main() {
  const scale = Number(process.env.PMP_PERFORMANCE_ACTIONS ?? "50000");
  assert.ok(Number.isInteger(scale) && scale >= 1000 && scale <= 50000);
  const careerCount = Math.min(5000, Math.floor(scale / 10)),
    debtCount = 10;
  let userId = randomUUID(),
    workspaceId: string;
  const resumeId = process.env.PMP_PERFORMANCE_RESUME_WORKSPACE_ID;
  if (resumeId) {
    assert.match(resumeId, /^[a-f0-9-]{36}$/);
    const url = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
    url.pathname = "/personal_management_test";
    const inspect = new Client({ connectionString: url.toString() });
    await inspect.connect();
    try {
      assert.equal(
        (await inspect.query("SELECT current_database() name")).rows[0].name,
        "personal_management_test",
      );
      const root = (
        await inspect.query(
          `SELECT u.id FROM auth."user" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE w.id=$1 AND u.name='C5 performance fixture' AND u.email=u.id::text||'@example.test'`,
          [resumeId],
        )
      ).rows;
      assert.equal(
        root.length,
        1,
        "Resume requires an exact named synthetic test root.",
      );
      userId = root[0].id;
      workspaceId = resumeId;
    } finally {
      await inspect.end();
    }
  } else {
    await getAuthPool().query(
      "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'C5 performance fixture',$2,true)",
      [userId, `${userId}@example.test`],
    );
    ({ workspaceId } = await provisionPersonalWorkspace({
      userId,
      displayName: "C5 performance fixture",
    }));
  }
  const owner = { userId, workspaceId };
  const client = await getDomainPool().connect();
  const loadOwners: Array<{
    userId: string;
    workspaceId: string;
    accountId: string;
  }> = [];
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
      [userId, workspaceId],
    );
    const t = { db: drizzle(client) } as ScopedTransaction;
    const existingAccounts = (
      await client.query(
        "SELECT id FROM finance.financial_account WHERE workspace_id=$1 AND name='Ten-year fixture cash'",
        [workspaceId],
      )
    ).rows;
    assert.ok(existingAccounts.length <= 1);
    const account = existingAccounts.length
      ? { accountId: existingAccounts[0].id as string }
      : await openFinancialAccountInTransaction(t, {
          ...owner,
          clientCommandId: randomUUID(),
          name: "Ten-year fixture cash",
          accountType: "checking",
          openingCutoffDate: "2016-01-01",
          openingBalanceMinor: "20000000000",
        });
    const seedStarted = performance.now();
    async function commitBatch() {
      await client.query("COMMIT");
      transactionOpen = false;
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
        [userId, workspaceId],
      );
    }
    const seeded = (
      await client.query(
        `SELECT count(*)::int n,count(DISTINCT description)::int distinct_n,min(substring(description from '^Synthetic purchase ([0-9]+)$')::int) first,max(substring(description from '^Synthetic purchase ([0-9]+)$')::int) last FROM finance.financial_action WHERE workspace_id=$1 AND description ~ '^Synthetic purchase [0-9]+$'`,
        [workspaceId],
      )
    ).rows[0];
    assert.equal(seeded.n, seeded.distinct_n);
    assert.ok(seeded.n <= scale);
    if (seeded.n) {
      assert.equal(seeded.first, 0);
      assert.equal(seeded.last, seeded.n - 1);
    }
    console.log(
      `Performance fixture resumes at ${seeded.n}/${scale} committed synthetic financial actions.`,
    );
    for (let n = seeded.n; n < scale; n += 100) {
      await seedExpenseHistory(
        t,
        owner,
        account.accountId,
        n,
        Math.min(100, scale - n),
      );
      await commitBatch();
      if (n % 1000 === 900 || n + 100 === scale)
        console.log(
          `Performance fixture: ${Math.min(n + 100, scale)}/${scale} financial actions, ${Math.round((performance.now() - seedStarted) / 1000)} seconds.`,
        );
    }
    let applicationId = "",
      debtId = "";
    const existingApplications = (
      await client.query(
        "SELECT id,company_name FROM career.job_application WHERE workspace_id=$1 ORDER BY company_name",
        [workspaceId],
      )
    ).rows;
    assert.ok(existingApplications.length <= careerCount);
    const applicationIds = new Map(
      existingApplications.map((r) => [r.company_name, r.id]),
    );
    for (let n = 0; n < careerCount; n++) {
      if (applicationIds.has(`Synthetic company ${n}`)) {
        applicationId = applicationIds.get(`Synthetic company ${n}`)!;
        continue;
      }
      const app = await createJobApplicationInTransaction(t, {
        ...owner,
        clientCommandId: randomUUID(),
        companyName: `Synthetic company ${n}`,
        roleTitle: "Synthetic role",
        initialStageEffectiveDate: "2016-01-01",
        initialStage: "applied",
        appliedDate: "2016-01-01",
      });
      applicationId = app.applicationId;
      await createApplicationEventInTransaction(t, {
        ...owner,
        clientCommandId: randomUUID(),
        applicationId,
        eventKind: "interview",
        title: "Synthetic interview",
        temporalKind: "date",
        eventDate: new Date(Date.UTC(2016, 0, 2) + (n % 3900) * 86400000)
          .toISOString()
          .slice(0, 10),
      });
      if (n % 50 === 49) await commitBatch();
    }
    for (let n = 0; n < debtCount; n++) {
      const priorDebt = (
        await client.query(
          "SELECT d.id,v.version_no FROM finance.debt d JOIN finance.debt_schedule_version v ON v.id=d.current_schedule_version_id WHERE d.workspace_id=$1 AND d.name=$2",
          [workspaceId, `Synthetic debt ${n}`],
        )
      ).rows[0];
      if (priorDebt) {
        if (n === 0) debtId = priorDebt.id;
        if (n === 0 && priorDebt.version_no === 1)
          await seedPerformanceScheduleHistory(t, owner, priorDebt.id);
        await commitBatch();
        continue;
      }
      const debt = await importExistingDebtInTransaction(t, {
        ...owner,
        clientCommandId: randomUUID(),
        name: `Synthetic debt ${n}`,
        lenderName: "Synthetic provider",
        debtType: "personal_loan",
        startDate: "2016-01-01",
        openingCutoffDate: "2016-01-01",
        openingLiabilityMinor: "132000",
        openingComponents: [{ kind: "principal", amountMinor: "132000" }],
        scheduleReason: "Synthetic multi-year performance schedule",
        installments: Array.from({ length: 132 }, (_, i) => ({
          dueDate: new Date(Date.UTC(2016, i + 1, 1))
            .toISOString()
            .slice(0, 10),
          contractualMinor: "1000",
          openingSatisfiedMinor: "0",
        })),
      });
      if (n === 0) {
        debtId = debt.debtId;
        await seedPerformanceScheduleHistory(t, owner, debtId);
      }
      await commitBatch();
      console.log(
        `Performance fixture: ${n + 1}/${debtCount} multi-year debt schedules.`,
      );
    }
    // Ordinary building/finalized transitions, real runtime-role RLS and all
    // recipe/integrity constraints construct the synthetic history.
    phase = "financial_command";
    const commandSamplesMs: number[] = [];
    const priorMeasured = (
      await client.query(
        "SELECT count(*)::int n FROM finance.financial_action WHERE workspace_id=$1 AND description='Synthetic measured command'",
        [workspaceId],
      )
    ).rows[0].n;
    for (let n = 0; n < 10; n++) {
      const started = performance.now();
      await recordExpenseInTransaction(t, {
        ...owner,
        clientCommandId: randomUUID(),
        fundingAccountId: account.accountId,
        effectiveDate: "2026-10-09",
        purchaseMinor: "1",
        description: "Synthetic measured command",
        splits: [{ amountMinor: "1" }],
      });
      await commitBatch();
      commandSamplesMs.push(
        Math.round((performance.now() - started) * 100) / 100,
      );
    }
    await mkdir("test-results/performance", { recursive: true });
    await writeFile(
      "test-results/performance/command-samples.json",
      JSON.stringify(
        {
          samplesMs: commandSamplesMs,
          budgetMs: 1000,
          productionCapacityClaim: false,
        },
        null,
        2,
      ),
    );
    console.log(
      `financial_command: local maximum ${Math.max(...commandSamplesMs)} ms (budget 1000 ms)`,
    );
    assert.ok(
      Math.max(...commandSamplesMs) < 1000,
      "financial command exceeds its local 1 second budget",
    );
    const count = (
      await client.query(
        "SELECT count(*)::int AS count FROM finance.posting WHERE workspace_id=$1",
        [workspaceId],
      )
    ).rows[0].count;
    assert.equal(count, scale * 6 + 2 + debtCount * 2 + 20 + priorMeasured * 2);
    const historyCounts = (
      await client.query(
        `SELECT (SELECT count(*)::int FROM career.job_application WHERE workspace_id=$1) applications,(SELECT count(*)::int FROM career.application_event WHERE workspace_id=$1) career_events,(SELECT count(*)::int FROM finance.debt_schedule_version WHERE workspace_id=$1) schedule_versions,(SELECT count(*)::int FROM finance.scheduled_installment WHERE workspace_id=$1) retained_installments`,
        [workspaceId],
      )
    ).rows[0];
    assert.equal(historyCounts.applications, careerCount);
    assert.equal(historyCounts.career_events, careerCount);
    assert.equal(historyCounts.schedule_versions, debtCount + 1);
    assert.equal(historyCounts.retained_installments, (debtCount + 1) * 132);
    await client.query("COMMIT");
    transactionOpen = false;
    for (let n = 0; n < 99; n++) {
      const loadUserId = randomUUID();
      await getAuthPool().query(
        "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'C5 performance fixture',$2,true)",
        [loadUserId, `${loadUserId}@example.test`],
      );
      const provisioned = await provisionPersonalWorkspace({
        userId: loadUserId,
        displayName: "C5 performance fixture",
      });
      const loadOwner = {
        userId: loadUserId,
        workspaceId: provisioned.workspaceId,
      };
      // Register root before account setup so a failure still cleans it.
      loadOwners.push({ ...loadOwner, accountId: "" });
      const loadAccount = await (
        await import("../../src/modules/finance/services/open-financial-account")
      ).openFinancialAccount({
        ...loadOwner,
        clientCommandId: randomUUID(),
        name: "Synthetic load cash",
        accountType: "checking",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "200000",
      });
      loadOwners.at(-1)!.accountId = loadAccount.accountId;
    }
    const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
    adminUrl.pathname = "/personal_management_test";
    const maintenance = new Client({ connectionString: adminUrl.toString() });
    await maintenance.connect();
    try {
      await maintenance.query(
        "ANALYZE finance.posting,finance.journal,finance.action_revision,finance.financial_action,finance.debt,finance.scheduled_installment,finance.debt_schedule_version,career.job_application,career.application_event,career.application_stage_history,audit.private_activity,core.command_receipt",
      );
    } finally {
      await maintenance.end();
    }
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    await client.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
      [userId, workspaceId],
    );
    const measurements: Record<string, { samplesMs: number[]; p95Ms: number }> =
      {
        financial_command: {
          samplesMs: commandSamplesMs,
          p95Ms: Math.max(...commandSamplesMs),
        },
      };
    const cases: [string, () => Promise<unknown>, number][] = [
      [
        "account_history",
        () =>
          getAccountHistoryInTransaction(t, {
            ...owner,
            accountId: account.accountId,
            pageSize: 50,
          }),
        800,
      ],
      ["debts", () => listDebtsInTransaction(t, owner), 800],
      [
        "debt_schedule",
        () => getDebtDetailInTransaction(t, { ...owner, debtId }),
        800,
      ],
      [
        "career_list",
        () => listJobApplicationsInTransaction(t, { ...owner, pageSize: 50 }),
        800,
      ],
      [
        "career_history",
        () =>
          getJobApplicationDetailInTransaction(t, { ...owner, applicationId }),
        800,
      ],
      [
        "agenda",
        () =>
          listAgendaItemsInTransaction(t, {
            ...owner,
            startDate: "2026-10-01",
            endDate: "2026-10-31",
            pageSize: 50,
          }),
        800,
      ],
      ["dashboard", () => getDashboardInTransaction(t, owner), 2000],
      [
        "financial_report",
        () =>
          getFinancialReportInTransaction(t, {
            workspaceId,
            query: { period: "year", anchorDate: "2026-10-01" },
          }),
        2000,
      ],
      [
        "career_report",
        () =>
          getCareerReportInTransaction(t, {
            workspaceId,
            query: { period: "year", anchorDate: "2026-10-01" },
          }),
        2000,
      ],
    ];
    for (const [name, run, threshold] of cases) {
      phase = name;
      const samplesMs: number[] = [];
      await run();
      for (let n = 0; n < 10; n++) {
        const start = performance.now();
        await run();
        samplesMs.push(Math.round((performance.now() - start) * 100) / 100);
      }
      const sorted = [...samplesMs].sort((a, b) => a - b),
        p95Ms = sorted[sorted.length - 1]!;
      measurements[name] = { samplesMs, p95Ms };
      console.log(`${name}: local p95 ${p95Ms} ms (budget ${threshold} ms)`);
      assert.ok(
        p95Ms < threshold,
        `${name} exceeds its documented local budget`,
      );
    }
    const concurrentReadMs: number[] = [],
      concurrentCommandMs: number[] = [];
    const active = [
      { ...owner, accountId: account.accountId },
      ...loadOwners.slice(0, 19),
    ];
    for (let batch = 0; batch < 5; batch++) {
      phase = "20_active_reads";
      await Promise.all(
        active.map(async (loadOwner) => {
          const start = performance.now();
          await getAccountHistory({ ...loadOwner, pageSize: 50 });
          concurrentReadMs.push(performance.now() - start);
        }),
      );
      // Different owners exercise the pool at 20 active callers; main large
      // workspace commands were separately measured above with commit.
      phase = "20_active_commands";
      await Promise.all(
        loadOwners.slice(0, 20).map(async (loadOwner) => {
          const start = performance.now();
          await recordExpense({
            userId: loadOwner.userId,
            workspaceId: loadOwner.workspaceId,
            clientCommandId: randomUUID(),
            fundingAccountId: loadOwner.accountId,
            effectiveDate: "2026-10-09",
            purchaseMinor: "1",
            description: "Synthetic concurrent command",
            splits: [{ amountMinor: "1" }],
          });
          concurrentCommandMs.push(performance.now() - start);
        }),
      );
    }
    for (const [name, samples, threshold] of [
      ["20_active_reads", concurrentReadMs, 800],
      ["20_active_commands", concurrentCommandMs, 1000],
    ] as const) {
      phase = name;
      const sorted = [...samples].sort((a, b) => a - b),
        p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
      measurements[name] = { samplesMs: [...samples], p95Ms };
      console.log(`${name}: local p95 ${p95Ms.toFixed(2)} ms`);
      assert.ok(p95Ms < threshold, `${name} exceeds local budget`);
    }
    const plans = (
      await client.query(
        "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id,primary_effective_date FROM finance.action_revision WHERE workspace_id=$1 ORDER BY primary_effective_date DESC,id DESC LIMIT 50",
        [workspaceId],
      )
    ).rows;
    await mkdir("test-results/performance", { recursive: true });
    await writeFile(
      "test-results/performance/evidence.json",
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          financialActions: scale,
          measuredAdditionalActions: 10 + priorMeasured,
          resumedSeedActions: seeded.n,
          users: 100,
          concurrentlyActive: 20,
          postings: count,
          applications: careerCount,
          careerEvents: careerCount,
          debts: debtCount,
          installments: debtCount * 132,
          scheduleVersions: historyCounts.schedule_versions,
          retainedInstallments: historyCounts.retained_installments,
          years: 10,
          seedSeconds: Math.round((performance.now() - seedStarted) / 1000),
          measurements,
          plans,
          productionCapacityClaim: false,
        },
        null,
        2,
      ),
    );
  } finally {
    if (transactionOpen) await client.query("ROLLBACK");
    client.release();
    for (const loadOwner of loadOwners)
      await removeNamedFinancialFixture(loadOwner, "C5 performance fixture");
    if (process.env.PMP_PERFORMANCE_RETAIN_FIXTURE !== "true")
      await removeNamedFinancialFixture(owner, "C5 performance fixture");
    await closeRuntimeDatabasePools();
  }
}
void main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  console.error(
    JSON.stringify({
      event: "performance_failed",
      phase,
      ...(code && /^[A-Z0-9]{5}$/.test(code) ? { code } : {}),
      ...((error as { name?: string }).name === "ZodError"
        ? { cause: "invalid_fixture_input" }
        : {}),
    }),
  );
  console.error(
    "Multi-year performance verification failed; no credentials or private record content logged.",
  );
  process.exitCode = 1;
});
