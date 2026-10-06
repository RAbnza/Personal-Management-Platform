import { randomUUID } from "node:crypto";

import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { JobApplicationUnavailableError } from "@/modules/career/domain/application";
import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { getJobApplicationDetailInTransaction } from "@/modules/career/services/get-job-application-detail";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { transitionJobApplicationStageInTransaction } from "@/modules/career/services/transition-job-application-stage";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import type { ScopedTransaction } from "@/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";

const TEST_DATABASE_NAME = "personal_management_test";

type TestUser = {
  userId: string;
  workspaceId: string;
};

function getTestAdministratorConnectionString(): string {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_ADMIN_URL is required for job-application detail integration-test cleanup.",
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

async function runCareerTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_GET_JOB_APPLICATION_DETAIL_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the job-application detail integration test transaction to roll back.",
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

async function createResumeVersion(
  client: PoolClient,
  user: TestUser,
): Promise<string> {
  const resumeVersionId = randomUUID();

  await client.query(
    `
      INSERT INTO career."resume_version" (
        id,
        workspace_id,
        label,
        reference_url,
        notes,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        'Backend Resume v3',
        'https://example.test/resume-v3.pdf',
        'Resume used for backend-focused applications.',
        $3,
        'user'
      )
    `,
    [resumeVersionId, user.workspaceId, user.userId],
  );

  return resumeVersionId;
}

/**
 * The isolation test intentionally commits one Career application so another
 * scoped user can attempt to read a real foreign record.
 *
 * Most integration-test domain fixtures are rolled back, so the shared
 * provisioning cleanup deliberately does not purge Career evidence. Remove
 * this one committed fixture here before removeProvisionedTestUser() removes
 * command receipts and ownership roots.
 *
 * Career stage history is immutable under normal runtime roles. This
 * administrator-only test cleanup temporarily suppresses user/FK triggers for
 * its own transaction rather than weakening production deletion semantics.
 */
async function removeCommittedCareerFixture(user: TestUser): Promise<void> {
  const administrator = new Client({
    connectionString: getTestAdministratorConnectionString(),

    application_name: "pmp-job-application-detail-test-cleanup",
  });

  try {
    await administrator.connect();

    await administrator.query("BEGIN");

    try {
      await administrator.query(
        `
          SET LOCAL session_replication_role = 'replica'
        `,
      );

      await administrator.query(
        `
          DELETE FROM audit."private_activity"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM audit."private_revision"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM career."application_tag"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM career."application_event"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM career."application_stage_history"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM career."job_application"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query("COMMIT");
    } catch (error) {
      await administrator.query("ROLLBACK");

      throw error;
    }
  } finally {
    await administrator.end();
  }
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("get job application detail", () => {
  it("returns complete application metadata, exact resume version, stage history and all event shapes", async () => {
    const user = await createTestUser("ApplicationDetail");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const resumeVersionId = await createResumeVersion(client, user);

        const application = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            companyName: "Example Technology",

            roleTitle: "Backend Engineer",

            postingUrl: "https://example.test/jobs/backend",

            sourceName: "Company careers page",

            roleDescriptionSnapshot:
              "Build reliable TypeScript services and PostgreSQL-backed systems.",

            location: "Metro Manila",

            workArrangement: "hybrid",

            salaryMinMinor: "5000000",

            salaryMaxMinor: "7000000",

            salaryCurrency: "PHP",

            salaryPeriod: "month",

            technologyTags: ["TypeScript", "PostgreSQL"],

            contactName: "Recruiter Name",

            contactEmail: "recruiter@example.test",

            contactPhone: "+63 900 000 0000",

            resumeVersionId,

            appliedDate: "2026-10-01",

            initialStage: "applied",

            initialStageEffectiveDate: "2026-10-01",

            initialStageReason: "Application submitted.",

            notes: "Priority application.",
          },
        );

        const screening = await transitionJobApplicationStageInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            stage: "screening",

            effectiveDate: "2026-10-05",

            reason: "Recruiter screening started.",
          },
        );

        expect(screening.version).toBe(2);

        const interview = await createApplicationEventInTransaction(
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

            endsAt: "2026-10-10T10:30:00+08:00",

            timezone: "Asia/Manila",

            location: "Makati",

            meetingUrl: "https://example.test/meeting",

            preparationNotes: "Review system design.",

            setAsNextAction: true,

            expectedApplicationVersion: 2,
          },
        );

        expect(interview.applicationVersion).toBe(3);

        const responseEventId = randomUUID();

        await client.query(
          `
              INSERT INTO career."application_event" (
                id,
                workspace_id,
                application_id,
                event_kind,
                title,
                temporal_kind,
                event_date,
                status,
                outcome_notes,
                completed_at,
                recorded_by_user_id,
                actor_kind
              )
              VALUES (
                $1,
                $2,
                $3,
                'response',
                'Recruiter response',
                'date',
                DATE '2026-10-04',
                'completed',
                'Invited to screening.',
                clock_timestamp(),
                $4,
                'user'
              )
            `,
          [
            responseEventId,
            user.workspaceId,
            application.applicationId,
            user.userId,
          ],
        );

        const detail = await getJobApplicationDetailInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,
        });

        expect(detail.application).toMatchObject({
          applicationId: application.applicationId,

          companyName: "Example Technology",

          roleTitle: "Backend Engineer",

          postingUrl: "https://example.test/jobs/backend",

          sourceName: "Company careers page",

          roleDescriptionSnapshot:
            "Build reliable TypeScript services and PostgreSQL-backed systems.",

          location: "Metro Manila",

          workArrangement: "hybrid",

          salaryMinMinor: "5000000",

          salaryMaxMinor: "7000000",

          salaryCurrency: "PHP",

          salaryPeriod: "month",

          technologyTags: ["TypeScript", "PostgreSQL"],

          contactName: "Recruiter Name",

          contactEmail: "recruiter@example.test",

          contactPhone: "+63 900 000 0000",

          appliedDate: "2026-10-01",

          currentStage: "screening",

          currentOutcome: null,

          currentHistoryId: screening.currentHistoryId,

          nextActionEventId: interview.eventId,

          notes: "Priority application.",

          archived: false,

          version: 3,
        });

        expect(detail.application.resumeVersion).toEqual({
          resumeVersionId,

          label: "Backend Resume v3",

          referenceUrl: "https://example.test/resume-v3.pdf",

          notes: "Resume used for backend-focused applications.",

          archived: false,
        });

        expect(detail.application.createdAt).toEqual(expect.any(String));

        expect(detail.application.updatedAt).toEqual(expect.any(String));

        expect(
          detail.stageHistory.map((history) => ({
            stage: history.stage,

            effectiveDate: history.effectiveDate,

            reason: history.reason,

            isCurrent: history.isCurrent,
          })),
        ).toEqual([
          {
            stage: "applied",

            effectiveDate: "2026-10-01",

            reason: "Application submitted.",

            isCurrent: false,
          },
          {
            stage: "screening",

            effectiveDate: "2026-10-05",

            reason: "Recruiter screening started.",

            isCurrent: true,
          },
        ]);

        expect(
          detail.stageHistory.every(
            (history) => typeof history.recordedAt === "string",
          ),
        ).toBe(true);

        expect(
          detail.events.map((event) => ({
            eventId: event.eventId,

            eventKind: event.eventKind,

            temporalKind: event.temporalKind,

            status: event.status,

            isNextAction: event.isNextAction,
          })),
        ).toEqual([
          {
            eventId: responseEventId,

            eventKind: "response",

            temporalKind: "date",

            status: "completed",

            isNextAction: false,
          },
          {
            eventId: interview.eventId,

            eventKind: "interview",

            temporalKind: "timed",

            status: "scheduled",

            isNextAction: true,
          },
        ]);

        const response = detail.events[0];

        expect(response).toMatchObject({
          eventDate: "2026-10-04",

          startsAt: null,
          endsAt: null,
          timezone: null,

          outcomeNotes: "Invited to screening.",

          completedAt: expect.any(String),
        });

        const timedInterview = detail.events[1];

        expect(timedInterview).toMatchObject({
          eventDate: null,

          startsAt: "2026-10-10T01:00:00.000Z",

          endsAt: "2026-10-10T02:30:00.000Z",

          timezone: "Asia/Manila",

          location: "Makati",

          meetingUrl: "https://example.test/meeting",

          preparationNotes: "Review system design.",

          completedAt: null,

          notificationGeneration: 1,

          version: 1,
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-get-job-application-detail-test-cleanup",
      );
    }
  });

  it("retains superseded stage evidence and links a correction to the history it replaced", async () => {
    const user = await createTestUser("ApplicationDetailCorrection");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            companyName: "Correction Company",

            roleTitle: "Software Engineer",

            appliedDate: "2026-10-01",

            initialStage: "applied",

            initialStageEffectiveDate: "2026-10-01",
          },
        );

        const receipt = await client.query<{
          command_receipt_id: string;
        }>(
          `
                SELECT command_receipt_id

                FROM career."application_stage_history"

                WHERE
                  workspace_id = $1
                  AND id = $2
              `,
          [user.workspaceId, application.initialHistoryId],
        );

        const commandReceiptId = receipt.rows[0]?.command_receipt_id;

        if (!commandReceiptId) {
          throw new Error("Initial application command receipt was not found.");
        }

        const originalHistoryId = randomUUID();

        const correctionHistoryId = randomUUID();

        await client.query(
          `
              INSERT INTO career."application_stage_history" (
                id,
                workspace_id,
                application_id,
                sequence_no,
                stage,
                effective_date,
                effective_order,
                reason,
                command_receipt_id,
                recorded_by_user_id,
                actor_kind
              )
              VALUES (
                $1,
                $2,
                $3,
                2,
                'interview',
                DATE '2026-10-10',
                0,
                'Originally recorded as interview.',
                $4,
                $5,
                'user'
              )
            `,
          [
            originalHistoryId,
            user.workspaceId,
            application.applicationId,
            commandReceiptId,
            user.userId,
          ],
        );

        await client.query(
          `
              INSERT INTO career."application_stage_history" (
                id,
                workspace_id,
                application_id,
                sequence_no,
                stage,
                effective_date,
                effective_order,
                supersedes_history_id,
                reason,
                command_receipt_id,
                recorded_by_user_id,
                actor_kind
              )
              VALUES (
                $1,
                $2,
                $3,
                3,
                'technical_assessment',
                DATE '2026-10-10',
                0,
                $4,
                'Corrected the recorded stage.',
                $5,
                $6,
                'user'
              )
            `,
          [
            correctionHistoryId,
            user.workspaceId,
            application.applicationId,
            originalHistoryId,
            commandReceiptId,
            user.userId,
          ],
        );

        await client.query(
          `
              UPDATE career."job_application"

              SET
                current_history_id = $1,
                current_stage =
                  'technical_assessment'

              WHERE
                workspace_id = $2
                AND id = $3
            `,
          [correctionHistoryId, user.workspaceId, application.applicationId],
        );

        const detail = await getJobApplicationDetailInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,
        });

        const original = detail.stageHistory.find(
          (history) => history.historyId === originalHistoryId,
        );

        const correction = detail.stageHistory.find(
          (history) => history.historyId === correctionHistoryId,
        );

        expect(original).toMatchObject({
          stage: "interview",

          supersedesHistoryId: null,

          supersededByHistoryId: correctionHistoryId,

          isCurrent: false,
        });

        expect(correction).toMatchObject({
          stage: "technical_assessment",

          supersedesHistoryId: originalHistoryId,

          supersededByHistoryId: null,

          isCurrent: true,
        });

        expect(detail.application.currentHistoryId).toBe(correctionHistoryId);

        expect(detail.application.currentStage).toBe("technical_assessment");

        expect(detail.stageHistory).toHaveLength(3);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-get-job-application-detail-test-cleanup",
      );
    }
  });

  it("keeps archived applications readable with their history", async () => {
    const user = await createTestUser("ApplicationDetailArchived");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            companyName: "Archived Company",

            roleTitle: "Developer",

            initialStage: "saved",

            initialStageEffectiveDate: "2026-10-01",
          },
        );

        await client.query(
          `
              UPDATE career."job_application"

              SET archived_at =
                clock_timestamp()

              WHERE
                workspace_id = $1
                AND id = $2
            `,
          [user.workspaceId, application.applicationId],
        );

        const detail = await getJobApplicationDetailInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,
        });

        expect(detail.application.archived).toBe(true);

        expect(detail.application.version).toBe(2);

        expect(detail.stageHistory).toHaveLength(1);

        expect(detail.stageHistory[0]).toMatchObject({
          historyId: application.initialHistoryId,

          stage: "saved",

          isCurrent: true,
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-get-job-application-detail-test-cleanup",
      );
    }
  });

  it("does not expose another user's application detail", async () => {
    const userA = await createTestUser("ApplicationDetailOwnerA");

    const userB = await createTestUser("ApplicationDetailOwnerB");

    let committedCareerFixtureCreated = false;

    try {
      const client = await getDomainPool().connect();

      let applicationId: string;

      try {
        applicationId = await runScopedTransactionOnClient(
          client,
          userB,
          async (transaction) => {
            const application = await createJobApplicationInTransaction(
              transaction,
              {
                userId: userB.userId,

                workspaceId: userB.workspaceId,

                clientCommandId: randomUUID(),

                companyName: "Private Company",

                roleTitle: "Private Role",

                initialStage: "saved",

                initialStageEffectiveDate: "2026-10-01",
              },
            );

            return application.applicationId;
          },
        );

        committedCareerFixtureCreated = true;
      } finally {
        client.release();
      }

      await runCareerTestAndRollback(userA, async (transaction) => {
        let readError: unknown;

        try {
          await getJobApplicationDetailInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,

            applicationId,
          });
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(JobApplicationUnavailableError);
      });
    } finally {
      if (committedCareerFixtureCreated) {
        await removeCommittedCareerFixture(userB);
      }

      await removeProvisionedTestUser(
        userA,
        "pmp-get-job-application-detail-test-cleanup",
      );

      await removeProvisionedTestUser(
        userB,
        "pmp-get-job-application-detail-test-cleanup",
      );
    }
  });
});
