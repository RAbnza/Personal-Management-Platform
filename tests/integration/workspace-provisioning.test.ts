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
          DELETE FROM core."category"
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

        const workspace = await administrator.query<{
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

        expect(workspace.rows).toEqual([
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

        const categories = await administrator.query<{
          kind: string;
          code: string | null;
          name: string;
          sort_order: number;
          version: number;
        }>(
          `
            SELECT
              kind,
              code,
              name,
              sort_order,
              version

            FROM core."category"

            WHERE workspace_id = $1

            ORDER BY
              kind,
              sort_order,
              code
          `,
          [first.workspaceId],
        );

        expect(categories.rows).toEqual([
          {
            kind: "expense",
            code: "food",
            name: "Food",
            sort_order: 10,
            version: 1,
          },
          {
            kind: "expense",
            code: "transport",
            name: "Transport",
            sort_order: 20,
            version: 1,
          },
          {
            kind: "expense",
            code: "housing",
            name: "Housing",
            sort_order: 30,
            version: 1,
          },
          {
            kind: "expense",
            code: "utilities",
            name: "Utilities",
            sort_order: 40,
            version: 1,
          },
          {
            kind: "expense",
            code: "subscriptions",
            name: "Subscriptions",
            sort_order: 50,
            version: 1,
          },
          {
            kind: "expense",
            code: "shopping",
            name: "Shopping",
            sort_order: 60,
            version: 1,
          },
          {
            kind: "expense",
            code: "healthcare",
            name: "Healthcare",
            sort_order: 70,
            version: 1,
          },
          {
            kind: "expense",
            code: "education",
            name: "Education",
            sort_order: 80,
            version: 1,
          },
          {
            kind: "expense",
            code: "entertainment",
            name: "Entertainment",
            sort_order: 90,
            version: 1,
          },
          {
            kind: "expense",
            code: "interest",
            name: "Interest",
            sort_order: 100,
            version: 1,
          },
          {
            kind: "expense",
            code: "transaction_fees",
            name: "Transaction Fees",
            sort_order: 110,
            version: 1,
          },
          {
            kind: "expense",
            code: "other",
            name: "Other",
            sort_order: 120,
            version: 1,
          },
          {
            kind: "income",
            code: "salary",
            name: "Salary",
            sort_order: 10,
            version: 1,
          },
          {
            kind: "income",
            code: "gift",
            name: "Gift",
            sort_order: 20,
            version: 1,
          },
        ]);

        /*
         * Module preferences intentionally remain sparse. Their absence is the
         * documented/default enabled + agenda-visible + reminders-enabled
         * state exposed by listModulePreferences().
         */
        const modulePreferenceCount = await administrator.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count

            FROM core."module_preference"

            WHERE workspace_id = $1
          `,
          [first.workspaceId],
        );

        expect(modulePreferenceCount.rows[0]?.count).toBe("0");
      } finally {
        await administrator.end();
      }
    } finally {
      await removeTestUser(userId);
    }
  });

  it("repairs missing defaults for an already provisioned workspace without replacing existing settings", async () => {
    const userId = randomUUID();
    const workspaceId = randomUUID();

    const name = "Legacy Workspace User";
    const email = `legacy-workspace-${userId}@example.test`;

    try {
      await createAuthUser({
        userId,
        name,
        email,
      });

      const administrator = new Client({
        connectionString: getTestAdministratorConnectionString(),
        application_name: "pmp-workspace-provisioning-test-legacy-setup",
      });

      try {
        await administrator.connect();

        await administrator.query("BEGIN");

        try {
          await administrator.query(
            `
              INSERT INTO core."user_profile" (
                user_id,
                display_name
              )
              VALUES ($1, $2)
            `,
            [userId, name],
          );

          await administrator.query(
            `
              INSERT INTO core."workspace" (
                id,
                owner_user_id,
                kind
              )
              VALUES (
                $1,
                $2,
                'personal'
              )
            `,
            [workspaceId, userId],
          );

          await administrator.query(
            `
              INSERT INTO core."workspace_preference" (
                workspace_id,
                theme
              )
              VALUES (
                $1,
                'dark'
              )
            `,
            [workspaceId],
          );

          await administrator.query("COMMIT");
        } catch (error) {
          await administrator.query("ROLLBACK");

          throw error;
        }
      } finally {
        await administrator.end();
      }

      const repaired = await provisionPersonalWorkspace({
        userId,
        displayName: name,
      });

      expect(repaired).toEqual({
        workspaceId,
        created: false,
      });

      const inspection = new Client({
        connectionString: getTestAdministratorConnectionString(),
        application_name: "pmp-workspace-provisioning-test-legacy-inspection",
      });

      try {
        await inspection.connect();

        const preference = await inspection.query<{
          theme: string;
          version: number;
        }>(
          `
            SELECT
              theme,
              version

            FROM core."workspace_preference"

            WHERE workspace_id = $1
          `,
          [workspaceId],
        );

        expect(preference.rows).toEqual([
          {
            theme: "dark",
            version: 1,
          },
        ]);

        const categoryCount = await inspection.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count

            FROM core."category"

            WHERE workspace_id = $1
          `,
          [workspaceId],
        );

        expect(categoryCount.rows[0]?.count).toBe("14");
      } finally {
        await inspection.end();
      }
    } finally {
      await removeTestUser(userId);
    }
  });
});
