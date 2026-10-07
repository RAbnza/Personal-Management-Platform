import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { PersonalEventUnavailableError } from "@/modules/time/domain/personal-event";
import { createPersonalEventInTransaction } from "@/modules/time/services/create-personal-event";
import { getPersonalEventDetailInTransaction } from "@/modules/time/services/get-personal-event-detail";
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

  const rollbackMarker = new Error("ROLLBACK_GET_PERSONAL_EVENT_DETAIL_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the personal-event detail integration test transaction to roll back.",
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

describe("get personal event detail", () => {
  it("returns the authoritative source record and preserves terminal history", async () => {
    const user = await createTestUser("PersonalEventDetail");

    try {
      await runTimeTestAndRollback(user, async (transaction) => {
        const created = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Submit documents",

          temporalKind: "date",

          eventDate: "2026-10-10",

          description: "Prepare requirements.",

          location: "Home",

          referenceUrl: "https://example.test/reference",
        });

        const scheduled = await getPersonalEventDetailInTransaction(
          transaction,
          {
            userId: user.userId,

            workspaceId: user.workspaceId,

            eventId: created.eventId,
          },
        );

        expect(scheduled).toMatchObject({
          eventId: created.eventId,

          title: "Submit documents",

          temporalKind: "date",

          eventDate: "2026-10-10",

          endDateExclusive: null,

          startsAt: null,

          endsAt: null,

          timezone: null,

          status: "scheduled",

          description: "Prepare requirements.",

          location: "Home",

          referenceUrl: "https://example.test/reference",

          completedAt: null,

          version: 1,
        });

        expect(scheduled.createdAt).toEqual(expect.any(String));

        expect(scheduled.updatedAt).toEqual(expect.any(String));

        const completed = await mutatePersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          eventId: created.eventId,

          clientCommandId: randomUUID(),

          expectedEventVersion: created.eventVersion,

          action: "complete",

          reason: "Documents submitted.",
        });

        const historical = await getPersonalEventDetailInTransaction(
          transaction,
          {
            userId: user.userId,

            workspaceId: user.workspaceId,

            eventId: created.eventId,
          },
        );

        expect(historical).toMatchObject({
          status: "completed",

          version: completed.eventVersion,

          completedAt: expect.any(String),
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,

        "pmp-get-personal-event-detail-test-cleanup",
      );
    }
  });

  it("rejects an unavailable personal event", async () => {
    const user = await createTestUser("PersonalEventDetailUnavailable");

    try {
      await runTimeTestAndRollback(user, async (transaction) => {
        let readError: unknown;

        try {
          await getPersonalEventDetailInTransaction(transaction, {
            userId: user.userId,

            workspaceId: user.workspaceId,

            eventId: randomUUID(),
          });
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(PersonalEventUnavailableError);
      });
    } finally {
      await removeProvisionedTestUser(
        user,

        "pmp-get-personal-event-detail-test-cleanup",
      );
    }
  });
});
