import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";

import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import { importExistingDebt } from "../../src/modules/finance/services/import-existing-debt";
import {
  getDebtDetail,
  listDebts,
} from "../../src/modules/finance/services/read-debts";
import { FinancialCommandConflictError } from "../../src/modules/finance/domain/financial-command";
import { listAgendaItems } from "../../src/modules/time/services/list-agenda-items";
import { withDomainTransaction } from "../../src/platform/db";
import {
  getAuthPool,
  closeRuntimeDatabasePools,
} from "../../src/platform/db/pools";

/** Runs the complete chain against an empty, uniquely named disposable DB.
 * It never resets the development/test database and never changes role flags.
 * The generated database is dropped only if this invocation created it. */
async function main() {
  loadEnvFile(".env.test");
  const source = new URL(process.env.DATABASE_MIGRATION_URL!);
  assert.equal(source.pathname, "/personal_management_test");
  assert.equal(source.username, "migration_owner");
  const databaseName = `pmp_verify_${randomUUID().replaceAll("-", "")}`;
  assert.match(databaseName, /^pmp_verify_[a-f0-9]{32}$/);
  const quoteName = `"${databaseName}"`;
  const administrator = new Client({
    connectionString: process.env.TEST_DATABASE_ADMIN_URL,
    application_name: "pmp-isolated-chain-verification",
  });
  const inDatabase = (connection: string) => {
    const url = new URL(connection);
    url.pathname = `/${databaseName}`;
    return url.toString();
  };
  const migration = new Client({
    connectionString: inDatabase(source.toString()),
  });
  let created = false;
  await administrator.connect();
  try {
    await administrator.query(`CREATE DATABASE ${quoteName}`);
    created = true;
    await administrator.query(
      `REVOKE CONNECT, TEMPORARY ON DATABASE ${quoteName} FROM PUBLIC`,
    );
    await administrator.query(
      `GRANT CONNECT, CREATE ON DATABASE ${quoteName} TO migration_owner`,
    );
    await administrator.query(
      `GRANT CONNECT ON DATABASE ${quoteName} TO app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator`,
    );
    await migration.connect();
    const db = drizzle(migration);
    const config = {
      migrationsFolder: "./src/platform/db/migrations",
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    };
    await migrate(db, config);
    const journal = JSON.parse(
      await readFile("src/platform/db/migrations/meta/_journal.json", "utf8"),
    ) as { entries: unknown[] };
    const count = await migration.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    assert.equal(count.rows[0]?.count, String(journal.entries.length));
    await migrate(db, config);
    const repeat = await migration.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    assert.equal(repeat.rows[0]?.count, count.rows[0]?.count);
    console.log(
      `Empty-database migration chain and no-op repeat passed (${journal.entries.length} migrations).`,
    );

    process.env.DATABASE_URL = inDatabase(process.env.DATABASE_URL!);
    process.env.AUTH_DATABASE_URL = inDatabase(process.env.AUTH_DATABASE_URL!);
    // These are local test-only non-delivery settings; no external email occurs.
    process.env.BETTER_AUTH_SECRET =
      "migration-verification-secret-never-used-for-real-auth";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.EMAIL_PROVIDER = "mailpit";
    process.env.EMAIL_FROM_ADDRESS = "verification@example.test";
    process.env.EMAIL_FROM_NAME = "Migration verification";
    process.env.MAILPIT_API_URL = "http://localhost:8025";
    async function user() {
      const userId = randomUUID();
      await getAuthPool().query(
        'INSERT INTO auth."user" (id,name,email,email_verified) VALUES ($1,$2,$3,true)',
        [userId, "Verification", `${userId}@example.test`],
      );
      const workspace = await provisionPersonalWorkspace({
        userId,
        displayName: "Verification",
      });
      return { userId, workspaceId: workspace.workspaceId };
    }
    const owner = await user();
    const other = await user();
    const command = {
      ...owner,
      clientCommandId: randomUUID(),
      name: "Verification loan",
      lenderName: "Test provider",
      debtType: "personal_loan" as const,
      startDate: "2026-01-01",
      openingCutoffDate: "2026-10-06",
      openingLiabilityMinor: "640001",
      openingComponents: [
        { kind: "unclassified" as const, amountMinor: "640001" },
      ],
      scheduleReason: "Verified test history",
      installments: [
        {
          dueDate: "2026-09-01",
          contractualMinor: "100000",
          openingSatisfiedMinor: "100000",
        },
        { dueDate: "2026-11-01", contractualMinor: "680001" },
      ],
    };
    const [first, second] = await Promise.all([
      importExistingDebt(command),
      importExistingDebt(command),
    ]);
    assert.deepEqual(first, second);
    assert.deepEqual(
      await importExistingDebt({ ...command, requestId: randomUUID() }),
      first,
    );
    await assert.rejects(
      () => importExistingDebt({ ...command, name: "Changed retry" }),
      FinancialCommandConflictError,
    );
    const detail = await getDebtDetail({ ...owner, debtId: first.debtId });
    assert.equal(detail.debt.recognizedLiabilityMinor, "640001");
    assert.equal(detail.debt.remainingScheduledMinor, "680001");
    assert.equal((await listDebts(owner)).items.length, 1);
    assert.equal((await listDebts(other)).items.length, 0);
    await assert.rejects(() =>
      getDebtDetail({ ...other, debtId: first.debtId }),
    );
    const foreignAgenda = await listAgendaItems({
      ...other,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      modules: ["money"],
    });
    assert.equal(foreignAgenda.items.length, 0);
    const ownAgenda = await listAgendaItems({
      ...owner,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      modules: ["money"],
    });
    assert.equal(ownAgenda.items.length, 1);
    await withDomainTransaction(owner, async (t) => {
      const effects = await t.db.execute<{
        actions: string;
        receipts: string;
        audit: string;
        total: string;
      }>(sql`SELECT
        (SELECT count(*)::text FROM finance.financial_action) AS actions,
        (SELECT count(*)::text FROM core.command_receipt) AS receipts,
        (SELECT count(*)::text FROM audit.private_revision) AS audit,
        (SELECT sum(amount_minor)::text FROM finance.posting) AS total`);
      assert.deepEqual(effects.rows[0], {
        actions: "1",
        receipts: "1",
        audit: "2",
        total: "0",
      });
    });
    console.log(
      "Committed concurrent imports, lost-response replay, ledger totals, snapshot reads, and cross-owner debt/Agenda isolation passed.",
    );
  } finally {
    await closeRuntimeDatabasePools();
    await migration.end();
    if (created) await administrator.query(`DROP DATABASE ${quoteName}`);
    await administrator.end();
  }
}
main().catch(() => {
  console.error(
    "Isolated migration verification failed. No connection credentials or private records are logged.",
  );
  process.exitCode = 1;
});
