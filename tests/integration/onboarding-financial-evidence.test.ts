import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { listOnboardingProgressInTransaction } from "@/modules/core/services/list-onboarding-progress";
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

async function runTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error(
    "ROLLBACK_ONBOARDING_FINANCIAL_EVIDENCE_TEST",
  );

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the onboarding Finance-evidence integration test transaction to roll back.",
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

describe("onboarding financial evidence", () => {
  it("derives first-account completion from Finance without creating onboarding state", async () => {
    const user = await createTestUser("OnboardingFinancialEvidence");

    try {
      await runTestAndRollback(user, async (transaction, client) => {
        const before = await listOnboardingProgressInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(
          before.steps.find((step) => step.stepKey === "add-first-account"),
        ).toMatchObject({
          applicable: true,
          state: "pending",
          completedAt: null,
          updatedAt: null,
        });

        const opened = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          requestId: randomUUID(),

          name: "Cash Wallet",

          accountType: "cash",

          institutionName: null,

          openingCutoffDate: "2026-10-07",

          openingBalanceMinor: "0",

          notes: null,
        });

        expect(opened.accountId).toEqual(expect.any(String));

        const after = await listOnboardingProgressInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        const firstAccountStep = after.steps.find(
          (step) => step.stepKey === "add-first-account",
        );

        expect(firstAccountStep).toMatchObject({
          applicable: true,

          state: "completed",

          completedAt: expect.any(String),

          /*
           * Completion is derived from Finance. Merely reading onboarding
           * must not materialize a core.onboarding_step row.
           */
          updatedAt: null,
        });

        expect(after.resolvedApplicableStepCount).toBe(1);

        expect(after.complete).toBe(false);

        const stored = await client.query<{
          count: string;
        }>(
          `
                SELECT
                  count(*)::text
                    AS count

                FROM core."onboarding_step"

                WHERE
                  workspace_id = $1

                  AND guide_version = 1

                  AND step_key =
                    'add-first-account'
              `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.count).toBe("0");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-onboarding-financial-evidence-test-cleanup",
      );
    }
  });
});
