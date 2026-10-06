import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
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

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("financial write workspace boundary", () => {
  it("translates lifecycle disappearance into the typed Finance workspace error", async () => {
    const user = await createTestUser("FinancialWriteLifecycle");

    const client = await getDomainPool().connect();

    try {
      await expect(
        runScopedTransactionOnClient(client, user, async (transaction) => {
          await client.query(
            `
              UPDATE core."user_profile"
              SET
                lifecycle = 'deletion_pending',
                deletion_requested_at = clock_timestamp()
              WHERE user_id = $1
            `,
            [user.userId],
          );

          await openFinancialAccountInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            name: "Must Not Be Created",
            accountType: "cash",

            openingCutoffDate: "2026-10-07",

            openingBalanceMinor: "0",
          });
        }),
      ).rejects.toBeInstanceOf(FinancialWriteWorkspaceUnavailableError);
    } finally {
      client.release();

      await removeProvisionedTestUser(
        user,
        "pmp-financial-write-workspace-boundary-test-cleanup",
      );
    }
  });
});
