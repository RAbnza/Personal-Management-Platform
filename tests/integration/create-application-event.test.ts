import { randomUUID } from "node:crypto";

import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { JobApplicationVersionConflictError } from "@/modules/career/domain/application";
import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import type { ScopedTransaction } from "@/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";

const TEST_DATABASE_NAME = "personal_management_test";

type TestUser = {
  userId: string;
  workspaceId: string;
};

function getTestAdministratorConnectionString() {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_ADMIN_URL is required for create-application-event integration tests.",
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

async function removeTestUser(user: TestUser): Promise<void> {
  const administrator = new Client({
    connectionString: getTestAdministratorConnectionString(),
    application_name: "pmp-create-application-event-test-cleanup",
  });

  try {
    await administrator.connect();
    await administrator.query("BEGIN");

    try {
      await administrator.query(
        `
          DELETE FROM core."workspace_preference"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."workspace"
          WHERE id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."user_profile"
          WHERE user_id = $1
        `,
        [user.userId],
      );

      await administrator.query("COMMIT");
    } catch (error) {
      await administrator.query("ROLLBACK");

      throw error;
    }
  } finally {
    await administrator.end();
  }

  await getAuthPool().query(
    `
      DELETE FROM auth."user"
      WHERE id = $1
    `,
    [user.userId],
  );
}

async function runCareerTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_CREATE_APPLICATION_EVENT_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the Career event integration test transaction to roll back.",
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

describe("create application event", () => {
  it("creates a date-only follow-up and atomically makes it the next action", async () => {
    const user = await createTestUser("EventDateNext");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Date Next",
        );

        const result = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "follow_up",
          title: "Send recruiter follow-up",

          temporalKind: "date",
          eventDate: "2026-10-10",

          location: "Online",

          setAsNextAction: true,
          expectedApplicationVersion: 1,
        });

        expect(result).toEqual({
          eventId: expect.any(String),

          eventVersion: 1,
          notificationGeneration: 1,

          applicationVersion: 2,

          nextActionEventId: result.eventId,
        });

        const event = await client.query<{
          application_id: string;
          event_kind: string;
          title: string;
          temporal_kind: string;
          event_date: string | null;
          starts_at: Date | null;
          ends_at: Date | null;
          timezone: string | null;
          status: string;
          version: number;
          notification_generation: number;
        }>(
          `
              SELECT
                application_id,
                event_kind,
                title,
                temporal_kind,
                event_date::text AS event_date,
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
          [user.workspaceId, result.eventId],
        );

        expect(event.rows).toEqual([
          {
            application_id: application.applicationId,
            event_kind: "follow_up",
            title: "Send recruiter follow-up",
            temporal_kind: "date",
            event_date: "2026-10-10",
            starts_at: null,
            ends_at: null,
            timezone: null,
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
            next_action_event_id: result.eventId,
            version: 2,
          },
        ]);

        const agenda = await client.query<{
          source_kind: string;
          source_id: string;
          temporal_kind: string;
          event_date: string | null;
          status: string;
        }>(
          `
              SELECT
                source_kind,
                source_id,
                temporal_kind,
                event_date::text AS event_date,
                status
              FROM time."agenda_v"
              WHERE source_id = $1
            `,
          [result.eventId],
        );

        expect(agenda.rows).toEqual([
          {
            source_kind: "application_event",
            source_id: result.eventId,
            temporal_kind: "date",
            event_date: "2026-10-10",
            status: "scheduled",
          },
        ]);

        const eventAudit = await client.query<{
          subject_version: number;
          operation: string;
        }>(
          `
              SELECT
                subject_version,
                operation
              FROM audit."private_revision"
              WHERE
                workspace_id = $1
                AND subject_kind = 'application_event'
                AND subject_id = $2
            `,
          [user.workspaceId, result.eventId],
        );

        expect(eventAudit.rows).toEqual([
          {
            subject_version: 1,
            operation: "create",
          },
        ]);

        const applicationAudit = await client.query<{
          subject_version: number;
          operation: string;
        }>(
          `
              SELECT
                subject_version,
                operation
              FROM audit."private_revision"
              WHERE
                workspace_id = $1
                AND subject_kind = 'job_application'
                AND subject_id = $2
              ORDER BY subject_version
            `,
          [user.workspaceId, application.applicationId],
        );

        expect(applicationAudit.rows).toEqual([
          {
            subject_version: 1,
            operation: "create",
          },
          {
            subject_version: 2,
            operation: "next_action_set",
          },
        ]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("creates a timed interview with an explicit source timezone without changing the application version", async () => {
    const user = await createTestUser("EventTimed");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Timed Event",
        );

        const result = await createApplicationEventInTransaction(transaction, {
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

          meetingUrl: "https://example.test/interview",
          preparationNotes: "Review TypeScript and PostgreSQL topics.",
        });

        expect(result).toMatchObject({
          eventVersion: 1,
          notificationGeneration: 1,
          applicationVersion: 1,
          nextActionEventId: null,
        });

        const event = await client.query<{
          temporal_kind: string;
          event_date: string | null;
          starts_at: Date | null;
          ends_at: Date | null;
          timezone: string | null;
          meeting_url: string | null;
          version: number;
        }>(
          `
              SELECT
                temporal_kind,
                event_date::text AS event_date,
                starts_at,
                ends_at,
                timezone,
                meeting_url,
                version
              FROM career."application_event"
              WHERE
                workspace_id = $1
                AND id = $2
            `,
          [user.workspaceId, result.eventId],
        );

        const row = event.rows[0];

        expect(row).toBeDefined();

        expect(row?.temporal_kind).toBe("timed");
        expect(row?.event_date).toBeNull();

        expect(row?.starts_at?.toISOString()).toBe("2026-10-20T01:00:00.000Z");

        expect(row?.ends_at?.toISOString()).toBe("2026-10-20T02:00:00.000Z");

        expect(row?.timezone).toBe("Asia/Manila");
        expect(row?.meeting_url).toBe("https://example.test/interview");
        expect(row?.version).toBe(1);

        const agenda = await client.query<{
          source_kind: string;
          temporal_kind: string;
          starts_at: Date | null;
          timezone: string | null;
        }>(
          `
              SELECT
                source_kind,
                temporal_kind,
                starts_at,
                timezone
              FROM time."agenda_v"
              WHERE source_id = $1
            `,
          [result.eventId],
        );

        expect(agenda.rows[0]?.source_kind).toBe("application_event");

        expect(agenda.rows[0]?.temporal_kind).toBe("timed");

        expect(agenda.rows[0]?.starts_at?.toISOString()).toBe(
          "2026-10-20T01:00:00.000Z",
        );

        expect(agenda.rows[0]?.timezone).toBe("Asia/Manila");

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
            version: 1,
          },
        ]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("can explicitly replace the next-action pointer without hiding other scheduled agenda events", async () => {
    const user = await createTestUser("EventReplaceNext");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Replace Next",
        );

        const first = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "follow_up",
          title: "First follow-up",

          temporalKind: "date",
          eventDate: "2026-10-10",

          setAsNextAction: true,
          expectedApplicationVersion: 1,
        });

        expect(first.applicationVersion).toBe(2);

        const second = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "assessment",
          title: "Coding assessment",

          temporalKind: "date",
          eventDate: "2026-10-12",

          setAsNextAction: true,
          expectedApplicationVersion: 2,
        });

        expect(second).toMatchObject({
          applicationVersion: 3,
          nextActionEventId: second.eventId,
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
            next_action_event_id: second.eventId,
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
          [[first.eventId, second.eventId]],
        );

        expect(agenda.rows.map((row) => row.source_id).sort()).toEqual(
          [first.eventId, second.eventId].sort(),
        );
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("rejects a stale application version before creating a next-action event", async () => {
    const user = await createTestUser("EventStaleVersion");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Stale Event",
        );

        await client.query("SAVEPOINT stale_application_event");

        let staleError: unknown;

        try {
          await createApplicationEventInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            eventKind: "follow_up",
            title: "Stale follow-up",

            temporalKind: "date",
            eventDate: "2026-10-15",

            setAsNextAction: true,
            expectedApplicationVersion: 2,
          });
        } catch (error) {
          staleError = error;
        }

        expect(staleError).toBeInstanceOf(JobApplicationVersionConflictError);

        if (staleError instanceof JobApplicationVersionConflictError) {
          expect(staleError.expectedVersion).toBe(2);
          expect(staleError.currentVersion).toBe(1);
        }

        await client.query("ROLLBACK TO SAVEPOINT stale_application_event");
        await client.query("RELEASE SAVEPOINT stale_application_event");

        const eventCount = await client.query<{
          count: string;
        }>(
          `
              SELECT count(*)::text AS count
              FROM career."application_event"
              WHERE
                workspace_id = $1
                AND application_id = $2
            `,
          [user.workspaceId, application.applicationId],
        );

        expect(eventCount.rows[0]?.count).toBe("0");

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
            version: 1,
          },
        ]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("replays the same event command without duplicating the event or incrementing the application twice", async () => {
    const user = await createTestUser("EventReplay");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Replay Event",
        );

        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId,

          eventKind: "interview" as const,
          title: "Hiring manager interview",

          temporalKind: "timed" as const,
          startsAt: "2026-10-25T14:00:00+08:00",
          endsAt: "2026-10-25T15:00:00+08:00",
          timezone: "Asia/Manila",

          setAsNextAction: true,
          expectedApplicationVersion: 1,
        };

        const first = await createApplicationEventInTransaction(
          transaction,
          input,
        );

        const replay = await createApplicationEventInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(first);

        const eventCount = await client.query<{
          count: string;
        }>(
          `
              SELECT count(*)::text AS count
              FROM career."application_event"
              WHERE
                workspace_id = $1
                AND application_id = $2
            `,
          [user.workspaceId, application.applicationId],
        );

        expect(eventCount.rows[0]?.count).toBe("1");

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
            next_action_event_id: first.eventId,
            version: 2,
          },
        ]);

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
            `,
          [user.workspaceId, first.eventId],
        );

        expect(eventAuditCount.rows[0]?.count).toBe("1");

        const pointerAuditCount = await client.query<{
          count: string;
        }>(
          `
              SELECT count(*)::text AS count
              FROM audit."private_revision"
              WHERE
                workspace_id = $1
                AND subject_kind = 'job_application'
                AND subject_id = $2
                AND operation = 'next_action_set'
            `,
          [user.workspaceId, application.applicationId],
        );

        expect(pointerAuditCount.rows[0]?.count).toBe("1");
      });
    } finally {
      await removeTestUser(user);
    }
  });
});
