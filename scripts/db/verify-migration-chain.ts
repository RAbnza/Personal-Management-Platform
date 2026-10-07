import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import {
  finalizeSchedule,
  mapPool,
  payment,
  reclassify,
  schedule,
  withFixture,
} from "../../tests/integration/helpers/debt-payment-fixture";

import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import { FinancialCommandConflictError } from "../../src/modules/finance/domain/financial-command";
import { getAccountHistory } from "../../src/modules/finance/services/get-account-history";
import { importExistingDebt } from "../../src/modules/finance/services/import-existing-debt";
import { openFinancialAccount } from "../../src/modules/finance/services/open-financial-account";
import { recordBorrowing } from "../../src/modules/finance/services/record-borrowing";
import {
  getDebtDetail,
  listDebts,
} from "../../src/modules/finance/services/read-debts";
import { listAgendaItems } from "../../src/modules/time/services/list-agenda-items";
import { withDomainTransaction } from "../../src/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
} from "../../src/platform/db/pools";

/**
 * Runs the complete migration chain against an empty, uniquely named
 * disposable database.
 *
 * It never resets the development/test database and never changes role flags.
 * The generated database is dropped only if this invocation created it.
 */
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
    ) as {
      entries: unknown[];
    };

    const count = await migration.query<{
      count: string;
    }>(
      `
        SELECT count(*)::text AS count
        FROM drizzle.__drizzle_migrations
      `,
    );

    assert.equal(count.rows[0]?.count, String(journal.entries.length));

    /*
     * Re-running the migration engine against a fully migrated disposable
     * database must remain a no-op.
     */
    await migrate(db, config);

    const repeat = await migration.query<{
      count: string;
    }>(
      `
        SELECT count(*)::text AS count
        FROM drizzle.__drizzle_migrations
      `,
    );

    assert.equal(repeat.rows[0]?.count, count.rows[0]?.count);

    console.log(
      `Empty-database migration chain and no-op repeat passed (${journal.entries.length} migrations).`,
    );

    /*
     * Point runtime pools at the disposable database only after the complete
     * migration chain has succeeded.
     */
    process.env.DATABASE_URL = inDatabase(process.env.DATABASE_URL!);

    process.env.AUTH_DATABASE_URL = inDatabase(process.env.AUTH_DATABASE_URL!);

    /*
     * These are local test-only non-delivery settings. No external email is
     * sent by this verification.
     */
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
        `
          INSERT INTO auth."user" (
            id,
            name,
            email,
            email_verified
          )
          VALUES (
            $1,
            $2,
            $3,
            true
          )
        `,
        [userId, "Verification", `${userId}@example.test`],
      );

      const workspace = await provisionPersonalWorkspace({
        userId,
        displayName: "Verification",
      });

      return {
        userId,
        workspaceId: workspace.workspaceId,
      };
    }

    const owner = await user();

    const other = await user();

    /*
     * ---------------------------------------------------------------------
     * D6b — imported existing debt
     * ---------------------------------------------------------------------
     */

    const importCommand = {
      ...owner,

      clientCommandId: randomUUID(),

      name: "Verification opening loan",

      lenderName: "Test provider",

      debtType: "personal_loan" as const,

      startDate: "2026-01-01",

      openingCutoffDate: "2026-10-06",

      openingLiabilityMinor: "640001",

      openingComponents: [
        {
          kind: "unclassified" as const,
          amountMinor: "640001",
        },
      ],

      scheduleReason: "Verified test history",

      installments: [
        {
          dueDate: "2026-09-01",

          contractualMinor: "100000",

          openingSatisfiedMinor: "100000",
        },

        {
          dueDate: "2026-11-01",

          contractualMinor: "680001",
        },
      ],
    };

    /*
     * Two simultaneous same-key submissions must converge on one committed
     * command rather than duplicating the imported debt.
     */
    const [firstImport, secondImport] = await Promise.all([
      importExistingDebt(importCommand),
      importExistingDebt(importCommand),
    ]);

    assert.deepEqual(firstImport, secondImport);

    /*
     * A lost-response retry may use a different request ID but must replay the
     * already committed result.
     */
    assert.deepEqual(
      await importExistingDebt({
        ...importCommand,

        requestId: randomUUID(),
      }),
      firstImport,
    );

    await assert.rejects(
      () =>
        importExistingDebt({
          ...importCommand,

          name: "Changed retry",
        }),

      FinancialCommandConflictError,
    );

    const importedDetail = await getDebtDetail({
      ...owner,

      debtId: firstImport.debtId,
    });

    assert.equal(importedDetail.debt.recognizedLiabilityMinor, "640001");

    assert.equal(importedDetail.debt.remainingScheduledMinor, "680001");

    assert.equal((await listDebts(owner)).items.length, 1);

    assert.equal((await listDebts(other)).items.length, 0);

    await assert.rejects(() =>
      getDebtDetail({
        ...other,

        debtId: firstImport.debtId,
      }),
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

    console.log(
      "D6b existing-debt import replay, conflict handling, snapshot reads, and cross-owner Debt/Agenda isolation passed.",
    );

    /*
     * ---------------------------------------------------------------------
     * D7 — new borrowing and net proceeds
     * ---------------------------------------------------------------------
     *
     * Create a real receiving account with no opening cash so the only account
     * movement verified below is the borrowing itself.
     */

    const receivingAccount = await openFinancialAccount({
      ...owner,

      clientCommandId: randomUUID(),

      name: "Borrowing verification account",

      accountType: "checking",

      institutionName: "Verification Bank",

      openingCutoffDate: "2026-10-01",

      openingBalanceMinor: "0",

      notes: null,
    });

    const borrowingCommand = {
      ...owner,

      clientCommandId: randomUUID(),

      name: "Verification new loan",

      lenderName: "Test lender",

      productName: "Verification loan product",

      debtType: "personal_loan" as const,

      borrowingDate: "2026-10-08",

      receivingAccountId: receivingAccount.accountId,

      /*
       * PHP 10,000 contractual principal.
       */
      principalMinor: "1000000",

      /*
       * PHP 9,800 actually received.
       */
      actualReceivedMinor: "980000",

      fees: [
        {
          label: "Processing fee",

          /*
           * PHP 200 withheld by the lender.
           */
          amountMinor: "20000",

          treatment: "withheld" as const,

          categoryId: null,
        },
      ],

      installments: [
        {
          dueDate: "2026-11-08",

          contractualMinor: "1000000",

          knownPrincipalMinor: "1000000",

          knownInterestMinor: "0",

          knownFeeMinor: "0",

          breakdownComplete: true,

          notes: null,
        },
      ],

      scheduleReason: "Provider supplied the initial contractual schedule.",

      description: "Verification loan proceeds received",

      reference: "VERIFY-BORROWING-001",

      notes: null,
    };

    const firstBorrowing = await recordBorrowing(borrowingCommand);

    /*
     * A normal lost-response retry must return the exact committed result.
     */
    assert.deepEqual(
      await recordBorrowing({
        ...borrowingCommand,

        requestId: randomUUID(),
      }),
      firstBorrowing,
    );

    await assert.rejects(
      () =>
        recordBorrowing({
          ...borrowingCommand,

          description: "Changed borrowing retry",
        }),

      FinancialCommandConflictError,
    );

    const borrowingDetail = await getDebtDetail({
      ...owner,

      debtId: firstBorrowing.debtId,
    });

    assert.equal(borrowingDetail.debt.openingCutoffDate, null);

    assert.equal(borrowingDetail.debt.originalPrincipalMinor, "1000000");

    assert.equal(borrowingDetail.debt.recognizedLiabilityMinor, "1000000");

    assert.equal(borrowingDetail.debt.outstandingPrincipalMinor, "1000000");

    assert.equal(borrowingDetail.debt.remainingScheduledMinor, "1000000");

    assert.equal(borrowingDetail.debt.installmentCount, 1);

    assert.equal(borrowingDetail.installments[0]?.openingSatisfiedMinor, "0");

    const accountHistory = await getAccountHistory({
      ...owner,

      accountId: receivingAccount.accountId,
    });

    assert.equal(accountHistory.account.currentBalanceMinor, "980000");

    assert.equal(accountHistory.entries.length, 1);

    assert.equal(accountHistory.entries[0]?.actionId, firstBorrowing.actionId);

    assert.equal(accountHistory.entries[0]?.actionKind, "borrowing");

    assert.equal(accountHistory.entries[0]?.signedAmountMinor, "980000");

    /*
     * Verify the canonical D7 posting recipe directly:
     *
     *   cash asset        +980000
     *   fee expense        +20000
     *   debt liability   -1000000
     *
     *   income                   0
     *   separate fee cash-out    0
     */
    await withDomainTransaction(owner, async (transaction) => {
      const accounting = await transaction.db.execute<{
        cash_minor: string;

        expense_minor: string;

        principal_liability_minor: string;

        fee_liability_minor: string;

        income_posting_count: string;

        fee_cash_out_count: string;

        journal_total: string;
      }>(sql`
        SELECT
          COALESCE(
            sum(posting.amount_minor)
              FILTER (
                WHERE ledger.kind = 'cash_asset'
              ),
            0
          )::text
            AS cash_minor,

          COALESCE(
            sum(posting.amount_minor)
              FILTER (
                WHERE ledger.kind = 'expense'
              ),
            0
          )::text
            AS expense_minor,

          COALESCE(
            sum(-(posting.amount_minor))
              FILTER (
                WHERE
                  ledger.kind = 'debt_liability'
                  AND posting.liability_component = 'principal'
              ),
            0
          )::text
            AS principal_liability_minor,

          COALESCE(
            sum(-(posting.amount_minor))
              FILTER (
                WHERE
                  ledger.kind = 'debt_liability'
                  AND posting.liability_component = 'fee'
              ),
            0
          )::text
            AS fee_liability_minor,

          count(*) FILTER (
            WHERE ledger.kind = 'income'
          )::text
            AS income_posting_count,

          count(*) FILTER (
            WHERE
              posting.cash_flow_kind = 'fee'
              AND posting.cash_flow_direction = 'out'
          )::text
            AS fee_cash_out_count,

          COALESCE(
            sum(posting.amount_minor),
            0
          )::text
            AS journal_total

        FROM finance."posting" AS posting

        INNER JOIN finance."ledger_account" AS ledger
          ON ledger.workspace_id = posting.workspace_id
          AND ledger.id = posting.ledger_account_id

        WHERE
          posting.workspace_id = ${owner.workspaceId}::uuid
          AND posting.action_revision_id =
            ${firstBorrowing.actionRevisionId}::uuid
      `);

      assert.deepEqual(accounting.rows[0], {
        cash_minor: "980000",

        expense_minor: "20000",

        principal_liability_minor: "1000000",

        fee_liability_minor: "0",

        income_posting_count: "0",

        fee_cash_out_count: "0",

        journal_total: "0",
      });

      const fee = await transaction.db.execute<{
        amount_minor: string;

        treatment: string;

        bearer_kind: string;
      }>(sql`
        SELECT
          component.amount_minor::text
            AS amount_minor,

          component.treatment,

          bearer.kind
            AS bearer_kind

        FROM finance."fee_component" AS component

        INNER JOIN finance."ledger_account" AS bearer
          ON bearer.workspace_id = component.workspace_id
          AND bearer.id = component.bearing_ledger_account_id

        WHERE
          component.workspace_id = ${owner.workspaceId}::uuid
          AND component.action_revision_id =
            ${firstBorrowing.actionRevisionId}::uuid
      `);

      assert.deepEqual(fee.rows, [
        {
          amount_minor: "20000",

          treatment: "withheld",

          bearer_kind: "debt_liability",
        },
      ]);
    });

    /*
     * D7 must not weaken owner isolation established by D6b.
     */
    assert.equal((await listDebts(owner)).items.length, 2);

    assert.equal((await listDebts(other)).items.length, 0);

    await assert.rejects(() =>
      getDebtDetail({
        ...other,

        debtId: firstBorrowing.debtId,
      }),
    );

    console.log(
      "D7 borrowing net proceeds, fee expense, zero-income treatment, idempotent replay, account history, and cross-owner isolation passed.",
    );

    /*
     * ---------------------------------------------------------------------
     * Aggregate persistence sanity check
     * ---------------------------------------------------------------------
     *
     * Owner now has:
     *
     * - one imported opening debt financial action;
     * - one zero-opening-balance financial account;
     * - one D7 borrowing financial action.
     *
     * The zero-balance account creates no opening financial action.
     */

    await withDomainTransaction(owner, async (transaction) => {
      const effects = await transaction.db.execute<{
        actions: string;

        receipts: string;

        audit: string;

        total: string;
      }>(sql`
        SELECT
          (
            SELECT count(*)::text
            FROM finance."financial_action"
          ) AS actions,

          (
            SELECT count(*)::text
            FROM core."command_receipt"
          ) AS receipts,

          (
            SELECT count(*)::text
            FROM audit."private_revision"
          ) AS audit,

          (
            SELECT COALESCE(sum(amount_minor), 0)::text
            FROM finance."posting"
          ) AS total
      `);

      assert.deepEqual(effects.rows[0], {
        actions: "2",

        receipts: "3",

        audit: "5",

        total: "0",
      });
    });

    console.log(
      "Committed D6b + D7 financial effects remain balanced and auditable on the fresh migration chain.",
    );

    await withFixture(async (client, debt) => {
      const paid = await payment(client, debt, {
        external: "15",
        unapplied: "100",
        certainty: "unresolved",
        components: [{ disposition: "clearing", amount: "400" }],
      });
      await reclassify(client, debt, paid, { amount: "200" });
      const revised = await schedule(client, debt, {
        previousId: debt.scheduleId,
        version: 2,
      });
      await mapPool(client, debt, paid, revised, "300");
      await mapPool(
        client,
        debt,
        paid,
        { scheduleId: revised.scheduleId },
        "100",
        null,
      );
      await finalizeSchedule(client, debt, revised.scheduleId);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      const cash = await client.query<{ amount: string }>(
        "SELECT sum(amount_minor)::text AS amount FROM finance.posting WHERE workspace_id=$1 AND ledger_account_id=$2",
        [debt.workspaceId, debt.cashId],
      );
      assert.equal(cash.rows[0]?.amount, "-415");
    });
    console.log(
      "D8a payment, fee, clearing resolution, and exhaustive schedule mapping passed on the fresh migration chain.",
    );
  } finally {
    await closeRuntimeDatabasePools();

    await migration.end();

    if (created) {
      await administrator.query(`DROP DATABASE ${quoteName}`);
    }

    await administrator.end();
  }
}

main().catch(() => {
  console.error(
    "Isolated migration verification failed. No connection credentials or private records are logged.",
  );

  process.exitCode = 1;
});
