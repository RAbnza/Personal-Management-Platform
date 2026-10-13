import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import {
  getAuthPool,
  closeRuntimeDatabasePools,
} from "../../src/platform/db/pools";
import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import { recordRecurringCommand } from "../../src/modules/planning/services/recurring";
import {
  getRecurringObligation,
  getRecurringOccurrence,
} from "../../src/modules/planning/services/read-recurring";
import { listAgendaItems } from "../../src/modules/time/services/list-agenda-items";
import { getDashboard } from "../../src/modules/dashboard/services/get-dashboard";
import { getFinancialReport } from "../../src/modules/reporting/services/get-reports";
import { removeNamedFinancialFixture } from "../../tests/integration/helpers/named-financial-fixture";

/** Focused incremental capacity acceptance. Full posted-ledger capacity was
 * accepted in A6; this adds substantial planned-only source volume with all
 * ordinary ownership, audit, receipt and reminder guards enabled. */
async function main() {
  const userId = randomUUID(),
    label = "V2-B recurring fixture";
  await getAuthPool().query(
    'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
    [userId, label, `${userId}@example.test`],
  );
  let owner: { userId: string; workspaceId: string } | null = null;
  try {
    const { workspaceId } = await provisionPersonalWorkspace({
      userId,
      displayName: label,
    });
    owner = { userId, workspaceId };
    const started = performance.now();
    let firstPlan: string | null = null,
      firstOccurrence: string | null = null;
    for (let n = 0; n < 3; n += 1) {
      const result = await recordRecurringCommand({
        ...owner,
        operation: "definition",
        clientCommandId: randomUUID(),
        obligationId: null,
        expectedVersion: null,
        name: `Capacity recurring plan ${n + 1}`,
        kind: n === 0 ? "income" : "bill",
        reason: null,
        rule: {
          effectiveFrom: "2026-01-01",
          frequency: "daily",
          intervalCount: 1,
          weekdays: null,
          dayOfMonth: null,
          shortMonthPolicy: null,
          endsOn: null,
          occurrenceLimit: null,
          expectedMinor: "10000",
          currency: "PHP",
          categoryId: null,
          defaultAccountId: null,
          timezone: "Asia/Manila",
        },
        window: { from: "2026-01-01", through: "2026-12-31" },
      });
      assert.equal(result.occurrenceIds!.length, 365);
      firstPlan ??= result.obligationId;
      firstOccurrence ??= result.occurrenceIds![0]!;
    }
    const generationMs = performance.now() - started;
    const query = {
      period: "custom" as const,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    const reads: [string, number, () => Promise<unknown>][] = [
      [
        "definition",
        800,
        () => getRecurringObligation({ ...owner!, obligationId: firstPlan! }),
      ],
      [
        "occurrence",
        800,
        () =>
          getRecurringOccurrence({ ...owner!, occurrenceId: firstOccurrence! }),
      ],
      [
        "agenda",
        800,
        () =>
          listAgendaItems({
            ...owner!,
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            pageSize: 100,
          }),
      ],
      ["dashboard", 2000, () => getDashboard({ ...owner!, query })],
      [
        "financial_report",
        2000,
        () => getFinancialReport({ ...owner!, query }),
      ],
    ];
    const results = [];
    for (const [name, budget, run] of reads) {
      await run();
      const times = [];
      for (let n = 0; n < 7; n += 1) {
        const start = performance.now();
        await run();
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
      assert.ok(
        p95 < budget,
        `${name} p95 ${p95.toFixed(2)}ms exceeds ${budget}ms`,
      );
      results.push({ name, p95Ms: Number(p95.toFixed(2)), budgetMs: budget });
    }
    const report = await getFinancialReport({ ...owner, query });
    assert.equal(report.metrics.gross, "0");
    assert.equal(report.metrics.income, "0");
    await mkdir("test-results/recurring-performance", { recursive: true });
    await writeFile(
      "test-results/recurring-performance/evidence.json",
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          plannedOccurrences: 1095,
          generationMs: Number(generationMs.toFixed(2)),
          results,
          financialNonduplication: true,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        plannedOccurrences: 1095,
        generationMs: Number(generationMs.toFixed(2)),
        results,
        financialNonduplication: true,
      }),
    );
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
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Recurring capacity verification failed",
  );
  process.exitCode = 1;
});
