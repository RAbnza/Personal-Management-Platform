import { randomUUID } from "node:crypto";

import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import {
  listModulePreferencesInTransaction,
  ModulePreferenceWorkspaceUnavailableError,
} from "@/modules/core/services/list-module-preferences";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  ModulePreferenceVersionConflictError,
  updateModulePreferenceInTransaction,
} from "@/modules/core/services/update-module-preference";
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
      "TEST_DATABASE_ADMIN_URL is required for module-preference integration tests.",
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

    application_name: "pmp-module-preference-test-cleanup",
  });

  try {
    await administrator.connect();

    await administrator.query("BEGIN");

    try {
      await administrator.query(
        `
          DELETE FROM core."module_preference"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

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

async function runCoreTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_MODULE_PREFERENCE_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the module-preference integration test transaction to roll back.",
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

describe("module preferences", () => {
  it("returns virtual documented defaults when no preference rows have been materialized", async () => {
    const user = await createTestUser("ModuleDefaults");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const stored = await client.query<{
          count: string;
        }>(
          `
                SELECT
                  count(*)::text
                    AS count

                FROM core."module_preference"

                WHERE workspace_id = $1
              `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.count).toBe("0");

        const result = await listModulePreferencesInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,
        });

        expect(result.items).toEqual([
          {
            moduleKey: "money",

            enabled: true,

            agendaVisible: true,

            remindersEnabled: true,

            version: 0,
          },

          {
            moduleKey: "career",

            enabled: true,

            agendaVisible: true,

            remindersEnabled: true,

            version: 0,
          },

          {
            moduleKey: "time",

            enabled: true,

            agendaVisible: true,

            remindersEnabled: true,

            version: 0,
          },
        ]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("keeps navigation, Agenda visibility and reminders independent", async () => {
    const user = await createTestUser("ModuleIndependence");

    try {
      await runCoreTestAndRollback(user, async (transaction) => {
        const event = await createPersonalEventInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          title: "Visible Time event",

          temporalKind: "date",

          eventDate: "2026-12-10",
        });

        const hiddenNavigation = await updateModulePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,

            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            moduleKey: "time",

            expectedVersion: 0,

            enabled: false,

            agendaVisible: true,

            remindersEnabled: false,
          },
        );

        expect(hiddenNavigation).toEqual({
          moduleKey: "time",

          enabled: false,

          agendaVisible: true,

          remindersEnabled: false,

          version: 1,
        });

        const stillVisible = await listAgendaItemsInTransaction(transaction, {
          userId: user.userId,

          workspaceId: user.workspaceId,

          startDate: "2026-12-10",

          endDate: "2026-12-10",

          modules: ["time"],
        });

        expect(stillVisible.items).toEqual([
          expect.objectContaining({
            sourceId: event.eventId,

            displayModule: "time",

            remindersEnabled: false,
          }),
        ]);

        const hiddenAgenda = await updateModulePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,

            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            moduleKey: "time",

            expectedVersion: 1,

            enabled: false,

            agendaVisible: false,

            remindersEnabled: false,
          },
        );

        expect(hiddenAgenda.version).toBe(2);

        const noLongerVisible = await listAgendaItemsInTransaction(
          transaction,
          {
            userId: user.userId,

            workspaceId: user.workspaceId,

            startDate: "2026-12-10",

            endDate: "2026-12-10",

            modules: ["time"],
          },
        );

        expect(noLongerVisible.items).toEqual([]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("replays a committed preference command without advancing its version again", async () => {
    const user = await createTestUser("ModuleReplay");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,

          workspaceId: user.workspaceId,

          clientCommandId,

          moduleKey: "career" as const,

          expectedVersion: 0,

          enabled: false,

          agendaVisible: true,

          remindersEnabled: true,
        };

        const first = await updateModulePreferenceInTransaction(
          transaction,
          input,
        );

        const replay = await updateModulePreferenceInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(first);

        expect(first.version).toBe(1);

        const stored = await client.query<{
          version: number;
          count: string;
        }>(
          `
                SELECT
                  max(version)::integer
                    AS version,

                  count(*)::text
                    AS count

                FROM core."module_preference"

                WHERE
                  workspace_id = $1
                  AND module_key =
                    'career'
              `,
          [user.workspaceId],
        );

        expect(stored.rows[0]).toEqual({
          version: 1,
          count: "1",
        });
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("rejects a stale module-preference version without changing the stored preference", async () => {
    const user = await createTestUser("ModuleConflict");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
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

        await client.query("SAVEPOINT stale_module_preference");

        let staleError: unknown;

        try {
          await updateModulePreferenceInTransaction(transaction, {
            userId: user.userId,

            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            moduleKey: "money",

            expectedVersion: 0,

            enabled: true,

            agendaVisible: false,

            remindersEnabled: false,
          });
        } catch (error) {
          staleError = error;
        }

        await client.query("ROLLBACK TO SAVEPOINT stale_module_preference");

        await client.query("RELEASE SAVEPOINT stale_module_preference");

        expect(staleError).toBeInstanceOf(ModulePreferenceVersionConflictError);

        expect(staleError).toMatchObject({
          moduleKey: "money",

          expectedVersion: 0,

          currentVersion: 1,
        });

        const stored = await client.query<{
          enabled: boolean;

          agenda_visible: boolean;

          reminders_enabled: boolean;

          version: number;
        }>(
          `
                SELECT
                  enabled,
                  agenda_visible,
                  reminders_enabled,
                  version

                FROM core."module_preference"

                WHERE
                  workspace_id = $1
                  AND module_key =
                    'money'
              `,
          [user.workspaceId],
        );

        expect(stored.rows).toEqual([
          {
            enabled: false,

            agenda_visible: true,

            reminders_enabled: true,

            version: 1,
          },
        ]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("does not expose or mutate another user's module preferences", async () => {
    const userA = await createTestUser("ModuleOwnerA");

    const userB = await createTestUser("ModuleOwnerB");

    try {
      await runCoreTestAndRollback(userA, async (transaction) => {
        let readError: unknown;

        try {
          await listModulePreferencesInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,
          });
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(
          ModulePreferenceWorkspaceUnavailableError,
        );

        let writeError: unknown;

        try {
          await updateModulePreferenceInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,

            clientCommandId: randomUUID(),

            moduleKey: "career",

            expectedVersion: 0,

            enabled: false,

            agendaVisible: true,

            remindersEnabled: true,
          });
        } catch (error) {
          writeError = error;
        }

        expect(writeError).toBeInstanceOf(PrivateDomainWriteUnavailableError);
      });
    } finally {
      await removeTestUser(userA);

      await removeTestUser(userB);
    }
  });
});
