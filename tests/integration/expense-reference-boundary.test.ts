import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import { recordExpenseInTransaction } from "@/modules/finance/services/record-expense";
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

  const rollbackMarker = new Error("ROLLBACK_EXPENSE_REFERENCE_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the expense-reference integration test transaction to roll back.",
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

describe("expense financial reference boundary", () => {
  it("surfaces an unavailable funding account through the typed Finance reference error", async () => {
    const user = await createTestUser("ExpenseMissingAccount");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        await expect(
          recordExpenseInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            fundingAccountId: randomUUID(),

            effectiveDate: "2026-10-07",

            purchaseMinor: "10000",

            splits: [
              {
                amountMinor: "10000",
              },
            ],

            description: "Unavailable account expense",
          }),
        ).rejects.toBeInstanceOf(FinancialAccountReferenceUnavailableError);

        const actionCount = await client.query<{
          count: string;
        }>(
          `
              SELECT count(*)::text
                AS count

              FROM finance."financial_action"

              WHERE workspace_id = $1
            `,
          [user.workspaceId],
        );

        expect(actionCount.rows[0]?.count).toBe("0");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-expense-reference-boundary-test-cleanup",
      );
    }
  });

  it("surfaces an unavailable expense category before creating an economic action", async () => {
    const user = await createTestUser("ExpenseMissingCategory");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const account = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          name: "Expense Test Wallet",

          accountType: "cash",

          openingCutoffDate: "2026-10-01",

          openingBalanceMinor: "0",
        });

        await expect(
          recordExpenseInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            fundingAccountId: account.accountId,

            effectiveDate: "2026-10-07",

            purchaseMinor: "10000",

            splits: [
              {
                amountMinor: "10000",

                categoryId: randomUUID(),
              },
            ],

            description: "Unavailable category expense",
          }),
        ).rejects.toBeInstanceOf(FinancialCategoryReferenceUnavailableError);

        const actionCount = await client.query<{
          count: string;
        }>(
          `
              SELECT count(*)::text
                AS count

              FROM finance."financial_action"

              WHERE workspace_id = $1
            `,
          [user.workspaceId],
        );

        expect(actionCount.rows[0]?.count).toBe("0");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-expense-reference-boundary-test-cleanup",
      );
    }
  });
});
