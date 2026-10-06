import { randomUUID } from "node:crypto";

import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { createPersonalEventInTransaction } from "@/modules/time/services/create-personal-event";
import { listAgendaItemsInTransaction } from "@/modules/time/services/list-agenda-items";
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
      "TEST_DATABASE_ADMIN_URL is required for create-personal-event integration tests.",
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

    application_name: "pmp-create-personal-event-test-cleanup",
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

async function runTimeTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_CREATE_PERSONAL_EVENT_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the personal-event test transaction to roll back.",
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

describe("create personal event", () => {
  it("creates a multi-day date-only event and projects it into Agenda without inventing a time", async () => {
    const user = await createTestUser("PersonalDateEvent");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const result = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Family trip",

          temporalKind: "date",

          eventDate: "2026-11-10",

          endDateExclusive: "2026-11-13",

          description: "Three-day family trip.",

          location: "Tagaytay",

          referenceUrl: "https://example.com/trip",
        });

        expect(result).toEqual({
          eventId: expect.any(String),

          eventVersion: 1,

          notificationGeneration: 1,
        });

        const stored = await client.query<{
          title: string;

          temporal_kind: string;

          event_date: string;

          end_date_exclusive: string | null;

          starts_at: Date | null;

          ends_at: Date | null;

          timezone: string | null;

          status: string;

          description: string | null;

          location: string | null;

          reference_url: string | null;

          notification_generation: number;

          version: number;
        }>(
          `
                SELECT
                  title,

                  temporal_kind,

                  event_date::text
                    AS event_date,

                  end_date_exclusive::text
                    AS end_date_exclusive,

                  starts_at,
                  ends_at,
                  timezone,

                  status,

                  description,
                  location,
                  reference_url,

                  notification_generation,
                  version

                FROM time."personal_event"

                WHERE
                  workspace_id = $1
                  AND id = $2
              `,
          [user.workspaceId, result.eventId],
        );

        expect(stored.rows).toEqual([
          {
            title: "Family trip",

            temporal_kind: "date",

            event_date: "2026-11-10",

            end_date_exclusive: "2026-11-13",

            starts_at: null,
            ends_at: null,
            timezone: null,

            status: "scheduled",

            description: "Three-day family trip.",

            location: "Tagaytay",

            reference_url: "https://example.com/trip",

            notification_generation: 1,

            version: 1,
          },
        ]);

        const agenda = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          startDate: "2026-11-10",

          endDate: "2026-11-10",

          modules: ["time"],
        });

        expect(agenda.items).toEqual([
          expect.objectContaining({
            sourceKind: "personal_event",

            sourceId: result.eventId,

            displayModule: "time",

            agendaDate: "2026-11-10",

            temporal: {
              kind: "date",

              eventDate: "2026-11-10",

              endDateExclusive: "2026-11-13",
            },

            status: "scheduled",

            notificationGeneration: 1,

            sourceVersion: 1,
          }),
        ]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("creates a timed event with normalized UTC instants while preserving its source timezone", async () => {
    const user = await createTestUser("PersonalTimedEvent");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const result = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Dentist appointment",

          temporalKind: "timed",

          startsAt: "2026-11-20T14:00:00+08:00",

          endsAt: "2026-11-20T15:30:00+08:00",

          timezone: "Asia/Manila",

          location: "Clinic",
        });

        const stored = await client.query<{
          starts_at: Date;
          ends_at: Date | null;
          timezone: string | null;
          notification_generation: number;
          version: number;
        }>(
          `
                SELECT
                  starts_at,
                  ends_at,
                  timezone,
                  notification_generation,
                  version

                FROM time."personal_event"

                WHERE
                  workspace_id = $1
                  AND id = $2
              `,
          [user.workspaceId, result.eventId],
        );

        expect(stored.rows[0]?.starts_at.toISOString()).toBe(
          "2026-11-20T06:00:00.000Z",
        );

        expect(stored.rows[0]?.ends_at?.toISOString()).toBe(
          "2026-11-20T07:30:00.000Z",
        );

        expect(stored.rows[0]?.timezone).toBe("Asia/Manila");

        expect(stored.rows[0]?.notification_generation).toBe(1);

        expect(stored.rows[0]?.version).toBe(1);

        const agenda = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          startDate: "2026-11-20",

          endDate: "2026-11-20",

          modules: ["time"],
        });

        expect(agenda.items[0]).toMatchObject({
          sourceId: result.eventId,

          temporal: {
            kind: "timed",

            startsAt: "2026-11-20T06:00:00.000Z",

            endsAt: "2026-11-20T07:30:00.000Z",

            timezone: "Asia/Manila",
          },
        });
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("replays a committed client command without creating another event or audit revision", async () => {
    const user = await createTestUser("PersonalEventReplay");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId,

          title: "Renew document",

          temporalKind: "date" as const,

          eventDate: "2026-12-01",
        };

        const first = await createPersonalEventInTransaction(
          transaction,
          input,
        );

        const replay = await createPersonalEventInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(first);

        const eventCount = await client.query<{
          count: string;
        }>(
          `
                SELECT
                  count(*)::text
                    AS count

                FROM time."personal_event"

                WHERE
                  workspace_id = $1
                  AND id = $2
              `,
          [user.workspaceId, first.eventId],
        );

        expect(eventCount.rows[0]?.count).toBe("1");

        const auditCount = await client.query<{
          count: string;
        }>(
          `
                SELECT
                  count(*)::text
                    AS count

                FROM audit."private_revision"

                WHERE
                  workspace_id = $1

                  AND subject_kind =
                    'personal_event'

                  AND subject_id = $2

                  AND operation =
                    'create'
              `,
          [user.workspaceId, first.eventId],
        );

        expect(auditCount.rows[0]?.count).toBe("1");

        const receiptCount = await client.query<{
          count: string;
        }>(
          `
                SELECT
                  count(*)::text
                    AS count

                FROM core."command_receipt"

                WHERE
                  workspace_id = $1
                  AND client_command_id = $2
              `,
          [user.workspaceId, clientCommandId],
        );

        expect(receiptCount.rows[0]?.count).toBe("1");
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("rejects invalid date and timed temporal shapes before creating an event", async () => {
    const user = await createTestUser("PersonalEventShape");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        let dateError: unknown;

        try {
          await createPersonalEventInTransaction(transaction, {
            userId: user.userId,

            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            title: "Invalid date event",

            temporalKind: "date",

            eventDate: "2026-12-10",

            endDateExclusive: "2026-12-10",
          });
        } catch (error) {
          dateError = error;
        }

        expect(dateError).toBeDefined();

        let timedError: unknown;

        try {
          await createPersonalEventInTransaction(transaction, {
            userId: user.userId,

            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            title: "Invalid timed event",

            temporalKind: "timed",

            startsAt: "2026-12-10T15:00:00+08:00",

            endsAt: "2026-12-10T14:00:00+08:00",

            timezone: "Asia/Manila",
          });
        } catch (error) {
          timedError = error;
        }

        expect(timedError).toBeDefined();

        const rows = await client.query<{
          count: string;
        }>(
          `
                SELECT
                  count(*)::text
                    AS count

                FROM time."personal_event"

                WHERE workspace_id = $1
              `,
          [user.workspaceId],
        );

        expect(rows.rows[0]?.count).toBe("0");
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("cannot create a personal event in another user's workspace", async () => {
    const userA = await createTestUser("PersonalEventOwnerA");

    const userB = await createTestUser("PersonalEventOwnerB");

    try {
      await runTimeTestAndRollback(userA, async (transaction) => {
        let crossWorkspaceError: unknown;

        try {
          await createPersonalEventInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,

            clientCommandId: randomUUID(),

            title: "Foreign event",

            temporalKind: "date",

            eventDate: "2026-12-20",
          });
        } catch (error) {
          crossWorkspaceError = error;
        }

        expect(crossWorkspaceError).toBeDefined();
      });
    } finally {
      await removeTestUser(userA);
      await removeTestUser(userB);
    }
  });
});
