import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
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

  const rollbackMarker = new Error("ROLLBACK_TRANSFER_REFERENCE_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the transfer-reference integration test transaction to roll back.",
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

async function createAccount(
  transaction: ScopedTransaction,
  user: TestUser,
  name: string,
): Promise<string> {
  const result = await openFinancialAccountInTransaction(transaction, {
    userId: user.userId,
    workspaceId: user.workspaceId,

    clientCommandId: randomUUID(),

    name,

    accountType: "cash",

    openingCutoffDate: "2026-10-01",

    openingBalanceMinor: "0",
  });

  return result.accountId;
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("transfer financial reference boundary", () => {
  it("surfaces an unavailable source or destination through the typed account-reference error", async () => {
    const user = await createTestUser("TransferMissingAccount");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const destinationAccountId = await createAccount(
          transaction,
          user,
          "Destination Wallet",
        );

        await expect(
          recordTransferInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            sourceAccountId: randomUUID(),

            destinationAccountId,

            effectiveDate: "2026-10-07",

            destinationPrincipalMinor: "10000",

            description: "Unavailable source transfer",
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
        "pmp-transfer-reference-boundary-test-cleanup",
      );
    }
  });

  it("surfaces an unavailable separately paying fee account through the same private account contract", async () => {
    const user = await createTestUser("TransferMissingFeeAccount");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const sourceAccountId = await createAccount(
          transaction,
          user,
          "Source Wallet",
        );

        const destinationAccountId = await createAccount(
          transaction,
          user,
          "Destination Wallet",
        );

        await expect(
          recordTransferInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            sourceAccountId,
            destinationAccountId,

            effectiveDate: "2026-10-07",

            destinationPrincipalMinor: "10000",

            fees: [
              {
                label: "Separate fee",

                amountMinor: "100",

                effectiveDate: "2026-10-08",

                bearingAccountId: randomUUID(),

                treatment: "separate",
              },
            ],

            description: "Transfer with unavailable fee account",
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
        "pmp-transfer-reference-boundary-test-cleanup",
      );
    }
  });

  it("surfaces an unavailable transfer-fee category before creating the economic action", async () => {
    const user = await createTestUser("TransferMissingFeeCategory");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const sourceAccountId = await createAccount(
          transaction,
          user,
          "Source Wallet",
        );

        const destinationAccountId = await createAccount(
          transaction,
          user,
          "Destination Wallet",
        );

        await expect(
          recordTransferInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            sourceAccountId,
            destinationAccountId,

            effectiveDate: "2026-10-07",

            destinationPrincipalMinor: "10000",

            fees: [
              {
                label: "Processing fee",

                amountMinor: "100",

                treatment: "source_additional",

                categoryId: randomUUID(),
              },
            ],

            description: "Transfer with unavailable fee category",
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
        "pmp-transfer-reference-boundary-test-cleanup",
      );
    }
  });
});
