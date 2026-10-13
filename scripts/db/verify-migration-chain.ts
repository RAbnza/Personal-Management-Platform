import {
  recordExpense,
  recordCardPurchase,
} from "../../src/modules/finance/services/record-expense";
import { recordCardStatement } from "../../src/modules/finance/services/card-statements";
import { recordCardCommand } from "../../src/modules/finance/services/record-card-command";
import {
  recordCardInstallmentPlan,
  recordInstallmentApplication,
  reverseInstallmentApplication,
} from "../../src/modules/finance/services/card-installments";
import { getCardInstallmentPlan } from "../../src/modules/finance/services/read-card-installments";
import {
  recordCardAllocation,
  reverseCardAllocation,
} from "../../src/modules/finance/services/card-allocations";
import { getCardStatement } from "../../src/modules/finance/services/read-card-statements";
import { createPersonalEvent } from "../../src/modules/time/services/create-personal-event";
import { mutatePersonalEvent } from "../../src/modules/time/services/mutate-personal-event";
import {
  getReminder,
  getReminderAttention,
  mutateReminder,
} from "../../src/modules/time/services/reminders";
import { ReminderUnavailableError } from "../../src/modules/time/domain/reminder";
import { CommandReceiptConflictError } from "../../src/modules/core/domain/command";
import { recordRefund } from "../../src/modules/finance/services/record-refund";
import {
  correctFinancialAction,
  getFinancialActionDetail,
} from "../../src/modules/finance/services/correct-financial-action";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import {
  readFile,
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { parseEnv } from "node:util";
import {
  getDeletionPreview,
  requestDeletionInTransaction,
} from "../../src/modules/core/services/workspace-lifecycle";
import {
  getIdentityProfile,
  updateProfile,
} from "../../src/modules/core/services/profile";
import { purgeDeletionStep } from "../../src/platform/lifecycle/purge";
import { migrateJobStorage } from "../jobs/migrate";

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
import {
  createCreditCard,
  updateCreditCard,
} from "../../src/modules/finance/services/credit-cards";
import {
  getCreditCardDetail,
  listCreditCards,
} from "../../src/modules/finance/services/read-credit-cards";
import { recordBorrowing } from "../../src/modules/finance/services/record-borrowing";
import { recordDebtPayment } from "../../src/modules/finance/services/record-debt-payment";
import { PaymentPreviewStaleError } from "../../src/modules/finance/domain/debt-payment";
import { getDebtScheduleSetup } from "../../src/modules/finance/services/get-debt-schedule-setup";
import { reviseDebtSchedule } from "../../src/modules/finance/services/revise-debt-schedule";
import { SchedulePreviewStaleError } from "../../src/modules/finance/domain/debt-schedule-revision";
import { listDebtSchedules } from "../../src/modules/finance/services/read-debt-schedules";
import {
  getDebtSettlementSetup,
  previewDebtSettlement,
  settleDebt,
} from "../../src/modules/finance/services/settle-debt";
import {
  settleDebtBodySchema,
  SettlementPreviewStaleError,
} from "../../src/modules/finance/domain/debt-settlement";
import {
  getDebtDetail,
  listDebts,
} from "../../src/modules/finance/services/read-debts";
import { listAgendaItems } from "../../src/modules/time/services/list-agenda-items";
import { recordRecurringCommand } from "../../src/modules/planning/services/recurring";
import { recordBudgetCommand } from "../../src/modules/planning/services/budgets";
import { getBudget } from "../../src/modules/planning/services/read-budgets";
import { listCategories } from "../../src/modules/core/services/list-categories";
import {
  getRecurringObligation,
  getRecurringOccurrence,
} from "../../src/modules/planning/services/read-recurring";
import { withDomainTransaction } from "../../src/platform/db";
import {
  getAccountReconciliationSetup,
  previewAccountReconciliation,
  previewAccountAdjustment,
  reconcileAccount,
  adjustAccountBalance,
} from "../../src/modules/finance/services/reconcile-account";
import { ReconciliationPreviewStaleError } from "../../src/modules/finance/domain/reconciliation";
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

    if (
      process.argv.includes("--upgrade") ||
      process.argv.includes("--upgrade-v1") ||
      process.argv.includes("--upgrade-a1") ||
      process.argv.includes("--upgrade-a2") ||
      process.argv.includes("--upgrade-a3") ||
      process.argv.includes("--upgrade-a4") ||
      process.argv.includes("--upgrade-a5") ||
      process.argv.includes("--upgrade-a6") ||
      process.argv.includes("--upgrade-b")
    ) {
      const baselineCount = process.argv.includes("--upgrade-b")
        ? 104
        : process.argv.includes("--upgrade-a6")
          ? 94
          : process.argv.includes("--upgrade-a5")
            ? 89
            : process.argv.includes("--upgrade-a4")
              ? 86
              : process.argv.includes("--upgrade-a3")
                ? 82
                : process.argv.includes("--upgrade-a2")
                  ? 80
                  : process.argv.includes("--upgrade-a1")
                    ? 78
                    : process.argv.includes("--upgrade-v1")
                      ? 76
                      : 67;
      const priorJournal = JSON.parse(
        await readFile("src/platform/db/migrations/meta/_journal.json", "utf8"),
      ) as { entries: Array<{ tag: string }> };
      assert.ok(priorJournal.entries.length > baselineCount);
      const folder = await mkdtemp(join(tmpdir(), "pmp-c4-upgrade-"));
      try {
        await mkdir(join(folder, "meta"));
        const entries = priorJournal.entries.slice(0, baselineCount);
        for (const entry of entries)
          await copyFile(
            join(config.migrationsFolder, entry.tag + ".sql"),
            join(folder, entry.tag + ".sql"),
          );
        await writeFile(
          join(folder, "meta", "_journal.json"),
          JSON.stringify({ ...priorJournal, entries }),
        );
        await migrate(db, { ...config, migrationsFolder: folder });
        assert.equal(
          (
            await migration.query(
              "SELECT count(*)::int count FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].count,
          baselineCount,
        );
        process.env.DATABASE_URL = inDatabase(process.env.DATABASE_URL!);
        process.env.AUTH_DATABASE_URL = inDatabase(
          process.env.AUTH_DATABASE_URL!,
        );
        const userId = randomUUID();
        await getAuthPool().query(
          "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'C4 upgrade fixture',$2,true)",
          [userId, `${userId}@example.test`],
        );
        const { workspaceId } = await provisionPersonalWorkspace({
          userId,
          displayName: "C4 upgrade fixture",
        });
        const account = await openFinancialAccount({
          userId,
          workspaceId,
          clientCommandId: randomUUID(),
          name: "Preserved C4 account",
          accountType: "checking",
          openingCutoffDate: "2026-09-30",
          openingBalanceMinor: "200000",
        });
        await (
          await import("../../src/modules/finance/services/record-income")
        ).recordIncome({
          userId,
          workspaceId,
          clientCommandId: randomUUID(),
          receivingAccountId: account.accountId,
          effectiveDate: "2026-10-01",
          amountMinor: "100",
          incomeClass: "gift",
          description: "Preserved C4 financial evidence",
        });
        const baselineCard =
          baselineCount >= 78
            ? await createCreditCard({
                userId,
                workspaceId,
                clientCommandId: randomUUID(),
                name: "Preserved A1 card",
                issuerName: "Issuer",
                creditLimitMinor: "9007199254740993",
              })
            : null;
        const baselinePurchase =
          baselineCount >= 80 && baselineCard
            ? await recordCardPurchase({
                userId,
                workspaceId,
                cardId: baselineCard.cardId,
                clientCommandId: randomUUID(),
                effectiveDate: "2026-10-02",
                postingDate: "2026-10-03",
                purchaseMinor: "777",
                splits: [{ amountMinor: "777", categoryId: null }],
                description: "Preserved A2 purchase",
                providerReference: "A2 provider reference",
              })
            : null;
        const baselineStatement =
          baselineCount >= 82 && baselineCard
            ? await recordCardStatement({
                userId,
                workspaceId,
                cardId: baselineCard.cardId,
                clientCommandId: randomUUID(),
                cycleStart: "2026-10-01",
                cycleEnd: "2026-10-31",
                statementDate: "2026-11-01",
                dueDate: "2026-11-20",
                balanceMinor: "777",
                minimumDueMinor: "0",
                verificationSource: "Preserved A3 provider statement",
                verifiedDate: "2026-11-02",
                entries: [],
              })
            : null;
        const baselinePayment =
          baselineCount >= 86 && baselineCard
            ? await recordCardCommand({
                userId,
                workspaceId,
                cardId: baselineCard.cardId,
                clientCommandId: randomUUID(),
                actionKind: "card_payment",
                payingAccountId: account.accountId,
                amountMinor: "100",
                effectiveDate: "2026-11-03",
                postingDate: "2026-11-04",
                description: "Preserved A4 payment",
                providerConfirmed: true,
                confirmationSource: "Actual provider receipt",
              })
            : null;
        const baselineAllocation =
          baselinePayment && baselineCard && baselineStatement
            ? await recordCardAllocation({
                userId,
                workspaceId,
                cardId: baselineCard.cardId,
                clientCommandId: randomUUID(),
                statementRevisionId: baselineStatement.revisionId,
                sourceActionRevisionId: baselinePayment.actionRevisionId,
                amountMinor: "50",
                confirmationKind: "provider",
                confirmationSource: "Preserved A4 confirmation",
                confirmedDate: "2026-11-05",
              })
            : null;
        const baselinePlan =
          baselineCount >= 89 && baselineCard && baselinePurchase
            ? await recordCardInstallmentPlan({
                userId,
                workspaceId,
                cardId: baselineCard.cardId,
                clientCommandId: randomUUID(),
                purchaseActionId: baselinePurchase.actionId,
                purchaseActionRevisionId: baselinePurchase.actionRevisionId,
                principalMinor: "777",
                installmentCount: 1,
                providerConfirmed: true,
                verificationSource: "Preserved A5 complete schedule",
                verifiedDate: "2026-11-02",
                installments: [
                  {
                    dueDate: "2026-11-20",
                    principalMinor: "777",
                    interestMinor: "0",
                    feeMinor: "0",
                    totalMinor: "777",
                  },
                ],
              })
            : null;
        const baselineRecurring =
          baselineCount >= 104
            ? await recordRecurringCommand({
                userId,
                workspaceId,
                operation: "definition",
                clientCommandId: randomUUID(),
                obligationId: null,
                expectedVersion: null,
                reason: null,
                name: "Preserved B recurring evidence",
                kind: "bill",
                rule: {
                  effectiveFrom: "2026-10-01",
                  frequency: "monthly",
                  intervalCount: 1,
                  weekdays: null,
                  dayOfMonth: 10,
                  shortMonthPolicy: "last_valid_day",
                  endsOn: null,
                  occurrenceLimit: 2,
                  expectedMinor: "777",
                  currency: "PHP",
                  categoryId: null,
                  defaultAccountId: null,
                  timezone: "Asia/Manila",
                },
                window: { from: "2026-10-01", through: "2026-11-30" },
              })
            : null;
        await migrate(db, config);
        if (baselineRecurring) {
          const p = await getRecurringObligation({
            userId,
            workspaceId,
            obligationId: baselineRecurring.obligationId,
          });
          assert.equal(p.root.name, "Preserved B recurring evidence");
          assert.equal(p.occurrences.items.length, 2);
          assert.equal(p.occurrences.items[0]!.expectedMinor, "777");
        }
        if (baselinePlan && baselineCard)
          assert.equal(
            (
              await getCardInstallmentPlan({
                userId,
                workspaceId,
                cardId: baselineCard.cardId,
                planId: baselinePlan.planId,
              })
            ).snapshot.verificationSource,
            "Preserved A5 complete schedule",
          );
        if (baselineStatement && baselineCard) {
          const s = await getCardStatement({
            userId,
            workspaceId,
            cardId: baselineCard.cardId,
            statementId: baselineStatement.statementId,
          });
          assert.equal(
            s.snapshot.verificationSource,
            "Preserved A3 provider statement",
          );
          assert.equal(
            s.reconciliation.recordedRemainingDueMinor,
            baselineAllocation ? "727" : "777",
          );
          assert.equal(
            s.reconciliation.effectiveAllocatedMinor,
            baselineAllocation ? "50" : "0",
          );
        }
        if (baselineCard)
          assert.equal(
            (
              await getCreditCardDetail({
                userId,
                workspaceId,
                cardId: baselineCard.cardId,
              })
            ).card.creditLimitMinor,
            "9007199254740993",
          );
        const history = await getAccountHistory({
          userId,
          workspaceId,
          accountId: account.accountId,
          pageSize: 50,
        });
        assert.ok(
          JSON.stringify(history).includes("Preserved C4 financial evidence"),
        );
        const report = await (
          await import("../../src/modules/reporting/services/get-reports")
        ).getFinancialReport({
          userId,
          workspaceId,
          query: { period: "month", anchorDate: "2026-10-01" },
        });
        assert.equal(report.metrics.income, "100");
        assert.equal(report.metrics.closing_cash, "200100");
        if (baselinePurchase && baselineCard) {
          assert.equal(report.metrics.gross, "777");
          assert.equal(report.metrics.closing_liability, "777");
          const preserved = await getFinancialActionDetail({
            userId,
            workspaceId,
            actionId: baselinePurchase.actionId,
          });
          assert.equal(
            preserved.current.actionRevisionId,
            baselinePurchase.actionRevisionId,
          );
          assert.equal(
            (
              await getCreditCardDetail({
                userId,
                workspaceId,
                cardId: baselineCard.cardId,
              })
            ).card.postedOutstandingMinor,
            baselinePayment ? "677" : "777",
          );
        }
        console.log(
          `${baselineCount}-migration upgrade preserves committed account/history and exact report totals.`,
        );
      } finally {
        assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
        assert.ok(resolve(folder).includes("pmp-c4-upgrade-"));
        await rm(folder, { recursive: true, force: true });
      }
    }
    await migrate(db, config);
    await migrateJobStorage(inDatabase(source.toString()));
    await migrateJobStorage(inDatabase(source.toString()));

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
    const paymentBefore = await getDebtDetail({
      ...owner,
      debtId: firstBorrowing.debtId,
    });
    const paymentCommand = {
      ...owner,
      clientCommandId: randomUUID(),
      debtId: firstBorrowing.debtId,
      payingAccountId: receivingAccount.accountId,
      paymentDate: "2026-10-09",
      scheduleVersionId: firstBorrowing.scheduleVersionId,
      expectedFinancialRevision: paymentBefore.financialRevision,
      actualPaidMinor: "111000",
      contractualMinor: "110000",
      externalFeeMinor: "1000",
      allocationCertainty: "known_components" as const,
      components: [
        {
          disposition: "liability_reduction" as const,
          liabilityComponent: "principal" as const,
          amountMinor: "100000",
          label: "Principal",
        },
        {
          disposition: "new_interest" as const,
          amountMinor: "10000",
          label: "Confirmed new interest",
        },
      ],
      dueAllocations: [
        {
          installmentId: paymentBefore.installments[0]!.installmentId,
          amountMinor: "110000",
        },
      ],
      unappliedContractualMinor: "0",
      dueAllocationConfirmed: true as const,
      confirmationSource: "user" as const,
      description: "Verification debt payment",
    };
    const [savedPayment, concurrentReplay] = await Promise.all([
      recordDebtPayment(paymentCommand),
      recordDebtPayment({ ...paymentCommand, requestId: randomUUID() }),
    ]);
    assert.deepEqual(savedPayment, concurrentReplay);
    assert.deepEqual(
      await recordDebtPayment({ ...paymentCommand, requestId: randomUUID() }),
      savedPayment,
    );
    await assert.rejects(
      () =>
        recordDebtPayment({
          ...paymentCommand,
          description: "Changed payment retry",
        }),
      FinancialCommandConflictError,
    );
    const paymentAfter = await getDebtDetail({
      ...owner,
      debtId: firstBorrowing.debtId,
    });
    assert.equal(paymentAfter.debt.recognizedLiabilityMinor, "900000");
    assert.equal(paymentAfter.debt.remainingScheduledMinor, "890000");
    assert.equal(paymentAfter.installments[0]?.openingSatisfiedMinor, "0");
    assert.equal(paymentAfter.installments[0]?.paymentSatisfiedMinor, "110000");
    assert.equal(paymentAfter.payments.length, 1);
    assert.equal(paymentAfter.payments[0]?.paymentId, savedPayment.paymentId);
    const paidAccount = await getAccountHistory({
      ...owner,
      accountId: receivingAccount.accountId,
    });
    assert.equal(paidAccount.account.currentBalanceMinor, "869000");
    assert.equal(
      paidAccount.entries.filter(
        (entry) => entry.actionId === savedPayment.actionId,
      ).length,
      1,
    );
    assert.equal(
      paidAccount.entries.find(
        (entry) => entry.actionId === savedPayment.actionId,
      )?.signedAmountMinor,
      "-111000",
    );
    assert.equal(
      (
        await listAgendaItems({
          ...owner,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          modules: ["money"],
        })
      ).items.length,
      2,
    );
    const competingPayment = {
      ...paymentCommand,
      expectedFinancialRevision: paymentAfter.financialRevision,
      actualPaidMinor: "1000",
      contractualMinor: "1000",
      externalFeeMinor: "0",
      components: [
        {
          disposition: "liability_reduction" as const,
          liabilityComponent: "principal" as const,
          amountMinor: "1000",
          label: "Principal",
        },
      ],
      dueAllocations: [
        {
          installmentId: paymentAfter.installments[0]!.installmentId,
          amountMinor: "1000",
        },
      ],
    };
    const competing = await Promise.allSettled([
      recordDebtPayment({ ...competingPayment, clientCommandId: randomUUID() }),
      recordDebtPayment({ ...competingPayment, clientCommandId: randomUUID() }),
    ]);
    assert.equal(
      competing.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const rejected = competing.find((result) => result.status === "rejected");
    assert.ok(
      rejected &&
        rejected.status === "rejected" &&
        rejected.reason instanceof PaymentPreviewStaleError,
    );
    const currentPaid = await getDebtDetail({
      ...owner,
      debtId: firstBorrowing.debtId,
    });
    assert.equal(currentPaid.payments.length, 2);
    assert.equal(currentPaid.debt.remainingScheduledMinor, "889000");
    assert.equal(
      (
        await getAccountHistory({
          ...owner,
          accountId: receivingAccount.accountId,
        })
      ).account.currentBalanceMinor,
      "868000",
    );
    console.log(
      "D8b committed payment, exact cash/expense/liability effects, concurrent replay/competing-preview conflicts, payment history, and current Debt/Agenda dues passed.",
    );
    const revisionSetup = await getDebtScheduleSetup({
      ...owner,
      debtId: firstBorrowing.debtId,
    });
    const revisionEntries = revisionSetup.detail.installments.map((i) => ({
      entryKey: randomUUID(),
      obligationId: i.obligationId,
      dueDate: "2026-12-20",
      contractualMinor: i.contractualMinor,
      knownPrincipalMinor: i.knownPrincipalMinor,
      knownInterestMinor: i.knownInterestMinor,
      knownFeeMinor: i.knownFeeMinor,
      breakdownComplete: i.breakdownComplete,
      disposition: i.disposition,
      cancellationReason: i.cancellationReason,
      notes: i.notes,
    }));
    const revisionCommand = {
      ...owner,
      clientCommandId: randomUUID(),
      debtId: firstBorrowing.debtId,
      expectedDebtVersion: revisionSetup.detail.debt.version,
      expectedScheduleVersionId: revisionSetup.detail.debt.scheduleVersionId!,
      expectedFinancialRevision: revisionSetup.detail.financialRevision,
      effectiveDate: "2026-10-08",
      revisionKind: "date_correction" as const,
      reason: "Provider corrected due dates",
      frequency: revisionSetup.frequency,
      entries: revisionEntries,
      mappings: revisionSetup.pools.flatMap((p) =>
        p.currentTargets.map((target) => ({
          paymentRevisionId: p.paymentRevisionId,
          sourceAllocationId: p.sourceAllocationId,
          targetEntryKey: target.obligationId
            ? revisionEntries.find(
                (e) => e.obligationId === target.obligationId,
              )!.entryKey
            : null,
          amountMinor: target.amountMinor,
        })),
      ),
      allocationMappingConfirmed: true as const,
    };
    const revisionReplay = await Promise.all([
      reviseDebtSchedule(revisionCommand),
      reviseDebtSchedule(revisionCommand),
    ]);
    assert.deepEqual(revisionReplay[0], revisionReplay[1]);
    const revised = await getDebtScheduleSetup({
      ...owner,
      debtId: firstBorrowing.debtId,
    });
    assert.equal(revised.detail.debt.remainingScheduledMinor, "889000");
    assert.equal(
      revised.detail.installments[0]!.paymentSatisfiedMinor,
      "111000",
    );
    assert.equal(revised.detail.installments[0]!.openingSatisfiedMinor, "0");
    assert.equal(
      revised.detail.installments[0]!.obligationId,
      revisionSetup.detail.installments[0]!.obligationId,
    );
    assert.equal(
      (
        await getAccountHistory({
          ...owner,
          accountId: receivingAccount.accountId,
        })
      ).account.currentBalanceMinor,
      "868000",
    );
    await assert.rejects(
      reviseDebtSchedule({ ...revisionCommand, clientCommandId: randomUUID() }),
      SchedulePreviewStaleError,
    );
    const competingRevision = {
      ...revisionCommand,
      expectedDebtVersion: revised.detail.debt.version,
      expectedScheduleVersionId: revised.detail.debt.scheduleVersionId!,
      expectedFinancialRevision: revised.detail.financialRevision,
      entries: revisionEntries.map((e) => ({ ...e, dueDate: "2026-12-25" })),
    };
    const revisions = await Promise.allSettled([
      reviseDebtSchedule({
        ...competingRevision,
        clientCommandId: randomUUID(),
      }),
      reviseDebtSchedule({
        ...competingRevision,
        clientCommandId: randomUUID(),
      }),
    ]);
    assert.equal(revisions.filter((r) => r.status === "fulfilled").length, 1);
    const rejectedRevision = revisions.find((r) => r.status === "rejected");
    assert.ok(
      rejectedRevision?.status === "rejected" &&
        rejectedRevision.reason instanceof SchedulePreviewStaleError,
    );
    const history = await listDebtSchedules({
      ...owner,
      debtId: firstBorrowing.debtId,
    });
    assert.deepEqual(
      history.items.map((v) => v.versionNo),
      [3, 2, 1],
    );
    assert.equal(
      history.items[2]!.entries[0]!.dueDate,
      revisionSetup.detail.installments[0]!.dueDate,
    );
    const revisedAgenda = await listAgendaItems({
      ...owner,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      modules: ["money"],
    });
    assert.ok(
      revisedAgenda.items.some(
        (i) =>
          i.sourceId === revised.detail.installments[0]!.obligationId &&
          i.temporal.kind === "date" &&
          i.temporal.eventDate === "2026-12-25",
      ),
    );
    console.log(
      "D9 committed immutable schedules, exhaustive original-pool mapping, unchanged cash, stable Agenda identities/generations, history and concurrent replay/stale conflicts passed.",
    );
    const settlementSetup = await getDebtSettlementSetup({
      ...owner,
      debtId: firstBorrowing.debtId,
    });
    let payoffRemainder = BigInt(
      settlementSetup.detail.debt.recognizedLiabilityMinor,
    );
    const payoffAllocations = settlementSetup.detail.installments.flatMap(
      (i) => {
        const amount =
          payoffRemainder < BigInt(i.remainingMinor)
            ? payoffRemainder
            : BigInt(i.remainingMinor);
        payoffRemainder -= amount;
        return amount > 0n
          ? [{ installmentId: i.installmentId, amountMinor: amount.toString() }]
          : [];
      },
    );
    const settlementCommand = {
      ...owner,
      ...settleDebtBodySchema.parse({
        clientCommandId: randomUUID(),
        debtId: firstBorrowing.debtId,
        expectedDebtVersion: settlementSetup.detail.debt.version,
        expectedScheduleVersionId:
          settlementSetup.detail.debt.scheduleVersionId,
        expectedFinancialRevision: settlementSetup.detail.financialRevision,
        settlementDate: "2026-10-10",
        settlementKind: "early",
        payingAccountId: receivingAccount.accountId,
        actualCashPaidMinor:
          settlementSetup.detail.debt.recognizedLiabilityMinor,
        confirmedPayoffMinor:
          settlementSetup.detail.debt.recognizedLiabilityMinor,
        externalFeeMinor: "0",
        externalFeeLabel: "External settlement fee",
        externalFeeCategoryId: null,
        liabilityPayments: Object.entries(
          settlementSetup.detail.debt.recognizedLiabilityComponents,
        ).flatMap(([kind, amountMinor]) =>
          BigInt(amountMinor) > 0n ? [{ kind, amountMinor }] : [],
        ),
        adjustments: [],
        dueAllocations: payoffAllocations,
        unappliedContractualMinor: payoffRemainder.toString(),
        poolMappings: settlementSetup.pools.flatMap((p) =>
          p.currentTargets.map((target) => ({
            paymentRevisionId: p.paymentRevisionId,
            sourceAllocationId: p.sourceAllocationId,
            targetObligationId: target.obligationId,
            amountMinor: target.amountMinor,
          })),
        ),
        unappliedResolutionNote:
          "Provider accepts the entire contractual pool as final payoff",
        allocationConfirmed: true,
        confirmationSource: "provider",
        confirmationNote: "Verified final payoff",
        acknowledgeNegativeBalance: true,
        providerReference: "D10",
        reason: "Provider confirmed early settlement",
      }),
    };
    const settlementPreview = await previewDebtSettlement(settlementCommand);
    assert.equal(settlementPreview.residualMinor, "0");
    const settlements = await Promise.all([
      settleDebt(settlementCommand),
      settleDebt(settlementCommand),
    ]);
    assert.deepEqual(settlements[0], settlements[1]);
    await assert.rejects(
      settleDebt({ ...settlementCommand, reason: "Changed payoff intent" }),
      FinancialCommandConflictError,
    );
    await assert.rejects(
      settleDebt({ ...settlementCommand, clientCommandId: randomUUID() }),
      SettlementPreviewStaleError,
    );
    const settledDetail = await getDebtDetail({
      ...owner,
      debtId: firstBorrowing.debtId,
    });
    assert.equal(settledDetail.debt.lifecycle, "settled_early");
    assert.equal(settledDetail.debt.recognizedLiabilityMinor, "0");
    assert.equal(settledDetail.debt.unappliedContractualMinor, "0");
    assert.equal(settledDetail.installments[0]!.openingSatisfiedMinor, "0");
    assert.equal(settledDetail.payments.length, 3);
    const settledAccount = await getAccountHistory({
      ...owner,
      accountId: receivingAccount.accountId,
    });
    assert.equal(
      settledAccount.entries.filter(
        (e) => e.actionId === settlements[0]!.actionId,
      ).length,
      1,
    );
    assert.equal(
      settledAccount.entries.find(
        (e) => e.actionId === settlements[0]!.actionId,
      )?.signedAmountMinor,
      `-${settlementCommand.actualCashPaidMinor}`,
    );
    assert.ok(
      !(
        await listAgendaItems({
          ...owner,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          modules: ["money"],
        })
      ).items.some(
        (i) => i.sourceId === settledDetail.installments[0]!.obligationId,
      ),
    );
    assert.deepEqual(
      (
        await listDebtSchedules({ ...owner, debtId: firstBorrowing.debtId })
      ).items.map((s) => s.versionNo),
      [4, 3, 2, 1],
    );
    // Competing distinct settlement commands serialize against one reviewed snapshot.
    const competingDebt = await importExistingDebt({
      ...owner,
      clientCommandId: randomUUID(),
      name: "Competing settlement",
      lenderName: "Provider",
      debtType: "personal_loan",
      startDate: "2026-01-01",
      openingCutoffDate: "2026-09-30",
      openingLiabilityMinor: "100000",
      openingComponents: [{ kind: "principal", amountMinor: "100000" }],
      installments: [],
      scheduleReason: "No provider due dates",
    });
    const competingSetup = await getDebtSettlementSetup({
      ...owner,
      debtId: competingDebt.debtId,
    });
    const competingSettlement = {
      ...settlementCommand,
      debtId: competingDebt.debtId,
      expectedDebtVersion: competingSetup.detail.debt.version,
      expectedScheduleVersionId: competingDebt.scheduleVersionId,
      expectedFinancialRevision: competingSetup.detail.financialRevision,
      actualCashPaidMinor: "100000",
      confirmedPayoffMinor: "100000",
      liabilityPayments: [
        { kind: "principal" as const, amountMinor: "100000" },
      ],
      dueAllocations: [],
      unappliedContractualMinor: "100000",
      poolMappings: [],
    };
    const outcomes = await Promise.allSettled([
      settleDebt({ ...competingSettlement, clientCommandId: randomUUID() }),
      settleDebt({ ...competingSettlement, clientCommandId: randomUUID() }),
    ]);
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    assert.ok(
      outcomes.some(
        (o) =>
          o.status === "rejected" &&
          o.reason instanceof SettlementPreviewStaleError,
      ),
    );
    console.log(
      "D10 committed settlement, server preview, one account deduction, immutable closing history, Agenda cleanup, resolved unapplied pools, concurrent replay and competing-version conflicts passed.",
    );
    const reconciliationScope = {
      ...owner,
      financialAccountId: receivingAccount.accountId,
    };
    const accountSetup =
      await getAccountReconciliationSetup(reconciliationScope);
    const matchedCommand = {
      ...reconciliationScope,
      clientCommandId: randomUUID(),
      expectedFinancialRevision: accountSetup.financialRevision,
      expectedAccountVersion: accountSetup.account.version,
      cutoffDate: "2026-10-10",
      observedMinor: accountSetup.account.currentBalanceMinor,
      reference: "D11 statement",
      notes: "Provider comparison",
    };
    assert.equal(
      (await previewAccountReconciliation(matchedCommand)).status,
      "verified",
    );
    const matched = await Promise.all([
      reconcileAccount(matchedCommand),
      reconcileAccount(matchedCommand),
    ]);
    assert.deepEqual(matched[0], matched[1]);
    assert.equal(
      (await getAccountReconciliationSetup(reconciliationScope))
        .financialRevision,
      accountSetup.financialRevision,
    );
    const differenceCommand = {
      ...matchedCommand,
      clientCommandId: randomUUID(),
      observedMinor: (BigInt(matchedCommand.observedMinor) + 100n).toString(),
      supersedesReconciliationId: matched[0]!.reconciliationId,
    };
    const difference = await reconcileAccount(differenceCommand);
    assert.equal(difference.preview.differenceMinor, "100");
    assert.equal(
      (await getAccountReconciliationSetup(reconciliationScope)).account
        .currentBalanceMinor,
      accountSetup.account.currentBalanceMinor,
    );
    const adjustmentCommand = {
      ...reconciliationScope,
      clientCommandId: randomUUID(),
      expectedFinancialRevision: accountSetup.financialRevision,
      expectedAccountVersion: accountSetup.account.version,
      effectiveDate: "2026-10-10",
      signedAdjustmentMinor: "100",
      reconciliationId: difference.reconciliationId,
      reason: "Explicit unexplained statement difference",
      acknowledgeNegativeBalance: true,
    };
    assert.equal(
      (await previewAccountAdjustment(adjustmentCommand)).reconciliation
        ?.differenceAfterMinor,
      "0",
    );
    const adjusted = await Promise.all([
      adjustAccountBalance(adjustmentCommand),
      adjustAccountBalance(adjustmentCommand),
    ]);
    assert.deepEqual(adjusted[0], adjusted[1]);
    assert.equal(
      adjusted[0]!.financialRevision,
      (BigInt(accountSetup.financialRevision) + 1n).toString(),
    );
    const adjustedSetup =
      await getAccountReconciliationSetup(reconciliationScope);
    assert.equal(
      adjustedSetup.account.currentBalanceMinor,
      differenceCommand.observedMinor,
    );
    assert.equal(
      adjustedSetup.history.find(
        (r) => r.reconciliationId === difference.reconciliationId,
      )?.status,
      "needs_review",
    );
    assert.equal(
      adjustedSetup.history.find(
        (r) => r.reconciliationId === difference.reconciliationId,
      )?.calculatedMinor,
      accountSetup.account.currentBalanceMinor,
    );
    assert.equal(adjustedSetup.adjustments.length, 1);
    const adjustedHistory = await getAccountHistory({
      ...owner,
      accountId: receivingAccount.accountId,
    });
    assert.equal(
      adjustedHistory.account.currentBalanceMinor,
      adjustedSetup.account.currentBalanceMinor,
    );
    assert.deepEqual(
      adjustedHistory.entries
        .filter((e) => e.actionId === adjusted[0]!.actionId)
        .map((e) => e.signedAmountMinor),
      ["100"],
    );
    await assert.rejects(
      adjustAccountBalance({ ...adjustmentCommand, reason: "Changed payload" }),
      FinancialCommandConflictError,
    );
    await assert.rejects(
      adjustAccountBalance({
        ...adjustmentCommand,
        clientCommandId: randomUUID(),
      }),
      ReconciliationPreviewStaleError,
    );
    assert.deepEqual(await reconcileAccount(differenceCommand), difference);
    const verifiedAgain = await reconcileAccount({
      ...differenceCommand,
      clientCommandId: randomUUID(),
      expectedFinancialRevision: adjustedSetup.financialRevision,
      supersedesReconciliationId: difference.reconciliationId,
    });
    assert.equal(verifiedAgain.preview.status, "verified");
    const competingAdjustments = await Promise.allSettled(
      ["100", "-100"].map((signedAdjustmentMinor) =>
        adjustAccountBalance({
          ...adjustmentCommand,
          clientCommandId: randomUUID(),
          expectedFinancialRevision: adjustedSetup.financialRevision,
          reconciliationId: verifiedAgain.reconciliationId,
          signedAdjustmentMinor,
        }),
      ),
    );
    assert.equal(
      competingAdjustments.filter((r) => r.status === "fulfilled").length,
      1,
    );
    assert.ok(
      competingAdjustments.some(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof ReconciliationPreviewStaleError,
      ),
    );
    assert.equal(
      (await getAccountReconciliationSetup(reconciliationScope)).history.find(
        (r) => r.reconciliationId === verifiedAgain.reconciliationId,
      )?.status,
      "needs_review",
    );
    console.log(
      "D11 committed comparisons, no automatic adjustment, explicit cash/equity posting, cutoff invalidation, history consistency, concurrent replay and stale-version conflicts passed.",
    );
    const purchase = await recordExpense({
      ...owner,
      clientCommandId: randomUUID(),
      fundingAccountId: receivingAccount.accountId,
      effectiveDate: "2026-10-08",
      purchaseMinor: "1000",
      splits: [{ amountMinor: "1000" }],
      description: "D12 committed purchase",
      acknowledgeNegativeBalance: true,
    });
    const correction = {
      ...owner,
      actionId: purchase.actionId,
      clientCommandId: randomUUID(),
      expectedActionRevisionId: purchase.actionRevisionId,
      expectedFinancialRevision: purchase.financialRevision,
      reason: "Corrected receipt amount and date",
      replacement: {
        actionKind: "expense" as const,
        fundingAccountId: receivingAccount.accountId,
        effectiveDate: "2026-10-09",
        purchaseMinor: "800",
        splits: [{ amountMinor: "800" }],
        description: "D12 corrected purchase",
        acknowledgeNegativeBalance: true,
      },
    };
    const corrected = await Promise.all([
      correctFinancialAction(correction),
      correctFinancialAction(correction),
    ]);
    assert.deepEqual(corrected[0], corrected[1]);
    assert.equal(corrected[0]!.actionId, purchase.actionId);
    await assert.rejects(
      correctFinancialAction({ ...correction, reason: "Changed payload" }),
      FinancialCommandConflictError,
    );
    const evidence = await getFinancialActionDetail({
      ...owner,
      actionId: purchase.actionId,
    });
    assert.equal(evidence.history.length, 2);
    const refund = {
      ...owner,
      clientCommandId: randomUUID(),
      purchaseActionId: purchase.actionId,
      receivingAccountId: receivingAccount.accountId,
      effectiveDate: "2026-10-10",
      allocations: [
        {
          originalPurchasePostingId: evidence.refundSources[0]!.postingId,
          amountMinor: "200",
          allocationKind: "purchase" as const,
        },
      ],
      description: "D12 genuine later refund",
      acknowledgeNegativeBalance: true,
    };
    const refunded = await Promise.all([
      recordRefund(refund),
      recordRefund(refund),
    ]);
    assert.deepEqual(refunded[0], refunded[1]);
    const d12History = await getAccountHistory({
      ...owner,
      accountId: receivingAccount.accountId,
    });
    assert.equal(
      d12History.entries
        .filter((e) => e.actionId === purchase.actionId)
        .reduce((sum, e) => sum + BigInt(e.signedAmountMinor), 0n),
      -800n,
    );
    assert.equal(
      d12History.entries
        .filter((e) => e.actionId === refunded[0]!.actionId)
        .reduce((sum, e) => sum + BigInt(e.signedAmountMinor), 0n),
      200n,
    );
    await assert.rejects(
      getFinancialActionDetail({ ...other, actionId: purchase.actionId }),
    );
    console.log(
      "D12 committed reversal/replacement, current logical identity, genuine refund, signed account history, concurrent replay, changed-payload conflicts and owner isolation passed.",
    );
    const { getDashboard } =
      await import("@/modules/dashboard/services/get-dashboard");
    const { getSpendingDetail } =
      await import("@/modules/reporting/services/get-spending-detail");
    const dashboard = await getDashboard({
      ...owner,
      query: {
        period: "custom",
        startDate: "2026-10-08",
        endDate: "2026-10-10",
      },
    });
    const contributions = await getSpendingDetail({
      ...owner,
      query: { startDate: "2026-10-08", endDate: "2026-10-10" },
    });
    assert.deepEqual(dashboard.finance.spending, contributions.summary);
    assert.equal(
      dashboard.finance.accounts.find(
        (a) => a.account_id === receivingAccount.accountId,
      )?.current_balance_minor,
      d12History.account.currentBalanceMinor,
    );
    assert.equal(
      contributions.items
        .filter((p) => p.actionId === purchase.actionId)
        .reduce((sum, p) => sum + BigInt(p.amountMinor), 0n),
      800n,
    );
    assert.equal(
      contributions.items
        .filter((p) => p.actionId === refunded[0]!.actionId)
        .reduce((sum, p) => sum + BigInt(p.amountMinor), 0n),
      -200n,
    );
    assert.equal(
      dashboard.activity.filter((a) => a.key === purchase.actionId).length,
      1,
    );
    const foreignDashboard = await getDashboard({
      ...other,
      query: {
        period: "custom",
        startDate: "2026-10-08",
        endDate: "2026-10-10",
      },
    });
    assert.equal(
      foreignDashboard.finance.accounts.some(
        (a) => a.account_id === receivingAccount.accountId,
      ),
      false,
    );
    assert.equal(
      foreignDashboard.activity.some((a) => a.key === purchase.actionId),
      false,
    );
    console.log(
      "V1-C1 committed Dashboard/spending snapshot, signed correction/refund contributions, account history consistency, logical activity and owner isolation passed.",
    );
    const { getFinancialReport, getFinancialDetail, getCareerReport } =
      await import("../../src/modules/reporting/services/get-reports");
    const { prepareCsvExport } =
      await import("../../src/modules/reporting/services/export-csv");
    const { parse } = await import("csv-parse/sync");
    const reportQuery = {
      period: "custom" as const,
      startDate: "2026-10-08",
      endDate: "2026-10-10",
    };
    const report = await getFinancialReport({ ...owner, query: reportQuery });
    assert.equal(report.metrics.net, contributions.summary.netMinor);
    assert.deepEqual(report.identities, {
      cashMatches: true,
      liabilityMatches: true,
    });
    const detail = await getFinancialDetail({
      ...owner,
      query: { ...reportQuery, metric: "net" },
    });
    assert.equal(detail.amountMinor, report.metrics.net);
    const prepared = await prepareCsvExport({
      ...owner,
      kind: "report",
      query: reportQuery,
    });
    const csvRows = parse(prepared.buffer, {
      bom: true,
      columns: true,
    }) as Record<string, string>[];
    assert.equal(csvRows[0]!.record_type, "manifest");
    assert.equal(csvRows[0]!.financial_revision, report.financialRevision);
    assert.equal(
      csvRows.find((r) => r.metric === "net")?.amount_minor,
      report.metrics.net,
    );
    const provenance = await withDomainTransaction(
      owner,
      (t) =>
        t.db.execute(
          sql`SELECT state FROM ops.export_run WHERE id=${prepared.exportRunId}::uuid`,
        ),
      { readOnlySnapshot: true },
    );
    assert.equal(provenance.rows[0]!.state, "completed");
    const otherProvenance = await withDomainTransaction(
      other,
      (t) =>
        t.db.execute(
          sql`SELECT id FROM ops.export_run WHERE id=${prepared.exportRunId}::uuid`,
        ),
      { readOnlySnapshot: true },
    );
    assert.equal(otherProvenance.rows.length, 0);
    assert.equal(
      (await getFinancialReport({ ...owner, query: reportQuery }))
        .financialRevision,
      report.financialRevision,
    );
    assert.equal(
      (await getCareerReport({ ...other, query: reportQuery })).summary
        .responseRate,
      null,
    );
    // Prove a multi-query report remains on its repeatable read snapshot while
    // an independent command commits. This is distinct from freshness on reload.
    const { recordIncome } =
      await import("../../src/modules/finance/services/record-income");
    await withDomainTransaction(
      owner,
      async (t) => {
        const first = await (
          await import("../../src/modules/reporting/services/get-reports")
        ).getFinancialReportInTransaction(t, {
          workspaceId: owner.workspaceId,
          query: reportQuery,
        });
        await recordIncome({
          ...owner,
          clientCommandId: randomUUID(),
          receivingAccountId: receivingAccount.accountId,
          effectiveDate: "2026-10-10",
          amountMinor: "1",
          incomeClass: "earned",
          description: "Snapshot concurrent fixture income",
          acknowledgeNegativeBalance: true,
        });
        const second = await (
          await import("../../src/modules/reporting/services/get-reports")
        ).getFinancialReportInTransaction(t, {
          workspaceId: owner.workspaceId,
          query: reportQuery,
        });
        assert.deepEqual(second.metrics, first.metrics);
        assert.equal(second.financialRevision, first.financialRevision);
      },
      { readOnlySnapshot: true },
    );
    const fresh = await getFinancialReport({ ...owner, query: reportQuery });
    assert.equal(
      BigInt(fresh.metrics.income),
      BigInt(report.metrics.income) + 1n,
    );
    console.log(
      "V1-C2 committed reports/drilldown/CSV provenance, exact values, owner isolation, nonfinancial export and concurrent repeatable snapshot passed.",
    );
    const reminderFinancialBefore = await getFinancialReport({
      ...owner,
      query: reportQuery,
    });
    const reminderEvent = await createPersonalEvent({
      ...owner,
      clientCommandId: randomUUID(),
      title: "Reminder committed source",
      temporalKind: "date",
      eventDate: "2026-01-01",
    });
    const reminderTarget = {
      sourceKind: "personal_event" as const,
      sourceId: reminderEvent.eventId,
    };
    const reminderBefore = await getReminder(owner, reminderTarget);
    assert.equal(reminderBefore.rules[0]!.id, null);
    const reminderCommand = {
      target: reminderTarget,
      expectedSnapshot: reminderBefore.snapshot,
      clientCommandId: randomUUID(),
      action: { kind: "dismiss" as const, ruleKey: "0:09:00" },
    };
    await mutateReminder(owner, reminderCommand);
    await mutateReminder(owner, reminderCommand);
    assert.equal(
      (await getReminder(owner, reminderTarget)).rules[0]!.state,
      "dismissed",
    );
    await assert.rejects(
      getReminder(other, reminderTarget),
      ReminderUnavailableError,
    );
    await assert.rejects(
      mutateReminder(owner, {
        ...reminderCommand,
        action: { kind: "restore", ruleKey: "0:09:00" },
      }),
      CommandReceiptConflictError,
    );
    await withDomainTransaction(
      owner,
      async (t) => {
        assert.equal(
          (
            await t.db.execute<{ count: string }>(
              sql`SELECT count(*)::text count FROM time.reminder_occurrence WHERE personal_event_id=${reminderEvent.eventId}::uuid`,
            )
          ).rows[0]!.count,
          "1",
        );
      },
      { readOnlySnapshot: true },
    );
    assert.ok(
      !(await getReminderAttention(owner)).items.some(
        (r) =>
          "sourceId" in r.target && r.target.sourceId === reminderEvent.eventId,
      ),
    );
    await mutatePersonalEvent({
      ...owner,
      eventId: reminderEvent.eventId,
      expectedEventVersion: 1,
      clientCommandId: randomUUID(),
      action: "cancel",
    });
    const reminderClosed = await getReminder(owner, reminderTarget);
    assert.equal(reminderClosed.eligible, false);
    assert.equal(reminderClosed.history[0]!.state, "cancelled");
    await mutateReminder(owner, reminderCommand);
    assert.equal(
      (await getFinancialReport({ ...owner, query: reportQuery }))
        .financialRevision,
      reminderFinancialBefore.financialRevision,
    );
    console.log(
      "V1-C3 committed reminder replay/conflict, source cancellation, owner isolation, read-time attention and financial independence passed.",
    );
    const profile = (await getIdentityProfile(owner.userId))!;
    const profileCommand = {
      clientCommandId: randomUUID(),
      expectedVersion: profile.version,
      displayName: "Verified lifecycle fixture",
    };
    assert.equal(
      (await updateProfile(owner, profileCommand)).displayName,
      profileCommand.displayName,
    );
    assert.equal(
      (await updateProfile(owner, profileCommand)).displayName,
      profileCommand.displayName,
    );
    const cardReportBefore = await getFinancialReport({
      ...owner,
      query: reportQuery,
    });
    const cardCommand = {
      ...owner,
      clientCommandId: randomUUID(),
      name: "Verification card",
      issuerName: "Test issuer",
      creditLimitMinor: "9007199254740993",
    };
    const card = await createCreditCard(cardCommand);
    assert.deepEqual(
      await createCreditCard({ ...cardCommand, requestId: randomUUID() }),
      card,
    );
    await assert.rejects(
      createCreditCard({ ...cardCommand, name: "Conflicting card" }),
      FinancialCommandConflictError,
    );
    assert.equal(
      (await getCreditCardDetail({ ...owner, cardId: card.cardId })).card
        .postedOutstandingMinor,
      "0",
    );
    assert.equal(
      (await getCreditCardDetail({ ...owner, cardId: card.cardId })).card
        .creditLimitMinor,
      "9007199254740993",
    );
    const preservedCard = await createCreditCard({
      ...other,
      clientCommandId: randomUUID(),
      name: "Preserved other card",
      issuerName: "Other issuer",
    });
    await assert.rejects(
      getCreditCardDetail({ ...owner, cardId: preservedCard.cardId }),
    );
    await updateCreditCard({
      ...owner,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      expectedVersion: 1,
      name: "Archived verification card",
      issuerName: "Test issuer",
      archived: true,
    });
    assert.equal((await listCreditCards(owner)).items.length, 0);
    assert.equal(
      (await listCreditCards({ ...owner, includeArchived: true })).items.length,
      1,
    );
    assert.deepEqual(
      (await getFinancialReport({ ...owner, query: reportQuery })).metrics,
      cardReportBefore.metrics,
    );
    console.log(
      "V2-A1 card identity, exact metadata, replay/conflict, archive, ownership and unchanged V1 financial totals passed.",
    );
    await updateCreditCard({
      ...owner,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      expectedVersion: 2,
      name: "Verification card",
      issuerName: "Test issuer",
      archived: false,
    });
    const cardPurchase = {
      ...owner,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      effectiveDate: "2026-10-10",
      postingDate: "2026-11-02",
      providerReference: "Verified provider line",
      purchaseMinor: "300000",
      splits: [{ amountMinor: "300000", categoryId: null }],
      description: "A2 migration-chain purchase",
    };
    const recordedCardPurchase = await recordCardPurchase(cardPurchase);
    assert.deepEqual(
      await recordCardPurchase(cardPurchase),
      recordedCardPurchase,
    );
    const cardReportAfter = await getFinancialReport({
      ...owner,
      query: reportQuery,
    });
    assert.equal(
      cardReportAfter.metrics.closing_cash,
      cardReportBefore.metrics.closing_cash,
    );
    assert.equal(
      cardReportAfter.metrics.gross,
      (BigInt(cardReportBefore.metrics.gross) + 300000n).toString(),
    );
    assert.equal(
      cardReportAfter.metrics.closing_liability,
      (BigInt(cardReportBefore.metrics.closing_liability) + 300000n).toString(),
    );
    assert.equal(
      (await getCreditCardDetail({ ...owner, cardId: card.cardId })).card
        .postedOutstandingMinor,
      "300000",
    );
    const preservedCardPurchase = await recordCardPurchase({
      ...cardPurchase,
      ...other,
      cardId: preservedCard.cardId,
      clientCommandId: randomUUID(),
    });
    console.log(
      "V2-A2 posted card purchase, replay, spending/liability once, unchanged cash and provider evidence passed.",
    );
    const statementCommand = {
      ...owner,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      cycleStart: "2026-11-01",
      cycleEnd: "2026-11-30",
      statementDate: "2026-12-01",
      dueDate: "2026-12-20",
      balanceMinor: "300000",
      minimumDueMinor: "10000",
      openingBalanceMinor: "0",
      verifiedDate: "2026-12-02",
      verificationSource: "Provider statement checked",
      entries: [
        {
          description: "Verified provider purchase",
          amountMinor: "300000",
          postingDate: "2026-11-02",
          actionRevisionId: recordedCardPurchase.actionRevisionId,
        },
      ],
    };
    const statement = await recordCardStatement(statementCommand);
    assert.deepEqual(await recordCardStatement(statementCommand), statement);
    const statementCorrection = await recordCardStatement({
      ...statementCommand,
      clientCommandId: randomUUID(),
      statementId: statement.statementId,
      expectedVersion: 1,
      reason: "Provider corrected reference",
      providerReference: "Corrected provider reference",
    });
    assert.equal(statementCorrection.version, 2);
    const originalStatement = await getCardStatement({
      ...owner,
      cardId: card.cardId,
      statementId: statement.statementId,
      revisionId: statement.revisionId,
    });
    assert.equal(originalStatement.snapshot.providerReference, null);
    assert.equal(originalStatement.isCurrent, false);
    assert.equal(
      originalStatement.reconciliation.recordedRemainingDueMinor,
      "300000",
    );
    assert.equal(
      originalStatement.reconciliation.unexplainedDifferenceMinor,
      "0",
    );
    assert.deepEqual(
      (await getFinancialReport({ ...owner, query: reportQuery })).metrics,
      cardReportAfter.metrics,
    );
    const preservedStatement = await recordCardStatement({
      ...statementCommand,
      ...other,
      cardId: preservedCard.cardId,
      clientCommandId: randomUUID(),
      entries: [
        {
          description: "Other provider purchase",
          amountMinor: "300000",
          postingDate: "2026-11-02",
          actionRevisionId: preservedCardPurchase.actionRevisionId,
        },
      ],
    });
    console.log(
      "V2-A3 verified statements, explicit membership, exact due, immutable correction history, replay and unchanged ledger totals passed.",
    );
    // Earlier V1 fixtures intentionally exercise acknowledged negative cash.
    // Give this A4 transfer its own funded account and prove its exact cash effect.
    const cardPayingAccount = await openFinancialAccount({
      ...owner,
      clientCommandId: randomUUID(),
      name: "A4 actual paying account",
      accountType: "checking",
      openingCutoffDate: "2026-10-01",
      openingBalanceMinor: "10000",
    });
    const cardPayment = {
      ...owner,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      actionKind: "card_payment" as const,
      effectiveDate: "2026-12-03",
      postingDate: "2026-12-04",
      amountMinor: "8000",
      payingAccountId: cardPayingAccount.accountId,
      description: "Actual card cash payment",
      providerConfirmed: true as const,
      confirmationSource: "Provider payment receipt",
    };
    const paid = await recordCardCommand(cardPayment);
    assert.deepEqual(await recordCardCommand(cardPayment), paid);
    assert.equal(
      (
        await getAccountHistory({
          ...owner,
          accountId: cardPayingAccount.accountId,
        })
      ).account.currentBalanceMinor,
      "2000",
    );
    const confirmedAllocation = {
      ...owner,
      cardId: card.cardId,
      clientCommandId: randomUUID(),
      statementRevisionId: statementCorrection.revisionId,
      sourceActionRevisionId: paid.actionRevisionId,
      amountMinor: "5000",
      confirmationKind: "provider" as const,
      confirmationSource: "Provider confirmed October application",
      confirmedDate: "2026-12-04",
    };
    const applied = await recordCardAllocation(confirmedAllocation);
    assert.deepEqual(await recordCardAllocation(confirmedAllocation), applied);
    const allocatedStatement = await getCardStatement({
      ...owner,
      cardId: card.cardId,
      statementId: statement.statementId,
    });
    assert.equal(allocatedStatement.snapshot.balanceMinor, "300000");
    assert.equal(
      allocatedStatement.reconciliation.recordedRemainingDueMinor,
      "295000",
    );
    const providerPlan = {
      ...owner,
      cardId: card.cardId,
      clientCommandId: randomUUID(),
      purchaseActionId: recordedCardPurchase.actionId,
      purchaseActionRevisionId: recordedCardPurchase.actionRevisionId,
      principalMinor: "300000",
      installmentCount: 3,
      providerConfirmed: true as const,
      verificationSource: "Full provider schedule",
      verifiedDate: "2026-12-04",
      installments: ["2026-12-10", "2027-01-10", "2027-02-10"].map(
        (dueDate) => ({
          dueDate,
          principalMinor: "100000",
          interestMinor: "0",
          feeMinor: "0",
          totalMinor: "100000",
        }),
      ),
    };
    const plan = await recordCardInstallmentPlan(providerPlan);
    assert.deepEqual(await recordCardInstallmentPlan(providerPlan), plan);
    const appliedInstallment = {
      ...owner,
      cardId: card.cardId,
      planId: plan.planId,
      clientCommandId: randomUUID(),
      planRevisionId: plan.revisionId,
      installmentNo: 1,
      allocationId: applied.allocationId,
      principalMinor: "5000",
      confirmationKind: "provider" as const,
      confirmationSource: "Explicit confirmed installment portion",
      confirmedDate: "2026-12-04",
    };
    const application = await recordInstallmentApplication(appliedInstallment);
    assert.deepEqual(
      await recordInstallmentApplication(appliedInstallment),
      application,
    );
    assert.equal(
      (
        await getCardInstallmentPlan({
          ...owner,
          cardId: card.cardId,
          planId: plan.planId,
        })
      ).totals.remainingPrincipalMinor,
      "295000",
    );
    await reverseInstallmentApplication({
      ...owner,
      cardId: card.cardId,
      planId: plan.planId,
      clientCommandId: randomUUID(),
      applicationId: application.applicationId,
      reason: "Correct provider confirmation",
    });
    const cancelled = await recordCardInstallmentPlan({
      ...providerPlan,
      clientCommandId: randomUUID(),
      planId: plan.planId,
      expectedVersion: 1,
      reason: "Provider cancelled",
      lifecycle: "cancelled",
    });
    assert.equal(cancelled.version, 2);
    assert.equal(
      (
        await getCardInstallmentPlan({
          ...owner,
          cardId: card.cardId,
          planId: plan.planId,
        })
      ).totals.remainingPrincipalMinor,
      null,
    );
    const { getCardSurface } =
      await import("../../src/modules/finance/services/read-card-surface");
    const integrated = await getCardSurface(owner);
    assert.equal(
      integrated.statements.find((s) => s.statementId === statement.statementId)
        ?.remainingDueMinor,
      (
        await getCardStatement({
          ...owner,
          cardId: card.cardId,
          statementId: statement.statementId,
        })
      ).reconciliation.recordedRemainingDueMinor,
    );
    const cardSource = {
      sourceKind: "card_statement" as const,
      sourceId: statement.statementId,
    };
    const cardReminder = await getReminder(owner, cardSource);
    if (cardReminder.eligible) {
      const cmd = {
        target: cardSource,
        clientCommandId: randomUUID(),
        expectedSnapshot: cardReminder.snapshot,
        action: { kind: "dismiss" as const, ruleKey: "0:09:00" },
      };
      await mutateReminder(owner, cmd);
      await mutateReminder(owner, cmd);
      assert.equal(
        (await getReminder(owner, cardSource)).rules[0]?.state,
        "dismissed",
      );
    }
    assert.ok(integrated.warning.includes("overlap"));
    console.log(
      "V2-A6 current posted cards, exact verified statement due, provider projections and replay-safe scoped reminders passed.",
    );
    const preservedPlan = await recordCardInstallmentPlan({
      ...providerPlan,
      ...other,
      cardId: preservedCard.cardId,
      clientCommandId: randomUUID(),
      purchaseActionId: preservedCardPurchase.actionId,
      purchaseActionRevisionId: preservedCardPurchase.actionRevisionId,
    });
    console.log(
      "V2-A5 complete provider schedules, replay, explicit A4 applications/reversals and immutable cancellation passed without additional financial recognition.",
    );
    await reverseCardAllocation({
      ...owner,
      cardId: card.cardId,
      clientCommandId: randomUUID(),
      allocationId: applied.allocationId,
      reason: "Correct confirmed application",
    });
    assert.equal(
      (
        await getCardStatement({
          ...owner,
          cardId: card.cardId,
          statementId: statement.statementId,
        })
      ).reconciliation.recordedRemainingDueMinor,
      "300000",
    );
    assert.equal(
      (await getCreditCardDetail({ ...owner, cardId: card.cardId })).card
        .postedOutstandingMinor,
      "292000",
    );
    console.log(
      "V2-A4 actual payment/replay, explicit partial allocation/reversal, unchanged provider snapshot and exact due passed; purge includes immutable allocation history.",
    );
    const recurringBody = {
      ...owner,
      operation: "definition" as const,
      clientCommandId: randomUUID(),
      obligationId: null,
      expectedVersion: null,
      name: "Committed recurring migration smoke",
      kind: "bill" as const,
      reason: null,
      rule: {
        effectiveFrom: "2026-10-01",
        frequency: "monthly" as const,
        intervalCount: 1,
        weekdays: null,
        dayOfMonth: 10,
        shortMonthPolicy: "last_valid_day" as const,
        endsOn: null,
        occurrenceLimit: 3,
        expectedMinor: "1000",
        currency: "PHP" as const,
        categoryId: null,
        defaultAccountId: null,
        timezone: "Asia/Manila",
      },
      window: { from: "2026-10-01", through: "2026-12-31" },
    };
    const beforeRecurring = await getCreditCardDetail({
      ...owner,
      cardId: card.cardId,
    });
    const recurring = await recordRecurringCommand(recurringBody);
    assert.deepEqual(await recordRecurringCommand(recurringBody), recurring);
    assert.equal(recurring.occurrenceIds!.length, 3);
    const link = await recordRecurringCommand({
      ...owner,
      operation: "link",
      clientCommandId: randomUUID(),
      occurrenceId: recurring.occurrenceIds![0]!,
      expectedVersion: 1,
      actionId: recordedCardPurchase.actionId,
      actionRevisionId: recordedCardPurchase.actionRevisionId,
      linkedMinor: "1000",
    });
    assert.equal(
      (
        await getRecurringOccurrence({
          ...owner,
          occurrenceId: recurring.occurrenceIds![0]!,
        })
      ).occurrence.state,
      "completed",
    );
    await recordRecurringCommand({
      ...owner,
      operation: "unlink",
      clientCommandId: randomUUID(),
      linkId: link.linkId!,
      expectedOccurrenceVersion: 2,
      reason: "Migration reversal smoke",
    });
    assert.equal(
      (
        await getRecurringOccurrence({
          ...owner,
          occurrenceId: recurring.occurrenceIds![0]!,
        })
      ).remainingMinor,
      "1000",
    );
    assert.equal(
      (await getCreditCardDetail({ ...owner, cardId: card.cardId })).card
        .postedOutstandingMinor,
      beforeRecurring.card.postedOutstandingMinor,
    );
    const preservedRecurring = await recordRecurringCommand({
      ...recurringBody,
      ...other,
      clientCommandId: randomUUID(),
    });
    console.log(
      "V2-B bounded recurring evidence/replay, explicit actual linkage/reversal and unchanged card liability passed; complete planning history is included in purge.",
    );
    const budgetCategory = (await listCategories({ ...owner, kind: "expense" }))
        .items[0]!,
      otherBudgetCategory = (
        await listCategories({ ...other, kind: "expense" })
      ).items[0]!;
    const budgetBody = {
      ...owner,
      operation: "save" as const,
      clientCommandId: randomUUID(),
      budgetId: null,
      expectedVersion: null,
      reason: null,
      fields: {
        categoryId: budgetCategory.categoryId,
        startDate: "2026-10-01",
        endDateExclusive: "2026-11-01",
        limitMinor: "0",
        basis: "net" as const,
        notes: "Migration budget evidence",
      },
    };
    const budgetSmoke = await recordBudgetCommand(budgetBody);
    assert.deepEqual(await recordBudgetCommand(budgetBody), budgetSmoke);
    await recordBudgetCommand({
      ...budgetBody,
      clientCommandId: randomUUID(),
      budgetId: budgetSmoke.budgetId,
      expectedVersion: 1,
      reason: "Reviewed exact limit",
      fields: { ...budgetBody.fields, limitMinor: "9007199254740993" },
    });
    const budgetView = await getBudget({
      ...owner,
      budgetId: budgetSmoke.budgetId,
    });
    assert.equal(budgetView.budget.limit_minor, "9007199254740993");
    assert.equal(budgetView.history.items.length, 2);
    const preservedBudget = await recordBudgetCommand({
      ...budgetBody,
      ...other,
      clientCommandId: randomUUID(),
      fields: {
        ...budgetBody.fields,
        categoryId: otherBudgetCategory.categoryId,
      },
    });
    console.log(
      "V2-C exact category-period budgets, immutable audit/replay and nonfinancial lifecycle evidence passed.",
    );
    const deletionPreview = await getDeletionPreview(owner);
    const proofSession = randomUUID();
    await getAuthPool().query(
      "INSERT INTO auth.session(id,user_id,token,updated_at,expires_at) VALUES($1,$2,$3,clock_timestamp(),clock_timestamp()+interval '7 days')",
      [proofSession, owner.userId, randomUUID()],
    );
    await getAuthPool().query(
      "INSERT INTO auth.session_assurance(session_id,method,verified_at) VALUES($1,'password',clock_timestamp())",
      [proofSession],
    );
    const deletionActor = { ...owner, sessionId: proofSession };
    const deletionCommand = {
      clientCommandId: randomUUID(),
      expectedSnapshot: deletionPreview.snapshot,
      confirmation: "DELETE MY WORKSPACE AND ACCOUNT" as const,
    };
    const deletion = await withDomainTransaction(owner, (t) =>
      requestDeletionInTransaction(t, deletionActor, deletionCommand),
    );
    assert.deepEqual(
      await withDomainTransaction(owner, (t) =>
        requestDeletionInTransaction(t, deletionActor, deletionCommand),
      ),
      deletion,
    );
    const bootstrapSecrets = parseEnv(await readFile(".env.bootstrap", "utf8"));
    const operatorUrl = new URL(inDatabase(process.env.DATABASE_URL!));
    operatorUrl.username = "lifecycle_operator";
    operatorUrl.password = bootstrapSecrets.LIFECYCLE_OPERATOR_PASSWORD!;
    const operator = new Client({ connectionString: operatorUrl.toString() });
    const fixtureAdministrator = new Client({
      connectionString: inDatabase(process.env.TEST_DATABASE_ADMIN_URL!),
    });
    try {
      await operator.connect();
      await fixtureAdministrator.connect();
      // Disposable synthetic database only: advance this request's test clock.
      await fixtureAdministrator.query("BEGIN");
      await fixtureAdministrator.query(
        "SET LOCAL session_replication_role='replica'",
      );
      await fixtureAdministrator.query(
        "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_user_id=$2",
        [deletion.requestId, owner.userId],
      );
      await fixtureAdministrator.query("COMMIT");
      let complete = false;
      for (let step = 0; step < 10; step++) {
        if (
          (await purgeDeletionStep(operator, deletion.requestId, 10000))
            .state === "completed"
        ) {
          complete = true;
          break;
        }
      }
      assert.equal(complete, true);
      assert.equal(
        (await purgeDeletionStep(operator, deletion.requestId)).state,
        "completed",
      );
      assert.equal(
        (
          await fixtureAdministrator.query(
            "SELECT id FROM core.workspace WHERE id=$1",
            [owner.workspaceId],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await operator.query(
            "SELECT id FROM ops.deletion_tombstone WHERE target_user_id=$1",
            [owner.userId],
          )
        ).rowCount,
        1,
      );
      assert.equal(
        (
          await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
            other.userId,
          ])
        ).rowCount,
        1,
      );
      assert.equal(
        (await getCreditCardDetail({ ...other, cardId: preservedCard.cardId }))
          .card.name,
        "Preserved other card",
      );
      assert.equal(
        (
          await getCardStatement({
            ...other,
            cardId: preservedCard.cardId,
            statementId: preservedStatement.statementId,
          })
        ).snapshot.balanceMinor,
        "300000",
      );
      assert.equal(
        (
          await fixtureAdministrator.query(
            "SELECT id FROM finance.credit_card WHERE id=$1",
            [card.cardId],
          )
        ).rowCount,
        0,
      );
      for (const table of [
        "card_installment_plan",
        "card_installment_revision",
        "card_installment",
        "card_installment_application",
      ])
        assert.equal(
          (
            await fixtureAdministrator.query(
              `SELECT workspace_id FROM finance.${table} WHERE workspace_id=$1`,
              [owner.workspaceId],
            )
          ).rowCount,
          0,
        );
      for (const table of [
        "recurring_obligation",
        "recurrence_version",
        "expected_occurrence",
        "occurrence_actual_link",
        "budget",
      ])
        assert.equal(
          (
            await fixtureAdministrator.query(
              `SELECT workspace_id FROM planning.${table} WHERE workspace_id=$1`,
              [owner.workspaceId],
            )
          ).rowCount,
          0,
        );
      assert.equal(
        (await getBudget({ ...other, budgetId: preservedBudget.budgetId }))
          .budget.version,
        1,
      );
      assert.equal(
        (
          await getRecurringObligation({
            ...other,
            obligationId: preservedRecurring.obligationId,
          })
        ).occurrences.items.length,
        3,
      );
      assert.equal(
        (
          await getCardInstallmentPlan({
            ...other,
            cardId: preservedCard.cardId,
            planId: preservedPlan.planId,
          })
        ).snapshot.principalMinor,
        "300000",
      );
    } finally {
      await operator.end();
      await fixtureAdministrator.end();
    }
    console.log(
      "V1-C4 profile audit/replay, restricted deletion request, complete scoped evidence purge, tombstone and other-owner preservation passed.",
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
