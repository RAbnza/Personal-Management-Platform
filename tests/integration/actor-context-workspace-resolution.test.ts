import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { resolveActivePersonalWorkspaceIdForActor } from "@/modules/core/repositories/actor-workspace-repository";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { withIdentityTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";

type TestUser = {
  userId: string;
  workspaceId: string;
};

async function createAuthUser(label: string): Promise<{
  userId: string;
  name: string;
}> {
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

  return {
    userId,
    name,
  };
}

async function createProvisionedTestUser(label: string): Promise<TestUser> {
  const identity = await createAuthUser(label);

  const workspace = await provisionPersonalWorkspace({
    userId: identity.userId,
    displayName: identity.name,
  });

  return {
    userId: identity.userId,
    workspaceId: workspace.workspaceId,
  };
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("actor workspace resolution", () => {
  it("resolves only the authenticated identity's active personal workspace", async () => {
    const first = await createProvisionedTestUser("ActorWorkspaceFirst");

    const second = await createProvisionedTestUser("ActorWorkspaceSecond");

    try {
      const firstResolved = await withIdentityTransaction(
        {
          userId: first.userId,
        },
        (transaction) => resolveActivePersonalWorkspaceIdForActor(transaction),
      );

      const secondResolved = await withIdentityTransaction(
        {
          userId: second.userId,
        },
        (transaction) => resolveActivePersonalWorkspaceIdForActor(transaction),
      );

      expect(firstResolved).toBe(first.workspaceId);

      expect(secondResolved).toBe(second.workspaceId);

      expect(firstResolved).not.toBe(second.workspaceId);

      expect(secondResolved).not.toBe(first.workspaceId);
    } finally {
      await removeProvisionedTestUser(first, "pmp-actor-context-test-cleanup");

      await removeProvisionedTestUser(second, "pmp-actor-context-test-cleanup");
    }
  });

  it("keeps workspace-child tables inaccessible until the full workspace context is installed", async () => {
    const user = await createProvisionedTestUser("ActorWorkspaceChildScope");

    try {
      const result = await withIdentityTransaction(
        {
          userId: user.userId,
        },
        async (transaction) => {
          const workspaceId =
            await resolveActivePersonalWorkspaceIdForActor(transaction);

          const preferences = await transaction.db.execute<{
            workspace_id: string;
          }>(sql`
                SELECT
                  preference."workspace_id"

                FROM core."workspace_preference"
                  AS preference
              `);

          const categories = await transaction.db.execute<{
            id: string;
          }>(sql`
                SELECT
                  category."id"

                FROM core."category"
                  AS category
              `);

          return {
            workspaceId,

            preferenceRows: preferences.rows,

            categoryRows: categories.rows,
          };
        },
      );

      expect(result.workspaceId).toBe(user.workspaceId);

      /*
       * app.workspace_id is deliberately absent in an identity-only
       * transaction, so child-table RLS remains default-deny.
       */
      expect(result.preferenceRows).toEqual([]);

      expect(result.categoryRows).toEqual([]);
    } finally {
      await removeProvisionedTestUser(user, "pmp-actor-context-test-cleanup");
    }
  });

  it("returns no workspace for an authenticated identity that has not completed provisioning", async () => {
    const identity = await createAuthUser("ActorWorkspaceUnprovisioned");

    try {
      const resolved = await withIdentityTransaction(
        {
          userId: identity.userId,
        },
        (transaction) => resolveActivePersonalWorkspaceIdForActor(transaction),
      );

      expect(resolved).toBeNull();
    } finally {
      await getAuthPool().query(
        `
          DELETE FROM auth."user"
          WHERE id = $1
        `,
        [identity.userId],
      );
    }
  });
});
