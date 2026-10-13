import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
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
import { recordBudgetCommand } from "../../src/modules/planning/services/budgets";
import {
  getBudget,
  listBudgets,
} from "../../src/modules/planning/services/read-budgets";
import { getDashboard } from "../../src/modules/dashboard/services/get-dashboard";
import { getFinancialReport } from "../../src/modules/reporting/services/get-reports";
import { removeNamedFinancialFixture } from "../../tests/integration/helpers/named-financial-fixture";
/** Focused new-query capacity, with real recipe/finalization/RLS protections.
 * No published ledger fixture or user development process is modified. */
async function main() {
  const userId = randomUUID(),
    label = "V2-C budget fixture";
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
      name: "Guarded budget capacity cash",
      accountType: "checking",
      openingCutoffDate: "2024-12-31",
      openingBalanceMinor: "2000000",
    });
    const month = (n: number) =>
      new Date(Date.UTC(2025, n, 1)).toISOString().slice(0, 10);
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
        description: `Synthetic budget capacity actual ${n + 1}`,
      });
    const query = {
        period: "custom" as const,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      before = await getFinancialReport({ ...owner, query });
    assert.equal(before.metrics.net, "400000");
    let first = "";
    const started = performance.now();
    for (let m = 0; m < 20; m++)
      for (const c of cats) {
        const b = await recordBudgetCommand({
          ...owner,
          operation: "save",
          clientCommandId: randomUUID(),
          budgetId: null,
          expectedVersion: null,
          reason: null,
          fields: {
            categoryId: c.categoryId,
            startDate: month(m),
            endDateExclusive: month(m + 1),
            limitMinor: "10000",
            basis: "net",
            notes: "Explicit synthetic monthly limit",
          },
        });
        if (!first) first = b.budgetId;
      }
    const definitionMs = performance.now() - started;
    const counts = await withDomainTransaction(
      owner,
      async (t) =>
        (
          await t.db.execute<{
            budgets: string;
            actions: string;
            classified: string;
          }>(
            sql`SELECT (SELECT count(*)::text FROM planning.budget WHERE workspace_id=${workspaceId}::uuid) budgets,(SELECT count(*)::text FROM finance.financial_action WHERE workspace_id=${workspaceId}::uuid) actions,(SELECT count(*)::text FROM finance.posting WHERE workspace_id=${workspaceId}::uuid AND expense_class='gross') classified`,
          )
        ).rows[0]!,
    );
    assert.deepEqual(counts, {
      budgets: "100",
      actions: "201",
      classified: "1000",
    });
    assert.deepEqual(
      (await getFinancialReport({ ...owner, query })).metrics,
      before.metrics,
    );
    const results: { name: string; p95Ms: number; budgetMs: number }[] = [];
    for (const [name, budgetMs, run] of [
      ["budget_list_100", 800, () => listBudgets({ ...owner!, pageSize: 100 })],
      ["budget_detail", 800, () => getBudget({ ...owner!, budgetId: first })],
      ["dashboard", 2000, () => getDashboard({ ...owner!, query })],
      [
        "financial_reports",
        2000,
        () => getFinancialReport({ ...owner!, query }),
      ],
    ] as const) {
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
      budgets: 100,
      financialActions: 201,
      classifiedPostings: 1000,
      definitionMs: Number(definitionMs.toFixed(2)),
      results,
      financialNonduplication: true,
    };
    await mkdir("test-results/budget-performance", { recursive: true });
    await writeFile(
      "test-results/budget-performance/evidence.json",
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
      message:
        e instanceof Error && !cause
          ? e.message.slice(0, 200)
          : "Budget capacity verification failed",
      causeCode:
        cause && typeof cause === "object" && "code" in cause
          ? cause.code
          : null,
      causeMessage: cause instanceof Error ? cause.message.slice(0, 200) : null,
    }),
  );
  process.exitCode = 1;
});
