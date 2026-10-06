import { randomUUID } from "node:crypto";

import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  AgendaWorkspaceUnavailableError,
  InvalidAgendaCursorError,
  listAgendaItemsInTransaction,
} from "@/modules/time/services/list-agenda-items";
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

type DatePersonalEventFixture = {
  title: string;

  temporalKind: "date";

  eventDate: string;
  endDateExclusive?: string | null;
};

type TimedPersonalEventFixture = {
  title: string;

  temporalKind: "timed";

  startsAt: string;
  endsAt?: string | null;

  timezone: string;
};

type PersonalEventFixture =
  DatePersonalEventFixture | TimedPersonalEventFixture;

function getTestAdministratorConnectionString() {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_ADMIN_URL is required for list-agenda-items integration tests.",
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

    application_name: "pmp-list-agenda-items-test-cleanup",
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

  const rollbackMarker = new Error("ROLLBACK_LIST_AGENDA_ITEMS_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the Agenda integration test transaction to roll back.",
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

async function insertPersonalEvent(
  client: PoolClient,
  user: TestUser,
  input: PersonalEventFixture,
): Promise<string> {
  const id = randomUUID();

  const eventDate = input.temporalKind === "date" ? input.eventDate : null;

  const endDateExclusive =
    input.temporalKind === "date" ? (input.endDateExclusive ?? null) : null;

  const startsAt = input.temporalKind === "timed" ? input.startsAt : null;

  const endsAt = input.temporalKind === "timed" ? (input.endsAt ?? null) : null;

  const timezone = input.temporalKind === "timed" ? input.timezone : null;

  await client.query(
    `
      INSERT INTO time."personal_event" (
        id,
        workspace_id,

        title,
        temporal_kind,

        event_date,
        end_date_exclusive,

        starts_at,
        ends_at,
        timezone,

        status,

        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,

        $3,
        $4,

        $5,
        $6,

        $7,
        $8,
        $9,

        'scheduled',

        $10,
        'user'
      )
    `,
    [
      id,
      user.workspaceId,

      input.title,
      input.temporalKind,

      eventDate,
      endDateExclusive,

      startsAt,
      endsAt,
      timezone,

      user.userId,
    ],
  );

  return id;
}

async function createAppliedApplication(
  transaction: ScopedTransaction,
  user: TestUser,
  label: string,
  appliedDate: string,
) {
  return createJobApplicationInTransaction(transaction, {
    userId: user.userId,
    workspaceId: user.workspaceId,

    clientCommandId: randomUUID(),

    companyName: `${label} Company`,
    roleTitle: "Software Engineer",

    appliedDate,

    initialStage: "applied",
    initialStageEffectiveDate: appliedDate,
  });
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("list Agenda items", () => {
  it("orders sources by workspace-local date and preserves native date/timed shapes", async () => {
    const user = await createTestUser("AgendaOrdering");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const dates = await client.query<{
          yesterday: string;
          today: string;
          tomorrow: string;
        }>(
          `
              SELECT
                (
                  (
                    clock_timestamp()
                      AT TIME ZONE timezone
                  )::date - 1
                )::text AS yesterday,

                (
                  clock_timestamp()
                    AT TIME ZONE timezone
                )::date::text AS today,

                (
                  (
                    clock_timestamp()
                      AT TIME ZONE timezone
                  )::date + 1
                )::text AS tomorrow

              FROM core."workspace"

              WHERE id = $1
            `,
          [user.workspaceId],
        );

        const local = dates.rows[0];

        if (!local) {
          throw new Error(
            "Failed to resolve workspace-local Agenda test dates.",
          );
        }

        const overduePersonalId = await insertPersonalEvent(client, user, {
          title: "Overdue personal task",

          temporalKind: "date",
          eventDate: local.yesterday,
        });

        const application = await createAppliedApplication(
          transaction,
          user,
          "Agenda Ordering",
          local.yesterday,
        );

        const interview = await createApplicationEventInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            eventKind: "interview",
            title: "Today's interview",

            temporalKind: "timed",

            startsAt: `${local.today}T09:00:00+08:00`,

            endsAt: `${local.today}T10:00:00+08:00`,

            timezone: "Asia/Manila",
          },
        );

        const futurePersonalId = await insertPersonalEvent(client, user, {
          title: "Upcoming personal task",

          temporalKind: "date",
          eventDate: local.tomorrow,
        });

        const result = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          startDate: local.yesterday,
          endDate: local.tomorrow,
        });

        expect(result.workspaceTimezone).toBe("Asia/Manila");

        expect(result.today).toBe(local.today);

        expect(result.items.map((item) => item.sourceId)).toEqual([
          overduePersonalId,
          interview.eventId,
          futurePersonalId,
        ]);

        expect(result.items[0]).toEqual({
          sourceKind: "personal_event",
          sourceId: overduePersonalId,

          occurrenceKey: "single",

          title: "Overdue personal task",

          displayModule: "time",

          agendaDate: local.yesterday,

          timingState: "overdue",

          temporal: {
            kind: "date",

            eventDate: local.yesterday,
            endDateExclusive: null,
          },

          status: "scheduled",

          notificationGeneration: 1,

          reminderCapable: true,
          remindersEnabled: true,

          sourceVersion: 1,
        });

        expect(result.items[1]).toEqual({
          sourceKind: "application_event",
          sourceId: interview.eventId,

          occurrenceKey: "single",

          title: "Today's interview",

          displayModule: "career",

          agendaDate: local.today,

          timingState: "today",

          temporal: {
            kind: "timed",

            startsAt: `${local.today}T01:00:00.000Z`,

            endsAt: `${local.today}T02:00:00.000Z`,

            timezone: "Asia/Manila",
          },

          status: "scheduled",

          notificationGeneration: 1,

          reminderCapable: true,
          remindersEnabled: true,

          sourceVersion: 1,
        });

        expect(result.items[2]?.timingState).toBe("upcoming");

        expect(result.nextCursor).toBeNull();
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("honors agenda visibility separately from navigation enablement and explicit module filters", async () => {
    const user = await createTestUser("AgendaVisibility");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Visibility",
          "2026-11-01",
        );

        const careerEvent = await createApplicationEventInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            eventKind: "follow_up",
            title: "Career follow-up",

            temporalKind: "date",
            eventDate: "2026-11-10",
          },
        );

        const personalEventId = await insertPersonalEvent(client, user, {
          title: "Personal deadline",

          temporalKind: "date",
          eventDate: "2026-11-10",
        });

        await client.query(
          `
              INSERT INTO core."module_preference" (
                workspace_id,
                module_key,
                enabled,
                agenda_visible,
                reminders_enabled
              )
              VALUES
                (
                  $1,
                  'career',
                  false,
                  true,
                  true
                ),
                (
                  $1,
                  'time',
                  true,
                  false,
                  true
                )
            `,
          [user.workspaceId],
        );

        const defaultResult = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          startDate: "2026-11-10",
          endDate: "2026-11-10",
        });

        expect(defaultResult.items.map((item) => item.sourceId)).toEqual([
          careerEvent.eventId,
        ]);

        const hiddenTime = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          startDate: "2026-11-10",
          endDate: "2026-11-10",

          modules: ["time"],
        });

        expect(hiddenTime.items).toEqual([]);

        await client.query(
          `
              UPDATE core."module_preference"
              SET agenda_visible = true
              WHERE
                workspace_id = $1
                AND module_key = 'time'
            `,
          [user.workspaceId],
        );

        const visibleTime = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          startDate: "2026-11-10",
          endDate: "2026-11-10",

          modules: ["time"],
        });

        expect(visibleTime.items.map((item) => item.sourceId)).toEqual([
          personalEventId,
        ]);

        expect(visibleTime.items[0]?.displayModule).toBe("time");
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("uses the workspace timezone when bounding timed sources by calendar date", async () => {
    const user = await createTestUser("AgendaTimezone");

    try {
      await runTimeTestAndRollback(user, async (transaction) => {
        const application = await createAppliedApplication(
          transaction,
          user,
          "Timezone",
          "2026-10-01",
        );

        const inside = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "interview",
          title: "After midnight interview",

          temporalKind: "timed",

          startsAt: "2026-10-10T00:30:00+08:00",

          endsAt: "2026-10-10T01:30:00+08:00",

          timezone: "Asia/Manila",
        });

        const outside = await createApplicationEventInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId: randomUUID(),

          eventKind: "interview",
          title: "Previous day interview",

          temporalKind: "timed",

          startsAt: "2026-10-09T23:30:00+08:00",

          endsAt: "2026-10-09T23:45:00+08:00",

          timezone: "Asia/Manila",
        });

        const result = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          startDate: "2026-10-10",
          endDate: "2026-10-10",
        });

        expect(result.items.map((item) => item.sourceId)).toEqual([
          inside.eventId,
        ]);

        expect(
          result.items.some((item) => item.sourceId === outside.eventId),
        ).toBe(false);

        expect(result.items[0]).toMatchObject({
          sourceId: inside.eventId,

          agendaDate: "2026-10-10",

          temporal: {
            kind: "timed",

            startsAt: "2026-10-09T16:30:00.000Z",

            endsAt: "2026-10-09T17:30:00.000Z",

            timezone: "Asia/Manila",
          },
        });
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("paginates deterministically without duplicate sources and rejects cursors reused with different filters", async () => {
    const user = await createTestUser("AgendaPaging");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        /*
         * A checked-out pg PoolClient executes one query at a time.
         * Keep these fixture inserts sequential rather than issuing
         * concurrent client.query() calls against the same connection.
         */
        const firstEventId = await insertPersonalEvent(client, user, {
          title: "Agenda Page A",

          temporalKind: "date",
          eventDate: "2026-12-01",
        });

        const secondEventId = await insertPersonalEvent(client, user, {
          title: "Agenda Page B",

          temporalKind: "date",
          eventDate: "2026-12-01",
        });

        const thirdEventId = await insertPersonalEvent(client, user, {
          title: "Agenda Page C",

          temporalKind: "date",
          eventDate: "2026-12-01",
        });

        const eventIds = [firstEventId, secondEventId, thirdEventId];

        const pageOne = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          startDate: "2026-12-01",
          endDate: "2026-12-01",

          modules: ["time"],

          pageSize: 2,
        });

        expect(pageOne.items).toHaveLength(2);
        expect(pageOne.nextCursor).not.toBeNull();

        const pageTwo = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          startDate: "2026-12-01",
          endDate: "2026-12-01",

          modules: ["time"],

          pageSize: 2,

          cursor: pageOne.nextCursor ?? undefined,
        });

        expect(pageTwo.items).toHaveLength(1);
        expect(pageTwo.nextCursor).toBeNull();

        const combinedIds = [...pageOne.items, ...pageTwo.items].map(
          (item) => item.sourceId,
        );

        expect(new Set(combinedIds).size).toBe(3);

        expect(combinedIds.sort()).toEqual([...eventIds].sort());

        let cursorError: unknown;

        try {
          await listAgendaItemsInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            startDate: "2026-12-01",
            endDate: "2026-12-01",

            modules: ["career"],

            pageSize: 2,

            cursor: pageOne.nextCursor ?? undefined,
          });
        } catch (error) {
          cursorError = error;
        }

        expect(cursorError).toBeInstanceOf(InvalidAgendaCursorError);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("does not allow a scoped transaction to query another user's workspace Agenda", async () => {
    const userA = await createTestUser("AgendaOwnerA");

    const userB = await createTestUser("AgendaOwnerB");

    try {
      await runTimeTestAndRollback(userA, async (transaction) => {
        let unavailableError: unknown;

        try {
          await listAgendaItemsInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,

            startDate: "2026-10-01",
            endDate: "2026-10-31",
          });
        } catch (error) {
          unavailableError = error;
        }

        expect(unavailableError).toBeInstanceOf(
          AgendaWorkspaceUnavailableError,
        );
      });
    } finally {
      await removeTestUser(userA);
      await removeTestUser(userB);
    }
  });
});
