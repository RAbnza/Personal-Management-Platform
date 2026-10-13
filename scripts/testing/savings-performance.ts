import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { withDomainTransaction } from "../../src/platform/db";
import {
  getAuthPool,
  closeRuntimeDatabasePools,
} from "../../src/platform/db/pools";
import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import { listCategories } from "../../src/modules/core/services/list-categories";
import { openFinancialAccount } from "../../src/modules/finance/services/open-financial-account";
import { recordExpense } from "../../src/modules/finance/services/record-expense";
import { recordSavingsGoalCommand } from "../../src/modules/planning/services/savings-goals";
import {
  getSavingsGoal,
  listSavingsGoals,
} from "../../src/modules/planning/services/read-savings-goals";
import { getDashboard } from "../../src/modules/dashboard/services/get-dashboard";
import { getFinancialReport } from "../../src/modules/reporting/services/get-reports";
import { removeNamedFinancialFixture } from "../../tests/integration/helpers/named-financial-fixture";
/** Focused new-query capacity, with real recipe/finalization/RLS protections.
 * No published ledger fixture or user development process is modified. */
let phase = "setup";
async function refreshFixtureStatistics(owner: {
  userId: string;
  workspaceId: string;
}) {
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  url.pathname = "/personal_management_test";
  const maintenance = new Client({ connectionString: url.toString() });
  await maintenance.connect();
  try {
    assert.equal(
      (await maintenance.query("SELECT current_database() name")).rows[0].name,
      "personal_management_test",
    );
    assert.equal(
      (
        await maintenance.query(
          'SELECT 1 FROM auth."user" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE u.id=$1 AND w.id=$2 AND u.name=$3 AND u.email=$4',
          [
            owner.userId,
            owner.workspaceId,
            "V2-D savings fixture",
            `${owner.userId}@example.test`,
          ],
        )
      ).rowCount,
      1,
    );
    // Match the established large-fixture benchmark: refresh planner statistics
    // after guarded synthetic seeding, without changing evidence or timeouts.
    await maintenance.query(
      "ANALYZE finance.posting,finance.journal,finance.action_revision,finance.financial_action,finance.ledger_account,finance.financial_account,core.workspace,core.user_profile,core.category,core.command_receipt,audit.private_revision,planning.savings_goal,planning.goal_reservation",
    );
  } finally {
    await maintenance.end();
  }
}
async function main() {
  const userId = randomUUID(),
    label = "V2-D savings fixture";
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
    const cats = (
      await listCategories({ ...owner, kind: "expense" })
    ).items.slice(0, 5);
    assert.equal(cats.length, 5);
    const account = await openFinancialAccount({
      ...owner,
      clientCommandId: randomUUID(),
      name: "Guarded savings capacity cash",
      accountType: "checking",
      openingCutoffDate: "2024-12-31",
      openingBalanceMinor: "2000000",
    });
    const month = (n: number) =>
      new Date(Date.UTC(2025, n, 1)).toISOString().slice(0, 10);
    phase = "recognized financial fixture";
    for (let n = 0; n < 200; n++)
      await recordExpense({
        ...owner,
        clientCommandId: randomUUID(),
        fundingAccountId: account.accountId,
        effectiveDate: month(n % 20).slice(0, 8) + "10",
        purchaseMinor: "5000",
        splits: cats.map((c) => ({
          amountMinor: "1000",
          categoryId: c.categoryId,
        })),
        description: `Synthetic savings capacity actual ${n + 1}`,
      });
    const query = {
      period: "custom" as const,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    phase = "financial fixture statistics";
    await refreshFixtureStatistics(owner);
    phase = "financial baseline before goals";
    const before = await getFinancialReport({ ...owner, query });
    assert.equal(before.metrics.net, "400000");
    let first = "";
    const started = performance.now();
    phase = "supported goal reservations";
    for (let n = 0; n < 100; n++) {
      const g = await recordSavingsGoalCommand({
        ...owner,
        operation: "save",
        clientCommandId: randomUUID(),
        goalId: null,
        expectedVersion: null,
        reason: null,
        fields: {
          name: "Capacity savings goal " + (n + 1),
          targetMinor: "10000",
          targetDate: null,
          notes: "Explicit conceptual target",
        },
      });
      await recordSavingsGoalCommand({
        ...owner,
        operation: "reserve",
        clientCommandId: randomUUID(),
        goalId: g.goalId,
        expectedVersion: 1,
        expectedFinancialRevision: g.financialRevision,
        financialAccountId: account.accountId,
        reservedMinor: "4000",
        reason: "Supported real cash reservation",
      });
      if (!first) first = g.goalId;
    }
    const definitionMs = performance.now() - started;
    phase = "goal fixture statistics";
    await refreshFixtureStatistics(owner);
    phase = "financial nonduplication";
    const counts = await withDomainTransaction(
      owner,
      async (t) =>
        (
          await t.db.execute<{
            goals: string;
            reservations: string;
            actions: string;
            classified: string;
          }>(
            sql`SELECT (SELECT count(*)::text FROM planning.savings_goal WHERE workspace_id=${workspaceId}::uuid) goals,(SELECT count(*)::text FROM planning.goal_reservation WHERE workspace_id=${workspaceId}::uuid) reservations,(SELECT count(*)::text FROM finance.financial_action WHERE workspace_id=${workspaceId}::uuid) actions,(SELECT count(*)::text FROM finance.posting WHERE workspace_id=${workspaceId}::uuid AND expense_class='gross') classified`,
          )
        ).rows[0]!,
    );
    assert.deepEqual(counts, {
      goals: "100",
      reservations: "100",
      actions: "201",
      classified: "1000",
    });
    assert.deepEqual(
      (await getFinancialReport({ ...owner, query })).metrics,
      before.metrics,
    );
    assert.equal(
      (await listSavingsGoals({ ...owner, pageSize: 100 })).summary
        .reservedMinor,
      "400000",
    );
    const results: { name: string; p95Ms: number; budgetMs: number }[] = [];
    for (const [name, budgetMs, run] of [
      [
        "savings_list_100",
        800,
        () => listSavingsGoals({ ...owner!, pageSize: 100 }),
      ],
      [
        "savings_detail",
        800,
        () => getSavingsGoal({ ...owner!, goalId: first }),
      ],
      ["dashboard", 2000, () => getDashboard({ ...owner!, query })],
      [
        "financial_reports",
        2000,
        () => getFinancialReport({ ...owner!, query }),
      ],
    ] as const) {
      phase = name;
      await run();
      const times = [];
      for (let n = 0; n < 7; n++) {
        const start = performance.now();
        await run();
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
      assert.ok(
        p95 < budgetMs,
        `${name} p95 ${p95.toFixed(2)}ms exceeds ${budgetMs}ms`,
      );
      results.push({ name, p95Ms: Number(p95.toFixed(2)), budgetMs });
    }
    const evidence = {
      completedAt: new Date().toISOString(),
      goals: 100,
      reservations: 100,
      financialActions: 201,
      classifiedPostings: 1000,
      definitionMs: Number(definitionMs.toFixed(2)),
      results,
      financialNonduplication: true,
    };
    await mkdir("test-results/savings-performance", { recursive: true });
    await writeFile(
      "test-results/savings-performance/evidence.json",
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
      queryPrefix:
        e &&
        typeof e === "object" &&
        "query" in e &&
        typeof e.query === "string"
          ? e.query.replace(/\s+/g, " ").slice(0, 100)
          : null,
      message:
        e instanceof Error && !cause
          ? e.message.slice(0, 200)
          : "Savings capacity verification failed",
      causeCode:
        cause && typeof cause === "object" && "code" in cause
          ? cause.code
          : null,
      causeMessage: cause instanceof Error ? cause.message.slice(0, 200) : null,
    }),
  );
  process.exitCode = 1;
});
