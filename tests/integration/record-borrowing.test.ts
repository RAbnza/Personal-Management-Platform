import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import { getAccountHistoryInTransaction } from "@/modules/finance/services/get-account-history";
import { recordBorrowingInTransaction } from "@/modules/finance/services/record-borrowing";
import {
  getDebtDetailInTransaction,
  listDebtsInTransaction,
} from "@/modules/finance/services/read-debts";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";

type TestUser = {
  userId: string;
  workspaceId: string;
};

type FinancialAccountFixture = {
  accountId: string;
  ledgerAccountId: string;
};

async function createTestUser(label: string): Promise<TestUser> {
  const userId = randomUUID();

  const name = `${label} User`;

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
    [userId, name, `${label.toLowerCase()}-${userId}@example.test`],
  );

  const workspace = await provisionPersonalWorkspace({
    userId,
    displayName: name,
  });

  return {
    userId,
    workspaceId: workspace.workspaceId,
  };
}

async function createFinancialAccountFixture(
  transaction: ScopedTransaction,
  user: TestUser,
  input: {
    name: string;
    openingCutoffDate: string;
    archived?: boolean;
  },
): Promise<FinancialAccountFixture> {
  const accountId = randomUUID();

  const ledgerAccountId = randomUUID();

  await transaction.db.execute(sql`
    INSERT INTO "finance"."ledger_account" (
      "id",
      "workspace_id",
      "code",
      "name",
      "kind",
      "currency"
    )
    VALUES (
      ${ledgerAccountId}::uuid,
      ${user.workspaceId}::uuid,
      ${`test-cash:${accountId}`},
      ${input.name},
      'cash_asset',
      'PHP'
    )
  `);

  await transaction.db.execute(sql`
    INSERT INTO "finance"."financial_account" (
      "id",
      "workspace_id",
      "ledger_account_id",
      "name",
      "account_type",
      "currency",
      "opening_cutoff_date",
      "archived_at"
    )
    VALUES (
      ${accountId}::uuid,
      ${user.workspaceId}::uuid,
      ${ledgerAccountId}::uuid,
      ${input.name},
      'checking',
      'PHP',
      ${input.openingCutoffDate}::date,
      CASE
        WHEN ${input.archived ?? false}
        THEN clock_timestamp()
        ELSE NULL
      END
    )
  `);

  return {
    accountId,
    ledgerAccountId,
  };
}

async function findExpenseCategoryId(
  transaction: ScopedTransaction,
  user: TestUser,
  code: string,
): Promise<string> {
  const result = await transaction.db.execute<{
    id: string;
  }>(sql`
    SELECT "id"
    FROM "core"."category"
    WHERE
      "workspace_id" = ${user.workspaceId}::uuid
      AND "kind" = 'expense'
      AND "code" = ${code}
      AND "archived_at" IS NULL
    LIMIT 1
  `);

  const id = result.rows[0]?.id;

  if (!id) {
    throw new Error(`Expected seeded expense category "${code}".`);
  }

  return id;
}

async function rollbackTest(
  operation: (transaction: ScopedTransaction, user: TestUser) => Promise<void>,
): Promise<void> {
  const user = await createTestUser("Borrowing");

  const marker = new Error("ROLLBACK_RECORD_BORROWING_TEST");

  try {
    await expect(
      withDomainTransaction(user, async (transaction) => {
        await operation(transaction, user);

        throw marker;
      }),
    ).rejects.toBe(marker);
  } finally {
    await removeProvisionedTestUser(user, "pmp-record-borrowing-test-cleanup");
  }
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("record borrowing", () => {
  it("records canonical withheld-fee borrowing without treating principal as income", () =>
    rollbackTest(async (transaction, user) => {
      const account = await createFinancialAccountFixture(transaction, user, {
        name: "Loan proceeds account",
        openingCutoffDate: "2026-10-01",
      });

      const feeCategoryId = await findExpenseCategoryId(
        transaction,
        user,
        "transaction_fees",
      );

      const clientCommandId = randomUUID();

      const input = {
        userId: user.userId,
        workspaceId: user.workspaceId,

        clientCommandId,

        name: "Personal loan",
        lenderName: "Example lender",
        productName: "Example loan",

        debtType: "personal_loan" as const,

        borrowingDate: "2026-10-08",

        receivingAccountId: account.accountId,

        principalMinor: "1000000",

        actualReceivedMinor: "980000",

        fees: [
          {
            label: "Processing fee",

            amountMinor: "20000",

            treatment: "withheld" as const,

            categoryId: feeCategoryId,
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

        description: "Personal loan disbursement",

        reference: "LOAN-001",

        notes: "Integration test loan",
      };

      const result = await recordBorrowingInTransaction(transaction, input);

      expect(result.financialRevision).toBe("1");

      const detail = await getDebtDetailInTransaction(transaction, {
        ...user,

        debtId: result.debtId,
      });

      expect(detail.debt).toMatchObject({
        debtId: result.debtId,

        name: "Personal loan",

        lenderName: "Example lender",

        debtType: "personal_loan",

        openingCutoffDate: null,

        originalPrincipalMinor: "1000000",

        recognizedLiabilityMinor: "1000000",

        outstandingPrincipalMinor: "1000000",

        unclassifiedLiabilityMinor: "0",

        breakdownStatus: "known",

        remainingScheduledMinor: "1000000",

        installmentCount: 1,

        lifecycle: "active",
      });

      expect(detail.installments).toEqual([
        expect.objectContaining({
          dueDate: "2026-11-08",

          contractualMinor: "1000000",

          openingSatisfiedMinor: "0",

          remainingMinor: "1000000",

          knownPrincipalMinor: "1000000",

          knownInterestMinor: "0",

          knownFeeMinor: "0",

          breakdownComplete: true,
        }),
      ]);

      const history = await getAccountHistoryInTransaction(transaction, {
        ...user,

        accountId: account.accountId,
      });

      expect(history.account.currentBalanceMinor).toBe("980000");

      expect(history.entries).toHaveLength(1);

      expect(history.entries[0]).toMatchObject({
        actionId: result.actionId,

        actionRevisionId: result.actionRevisionId,

        effectiveDate: "2026-10-08",

        actionKind: "borrowing",

        description: "Personal loan disbursement",

        reference: "LOAN-001",

        signedAmountMinor: "980000",

        balanceAfterMinor: "980000",
      });

      const accounting = await transaction.db.execute<{
        cash_minor: string;

        expense_minor: string;

        principal_liability_minor: string;

        fee_liability_minor: string;

        income_count: string;

        separate_fee_cash_out_count: string;
      }>(sql`
          SELECT
            COALESCE(
              sum(p.amount_minor)
                FILTER (
                  WHERE l.kind = 'cash_asset'
                ),
              0
            )::text
              AS cash_minor,

            COALESCE(
              sum(p.amount_minor)
                FILTER (
                  WHERE l.kind = 'expense'
                ),
              0
            )::text
              AS expense_minor,

            COALESCE(
              sum(-(p.amount_minor))
                FILTER (
                  WHERE
                    l.kind = 'debt_liability'
                    AND p.liability_component = 'principal'
                ),
              0
            )::text
              AS principal_liability_minor,

            COALESCE(
              sum(-(p.amount_minor))
                FILTER (
                  WHERE
                    l.kind = 'debt_liability'
                    AND p.liability_component = 'fee'
                ),
              0
            )::text
              AS fee_liability_minor,

            count(*) FILTER (
              WHERE l.kind = 'income'
            )::text
              AS income_count,

            count(*) FILTER (
              WHERE
                p.cash_flow_kind = 'fee'
                AND p.cash_flow_direction = 'out'
            )::text
              AS separate_fee_cash_out_count

          FROM finance."posting" AS p

          INNER JOIN finance."ledger_account" AS l
            ON l.workspace_id =
              p.workspace_id
            AND l.id =
              p.ledger_account_id

          WHERE
            p.workspace_id =
              ${user.workspaceId}::uuid
            AND p.action_revision_id =
              ${result.actionRevisionId}::uuid
        `);

      expect(accounting.rows).toEqual([
        {
          cash_minor: "980000",

          expense_minor: "20000",

          principal_liability_minor: "1000000",

          fee_liability_minor: "0",

          income_count: "0",

          separate_fee_cash_out_count: "0",
        },
      ]);

      const feeEvidence = await transaction.db.execute<{
        label: string;

        amount_minor: string;

        treatment: string;

        category_id: string | null;

        bearer_kind: string;
      }>(sql`
          SELECT
            fee.label,

            fee.amount_minor::text
              AS amount_minor,

            fee.treatment,

            expense.category_id,

            bearer.kind
              AS bearer_kind

          FROM finance."fee_component" AS fee

          INNER JOIN finance."posting" AS expense
            ON expense.workspace_id =
              fee.workspace_id
            AND expense.action_revision_id =
              fee.action_revision_id
            AND expense.id =
              fee.expense_posting_id

          INNER JOIN finance."ledger_account" AS bearer
            ON bearer.workspace_id =
              fee.workspace_id
            AND bearer.id =
              fee.bearing_ledger_account_id

          WHERE
            fee.workspace_id =
              ${user.workspaceId}::uuid
            AND fee.action_revision_id =
              ${result.actionRevisionId}::uuid
        `);

      expect(feeEvidence.rows).toEqual([
        {
          label: "Processing fee",

          amount_minor: "20000",

          treatment: "withheld",

          category_id: feeCategoryId,

          bearer_kind: "debt_liability",
        },
      ]);

      /*
       * Safe replay must return the original result and must not create a
       * second debt, action or cash receipt.
       */
      const replay = await recordBorrowingInTransaction(transaction, {
        ...input,

        requestId: randomUUID(),
      });

      expect(replay).toEqual(result);

      const counts = await transaction.db.execute<{
        debts: string;
        actions: string;
        receipts: string;
      }>(sql`
          SELECT
            (
              SELECT count(*)::text
              FROM finance."debt"
              WHERE workspace_id =
                ${user.workspaceId}::uuid
            ) AS debts,

            (
              SELECT count(*)::text
              FROM finance."financial_action"
              WHERE workspace_id =
                ${user.workspaceId}::uuid
            ) AS actions,

            (
              SELECT count(*)::text
              FROM finance."receipt_detail"
              WHERE workspace_id =
                ${user.workspaceId}::uuid
            ) AS receipts
        `);

      expect(counts.rows[0]).toEqual({
        debts: "1",
        actions: "1",
        receipts: "1",
      });

      const workspace = await transaction.db.execute<{
        financial_revision: string;
      }>(sql`
          SELECT
            "financial_revision"::text
              AS financial_revision
          FROM "core"."workspace"
          WHERE
            "id" =
              ${user.workspaceId}::uuid
        `);

      expect(workspace.rows[0]?.financial_revision).toBe("1");

      await expect(
        recordBorrowingInTransaction(transaction, {
          ...input,

          description: "Changed borrowing intent",
        }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
    }));

  it("records a capitalized fee as expense plus additional liability without reducing cash proceeds", () =>
    rollbackTest(async (transaction, user) => {
      const account = await createFinancialAccountFixture(transaction, user, {
        name: "Capitalized fee account",
        openingCutoffDate: "2026-10-01",
      });

      const feeCategoryId = await findExpenseCategoryId(
        transaction,
        user,
        "transaction_fees",
      );

      const result = await recordBorrowingInTransaction(transaction, {
        ...user,

        clientCommandId: randomUUID(),

        name: "Capitalized fee loan",

        lenderName: "Example lender",

        productName: null,

        debtType: "installment_loan",

        borrowingDate: "2026-10-08",

        receivingAccountId: account.accountId,

        principalMinor: "1000000",

        actualReceivedMinor: "1000000",

        fees: [
          {
            label: "Capitalized processing fee",

            amountMinor: "20000",

            treatment: "capitalized",

            categoryId: feeCategoryId,
          },
        ],

        installments: [],

        scheduleReason: "Provider has not supplied due dates yet.",

        description: "Loan with capitalized fee",

        reference: null,

        notes: null,
      });

      const detail = await getDebtDetailInTransaction(transaction, {
        ...user,

        debtId: result.debtId,
      });

      expect(detail.debt).toMatchObject({
        recognizedLiabilityMinor: "1020000",

        outstandingPrincipalMinor: "1000000",

        unclassifiedLiabilityMinor: "0",

        remainingScheduledMinor: null,

        installmentCount: 0,

        breakdownStatus: "known",
      });

      expect(detail.installments).toEqual([]);

      const accounting = await transaction.db.execute<{
        cash_minor: string;

        expense_minor: string;

        principal_minor: string;

        fee_liability_minor: string;

        income_count: string;
      }>(sql`
          SELECT
            COALESCE(
              sum(p.amount_minor)
                FILTER (
                  WHERE l.kind = 'cash_asset'
                ),
              0
            )::text
              AS cash_minor,

            COALESCE(
              sum(p.amount_minor)
                FILTER (
                  WHERE l.kind = 'expense'
                ),
              0
            )::text
              AS expense_minor,

            COALESCE(
              sum(-(p.amount_minor))
                FILTER (
                  WHERE
                    l.kind = 'debt_liability'
                    AND p.liability_component =
                      'principal'
                ),
              0
            )::text
              AS principal_minor,

            COALESCE(
              sum(-(p.amount_minor))
                FILTER (
                  WHERE
                    l.kind = 'debt_liability'
                    AND p.liability_component =
                      'fee'
                ),
              0
            )::text
              AS fee_liability_minor,

            count(*) FILTER (
              WHERE l.kind = 'income'
            )::text
              AS income_count

          FROM finance."posting" AS p

          INNER JOIN finance."ledger_account" AS l
            ON l.workspace_id =
              p.workspace_id
            AND l.id =
              p.ledger_account_id

          WHERE
            p.workspace_id =
              ${user.workspaceId}::uuid
            AND p.action_revision_id =
              ${result.actionRevisionId}::uuid
        `);

      expect(accounting.rows).toEqual([
        {
          cash_minor: "1000000",

          expense_minor: "20000",

          principal_minor: "1000000",

          fee_liability_minor: "20000",

          income_count: "0",
        },
      ]);

      const history = await getAccountHistoryInTransaction(transaction, {
        ...user,

        accountId: account.accountId,
      });

      expect(history.account.currentBalanceMinor).toBe("1000000");
    }));

  it("rejects unavailable receiving accounts and expense categories before creating the borrowing action", () =>
    rollbackTest(async (transaction, user) => {
      const validAccount = await createFinancialAccountFixture(
        transaction,
        user,
        {
          name: "Valid receiving account",
          openingCutoffDate: "2026-10-01",
        },
      );

      const baseInput = {
        ...user,

        clientCommandId: randomUUID(),

        name: "Reference boundary loan",

        lenderName: "Example lender",

        productName: null,

        debtType: "personal_loan" as const,

        borrowingDate: "2026-10-08",

        principalMinor: "100000",

        actualReceivedMinor: "100000",

        fees: [],

        installments: [],

        scheduleReason: "No provider schedule yet.",

        description: "Reference boundary borrowing",

        reference: null,

        notes: null,
      };

      await expect(
        recordBorrowingInTransaction(transaction, {
          ...baseInput,

          receivingAccountId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(FinancialAccountReferenceUnavailableError);

      const afterMissingAccount = await transaction.db.execute<{
        count: string;
      }>(sql`
          SELECT count(*)::text
            AS count
          FROM finance."financial_action"
          WHERE
            workspace_id =
              ${user.workspaceId}::uuid
        `);

      expect(afterMissingAccount.rows[0]?.count).toBe("0");

      await expect(
        recordBorrowingInTransaction(transaction, {
          ...baseInput,

          clientCommandId: randomUUID(),

          receivingAccountId: validAccount.accountId,

          principalMinor: "100000",

          actualReceivedMinor: "99000",

          fees: [
            {
              label: "Processing fee",

              amountMinor: "1000",

              treatment: "withheld",

              categoryId: randomUUID(),
            },
          ],
        }),
      ).rejects.toBeInstanceOf(FinancialCategoryReferenceUnavailableError);

      const afterMissingCategory = await transaction.db.execute<{
        count: string;
      }>(sql`
          SELECT count(*)::text
            AS count
          FROM finance."financial_action"
          WHERE
            workspace_id =
              ${user.workspaceId}::uuid
        `);

      expect(afterMissingCategory.rows[0]?.count).toBe("0");
    }));

  it("rejects archived accounts and borrowing on or before the account opening cutoff", () =>
    rollbackTest(async (transaction, user) => {
      const archivedAccount = await createFinancialAccountFixture(
        transaction,
        user,
        {
          name: "Archived account",

          openingCutoffDate: "2026-10-01",

          archived: true,
        },
      );

      const cutoffAccount = await createFinancialAccountFixture(
        transaction,
        user,
        {
          name: "Cutoff account",

          openingCutoffDate: "2026-10-08",
        },
      );

      const makeInput = (
        receivingAccountId: string,
        clientCommandId: string,
      ) => ({
        ...user,

        clientCommandId,

        name: "Account validation loan",

        lenderName: "Example lender",

        productName: null,

        debtType: "personal_loan" as const,

        borrowingDate: "2026-10-08",

        receivingAccountId,

        principalMinor: "100000",

        actualReceivedMinor: "100000",

        fees: [],

        installments: [],

        scheduleReason: "No provider schedule yet.",

        description: "Account validation borrowing",

        reference: null,

        notes: null,
      });

      await expect(
        recordBorrowingInTransaction(
          transaction,
          makeInput(archivedAccount.accountId, randomUUID()),
        ),
      ).rejects.toThrow(/active receiving financial account/i);

      await expect(
        recordBorrowingInTransaction(
          transaction,
          makeInput(cutoffAccount.accountId, randomUUID()),
        ),
      ).rejects.toThrow(/after the receiving account opening cutoff/i);

      expect((await listDebtsInTransaction(transaction, user)).items).toEqual(
        [],
      );
    }));

  it("rolls back the debt, financial action and command receipt when the enclosing transaction fails", async () => {
    const user = await createTestUser("BorrowingRollback");

    const marker = new Error("FORCED_BORROWING_ROLLBACK");

    try {
      await expect(
        withDomainTransaction(user, async (transaction) => {
          const account = await createFinancialAccountFixture(
            transaction,
            user,
            {
              name: "Rollback account",

              openingCutoffDate: "2026-10-01",
            },
          );

          await recordBorrowingInTransaction(transaction, {
            ...user,

            clientCommandId: randomUUID(),

            name: "Rollback loan",

            lenderName: "Example lender",

            productName: null,

            debtType: "personal_loan",

            borrowingDate: "2026-10-08",

            receivingAccountId: account.accountId,

            principalMinor: "100000",

            actualReceivedMinor: "100000",

            fees: [],

            installments: [],

            scheduleReason: "No schedule.",

            description: "Rollback borrowing",

            reference: null,

            notes: null,
          });

          throw marker;
        }),
      ).rejects.toBe(marker);

      await withDomainTransaction(user, async (transaction) => {
        const counts = await transaction.db.execute<{
          debts: string;

          actions: string;

          receipts: string;
        }>(sql`
              SELECT
                (
                  SELECT count(*)::text
                  FROM finance."debt"
                  WHERE workspace_id =
                    ${user.workspaceId}::uuid
                ) AS debts,

                (
                  SELECT count(*)::text
                  FROM finance."financial_action"
                  WHERE workspace_id =
                    ${user.workspaceId}::uuid
                ) AS actions,

                (
                  SELECT count(*)::text
                  FROM core."command_receipt"
                  WHERE workspace_id =
                    ${user.workspaceId}::uuid
                ) AS receipts
            `);

        expect(counts.rows[0]).toEqual({
          debts: "0",
          actions: "0",
          receipts: "0",
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-record-borrowing-test-cleanup",
      );
    }
  });
});
