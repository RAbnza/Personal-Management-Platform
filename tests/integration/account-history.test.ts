import { randomUUID } from "node:crypto";

import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { getAccountHistoryInTransaction } from "@/modules/finance/services/get-account-history";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import { recordExpenseInTransaction } from "@/modules/finance/services/record-expense";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
import type { ScopedTransaction } from "@/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";

const TEST_DATABASE_NAME = "personal_management_test";

type TestUser = {
  userId: string;
  workspaceId: string;
};

function getTestAdministratorConnectionString() {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_ADMIN_URL is required for account-history integration tests.",
    );
  }

  const url = new URL(connectionString);

  url.pathname = `/${TEST_DATABASE_NAME}`;

  return url.toString();
}

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
      VALUES ($1, $2, $3, true)
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

async function removeTestUser(user: TestUser): Promise<void> {
  const administrator = new Client({
    connectionString: getTestAdministratorConnectionString(),
    application_name: "pmp-account-history-test-cleanup",
  });

  try {
    await administrator.connect();
    await administrator.query("BEGIN");

    try {
      await administrator.query(
        `
          DELETE FROM core."workspace_preference"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."workspace"
          WHERE id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."user_profile"
          WHERE user_id = $1
        `,
        [user.userId],
      );

      await administrator.query("COMMIT");
    } catch (error) {
      await administrator.query("ROLLBACK");

      throw error;
    }
  } finally {
    await administrator.end();
  }

  await getAuthPool().query(
    `
      DELETE FROM auth."user"
      WHERE id = $1
    `,
    [user.userId],
  );
}

async function createExpenseCategory(
  client: PoolClient,
  user: TestUser,
  name: string,
): Promise<string> {
  const categoryId = randomUUID();

  await client.query(
    `
      INSERT INTO core."category" (
        id,
        workspace_id,
        kind,
        name
      )
      VALUES (
        $1,
        $2,
        'expense',
        $3
      )
    `,
    [categoryId, user.workspaceId, name],
  );

  return categoryId;
}

async function runFinancialTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_ACCOUNT_HISTORY_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the account-history test transaction to roll back.",
      );
    } catch (error) {
      if (error !== rollbackMarker) {
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("account history", () => {
  it("derives opening, income, expense and running balances with cursor pagination", async () => {
    const user = await createTestUser("HistoryFlow");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const account = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),

          name: "BDO Savings",
          accountType: "savings",
          institutionName: "BDO",

          openingCutoffDate: "2026-07-01",
          openingBalanceMinor: "200000",
        });

        /*
         * Each financial service deliberately validates all deferred
         * constraints before returning. The test is composing several
         * command services inside one outer rollback transaction, so restore
         * the transaction's normal deferred mode before constructing the
         * next action/revision cycle.
         */
        await client.query("SET CONSTRAINTS ALL DEFERRED");

        const income = await recordIncomeInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),

          receivingAccountId: account.accountId,
          effectiveDate: "2026-07-02",
          amountMinor: "1000000",
          incomeClass: "earned",

          sourceLabel: "Employer",
          description: "Salary received",
        });

        await client.query("SET CONSTRAINTS ALL DEFERRED");

        const groceriesCategoryId = await createExpenseCategory(
          client,
          user,
          "Groceries",
        );

        const expense = await recordExpenseInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),

          fundingAccountId: account.accountId,
          effectiveDate: "2026-07-03",
          purchaseMinor: "30000",

          splits: [
            {
              amountMinor: "30000",
              categoryId: groceriesCategoryId,
            },
          ],

          merchantName: "Grocery Store",
          description: "Groceries",
        });

        const firstPage = await getAccountHistoryInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          accountId: account.accountId,
          pageSize: 2,
        });

        expect(firstPage.financialRevision).toBe("3");

        expect(firstPage.account).toMatchObject({
          accountId: account.accountId,
          name: "BDO Savings",
          accountType: "savings",
          institutionName: "BDO",
          currency: "PHP",
          openingCutoffDate: "2026-07-01",
          archived: false,
          currentBalanceMinor: "1170000",
        });

        expect(firstPage.entries).toHaveLength(2);

        expect(firstPage.entries[0]).toMatchObject({
          actionId: expense.actionId,
          actionRevisionId: expense.actionRevisionId,
          effectiveDate: "2026-07-03",
          journalRole: "economic",
          changeKind: "create",
          actionKind: "expense",
          description: "Groceries",
          signedAmountMinor: "-30000",
          balanceAfterMinor: "1170000",
        });

        expect(firstPage.entries[1]).toMatchObject({
          actionId: income.actionId,
          actionRevisionId: income.actionRevisionId,
          effectiveDate: "2026-07-02",
          journalRole: "economic",
          changeKind: "create",
          actionKind: "income",
          description: "Salary received",
          signedAmountMinor: "1000000",
          balanceAfterMinor: "1200000",
        });

        expect(firstPage.nextCursor).not.toBeNull();

        const secondPage = await getAccountHistoryInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          accountId: account.accountId,
          pageSize: 2,
          cursor: firstPage.nextCursor ?? undefined,
        });

        expect(secondPage.account.currentBalanceMinor).toBe("1170000");

        expect(secondPage.financialRevision).toBe("3");

        expect(secondPage.entries).toHaveLength(1);

        expect(secondPage.entries[0]).toMatchObject({
          actionId: account.openingActionId,
          effectiveDate: "2026-07-01",
          journalRole: "economic",
          changeKind: "create",
          actionKind: "opening_cash",
          signedAmountMinor: "200000",
          balanceAfterMinor: "200000",
        });

        expect(secondPage.nextCursor).toBeNull();
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("retains readable financial history after an account is archived", async () => {
    const user = await createTestUser("ArchivedHistory");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const account = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),

          name: "Archived Wallet",
          accountType: "e_wallet",

          openingCutoffDate: "2026-08-01",
          openingBalanceMinor: "0",
        });

        await client.query("SET CONSTRAINTS ALL DEFERRED");

        const income = await recordIncomeInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),

          receivingAccountId: account.accountId,
          effectiveDate: "2026-08-02",
          amountMinor: "50000",
          incomeClass: "gift",

          senderName: "Another Person",
          description: "Gift received",
        });

        await client.query(
          `
              UPDATE finance."financial_account"
              SET archived_at =
                clock_timestamp()
              WHERE
                workspace_id = $1
                AND id = $2
            `,
          [user.workspaceId, account.accountId],
        );

        const history = await getAccountHistoryInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          accountId: account.accountId,
        });

        expect(history.account.archived).toBe(true);

        expect(history.account.currentBalanceMinor).toBe("50000");

        expect(history.entries).toHaveLength(1);

        expect(history.entries[0]).toMatchObject({
          actionId: income.actionId,
          actionKind: "income",
          effectiveDate: "2026-08-02",
          signedAmountMinor: "50000",
          balanceAfterMinor: "50000",
        });
      });
    } finally {
      await removeTestUser(user);
    }
  });
});
