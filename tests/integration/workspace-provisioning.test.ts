import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";

const TEST_DATABASE_NAME = "personal_management_test";

function getTestAdministratorConnectionString() {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_ADMIN_URL is required for workspace provisioning integration tests.",
    );
  }

  const url = new URL(connectionString);

  url.pathname = `/${TEST_DATABASE_NAME}`;

  return url.toString();
}

async function createAuthUser(input: {
  userId: string;
  name: string;
  email: string;
}) {
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
    [input.userId, input.name, input.email],
  );
}

async function removeTestUser(userId: string) {
  const administrator = new Client({
    connectionString: getTestAdministratorConnectionString(),
    application_name: "pmp-workspace-provisioning-test-cleanup",
  });

  try {
    await administrator.connect();

    await administrator.query("BEGIN");

    try {
      await administrator.query(
        `
          DELETE FROM core."workspace_preference"
          WHERE workspace_id IN (
            SELECT id
            FROM core."workspace"
            WHERE owner_user_id = $1
          )
        `,
        [userId],
      );

      await administrator.query(
        `
          DELETE FROM core."workspace"
          WHERE owner_user_id = $1
        `,
        [userId],
      );

      await administrator.query(
        `
          DELETE FROM core."user_profile"
          WHERE user_id = $1
        `,
        [userId],
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
    [userId],
  );
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("personal workspace provisioning", () => {
  it("is atomic, idempotent and safe under concurrent first requests", async () => {
    const userId = randomUUID();
    const name = "Workspace Provisioning User";
    const email = `workspace-${userId}@example.test`;

    try {
      await createAuthUser({
        userId,
        name,
        email,
      });

      const [first, second] = await Promise.all([
        provisionPersonalWorkspace({
          userId,
          displayName: name,
        }),
        provisionPersonalWorkspace({
          userId,
          displayName: name,
        }),
      ]);

      expect(first.workspaceId).toBe(second.workspaceId);

      expect([first, second].filter((result) => result.created)).toHaveLength(
        1,
      );

      const repeated = await provisionPersonalWorkspace({
        userId,
        displayName: name,
      });

      expect(repeated).toEqual({
        workspaceId: first.workspaceId,
        created: false,
      });

      const administrator = new Client({
        connectionString: getTestAdministratorConnectionString(),
        application_name: "pmp-workspace-provisioning-test-inspection",
      });

      try {
        await administrator.connect();

        const result = await administrator.query<{
          id: string;
          display_name: string;
          currency: string;
          timezone: string;
          week_start: number;
          state: string;
          locale: string;
          theme: string;
        }>(
          `
            SELECT
              w.id,
              p.display_name,
              w.currency,
              w.timezone,
              w.week_start,
              w.state,
              pref.locale,
              pref.theme
            FROM core."workspace" AS w
            INNER JOIN core."user_profile" AS p
              ON p.user_id = w.owner_user_id
            INNER JOIN core."workspace_preference" AS pref
              ON pref.workspace_id = w.id
            WHERE w.owner_user_id = $1
          `,
          [userId],
        );

        expect(result.rows).toEqual([
          {
            id: first.workspaceId,
            display_name: name,
            currency: "PHP",
            timezone: "Asia/Manila",
            week_start: 1,
            state: "active",
            locale: "en-PH",
            theme: "system",
          },
        ]);
      } finally {
        await administrator.end();
      }
    } finally {
      await removeTestUser(userId);
    }
  });
});
