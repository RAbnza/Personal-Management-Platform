import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
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

async function runCurrencyTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_WORKSPACE_CURRENCY_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the workspace-currency integration test transaction to roll back.",
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

describe("workspace currency integrity", () => {
  it("allows a fresh workspace currency to change before financial structure exists", async () => {
    const user = await createTestUser("FreshCurrency");

    try {
      await runCurrencyTestAndRollback(user, async (_transaction, client) => {
        const before = await client.query<{
          currency: string;
          version: number;
        }>(
          `
            SELECT
              currency,
              version

            FROM core."workspace"

            WHERE id = $1
          `,
          [user.workspaceId],
        );

        expect(before.rows).toEqual([
          {
            currency: "PHP",
            version: 1,
          },
        ]);

        const updated = await client.query<{
          currency: string;
          version: number;
        }>(
          `
            UPDATE core."workspace"

            SET currency = 'USD'

            WHERE id = $1

            RETURNING
              currency,
              version
          `,
          [user.workspaceId],
        );

        expect(updated.rows).toEqual([
          {
            currency: "USD",
            version: 2,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-currency-test-cleanup",
      );
    }
  });

  it("does not allow a referenced zero-balance account currency to be silently rewritten", async () => {
    const user = await createTestUser("ReferencedCurrency");

    try {
      await runCurrencyTestAndRollback(user, async (transaction, client) => {
        const account = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          name: "Zero Balance Wallet",
          accountType: "e_wallet",

          openingCutoffDate: "2026-10-07",
          openingBalanceMinor: "0",
        });

        const postingCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count

            FROM finance."posting"

            WHERE workspace_id = $1
          `,
          [user.workspaceId],
        );

        expect(postingCount.rows[0]?.count).toBe("0");

        await client.query("SAVEPOINT referenced_currency_change");

        let updateError: unknown;

        try {
          await client.query(
            `
              UPDATE core."workspace"

              SET currency = 'USD'

              WHERE id = $1
            `,
            [user.workspaceId],
          );
        } catch (error) {
          updateError = error;
        }

        await client.query("ROLLBACK TO SAVEPOINT referenced_currency_change");
        await client.query("RELEASE SAVEPOINT referenced_currency_change");

        expect(updateError).toMatchObject({
          code: "23503",
        });

        const stored = await client.query<{
          workspace_currency: string;
          account_currency: string;
          ledger_currency: string;
        }>(
          `
            SELECT
              workspace.currency
                AS workspace_currency,

              account.currency
                AS account_currency,

              ledger.currency
                AS ledger_currency

            FROM core."workspace" AS workspace

            INNER JOIN finance."financial_account" AS account
              ON account."workspace_id" =
                workspace."id"

            INNER JOIN finance."ledger_account" AS ledger
              ON ledger."workspace_id" =
                account."workspace_id"

              AND ledger."id" =
                account."ledger_account_id"

            WHERE
              workspace."id" = $1
              AND account."id" = $2
          `,
          [user.workspaceId, account.accountId],
        );

        expect(stored.rows).toEqual([
          {
            workspace_currency: "PHP",
            account_currency: "PHP",
            ledger_currency: "PHP",
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-currency-test-cleanup",
      );
    }
  });

  it("explicitly rejects a workspace currency change once posting history exists", async () => {
    const user = await createTestUser("PostedCurrency");

    try {
      await runCurrencyTestAndRollback(user, async (transaction, client) => {
        await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          name: "Savings Account",
          accountType: "savings",

          openingCutoffDate: "2026-10-07",
          openingBalanceMinor: "100000",
        });

        const postingCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count

            FROM finance."posting"

            WHERE workspace_id = $1
          `,
          [user.workspaceId],
        );

        expect(Number(postingCount.rows[0]?.count ?? "0")).toBeGreaterThan(0);

        await client.query("SAVEPOINT posted_currency_change");

        let updateError: unknown;

        try {
          await client.query(
            `
              UPDATE core."workspace"

              SET currency = 'USD'

              WHERE id = $1
            `,
            [user.workspaceId],
          );
        } catch (error) {
          updateError = error;
        }

        await client.query("ROLLBACK TO SAVEPOINT posted_currency_change");
        await client.query("RELEASE SAVEPOINT posted_currency_change");

        expect(updateError).toMatchObject({
          code: "23514",
        });

        expect(updateError).toMatchObject({
          message: expect.stringMatching(
            /workspace currency cannot change after posting history exists/i,
          ),
        });

        const stored = await client.query<{
          currency: string;
        }>(
          `
            SELECT currency

            FROM core."workspace"

            WHERE id = $1
          `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.currency).toBe("PHP");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-currency-test-cleanup",
      );
    }
  });
});
