import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  getWorkspaceSettingsInTransaction,
  WorkspaceSettingsWorkspaceUnavailableError,
} from "@/modules/core/services/get-workspace-settings";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  updateWorkspaceSettingsInTransaction,
  WorkspaceCurrencyLockedError,
  WorkspaceSettingsVersionConflictError,
} from "@/modules/core/services/update-workspace-settings";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
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

  const rollbackMarker = new Error("ROLLBACK_WORKSPACE_SETTINGS_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the workspace-settings integration test transaction to roll back.",
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

describe("workspace settings", () => {
  it("reads the provisioned workspace and preference defaults", async () => {
    const user = await createTestUser("WorkspaceSettingsDefaults");

    try {
      await runCoreTestAndRollback(user, async (transaction) => {
        const settings = await getWorkspaceSettingsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(settings).toEqual({
          workspace: {
            currency: "PHP",
            timezone: "Asia/Manila",
            weekStart: 1,
            version: 1,
            currencyChangeAllowed: true,
          },

          preference: {
            locale: "en-PH",
            theme: "system",
            defaultSalaryAccountId: null,
            gettingStartedDismissedAt: null,
            version: 1,
          },
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-settings-test-cleanup",
      );
    }
  });

  it("updates fresh-workspace currency, timezone and week start and Finance uses the chosen currency", async () => {
    const user = await createTestUser("WorkspaceSettingsUpdate");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const updated = await updateWorkspaceSettingsInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            currency: "USD",
            timezone: "America/New_York",
            weekStart: 0,
          },
        );

        expect(updated).toEqual({
          currency: "USD",
          timezone: "America/New_York",
          weekStart: 0,
          version: 2,
          currencyChangeAllowed: true,
        });

        const settings = await getWorkspaceSettingsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(settings.workspace).toEqual({
          currency: "USD",
          timezone: "America/New_York",
          weekStart: 0,
          version: 2,
          currencyChangeAllowed: true,
        });

        const account = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          name: "USD Wallet",
          accountType: "cash",

          openingCutoffDate: "2026-10-07",
          openingBalanceMinor: "0",
        });

        const stored = await client.query<{
          account_currency: string;
          ledger_currency: string;
        }>(
          `
            SELECT
              account."currency"
                AS account_currency,

              ledger."currency"
                AS ledger_currency

            FROM finance."financial_account"
              AS account

            INNER JOIN finance."ledger_account"
              AS ledger
              ON ledger."workspace_id" =
                account."workspace_id"

              AND ledger."id" =
                account."ledger_account_id"

            WHERE
              account."workspace_id" = $1
              AND account."id" = $2
          `,
          [user.workspaceId, account.accountId],
        );

        expect(stored.rows).toEqual([
          {
            account_currency: "USD",
            ledger_currency: "USD",
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-settings-test-cleanup",
      );
    }
  });

  it("replays a completed settings command before checking its now-stale version", async () => {
    const user = await createTestUser("WorkspaceSettingsReplay");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId,

          expectedVersion: 1,

          currency: "PHP",
          timezone: "Asia/Singapore",
          weekStart: 1,
        };

        const first = await updateWorkspaceSettingsInTransaction(
          transaction,
          input,
        );

        const replay = await updateWorkspaceSettingsInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(first);
        expect(first.version).toBe(2);

        const stored = await client.query<{
          version: number;
        }>(
          `
            SELECT version

            FROM core."workspace"

            WHERE id = $1
          `,
          [user.workspaceId],
        );

        expect(stored.rows[0]?.version).toBe(2);

        const receipts = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count

            FROM core."command_receipt"

            WHERE
              workspace_id = $1
              AND client_command_id = $2
          `,
          [user.workspaceId, clientCommandId],
        );

        expect(receipts.rows[0]?.count).toBe("1");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-settings-test-cleanup",
      );
    }
  });

  it("rejects stale workspace versions without changing the current settings", async () => {
    const user = await createTestUser("WorkspaceSettingsConflict");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        await updateWorkspaceSettingsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          expectedVersion: 1,

          currency: "PHP",
          timezone: "Asia/Singapore",
          weekStart: 1,
        });

        await client.query("SAVEPOINT stale_workspace_settings");

        let staleError: unknown;

        try {
          await updateWorkspaceSettingsInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            currency: "USD",
            timezone: "America/New_York",
            weekStart: 0,
          });
        } catch (error) {
          staleError = error;
        }

        await client.query("ROLLBACK TO SAVEPOINT stale_workspace_settings");
        await client.query("RELEASE SAVEPOINT stale_workspace_settings");

        expect(staleError).toBeInstanceOf(
          WorkspaceSettingsVersionConflictError,
        );

        expect(staleError).toMatchObject({
          expectedVersion: 1,
          currentVersion: 2,
        });

        const stored = await client.query<{
          currency: string;
          timezone: string;
          week_start: number;
          version: number;
        }>(
          `
            SELECT
              currency,
              timezone,
              week_start,
              version

            FROM core."workspace"

            WHERE id = $1
          `,
          [user.workspaceId],
        );

        expect(stored.rows).toEqual([
          {
            currency: "PHP",
            timezone: "Asia/Singapore",
            week_start: 1,
            version: 2,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-settings-test-cleanup",
      );
    }
  });

  it("locks currency after financial structure exists while still allowing timezone and week-start changes", async () => {
    const user = await createTestUser("WorkspaceCurrencyLock");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          name: "Existing Wallet",
          accountType: "e_wallet",

          openingCutoffDate: "2026-10-07",
          openingBalanceMinor: "0",
        });

        const current = await getWorkspaceSettingsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(current.workspace.currencyChangeAllowed).toBe(false);

        await client.query("SAVEPOINT locked_workspace_currency");

        let lockedError: unknown;

        try {
          await updateWorkspaceSettingsInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: current.workspace.version,

            currency: "USD",
            timezone: current.workspace.timezone,
            weekStart: current.workspace.weekStart,
          });
        } catch (error) {
          lockedError = error;
        }

        await client.query("ROLLBACK TO SAVEPOINT locked_workspace_currency");
        await client.query("RELEASE SAVEPOINT locked_workspace_currency");

        expect(lockedError).toBeInstanceOf(WorkspaceCurrencyLockedError);

        const updated = await updateWorkspaceSettingsInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: current.workspace.version,

            currency: "PHP",
            timezone: "Asia/Singapore",
            weekStart: 0,
          },
        );

        expect(updated).toMatchObject({
          currency: "PHP",
          timezone: "Asia/Singapore",
          weekStart: 0,
          currencyChangeAllowed: false,
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-workspace-settings-test-cleanup",
      );
    }
  });

  it("rejects invalid timezones and does not expose another user's workspace settings", async () => {
    const userA = await createTestUser("WorkspaceSettingsOwnerA");
    const userB = await createTestUser("WorkspaceSettingsOwnerB");

    try {
      await runCoreTestAndRollback(userA, async (transaction) => {
        await expect(
          updateWorkspaceSettingsInTransaction(transaction, {
            userId: userA.userId,
            workspaceId: userA.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            currency: "PHP",
            timezone: "Definitely/Not-A-Timezone",
            weekStart: 1,
          }),
        ).rejects.toThrow(/valid IANA timezone/i);

        let readError: unknown;

        try {
          await getWorkspaceSettingsInTransaction(transaction, {
            userId: userA.userId,
            workspaceId: userB.workspaceId,
          });
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(
          WorkspaceSettingsWorkspaceUnavailableError,
        );

        await expect(
          updateWorkspaceSettingsInTransaction(transaction, {
            userId: userA.userId,
            workspaceId: userB.workspaceId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            currency: "PHP",
            timezone: "Asia/Manila",
            weekStart: 1,
          }),
        ).rejects.toMatchObject({
          code: "PRIVATE_DOMAIN_WRITE_UNAVAILABLE",
        });
      });
    } finally {
      await removeProvisionedTestUser(
        userA,
        "pmp-workspace-settings-test-cleanup",
      );

      await removeProvisionedTestUser(
        userB,
        "pmp-workspace-settings-test-cleanup",
      );
    }
  });
});
