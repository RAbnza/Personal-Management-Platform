import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  PersonalEventStateError,
  PersonalEventVersionConflictError,
} from "@/modules/time/domain/personal-event";
import { createPersonalEventInTransaction } from "@/modules/time/services/create-personal-event";
import { listAgendaItemsInTransaction } from "@/modules/time/services/list-agenda-items";
import { mutatePersonalEventInTransaction } from "@/modules/time/services/mutate-personal-event";
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

async function runTimeTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_MUTATE_PERSONAL_EVENT_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the personal-event mutation test transaction to roll back.",
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

describe("mutate personal event", () => {
  it("edits descriptive fields without advancing notification generation", async () => {
    const user = await createTestUser("PersonalEditDescription");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const created = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Renew document",

          temporalKind: "date",

          eventDate: "2026-11-10",

          description: "Original description",

          location: "Original office",

          referenceUrl: "https://example.com/original",
        });

        const edited = await mutatePersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          eventId: created.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: 1,

          action: "edit",

          title: "Renew passport",

          temporalKind: "date",

          eventDate: "2026-11-10",

          description: "Bring supporting documents.",

          location: "Updated office",

          referenceUrl: "https://example.com/updated",

          reason: "Corrected event details.",
        });

        expect(edited).toEqual({
          eventId: created.eventId,

          action: "edit",

          eventVersion: 2,

          notificationGeneration: 1,

          status: "scheduled",

          completedAt: null,
        });

        const stored = await client.query<{
          title: string;
          description: string | null;
          location: string | null;
          reference_url: string | null;

          event_date: string;

          notification_generation: number;

          version: number;
        }>(
          `
            SELECT
              title,
              description,
              location,
              reference_url,

              event_date::text
                AS event_date,

              notification_generation,
              version

            FROM time."personal_event"

            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, created.eventId],
        );

        expect(stored.rows).toEqual([
          {
            title: "Renew passport",

            description: "Bring supporting documents.",

            location: "Updated office",

            reference_url: "https://example.com/updated",

            event_date: "2026-11-10",

            notification_generation: 1,

            version: 2,
          },
        ]);

        const agenda = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          startDate: "2026-11-10",

          endDate: "2026-11-10",

          modules: ["time"],
        });

        expect(agenda.items[0]).toMatchObject({
          sourceId: created.eventId,

          title: "Renew passport",

          notificationGeneration: 1,

          sourceVersion: 2,
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-personal-event-test-cleanup",
      );
    }
  });

  it("reschedules a date-only event into a timed event and advances notification generation", async () => {
    const user = await createTestUser("PersonalReschedule");

    try {
      await runTimeTestAndRollback(user, async (transaction) => {
        const created = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Doctor appointment",

          temporalKind: "date",

          eventDate: "2026-11-10",
        });

        const edited = await mutatePersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          eventId: created.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: 1,

          action: "edit",

          title: "Doctor appointment",

          temporalKind: "timed",

          startsAt: "2026-11-11T14:00:00+08:00",

          endsAt: "2026-11-11T15:00:00+08:00",

          timezone: "Asia/Manila",

          reason: "Clinic confirmed the appointment time.",
        });

        expect(edited).toEqual({
          eventId: created.eventId,

          action: "edit",

          eventVersion: 2,

          notificationGeneration: 2,

          status: "scheduled",

          completedAt: null,
        });

        const oldAgenda = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          startDate: "2026-11-10",

          endDate: "2026-11-10",

          modules: ["time"],
        });

        expect(oldAgenda.items).toEqual([]);

        const newAgenda = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          startDate: "2026-11-11",

          endDate: "2026-11-11",

          modules: ["time"],
        });

        expect(newAgenda.items).toEqual([
          expect.objectContaining({
            sourceId: created.eventId,

            agendaDate: "2026-11-11",

            temporal: {
              kind: "timed",

              startsAt: "2026-11-11T06:00:00.000Z",

              endsAt: "2026-11-11T07:00:00.000Z",

              timezone: "Asia/Manila",
            },

            notificationGeneration: 2,

            sourceVersion: 2,
          }),
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-personal-event-test-cleanup",
      );
    }
  });

  it("completes a scheduled event, removes it from Agenda and replays idempotently", async () => {
    const user = await createTestUser("PersonalComplete");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const created = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Submit document",

          temporalKind: "date",

          eventDate: "2026-11-15",
        });

        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,

          workspaceId: user.workspaceId,

          eventId: created.eventId,

          clientCommandId,

          expectedEventVersion: 1,

          action: "complete" as const,

          reason: "Submission completed.",
        };

        const completed = await mutatePersonalEventInTransaction(
          transaction,
          input,
        );

        expect(completed.eventId).toBe(created.eventId);

        expect(completed.action).toBe("complete");

        expect(completed.eventVersion).toBe(2);

        expect(completed.notificationGeneration).toBe(2);

        expect(completed.status).toBe("completed");

        expect(completed.completedAt).toEqual(expect.any(String));

        const replay = await mutatePersonalEventInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(completed);

        const stored = await client.query<{
          status: string;

          completed_at: Date | null;

          notification_generation: number;

          version: number;
        }>(
          `
            SELECT
              status,
              completed_at,
              notification_generation,
              version

            FROM time."personal_event"

            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, created.eventId],
        );

        expect(stored.rows[0]?.status).toBe("completed");

        expect(stored.rows[0]?.completed_at).toBeInstanceOf(Date);

        expect(stored.rows[0]?.notification_generation).toBe(2);

        expect(stored.rows[0]?.version).toBe(2);

        const agenda = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          startDate: "2026-11-15",

          endDate: "2026-11-15",

          modules: ["time"],
        });

        expect(agenda.items).toEqual([]);

        const audit = await client.query<{
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
                'complete'
          `,
          [user.workspaceId, created.eventId],
        );

        expect(audit.rows[0]?.count).toBe("1");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-personal-event-test-cleanup",
      );
    }
  });

  it("cancels a scheduled event without inventing a completion timestamp", async () => {
    const user = await createTestUser("PersonalCancel");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const created = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Cancelled meeting",

          temporalKind: "timed",

          startsAt: "2026-11-20T14:00:00+08:00",

          endsAt: "2026-11-20T15:00:00+08:00",

          timezone: "Asia/Manila",
        });

        const cancelled = await mutatePersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          eventId: created.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: 1,

          action: "cancel",

          reason: "Meeting was cancelled.",
        });

        expect(cancelled).toEqual({
          eventId: created.eventId,

          action: "cancel",

          eventVersion: 2,

          notificationGeneration: 2,

          status: "cancelled",

          completedAt: null,
        });

        const stored = await client.query<{
          status: string;

          completed_at: Date | null;

          notification_generation: number;

          version: number;
        }>(
          `
            SELECT
              status,
              completed_at,
              notification_generation,
              version

            FROM time."personal_event"

            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, created.eventId],
        );

        expect(stored.rows).toEqual([
          {
            status: "cancelled",

            completed_at: null,

            notification_generation: 2,

            version: 2,
          },
        ]);

        const agenda = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          startDate: "2026-11-20",

          endDate: "2026-11-20",

          modules: ["time"],
        });

        expect(agenda.items).toEqual([]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-personal-event-test-cleanup",
      );
    }
  });

  it("rejects stale versions and rejects further mutation after the event becomes terminal", async () => {
    const user = await createTestUser("PersonalMutationConflict");

    try {
      await runTimeTestAndRollback(user, async (transaction, client) => {
        const created = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Versioned event",

          temporalKind: "date",

          eventDate: "2026-12-05",

          description: "Initial description",
        });

        const edited = await mutatePersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          eventId: created.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: 1,

          action: "edit",

          title: "Versioned event",

          temporalKind: "date",

          eventDate: "2026-12-05",

          description: "Updated description",
        });

        expect(edited.eventVersion).toBe(2);

        expect(edited.notificationGeneration).toBe(1);

        await client.query("SAVEPOINT stale_personal_event");

        let staleError: unknown;

        try {
          await mutatePersonalEventInTransaction(transaction, {
            userId: user.userId,

            workspaceId: user.workspaceId,

            eventId: created.eventId,

            clientCommandId: randomUUID(),

            expectedEventVersion: 1,

            action: "complete",
          });
        } catch (error) {
          staleError = error;
        }

        await client.query("ROLLBACK TO SAVEPOINT stale_personal_event");

        await client.query("RELEASE SAVEPOINT stale_personal_event");

        expect(staleError).toBeInstanceOf(PersonalEventVersionConflictError);

        const completed = await mutatePersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          eventId: created.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: 2,

          action: "complete",
        });

        expect(completed.eventVersion).toBe(3);

        expect(completed.notificationGeneration).toBe(2);

        expect(completed.status).toBe("completed");

        await client.query("SAVEPOINT terminal_personal_event");

        let terminalError: unknown;

        try {
          await mutatePersonalEventInTransaction(transaction, {
            userId: user.userId,

            workspaceId: user.workspaceId,

            eventId: created.eventId,

            clientCommandId: randomUUID(),

            expectedEventVersion: 3,

            action: "edit",

            title: "Should not change",

            temporalKind: "date",

            eventDate: "2026-12-05",
          });
        } catch (error) {
          terminalError = error;
        }

        await client.query("ROLLBACK TO SAVEPOINT terminal_personal_event");

        await client.query("RELEASE SAVEPOINT terminal_personal_event");

        expect(terminalError).toBeInstanceOf(PersonalEventStateError);

        const finalState = await client.query<{
          status: string;
          version: number;
          notification_generation: number;
        }>(
          `
            SELECT
              status,
              version,
              notification_generation

            FROM time."personal_event"

            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, created.eventId],
        );

        expect(finalState.rows).toEqual([
          {
            status: "completed",

            version: 3,

            notification_generation: 2,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-mutate-personal-event-test-cleanup",
      );
    }
  });
});
