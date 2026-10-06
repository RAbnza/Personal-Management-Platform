import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import {
  listOnboardingProgressInTransaction,
  OnboardingWorkspaceUnavailableError,
} from "@/modules/core/services/list-onboarding-progress";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { setOnboardingStepStateInTransaction } from "@/modules/core/services/set-onboarding-step-state";
import { updateModulePreferenceInTransaction } from "@/modules/core/services/update-module-preference";
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

async function runCoreTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_ONBOARDING_PROGRESS_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the onboarding integration test transaction to roll back.",
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

describe("onboarding progress", () => {
  it("returns the Guide v1 steps as virtual pending state without creating progress rows", async () => {
    const user = await createTestUser("OnboardingDefaults");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const first = await listOnboardingProgressInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(first.guideVersion).toBe(1);

        expect(
          first.steps.map((step) => ({
            stepKey: step.stepKey,
            requiredModule: step.requiredModule,
            applicable: step.applicable,
            state: step.state,
            completedAt: step.completedAt,
            updatedAt: step.updatedAt,
          })),
        ).toEqual([
          {
            stepKey: "choose-goal",
            requiredModule: null,
            applicable: true,
            state: "pending",
            completedAt: null,
            updatedAt: null,
          },
          {
            stepKey: "confirm-preferences",
            requiredModule: null,
            applicable: true,
            state: "pending",
            completedAt: null,
            updatedAt: null,
          },
          {
            stepKey: "add-first-account",
            requiredModule: "money",
            applicable: true,
            state: "pending",
            completedAt: null,
            updatedAt: null,
          },
          {
            stepKey: "record-first-transaction",
            requiredModule: "money",
            applicable: true,
            state: "pending",
            completedAt: null,
            updatedAt: null,
          },
          {
            stepKey: "add-job-application",
            requiredModule: "career",
            applicable: true,
            state: "pending",
            completedAt: null,
            updatedAt: null,
          },
          {
            stepKey: "review-agenda",
            requiredModule: "time",
            applicable: true,
            state: "pending",
            completedAt: null,
            updatedAt: null,
          },
        ]);

        expect(first.applicableStepCount).toBe(6);
        expect(first.resolvedApplicableStepCount).toBe(0);
        expect(first.complete).toBe(false);

        /*
         * Reading/replaying the guide is intentionally side-effect free.
         */
        await listOnboardingProgressInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        const stored = await client.query<{
          count: string;
        }>(
          `
            SELECT
              count(*)::text AS count

            FROM core."onboarding_step"

            WHERE workspace_id = $1
          `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.count).toBe("0");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-onboarding-progress-test-cleanup",
      );
    }
  });

  it("makes Money onboarding steps non-applicable for a Career-only path without deleting progress", async () => {
    const user = await createTestUser("OnboardingCareerOnly");

    try {
      await runCoreTestAndRollback(user, async (transaction) => {
        await setOnboardingStepStateInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          stepKey: "add-first-account",
          state: "skipped",
        });

        await updateModulePreferenceInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          moduleKey: "money",

          expectedVersion: 0,

          enabled: false,
          agendaVisible: true,
          remindersEnabled: true,
        });

        const result = await listOnboardingProgressInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        const firstAccount = result.steps.find(
          (step) => step.stepKey === "add-first-account",
        );

        const firstTransaction = result.steps.find(
          (step) => step.stepKey === "record-first-transaction",
        );

        const jobApplication = result.steps.find(
          (step) => step.stepKey === "add-job-application",
        );

        expect(firstAccount).toMatchObject({
          applicable: false,

          /*
           * Progress is preserved even though this step is no longer part of
           * the user's current onboarding path.
           */
          state: "skipped",
        });

        expect(firstTransaction).toMatchObject({
          applicable: false,
          state: "pending",
        });

        expect(jobApplication).toMatchObject({
          applicable: true,
          state: "pending",
        });

        expect(result.applicableStepCount).toBe(4);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-onboarding-progress-test-cleanup",
      );
    }
  });

  it("supports skip, resume and completion without creating the business record represented by the guide step", async () => {
    const user = await createTestUser("OnboardingState");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const skipped = await setOnboardingStepStateInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          stepKey: "add-first-account",
          state: "skipped",
        });

        expect(skipped).toMatchObject({
          guideVersion: 1,
          stepKey: "add-first-account",
          state: "skipped",
          completedAt: null,
        });

        const resumed = await setOnboardingStepStateInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          stepKey: "add-first-account",
          state: "pending",
        });

        expect(resumed).toMatchObject({
          guideVersion: 1,
          stepKey: "add-first-account",
          state: "pending",
          completedAt: null,
        });

        const completed = await setOnboardingStepStateInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            stepKey: "add-first-account",
            state: "completed",
          },
        );

        expect(completed.state).toBe("completed");
        expect(completed.completedAt).toEqual(expect.any(String));

        /*
         * Onboarding progress is not authority for the actual setup workflow.
         * Marking this guide step complete must never manufacture an account.
         */
        const financialAccounts = await client.query<{
          count: string;
        }>(
          `
            SELECT
              count(*)::text AS count

            FROM finance."financial_account"

            WHERE workspace_id = $1
          `,
          [user.workspaceId],
        );

        expect(financialAccounts.rows[0]?.count).toBe("0");

        const stored = await client.query<{
          state: string;
          completed_at: Date | null;
        }>(
          `
            SELECT
              state,
              completed_at

            FROM core."onboarding_step"

            WHERE
              workspace_id = $1

              AND guide_version = 1

              AND step_key =
                'add-first-account'
          `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.state).toBe("completed");

        expect(stored.rows[0]?.completed_at).toBeInstanceOf(Date);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-onboarding-progress-test-cleanup",
      );
    }
  });

  it("replays a successful state command without creating another row or changing its completion timestamp", async () => {
    const user = await createTestUser("OnboardingReplay");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId,

          stepKey: "review-agenda" as const,
          state: "completed" as const,
        };

        const first = await setOnboardingStepStateInTransaction(
          transaction,
          input,
        );

        const replay = await setOnboardingStepStateInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(first);

        const stored = await client.query<{
          count: string;
          completed_at: Date | null;
        }>(
          `
            SELECT
              count(*)::text AS count,

              max(completed_at)
                AS completed_at

            FROM core."onboarding_step"

            WHERE
              workspace_id = $1

              AND guide_version = 1

              AND step_key =
                'review-agenda'
          `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.count).toBe("1");

        expect(stored.rows[0]?.completed_at?.toISOString()).toBe(
          first.completedAt,
        );

        const receipts = await client.query<{
          count: string;
        }>(
          `
            SELECT
              count(*)::text AS count

            FROM core."command_receipt"

            WHERE
              workspace_id = $1

              AND client_command_id = $2
          `,
          [user.workspaceId, clientCommandId],
        );

        expect(receipts.rows[0]?.count).toBe("1");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-onboarding-progress-test-cleanup",
      );
    }
  });

  it("does not expose or mutate another user's onboarding progress", async () => {
    const userA = await createTestUser("OnboardingOwnerA");
    const userB = await createTestUser("OnboardingOwnerB");

    try {
      await runCoreTestAndRollback(userA, async (transaction) => {
        let readError: unknown;

        try {
          await listOnboardingProgressInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,
          });
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(OnboardingWorkspaceUnavailableError);

        let writeError: unknown;

        try {
          await setOnboardingStepStateInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,

            clientCommandId: randomUUID(),

            stepKey: "review-agenda",

            state: "completed",
          });
        } catch (error) {
          writeError = error;
        }

        expect(writeError).toBeInstanceOf(PrivateDomainWriteUnavailableError);
      });
    } finally {
      await removeProvisionedTestUser(
        userA,
        "pmp-onboarding-progress-test-cleanup",
      );

      await removeProvisionedTestUser(
        userB,
        "pmp-onboarding-progress-test-cleanup",
      );
    }
  });
});
