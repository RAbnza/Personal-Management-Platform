import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "../../src/platform/db";
import {
  getAuthPool,
  closeRuntimeDatabasePools,
} from "../../src/platform/db/pools";
import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import { createPersonalEvent } from "../../src/modules/time/services/create-personal-event";
import {
  saveNotificationPreferences,
  getNotificationSettings,
} from "../../src/modules/time/services/notification-preferences";
import { scanNotificationScope } from "../../src/platform/email/notification-delivery";
import { openFinancialAccount } from "../../src/modules/finance/services/open-financial-account";
import { removeNamedFinancialFixture } from "../../tests/integration/helpers/named-financial-fixture";
import { addCalendarDays } from "../../src/modules/reporting/domain/period";
const label = "V2-G notification fixture";
let phase = "setup";
async function main() {
  const userId = randomUUID();
  await getAuthPool().query(
    'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
    [userId, label, `${userId}@example.test`],
  );
  const { workspaceId } = await provisionPersonalWorkspace({
    userId,
    displayName: label,
  });
  const actor = { userId, workspaceId };
  const secrets = parseEnv(await readFile(".env.bootstrap", "utf8"));
  const url = new URL(process.env.AUTH_DATABASE_URL!);
  url.username = "worker_domain";
  url.password = secrets.WORKER_DOMAIN_PASSWORD!;
  const worker = new Pool({ connectionString: url.toString(), max: 2 });
  const counts = () =>
    withDomainTransaction(
      actor,
      async (tx) =>
        (
          await tx.db.execute(
            sql`SELECT (SELECT count(*)::text FROM finance.financial_action) actions,(SELECT count(*)::text FROM finance.posting) postings,(SELECT COALESCE(sum(amount_minor),0)::text FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE l.kind='cash_asset') cash,(SELECT financial_revision::text FROM core.workspace) revision`,
          )
        ).rows,
    );
  try {
    const today = await withDomainTransaction(
      actor,
      async (tx) =>
        (
          await tx.db.execute<{ date: string }>(
            sql`SELECT (clock_timestamp() AT TIME ZONE timezone)::date::text date FROM core.workspace`,
          )
        ).rows[0]!.date,
    );
    await openFinancialAccount({
      ...actor,
      clientCommandId: randomUUID(),
      name: "Notification financial baseline",
      accountType: "checking",
      openingCutoffDate: today,
      openingBalanceMinor: "100000",
    });
    const before = await counts();
    const began = performance.now();
    phase = "create_sources";
    for (let n = 0; n < 1000; n++)
      await createPersonalEvent({
        ...actor,
        clientCommandId: randomUUID(),
        title: `Synthetic capacity reminder ${n}`,
        temporalKind: "date",
        eventDate: addCalendarDays(today, 1 + (n % 30)),
      });
    await saveNotificationPreferences(actor, {
      clientCommandId: randomUUID(),
      expectedVersion: 0,
      preferences: {
        enabled: true,
        timezone: null,
        quietStart: null,
        quietEnd: null,
        includeDueDate: false,
      },
    });
    const creationMs = performance.now() - began;
    const firstAt = performance.now();
    phase = "initial_scan";
    const first = await scanNotificationScope(worker, actor);
    const initialScanMs = performance.now() - firstAt;
    assert.equal(first.scheduled, 1000);
    assert.equal(first.sources, 1000);
    const scans: number[] = [],
      reads: number[] = [];
    phase = "steady_scans";
    for (let n = 0; n < 7; n++) {
      let began = performance.now();
      assert.equal((await scanNotificationScope(worker, actor)).scheduled, 0);
      scans.push(performance.now() - began);
      began = performance.now();
      const settings = await getNotificationSettings(actor);
      assert.equal(settings.total, 1000);
      assert.equal(settings.deliveries.length, 50);
      reads.push(performance.now() - began);
    }
    const p95 = (values: number[]) =>
      values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;
    console.log(
      `Notification capacity measurements: create ${creationMs.toFixed(2)} ms; initial scan ${initialScanMs.toFixed(2)} ms; scan p95 ${p95(scans).toFixed(2)} ms; evidence p95 ${p95(reads).toFixed(2)} ms.`,
    );
    phase = "latency_acceptance";
    assert.ok(p95(scans) < 5000, "Bounded notification scan exceeded 5s");
    assert.ok(p95(reads) < 800, "Notification evidence read exceeded 800ms");
    assert.deepEqual(await counts(), before);
    await mkdir("test-results", { recursive: true });
    await writeFile(
      "test-results/notification-performance.json",
      JSON.stringify(
        {
          sources: 1000,
          deliveries: 1000,
          financialUnchanged: true,
          creationMs,
          initialScanMs,
          scanP95Ms: p95(scans),
          settingsP95Ms: p95(reads),
          budgetsMs: { scan: 5000, settings: 800 },
        },
        null,
        2,
      ),
    );
    console.log(
      `Notification capacity passed: 1000 sources/deliveries; scan p95 ${p95(scans).toFixed(2)} ms < 5000; evidence ${p95(reads).toFixed(2)} ms < 800; financial evidence unchanged.`,
    );
  } finally {
    await worker.end();
    await removeNamedFinancialFixture(actor, label);
    await closeRuntimeDatabasePools();
  }
}
void main().catch(() => {
  console.error(
    `Guarded notification capacity failed at ${phase}. Private data and credentials are not logged.`,
  );
  process.exitCode = 1;
});
