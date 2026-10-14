import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "../../src/platform/db";
import {
  getAuthPool,
  closeRuntimeDatabasePools,
} from "../../src/platform/db/pools";
import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import { createJobApplication } from "../../src/modules/career/services/create-job-application";
import { transitionJobApplicationStage } from "../../src/modules/career/services/transition-job-application-stage";
import { recordCareerObservation } from "../../src/modules/career/services/record-career-observation";
import { getCareerReport } from "../../src/modules/reporting/services/get-reports";
import { getDashboard } from "../../src/modules/dashboard/services/get-dashboard";
import { readReportContext } from "../../src/modules/reporting/repositories/report-context-repository";
import { openFinancialAccount } from "../../src/modules/finance/services/open-financial-account";
import { addCalendarDays } from "../../src/modules/reporting/domain/period";
import { removeNamedFinancialFixture } from "../../tests/integration/helpers/named-financial-fixture";
const label = "V2-F career analytics fixture";
type Owner = { userId: string; workspaceId: string };
let phase = "setup";
async function counts(o: Owner) {
  return withDomainTransaction(
    o,
    async (t) =>
      (
        await t.db.execute(sql`SELECT
    (SELECT count(*)::text FROM career.job_application) applications,
    (SELECT count(*)::text FROM career.application_stage_history) history,
    (SELECT count(*)::text FROM career.application_event) events,
    (SELECT count(*)::text FROM finance.financial_action) actions,
    (SELECT count(*)::text FROM finance.posting) postings,
    (SELECT count(*)::text FROM core.command_receipt) receipts,
    (SELECT count(*)::text FROM audit.private_revision) audits,
    (SELECT financial_revision::text FROM core.workspace WHERE id=${o.workspaceId}::uuid) revision,
    (SELECT COALESCE(sum(p.amount_minor),0)::text FROM finance.posting p JOIN finance.ledger_account l ON l.id=p.ledger_account_id AND l.workspace_id=p.workspace_id WHERE l.kind='cash_asset') cash`)
      ).rows,
    { readOnlySnapshot: true },
  );
}
async function statistics(o: Owner) {
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  url.pathname = "/personal_management_test";
  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  try {
    assert.equal(
      (await c.query("SELECT current_database() name")).rows[0].name,
      "personal_management_test",
    );
    assert.equal(
      (
        await c.query(
          'SELECT 1 FROM auth."user" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE u.id=$1 AND w.id=$2 AND u.name=$3 AND u.email=$4',
          [o.userId, o.workspaceId, label, `${o.userId}@example.test`],
        )
      ).rowCount,
      1,
    );
    await c.query(
      "ANALYZE core.workspace,core.user_profile,core.command_receipt,career.job_application,career.application_stage_history,career.application_event,finance.financial_account,finance.ledger_account,finance.financial_action,finance.action_revision,finance.journal,finance.posting",
    );
  } finally {
    await c.end();
  }
}
async function main() {
  const userId = randomUUID();
  let owner: Owner | null = null;
  await getAuthPool().query(
    'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
    [userId, label, `${userId}@example.test`],
  );
  try {
    const w = await provisionPersonalWorkspace({ userId, displayName: label });
    owner = { userId, workspaceId: w.workspaceId };
    const o = owner;
    const context = await withDomainTransaction(
      o,
      (t) => readReportContext(t, o.workspaceId),
      { readOnlySnapshot: true },
    );
    await openFinancialAccount({
      ...o,
      clientCommandId: randomUUID(),
      name: "Career capacity cash baseline",
      accountType: "checking",
      openingCutoffDate: addCalendarDays(context.today, -60),
      openingBalanceMinor: "100000",
    });
    const financialBefore = await counts(o);
    assert.equal(financialBefore[0]!.cash, "100000");
    phase = "seed";
    const began = performance.now();
    for (let n = 0; n < 1000; n++) {
      const appliedDate = addCalendarDays(context.today, n % 2 ? -40 : -10);
      const a = await createJobApplication({
        ...o,
        clientCommandId: randomUUID(),
        companyName: `Analytics attempt ${n}`,
        roleTitle: "Engineer",
        sourceName: `Source ${n % 10}`,
        initialStage: "applied",
        initialStageEffectiveDate: appliedDate,
        appliedDate,
      });
      let version: number = a.version;
      if (n % 4 === 0)
        version = (
          await transitionJobApplicationStage({
            ...o,
            applicationId: a.applicationId,
            clientCommandId: randomUUID(),
            expectedVersion: version,
            stage: "interview",
            effectiveDate: addCalendarDays(appliedDate, 2),
          })
        ).version;
      if (n % 3 === 0)
        await recordCareerObservation({
          ...o,
          applicationId: a.applicationId,
          body: {
            clientCommandId: randomUUID(),
            expectedApplicationVersion: version,
            kind: "response",
            title: "Recorded reply",
            date: addCalendarDays(appliedDate, 1),
          },
        });
      if (n % 5 === 0)
        await recordCareerObservation({
          ...o,
          applicationId: a.applicationId,
          body: {
            clientCommandId: randomUUID(),
            expectedApplicationVersion: version,
            kind: "offer",
            title: "Recorded offer",
            date: addCalendarDays(appliedDate, 3),
          },
        });
    }
    const creationMs = performance.now() - began;
    phase = "statistics";
    await statistics(o);
    const before = await counts(o);
    for (const key of ["actions", "postings", "revision", "cash"])
      assert.equal(before[0]![key], financialBefore[0]![key]);
    assert.equal(before[0]!.applications, "1000");
    assert.equal(before[0]!.history, "1250");
    assert.equal(before[0]!.events, "534");
    const query = {
      period: "custom" as const,
      startDate: addCalendarDays(context.today, -28),
      endDate: context.today,
      asOfDate: context.today,
      compare: "previous" as const,
      cohortInterval: "week" as const,
    };
    const r = await getCareerReport({ ...o, query });
    assert.equal(r.summary.submitted, 500);
    assert.equal(r.summary.responded, 167);
    assert.equal(r.summary.interviewed, 250);
    assert.equal(r.summary.offered, 100);
    assert.equal(r.comparison!.summary.submitted, 500);
    assert.equal(r.comparison!.summary.responded, 167);
    assert.equal(r.comparison!.summary.offered, 100);
    assert.equal(r.summary.responseTiming.medianDays, 1);
    phase = "read-benchmarks";
    const operations = [
      {
        name: "career_cohort_comparison",
        budgetMs: 800,
        run: () => getCareerReport({ ...o, query }),
      },
      {
        name: "career_366_days",
        budgetMs: 800,
        run: () =>
          getCareerReport({
            ...o,
            query: {
              period: "custom",
              startDate: addCalendarDays(context.today, -365),
              endDate: context.today,
              cohortInterval: "month",
            },
          }),
      },
      { name: "dashboard", budgetMs: 2000, run: () => getDashboard(o) },
    ];
    const results = [];
    for (const op of operations) {
      await op.run();
      const times = [];
      for (let n = 0; n < 7; n++) {
        const start = performance.now();
        await op.run();
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const p95 = times[6]!;
      assert.ok(
        p95 < op.budgetMs,
        `${op.name} p95 ${p95.toFixed(2)}ms exceeds ${op.budgetMs}ms`,
      );
      results.push({
        name: op.name,
        p95Ms: Number(p95.toFixed(2)),
        budgetMs: op.budgetMs,
      });
    }
    assert.deepEqual(await counts(o), before);
    const evidence = {
      completedAt: new Date().toISOString(),
      applications: 1000,
      stageObservations: 1250,
      events: 534,
      creationMs: Number(creationMs.toFixed(2)),
      results,
      financialAndCareerNonmutation: true,
    };
    await mkdir("out", { recursive: true });
    await writeFile(
      "out/career-analytics-performance.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } finally {
    if (owner) await removeNamedFinancialFixture(owner, label);
    else
      await getAuthPool().query(
        'DELETE FROM auth."user" WHERE id=$1 AND name=$2 AND email=$3',
        [userId, label, `${userId}@example.test`],
      );
    await closeRuntimeDatabasePools();
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      phase,
      message:
        e instanceof Error && !e.cause
          ? e.message.slice(0, 200)
          : "Career capacity verification failed",
      causeCode: e?.cause?.code ?? null,
    }),
  );
  process.exitCode = 1;
});
