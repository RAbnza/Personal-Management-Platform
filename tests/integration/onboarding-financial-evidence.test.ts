import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { listOnboardingProgressInTransaction } from "@/modules/core/services/list-onboarding-progress";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
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
  it("derives account and real-transaction completion from Finance without creating onboarding state", async () => {
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

        expect(
          before.steps.find(
            (step) => step.stepKey === "record-first-transaction",
          ),
        ).toMatchObject({
          applicable: true,
          state: "pending",
          completedAt: null,
          updatedAt: null,
        });

        /*
         * Use a non-zero opening balance deliberately. Finance will create
         * an opening_cash action, which must complete account setup but must
         * NOT satisfy the user's first real transaction lesson.
         */
        const opened = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          requestId: randomUUID(),

          name: "Cash Wallet",

          accountType: "cash",

          institutionName: null,

          openingCutoffDate: "2026-10-01",

          openingBalanceMinor: "100000",

          notes: null,
        });

        expect(opened.accountId).toEqual(expect.any(String));

        expect(opened.openingActionId).toEqual(expect.any(String));

        const afterOpeningAccount = await listOnboardingProgressInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
          },
        );

        expect(
          afterOpeningAccount.steps.find(
            (step) => step.stepKey === "add-first-account",
          ),
        ).toMatchObject({
          applicable: true,

          state: "completed",

          completedAt: expect.any(String),

          /*
           * Completion is derived from Finance. Reading onboarding does not
           * create a core.onboarding_step row.
           */
          updatedAt: null,
        });

        expect(
          afterOpeningAccount.steps.find(
            (step) => step.stepKey === "record-first-transaction",
          ),
        ).toMatchObject({
          applicable: true,

          /*
           * The opening_cash journal is a baseline, not the user's first
           * real financial transaction.
           */
          state: "pending",

          completedAt: null,
          updatedAt: null,
        });

        expect(afterOpeningAccount.resolvedApplicableStepCount).toBe(1);

        await recordIncomeInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          requestId: randomUUID(),

          receivingAccountId: opened.accountId,

          effectiveDate: "2026-10-07",

          amountMinor: "50000",

          incomeClass: "earned",

          categoryId: null,

          senderName: "Test Employer",

          sourceLabel: null,

          description: "Test income",

          reference: null,

          notes: null,
        });

        const afterTransaction = await listOnboardingProgressInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
          },
        );

        expect(
          afterTransaction.steps.find(
            (step) => step.stepKey === "add-first-account",
          ),
        ).toMatchObject({
          applicable: true,
          state: "completed",
          completedAt: expect.any(String),
          updatedAt: null,
        });

        expect(
          afterTransaction.steps.find(
            (step) => step.stepKey === "record-first-transaction",
          ),
        ).toMatchObject({
          applicable: true,

          state: "completed",

          completedAt: expect.any(String),

          updatedAt: null,
        });

        expect(afterTransaction.resolvedApplicableStepCount).toBe(2);

        expect(afterTransaction.complete).toBe(false);

        /*
         * Evidence-backed Finance lessons remain side-effect free reads.
         * Neither derived completion should create onboarding rows.
         */
        const stored = await client.query<{
          step_key: string;
        }>(
          `
                SELECT
                  step_key

                FROM core."onboarding_step"

                WHERE
                  workspace_id = $1

                  AND guide_version = 1

                  AND step_key IN (
                    'add-first-account',
                    'record-first-transaction'
                  )

                ORDER BY
                  step_key
              `,
          [user.workspaceId],
        );

        expect(stored.rows).toEqual([]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-onboarding-financial-evidence-test-cleanup",
      );
    }
  });
});
