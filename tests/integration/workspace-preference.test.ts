import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { getWorkspaceSettingsInTransaction } from "@/modules/core/services/get-workspace-settings";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  updateWorkspacePreferenceInTransaction,
  WorkspacePreferenceVersionConflictError,
} from "@/modules/core/services/update-workspace-preference";
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

  const rollbackMarker = new Error("ROLLBACK_WORKSPACE_PREFERENCE_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the workspace-preference integration test transaction to roll back.",
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

describe("workspace preference", () => {
  it("changes theme and dismisses Getting Started with a database timestamp", async () => {
    const user = await createTestUser("PreferenceDismiss");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const updated = await updateWorkspacePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            theme: "dark",

            gettingStartedDismissed: true,
          },
        );

        expect(updated).toMatchObject({
          theme: "dark",

          gettingStartedDismissedAt: expect.any(String),

          version: 2,
        });

        const stored = await client.query<{
          theme: string;
          getting_started_dismissed_at: Date | null;
          version: number;
        }>(
          `
            SELECT
              theme,
              getting_started_dismissed_at,
              version

            FROM core."workspace_preference"

            WHERE workspace_id = $1
          `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.theme).toBe("dark");

        expect(
          stored.rows[0]?.getting_started_dismissed_at?.toISOString(),
        ).toBe(updated.gettingStartedDismissedAt);

        expect(stored.rows[0]?.version).toBe(2);

        const settings = await getWorkspaceSettingsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(settings.preference).toMatchObject({
          theme: "dark",

          gettingStartedDismissedAt: updated.gettingStartedDismissedAt,

          version: 2,
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-preference-test-cleanup",
      );
    }
  });

  it("restores the Getting Started checklist by clearing the dismissal timestamp", async () => {
    const user = await createTestUser("PreferenceRestore");

    try {
      await runCoreTestAndRollback(user, async (transaction) => {
        const dismissed = await updateWorkspacePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            theme: "system",

            gettingStartedDismissed: true,
          },
        );

        expect(dismissed.version).toBe(2);

        expect(dismissed.gettingStartedDismissedAt).not.toBeNull();

        const restored = await updateWorkspacePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 2,

            theme: "light",

            gettingStartedDismissed: false,
          },
        );

        expect(restored).toEqual({
          theme: "light",

          gettingStartedDismissedAt: null,

          version: 3,
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-preference-test-cleanup",
      );
    }
  });

  it("does not advance the preference version for an unchanged save", async () => {
    const user = await createTestUser("PreferenceNoop");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const clientCommandId = randomUUID();

        const unchanged = await updateWorkspacePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId,

            expectedVersion: 1,

            theme: "system",

            gettingStartedDismissed: false,
          },
        );

        expect(unchanged).toEqual({
          theme: "system",

          gettingStartedDismissedAt: null,

          version: 1,
        });

        const stored = await client.query<{
          version: number;
        }>(
          `
            SELECT version

            FROM core."workspace_preference"

            WHERE workspace_id = $1
          `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.version).toBe(1);

        const receipt = await client.query<{
          state: string;
        }>(
          `
            SELECT state

            FROM core."command_receipt"

            WHERE
              workspace_id = $1
              AND client_command_id = $2
          `,
          [user.workspaceId, clientCommandId],
        );

        expect(receipt.rows).toEqual([
          {
            state: "completed",
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-preference-test-cleanup",
      );
    }
  });

  it("replays the original successful result after later preference changes", async () => {
    const user = await createTestUser("PreferenceReplay");

    try {
      await runCoreTestAndRollback(user, async (transaction) => {
        const firstCommandId = randomUUID();

        const first = await updateWorkspacePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: firstCommandId,

            expectedVersion: 1,

            theme: "dark",

            gettingStartedDismissed: true,
          },
        );

        expect(first.version).toBe(2);

        const second = await updateWorkspacePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 2,

            theme: "light",

            gettingStartedDismissed: true,
          },
        );

        expect(second.version).toBe(3);

        const replay = await updateWorkspacePreferenceInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: firstCommandId,

            expectedVersion: 1,

            theme: "dark",

            gettingStartedDismissed: true,
          },
        );

        expect(replay).toEqual(first);

        expect(replay.gettingStartedDismissedAt).toBe(
          first.gettingStartedDismissedAt,
        );
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-preference-test-cleanup",
      );
    }
  });

  it("rejects stale versions and cross-workspace writes", async () => {
    const userA = await createTestUser("PreferenceOwnerA");
    const userB = await createTestUser("PreferenceOwnerB");

    try {
      await runCoreTestAndRollback(userA, async (transaction, client) => {
        await updateWorkspacePreferenceInTransaction(transaction, {
          userId: userA.userId,
          workspaceId: userA.workspaceId,

          clientCommandId: randomUUID(),

          expectedVersion: 1,

          theme: "dark",

          gettingStartedDismissed: false,
        });

        await client.query("SAVEPOINT stale_workspace_preference");

        let staleError: unknown;

        try {
          await updateWorkspacePreferenceInTransaction(transaction, {
            userId: userA.userId,
            workspaceId: userA.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            theme: "light",

            gettingStartedDismissed: false,
          });
        } catch (error) {
          staleError = error;
        }

        await client.query("ROLLBACK TO SAVEPOINT stale_workspace_preference");

        await client.query("RELEASE SAVEPOINT stale_workspace_preference");

        expect(staleError).toBeInstanceOf(
          WorkspacePreferenceVersionConflictError,
        );

        expect(staleError).toMatchObject({
          expectedVersion: 1,
          currentVersion: 2,
        });

        await expect(
          updateWorkspacePreferenceInTransaction(transaction, {
            userId: userA.userId,
            workspaceId: userB.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            theme: "dark",

            gettingStartedDismissed: false,
          }),
        ).rejects.toMatchObject({
          code: "PRIVATE_DOMAIN_WRITE_UNAVAILABLE",
        });
      });
    } finally {
      await removeProvisionedTestUser(
        userA,
        "pmp-workspace-preference-test-cleanup",
      );

      await removeProvisionedTestUser(
        userB,
        "pmp-workspace-preference-test-cleanup",
      );
    }
  });
});
