import { Client, type PoolClient } from "pg";

import { getAuthPool } from "@/platform/db/pools";

const TEST_DATABASE_NAME = "personal_management_test";

export type ProvisionedTestUser = {
  userId: string;
  workspaceId: string;
};

function getTestAdministratorConnectionString(): string {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_ADMIN_URL is required for provisioned-user integration-test cleanup.",
    );
  }

  const url = new URL(connectionString);

  url.pathname = `/${TEST_DATABASE_NAME}`;

  return url.toString();
}

export async function findSeededCategoryId(
  client: PoolClient,
  user: ProvisionedTestUser,
  input: {
    kind: "income" | "expense";
    code: string;
  },
): Promise<string> {
  const result = await client.query<{
    id: string;
  }>(
    `
      SELECT id

      FROM core."category"

      WHERE
        workspace_id = $1
        AND kind = $2
        AND code = $3
        AND archived_at IS NULL

      LIMIT 1
    `,
    [user.workspaceId, input.kind, input.code],
  );

  const categoryId = result.rows[0]?.id;

  if (!categoryId) {
    throw new Error(
      `Expected seeded ${input.kind} category "${input.code}" for workspace ${user.workspaceId}.`,
    );
  }

  return categoryId;
}

/**
 * Remove persistent ownership-root records created by
 * provisionPersonalWorkspace().
 *
 * Most domain records created by integration tests live inside explicitly
 * rolled-back scoped transactions. Some infrastructure tests intentionally
 * commit command receipts, so those are also removed here before the workspace
 * ownership root is deleted.
 */
export async function removeProvisionedTestUser(
  user: ProvisionedTestUser,
  applicationName: string,
): Promise<void> {
  const administrator = new Client({
    connectionString: getTestAdministratorConnectionString(),
    application_name: applicationName,
  });

  try {
    await administrator.connect();

    await administrator.query("BEGIN");

    try {
      await administrator.query(
        `
          DELETE FROM core."command_receipt"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."onboarding_step"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."module_preference"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."category"
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
