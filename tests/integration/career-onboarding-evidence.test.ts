import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { mutateApplicationEventInTransaction } from "@/modules/career/services/mutate-application-event";
import { listOnboardingProgressInTransaction } from "@/modules/core/services/list-onboarding-progress";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
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

async function runCareerOnboardingTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_CAREER_ONBOARDING_EVIDENCE_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the Career onboarding integration test transaction to roll back.",
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

describe("Career onboarding evidence", () => {
  it("requires a real application and real next action, then preserves completion after the action is finished", async () => {
    const user = await createTestUser("CareerOnboardingEvidence");

    try {
      await runCareerOnboardingTestAndRollback(
        user,
        async (transaction, client) => {
          const initial = await listOnboardingProgressInTransaction(
            transaction,
            {
              userId: user.userId,
              workspaceId: user.workspaceId,
            },
          );

          expect(
            initial.steps.find(
              (step) => step.stepKey === "add-job-application",
            ),
          ).toMatchObject({
            state: "pending",
            completedAt: null,
          });

          const application = await createJobApplicationInTransaction(
            transaction,
            {
              userId: user.userId,
              workspaceId: user.workspaceId,

              clientCommandId: randomUUID(),

              companyName: "Evidence Technologies",
              roleTitle: "Software Engineer",

              appliedDate: "2026-10-07",

              initialStage: "applied",

              initialStageEffectiveDate: "2026-10-07",
            },
          );

          const afterApplication = await listOnboardingProgressInTransaction(
            transaction,
            {
              userId: user.userId,
              workspaceId: user.workspaceId,
            },
          );

          expect(
            afterApplication.steps.find(
              (step) => step.stepKey === "add-job-application",
            ),
          ).toMatchObject({
            /*
             * Application creation alone does not satisfy the documented
             * Career onboarding lesson because no next action exists yet.
             */
            state: "pending",
            completedAt: null,
          });

          await createApplicationEventInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            eventKind: "follow_up",

            title: "Optional secondary follow-up",

            temporalKind: "date",

            eventDate: "2026-10-09",

            setAsNextAction: false,
          });

          const withoutNextAction = await listOnboardingProgressInTransaction(
            transaction,
            {
              userId: user.userId,
              workspaceId: user.workspaceId,
            },
          );

          expect(
            withoutNextAction.steps.find(
              (step) => step.stepKey === "add-job-application",
            ),
          ).toMatchObject({
            /*
             * Merely creating a Career event is not equivalent to recording
             * the application's actual next action.
             */
            state: "pending",
            completedAt: null,
          });

          const nextAction = await createApplicationEventInTransaction(
            transaction,
            {
              userId: user.userId,
              workspaceId: user.workspaceId,

              applicationId: application.applicationId,

              clientCommandId: randomUUID(),

              eventKind: "interview",

              title: "Technical interview",

              temporalKind: "timed",

              startsAt: "2026-10-10T09:00:00+08:00",

              endsAt: "2026-10-10T10:00:00+08:00",

              timezone: "Asia/Manila",

              setAsNextAction: true,

              expectedApplicationVersion: application.version,
            },
          );

          const completed = await listOnboardingProgressInTransaction(
            transaction,
            {
              userId: user.userId,
              workspaceId: user.workspaceId,
            },
          );

          const completedStep = completed.steps.find(
            (step) => step.stepKey === "add-job-application",
          );

          expect(completedStep).toMatchObject({
            state: "completed",

            /*
             * Evidence-derived completion does not need to materialize or
             * mutate core.onboarding_step.
             */
            updatedAt: null,
          });

          expect(completedStep?.completedAt).toEqual(expect.any(String));

          const storedGuideRows = await client.query<{
            count: string;
          }>(
            `
              SELECT
                count(*)::text AS count

              FROM core."onboarding_step"

              WHERE
                workspace_id = $1

                AND guide_version = 1

                AND step_key =
                  'add-job-application'
            `,
            [user.workspaceId],
          );

          expect(storedGuideRows.rows[0]?.count).toBe("0");

          await mutateApplicationEventInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,
            eventId: nextAction.eventId,

            clientCommandId: randomUUID(),

            expectedEventVersion: nextAction.eventVersion,

            action: "complete",

            outcomeNotes: "Interview completed.",

            expectedApplicationVersion: nextAction.applicationVersion,

            replacementNextActionEventId: null,
          });

          const afterCompletion = await listOnboardingProgressInTransaction(
            transaction,
            {
              userId: user.userId,
              workspaceId: user.workspaceId,
            },
          );

          expect(
            afterCompletion.steps.find(
              (step) => step.stepKey === "add-job-application",
            ),
          ).toMatchObject({
            /*
             * Clearing the current pointer after completing the real action
             * must not make the learned workflow become incomplete again.
             */
            state: "completed",

            updatedAt: null,
          });
        },
      );
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-career-onboarding-evidence-test-cleanup",
      );
    }
  });
});
