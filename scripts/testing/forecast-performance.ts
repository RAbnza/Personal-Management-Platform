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
import { listCategories } from "../../src/modules/core/services/list-categories";
import { openFinancialAccount } from "../../src/modules/finance/services/open-financial-account";
import { recordExpense } from "../../src/modules/finance/services/record-expense";
import { recordRecurringCommand } from "../../src/modules/planning/services/recurring";
import { getForecast } from "../../src/modules/planning/services/get-forecast";
import { addCalendarDays } from "../../src/modules/reporting/domain/period";
import { removeNamedFinancialFixture } from "../../tests/integration/helpers/named-financial-fixture";
const label = "V2-E forecast fixture";
let phase = "setup";
async function statistics(o: { userId: string; workspaceId: string }) {
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
      "ANALYZE core.workspace,core.user_profile,core.command_receipt,finance.posting,finance.journal,finance.action_revision,finance.financial_action,finance.financial_account,finance.ledger_account,planning.recurring_obligation,planning.recurrence_version,planning.expected_occurrence,planning.occurrence_actual_link,planning.savings_goal,planning.goal_reservation",
    );
  } finally {
    await c.end();
  }
}
async function main() {
  const userId = randomUUID();
  let owner: { userId: string; workspaceId: string } | null = null;
  await getAuthPool().query(
    'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
    [userId, label, `${userId}@example.test`],
  );
  try {
    const { workspaceId } = await provisionPersonalWorkspace({
      userId,
      displayName: label,
    });
    owner = { userId, workspaceId };
    const account = await openFinancialAccount({
        ...owner,
        clientCommandId: randomUUID(),
        name: "Guarded forecast cash",
        accountType: "checking",
        openingCutoffDate: "2024-12-31",
        openingBalanceMinor: "2000000",
      }),
      cats = (await listCategories({ ...owner, kind: "expense" })).items.slice(
        0,
        5,
      );
    assert.equal(cats.length, 5);
    phase = "financial fixture";
    for (let n = 0; n < 200; n++)
      await recordExpense({
        ...owner,
        clientCommandId: randomUUID(),
        fundingAccountId: account.accountId,
        effectiveDate: new Date(Date.UTC(2025, n % 20, 10))
          .toISOString()
          .slice(0, 10),
        purchaseMinor: "5000",
        splits: cats.map((c) => ({
          categoryId: c.categoryId,
          amountMinor: "1000",
        })),
        description: `Synthetic forecast actual ${n + 1}`,
      });
    await statistics(owner);
    phase = "recurrence fixture";
    const base = await getForecast(owner),
      start = addCalendarDays(base.today, 1),
      end = addCalendarDays(base.today, 366),
      began = performance.now();
    for (let n = 0; n < 100; n++)
      await recordRecurringCommand({
        ...owner,
        operation: "definition",
        clientCommandId: randomUUID(),
        obligationId: null,
        expectedVersion: null,
        name: `Capacity expectation ${n + 1}`,
        kind: n % 2 ? "income" : "bill",
        reason: null,
        rule: {
          effectiveFrom: start,
          frequency: "daily",
          intervalCount: 30,
          weekdays: null,
          dayOfMonth: null,
          shortMonthPolicy: null,
          endsOn: end,
          occurrenceLimit: null,
          expectedMinor: "1000",
          currency: "PHP",
          categoryId: null,
          defaultAccountId: account.accountId,
          timezone: base.timezone,
        },
        window: { from: start, through: start },
      });
    const creationMs = performance.now() - began;
    await statistics(owner);
    phase = "financial nonduplication";
    const counts = await withDomainTransaction(
      owner,
      async (t) =>
        (
          await t.db.execute(
            sql`SELECT (SELECT count(*)::text FROM finance.financial_action) actions,(SELECT count(*)::text FROM finance.posting WHERE expense_class='gross') classified,(SELECT count(*)::text FROM planning.recurring_obligation) definitions,(SELECT count(*)::text FROM planning.expected_occurrence) materialized,(SELECT count(*)::text FROM core.command_receipt) receipts,(SELECT count(*)::text FROM audit.private_revision) audits,(SELECT financial_revision::text FROM core.workspace WHERE id=${workspaceId}::uuid) revision`,
          )
        ).rows[0]!,
    );
    assert.equal(counts.actions, "201");
    assert.equal(counts.classified, "1000");
    assert.equal(counts.definitions, "100");
    assert.equal(counts.materialized, "100");
    const full = await getForecast({ ...owner, scenario: { endDate: end } });
    assert.equal(full.sources.length, 1300);
    assert.equal(full.totals.openingActualMinor, "1000000");
    assert.equal(full.totals.expectedInflowsMinor, "650000");
    assert.equal(full.totals.expectedOutflowsMinor, "650000");
    assert.equal(full.totals.closingProjectedMinor, "1000000");
    const results = [];
    for (const [name, scenario] of [
      ["forecast_30_days", {}],
      ["forecast_366_days", { endDate: end }],
    ] as const) {
      phase = name;
      await getForecast({ ...owner, scenario });
      const times = [];
      for (let n = 0; n < 7; n++) {
        const began = performance.now();
        await getForecast({ ...owner, scenario });
        times.push(performance.now() - began);
      }
      times.sort((a, b) => a - b);
      const p95 = times[6]!;
      assert.ok(p95 < 800, `${name} p95 ${p95.toFixed(2)}ms exceeds 800ms`);
      results.push({ name, p95Ms: Number(p95.toFixed(2)), budgetMs: 800 });
    }
    const after = await withDomainTransaction(
      owner,
      async (t) =>
        (
          await t.db.execute(
            sql`SELECT (SELECT count(*)::text FROM finance.financial_action) actions,(SELECT count(*)::text FROM finance.posting WHERE expense_class='gross') classified,(SELECT count(*)::text FROM planning.recurring_obligation) definitions,(SELECT count(*)::text FROM planning.expected_occurrence) materialized,(SELECT count(*)::text FROM core.command_receipt) receipts,(SELECT count(*)::text FROM audit.private_revision) audits,(SELECT financial_revision::text FROM core.workspace WHERE id=${workspaceId}::uuid) revision`,
          )
        ).rows[0]!,
    );
    assert.deepEqual(after, counts);
    const evidence = {
      completedAt: new Date().toISOString(),
      definitions: 100,
      materializedOccurrences: 100,
      derivedAndRecordedCandidates: 1300,
      financialActions: 201,
      classifiedPostings: 1000,
      creationMs: Number(creationMs.toFixed(2)),
      results,
      financialAndPlanningNonmutation: true,
    };
    await mkdir("test-results/forecast-performance", { recursive: true });
    await writeFile(
      "test-results/forecast-performance/evidence.json",
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
  const cause = e instanceof Error ? e.cause : undefined;
  console.error(
    JSON.stringify({
      phase,
      message:
        e instanceof Error && !cause
          ? e.message.slice(0, 200)
          : "Forecast capacity verification failed",
      causeCode:
        cause && typeof cause === "object" && "code" in cause
          ? cause.code
          : null,
      causeMessage: cause instanceof Error ? cause.message.slice(0, 200) : null,
    }),
  );
  process.exitCode = 1;
});
