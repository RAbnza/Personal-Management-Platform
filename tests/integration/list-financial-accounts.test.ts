import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { getAccountHistoryInTransaction } from "@/modules/finance/services/get-account-history";
import {
  FinancialAccountWorkspaceUnavailableError,
  listFinancialAccountsInTransaction,
} from "@/modules/finance/services/list-financial-accounts";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
import { recordTransferInTransaction } from "@/modules/finance/services/record-transfer";
import type { ScopedTransaction } from "@/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";

type TestUser = {
  userId: string;
  workspaceId: string;
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

async function runFinancialTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_LIST_FINANCIAL_ACCOUNTS_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the financial-account list integration test transaction to roll back.",
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

describe("list financial accounts", () => {
  it("returns an empty active account list for a newly provisioned workspace", async () => {
    const user = await createTestUser("AccountListEmpty");

    try {
      await runFinancialTestAndRollback(user, async (transaction) => {
        const result = await listFinancialAccountsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(result).toEqual({
          financialRevision: "0",
          items: [],
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-list-financial-accounts-test-cleanup",
      );
    }
  });

  it("derives current balances from posted ledger movements and matches account history", async () => {
    const user = await createTestUser("AccountListBalance");

    try {
      await runFinancialTestAndRollback(user, async (transaction) => {
        const cash = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          name: "Cash Wallet",
          accountType: "cash",

          openingCutoffDate: "2026-10-01",

          openingBalanceMinor: "200000",
        });

        const savings = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          name: "Savings",

          accountType: "savings",

          institutionName: "Example Bank",

          openingCutoffDate: "2026-10-01",

          openingBalanceMinor: "50000",
        });

        await recordIncomeInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          receivingAccountId: cash.accountId,

          effectiveDate: "2026-10-02",

          amountMinor: "100000",

          incomeClass: "earned",

          sourceLabel: "Employer",

          description: "Salary received",
        });

        const transfer = await recordTransferInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          sourceAccountId: cash.accountId,

          destinationAccountId: savings.accountId,

          effectiveDate: "2026-10-03",

          destinationPrincipalMinor: "30000",

          fees: [],

          description: "Move money to savings",
        });

        const result = await listFinancialAccountsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(result.financialRevision).toBe(transfer.financialRevision);

        expect(
          result.items.map((account) => ({
            accountId: account.accountId,

            name: account.name,

            currentBalanceMinor: account.currentBalanceMinor,

            archived: account.archived,
          })),
        ).toEqual([
          {
            accountId: cash.accountId,
            name: "Cash Wallet",

            /*
             * Opening 200,000
             * + income 100,000
             * - transfer 30,000
             */
            currentBalanceMinor: "270000",

            archived: false,
          },
          {
            accountId: savings.accountId,

            name: "Savings",

            /*
             * Opening 50,000
             * + transfer 30,000
             */
            currentBalanceMinor: "80000",

            archived: false,
          },
        ]);

        const history = await getAccountHistoryInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          accountId: cash.accountId,
        });

        const listedCash = result.items.find(
          (account) => account.accountId === cash.accountId,
        );

        expect(listedCash?.currentBalanceMinor).toBe(
          history.account.currentBalanceMinor,
        );

        expect(result.financialRevision).toBe(history.financialRevision);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-list-financial-accounts-test-cleanup",
      );
    }
  });

  it("excludes archived accounts by default and can include them explicitly", async () => {
    const user = await createTestUser("AccountListArchived");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const account = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          name: "Old Wallet",

          accountType: "e_wallet",

          openingCutoffDate: "2026-10-01",

          openingBalanceMinor: "0",
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

        const activeOnly = await listFinancialAccountsInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
          },
        );

        expect(activeOnly.items).toEqual([]);

        const withArchived = await listFinancialAccountsInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            includeArchived: true,
          },
        );

        expect(withArchived.items).toEqual([
          {
            accountId: account.accountId,

            name: "Old Wallet",

            accountType: "e_wallet",

            institutionName: null,

            currency: "PHP",

            openingCutoffDate: "2026-10-01",

            notes: null,

            archived: true,

            currentBalanceMinor: "0",

            version: 2,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-list-financial-accounts-test-cleanup",
      );
    }
  });

  it("does not expose another user's financial accounts", async () => {
    const userA = await createTestUser("AccountListOwnerA");

    const userB = await createTestUser("AccountListOwnerB");

    try {
      await runFinancialTestAndRollback(userA, async (transaction) => {
        let readError: unknown;

        try {
          await listFinancialAccountsInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,
          });
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(
          FinancialAccountWorkspaceUnavailableError,
        );
      });
    } finally {
      await removeProvisionedTestUser(
        userA,
        "pmp-list-financial-accounts-test-cleanup",
      );

      await removeProvisionedTestUser(
        userB,
        "pmp-list-financial-accounts-test-cleanup",
      );
    }
  });
});
