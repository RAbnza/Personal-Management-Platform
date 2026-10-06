import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { ApplicationEventVersionConflictError } from "@/modules/career/domain/application-event";
import { JobApplicationVersionConflictError } from "@/modules/career/domain/application";
import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { mutateApplicationEventInTransaction } from "@/modules/career/services/mutate-application-event";
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

async function runCareerTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_MUTATE_APPLICATION_EVENT_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the Career event-mutation test transaction to roll back.",
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

async function createAppliedApplication(
  transaction: ScopedTransaction,
  user: TestUser,
  label: string,
) {
  return createJobApplicationInTransaction(transaction, {
    userId: user.userId,
    workspaceId: user.workspaceId,

    clientCommandId: randomUUID(),

    companyName: `${label} Company`,
    roleTitle: "Software Engineer",

    appliedDate: "2026-10-01",
    initialStage: "applied",
    initialStageEffectiveDate: "2026-10-01",
  });
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("mutate application event", () => {
  it("reschedules the next-action event, advances its notification generation and keeps the application pointer/version unchanged", async () => {
    const user = await createTestUser("EventReschedule");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Reschedule",
        );

        const event = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "interview",
          title: "Technical interview",

          temporalKind: "timed",

          startsAt: "2026-10-20T09:00:00+08:00",
          endsAt: "2026-10-20T10:00:00+08:00",
          timezone: "Asia/Manila",

          setAsNextAction: true,
          expectedApplicationVersion: 1,
        });

        expect(event.applicationVersion).toBe(2);

        const result = await mutateApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,
          eventId: event.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: 1,

          action: "reschedule",

          temporalKind: "timed",

          startsAt: "2026-10-21T13:00:00+08:00",
          endsAt: "2026-10-21T14:30:00+08:00",
          timezone: "Asia/Manila",

          reason: "Employer moved the interview.",
        });

        expect(result).toEqual({
          applicationId: application.applicationId,
          eventId: event.eventId,

          action: "reschedule",

          eventVersion: 2,
          notificationGeneration: 2,

          status: "scheduled",
          completedAt: null,

          applicationVersion: 2,
          nextActionEventId: event.eventId,
        });

        const stored = await client.query<{
          starts_at: Date;
          ends_at: Date | null;
          timezone: string | null;
          status: string;
          version: number;
          notification_generation: number;
        }>(
          `
            SELECT
              starts_at,
              ends_at,
              timezone,
              status,
              version,
              notification_generation
            FROM career."application_event"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, event.eventId],
        );

        expect(stored.rows[0]?.starts_at.toISOString()).toBe(
          "2026-10-21T05:00:00.000Z",
        );

        expect(stored.rows[0]?.ends_at?.toISOString()).toBe(
          "2026-10-21T06:30:00.000Z",
        );

        expect(stored.rows[0]?.timezone).toBe("Asia/Manila");
        expect(stored.rows[0]?.status).toBe("scheduled");
        expect(stored.rows[0]?.version).toBe(2);
        expect(stored.rows[0]?.notification_generation).toBe(2);

        const parent = await client.query<{
          next_action_event_id: string | null;
          version: number;
        }>(
          `
            SELECT
              next_action_event_id,
              version
            FROM career."job_application"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(parent.rows).toEqual([
          {
            next_action_event_id: event.eventId,
            version: 2,
          },
        ]);

        const agenda = await client.query<{
          starts_at: Date | null;
        }>(
          `
            SELECT starts_at
            FROM time."agenda_v"
            WHERE source_id = $1
          `,
          [event.eventId],
        );

        expect(agenda.rows).toHaveLength(1);

        expect(agenda.rows[0]?.starts_at?.toISOString()).toBe(
          "2026-10-21T05:00:00.000Z",
        );
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-application-event-test-cleanup",
      );
    }
  });

  it("completes the pointed event, clears next action, removes it from agenda and replays idempotently", async () => {
    const user = await createTestUser("EventComplete");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Complete",
        );

        const event = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "follow_up",
          title: "Recruiter follow-up",

          temporalKind: "date",
          eventDate: "2026-10-12",

          setAsNextAction: true,
          expectedApplicationVersion: 1,
        });

        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,
          eventId: event.eventId,

          clientCommandId,

          expectedEventVersion: 1,

          action: "complete" as const,

          outcomeNotes: "Follow-up email sent.",

          expectedApplicationVersion: 2,

          reason: "Completed planned follow-up.",
        };

        const first = await mutateApplicationEventInTransaction(
          transaction,
          input,
        );

        expect(first).toMatchObject({
          action: "complete",

          eventVersion: 2,
          notificationGeneration: 2,

          status: "completed",

          applicationVersion: 3,
          nextActionEventId: null,
        });

        expect(first.completedAt).toEqual(expect.any(String));

        const replay = await mutateApplicationEventInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(first);

        const stored = await client.query<{
          status: string;
          completed_at: Date | null;
          outcome_notes: string | null;
          version: number;
          notification_generation: number;
        }>(
          `
            SELECT
              status,
              completed_at,
              outcome_notes,
              version,
              notification_generation
            FROM career."application_event"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, event.eventId],
        );

        expect(stored.rows[0]?.status).toBe("completed");

        expect(stored.rows[0]?.completed_at).not.toBeNull();

        expect(stored.rows[0]?.outcome_notes).toBe("Follow-up email sent.");

        expect(stored.rows[0]?.version).toBe(2);

        expect(stored.rows[0]?.notification_generation).toBe(2);

        const parent = await client.query<{
          next_action_event_id: string | null;
          version: number;
        }>(
          `
            SELECT
              next_action_event_id,
              version
            FROM career."job_application"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(parent.rows).toEqual([
          {
            next_action_event_id: null,
            version: 3,
          },
        ]);

        const agenda = await client.query<{
          source_id: string;
        }>(
          `
            SELECT source_id
            FROM time."agenda_v"
            WHERE source_id = $1
          `,
          [event.eventId],
        );

        expect(agenda.rows).toHaveLength(0);

        const eventAuditCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count
            FROM audit."private_revision"
            WHERE
              workspace_id = $1
              AND subject_kind = 'application_event'
              AND subject_id = $2
              AND operation = 'complete'
          `,
          [user.workspaceId, event.eventId],
        );

        expect(eventAuditCount.rows[0]?.count).toBe("1");

        const clearAuditCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count
            FROM audit."private_revision"
            WHERE
              workspace_id = $1
              AND subject_kind = 'job_application'
              AND subject_id = $2
              AND operation = 'next_action_clear'
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(clearAuditCount.rows[0]?.count).toBe("1");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-application-event-test-cleanup",
      );
    }
  });

  it("cancels the current next action and explicitly replaces it with another scheduled event", async () => {
    const user = await createTestUser("EventCancelReplace");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Cancel Replace",
        );

        const first = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "interview",
          title: "Original interview",

          temporalKind: "date",
          eventDate: "2026-10-15",

          setAsNextAction: true,
          expectedApplicationVersion: 1,
        });

        expect(first.applicationVersion).toBe(2);

        const replacement = await createApplicationEventInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            eventKind: "interview",
            title: "Replacement interview",

            temporalKind: "date",
            eventDate: "2026-10-18",
          },
        );

        expect(replacement.applicationVersion).toBe(2);

        const result = await mutateApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,
          eventId: first.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: 1,

          action: "cancel",

          outcomeNotes: "Original slot cancelled by employer.",

          expectedApplicationVersion: 2,

          replacementNextActionEventId: replacement.eventId,

          reason: "Employer provided a replacement interview slot.",
        });

        expect(result).toEqual({
          applicationId: application.applicationId,
          eventId: first.eventId,

          action: "cancel",

          eventVersion: 2,
          notificationGeneration: 2,

          status: "cancelled",
          completedAt: null,

          applicationVersion: 3,
          nextActionEventId: replacement.eventId,
        });

        const parent = await client.query<{
          next_action_event_id: string | null;
          version: number;
        }>(
          `
            SELECT
              next_action_event_id,
              version
            FROM career."job_application"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(parent.rows).toEqual([
          {
            next_action_event_id: replacement.eventId,
            version: 3,
          },
        ]);

        const agenda = await client.query<{
          source_id: string;
        }>(
          `
            SELECT source_id
            FROM time."agenda_v"
            WHERE source_id = ANY($1::uuid[])
            ORDER BY source_id
          `,
          [[first.eventId, replacement.eventId]],
        );

        expect(agenda.rows.map((row) => row.source_id)).toEqual([
          replacement.eventId,
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-application-event-test-cleanup",
      );
    }
  });

  it("completes an unpointed event without changing the application's version or existing next action", async () => {
    const user = await createTestUser("EventUnpointed");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Unpointed",
        );

        const nextAction = await createApplicationEventInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            eventKind: "follow_up",
            title: "Current next action",

            temporalKind: "date",
            eventDate: "2026-10-20",

            setAsNextAction: true,
            expectedApplicationVersion: 1,
          },
        );

        const otherEvent = await createApplicationEventInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            eventKind: "assessment",
            title: "Separate assessment",

            temporalKind: "date",
            eventDate: "2026-10-19",
          },
        );

        const result = await mutateApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,
          eventId: otherEvent.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: 1,

          action: "complete",

          outcomeNotes: "Assessment submitted.",
        });

        expect(result).toMatchObject({
          eventVersion: 2,
          notificationGeneration: 2,

          status: "completed",

          applicationVersion: 2,
          nextActionEventId: nextAction.eventId,
        });

        const parent = await client.query<{
          next_action_event_id: string | null;
          version: number;
        }>(
          `
            SELECT
              next_action_event_id,
              version
            FROM career."job_application"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(parent.rows).toEqual([
          {
            next_action_event_id: nextAction.eventId,
            version: 2,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-application-event-test-cleanup",
      );
    }
  });

  it("rejects stale event and application versions before lifecycle mutation", async () => {
    const user = await createTestUser("EventMutationVersion");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Mutation Version",
        );

        const event = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "follow_up",
          title: "Versioned follow-up",

          temporalKind: "date",
          eventDate: "2026-10-25",

          setAsNextAction: true,
          expectedApplicationVersion: 1,
        });

        await client.query("SAVEPOINT stale_event_version");

        let staleEventError: unknown;

        try {
          await mutateApplicationEventInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,
            eventId: event.eventId,

            clientCommandId: randomUUID(),

            expectedEventVersion: 2,

            action: "reschedule",

            temporalKind: "date",
            eventDate: "2026-10-26",
          });
        } catch (error) {
          staleEventError = error;
        }

        expect(staleEventError).toBeInstanceOf(
          ApplicationEventVersionConflictError,
        );

        await client.query("ROLLBACK TO SAVEPOINT stale_event_version");
        await client.query("RELEASE SAVEPOINT stale_event_version");

        await client.query("SAVEPOINT stale_application_version");

        let staleApplicationError: unknown;

        try {
          await mutateApplicationEventInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,
            eventId: event.eventId,

            clientCommandId: randomUUID(),

            expectedEventVersion: 1,

            action: "cancel",

            expectedApplicationVersion: 1,
          });
        } catch (error) {
          staleApplicationError = error;
        }

        expect(staleApplicationError).toBeInstanceOf(
          JobApplicationVersionConflictError,
        );

        await client.query("ROLLBACK TO SAVEPOINT stale_application_version");
        await client.query("RELEASE SAVEPOINT stale_application_version");

        const stored = await client.query<{
          status: string;
          version: number;
          notification_generation: number;
        }>(
          `
            SELECT
              status,
              version,
              notification_generation
            FROM career."application_event"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, event.eventId],
        );

        expect(stored.rows).toEqual([
          {
            status: "scheduled",
            version: 1,
            notification_generation: 1,
          },
        ]);

        const parent = await client.query<{
          next_action_event_id: string | null;
          version: number;
        }>(
          `
            SELECT
              next_action_event_id,
              version
            FROM career."job_application"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(parent.rows).toEqual([
          {
            next_action_event_id: event.eventId,
            version: 2,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-application-event-test-cleanup",
      );
    }
  });
});
