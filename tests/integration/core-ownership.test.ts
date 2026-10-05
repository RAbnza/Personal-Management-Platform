import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";

const TEST_DATABASE_NAME = "personal_management_test";

type TestIdentity = {
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
};

type MutableAggregateState = {
  version: number;
  updated_at: Date;
};

function createTestIdentity(label: string): TestIdentity {
  const userId = randomUUID();

  return {
    userId,
    workspaceId: randomUUID(),
    name: `${label} User`,
    email: `${label.toLowerCase()}-${userId}@example.test`,
  };
}

function getTestAdministratorConnectionString() {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_ADMIN_URL is required for core ownership integration tests.",
    );
  }

  const url = new URL(connectionString);

  url.pathname = `/${TEST_DATABASE_NAME}`;

  return url.toString();
}

async function createAuthUser(identity: TestIdentity) {
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
    [identity.userId, identity.name, identity.email],
  );
}

async function provisionCoreOwnership(identity: TestIdentity) {
  const client = await getDomainPool().connect();

  try {
    await runScopedTransactionOnClient(
      client,
      {
        userId: identity.userId,
        workspaceId: identity.workspaceId,
      },
      async () => {
        await client.query(
          `
            INSERT INTO core."user_profile" (
              user_id,
              display_name
            )
            VALUES ($1, $2)
          `,
          [identity.userId, identity.name],
        );

        await client.query(
          `
            INSERT INTO core."workspace" (
              id,
              owner_user_id
            )
            VALUES ($1, $2)
          `,
          [identity.workspaceId, identity.userId],
        );

        await client.query(
          `
            INSERT INTO core."workspace_preference" (
              workspace_id
            )
            VALUES ($1)
          `,
          [identity.workspaceId],
        );
      },
    );
  } finally {
    client.release();
  }
}

async function removeTestData(identities: TestIdentity[]) {
  const administrator = new Client({
    connectionString: getTestAdministratorConnectionString(),
    application_name: "pmp-core-ownership-test-cleanup",
  });

  try {
    await administrator.connect();

    await administrator.query(
      `
        DELETE FROM core."workspace_preference"
        WHERE workspace_id = ANY($1::uuid[])
      `,
      [identities.map((identity) => identity.workspaceId)],
    );

    await administrator.query(
      `
        DELETE FROM core."workspace"
        WHERE id = ANY($1::uuid[])
      `,
      [identities.map((identity) => identity.workspaceId)],
    );

    await administrator.query(
      `
        DELETE FROM core."user_profile"
        WHERE user_id = ANY($1::uuid[])
      `,
      [identities.map((identity) => identity.userId)],
    );
  } finally {
    await administrator.end();
  }

  await getAuthPool().query(
    `
      DELETE FROM auth."user"
      WHERE id = ANY($1::uuid[])
    `,
    [identities.map((identity) => identity.userId)],
  );
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("core ownership isolation", () => {
  it("enforces missing-context denial and two-user RLS isolation", async () => {
    const first = createTestIdentity("First");
    const second = createTestIdentity("Second");
    const identities = [first, second];

    try {
      await createAuthUser(first);
      await createAuthUser(second);

      await provisionCoreOwnership(first);
      await provisionCoreOwnership(second);

      const withoutContext = await getDomainPool().query<{
        id: string;
      }>(`
        SELECT id
        FROM core."workspace"
      `);

      expect(withoutContext.rows).toEqual([]);

      const client = await getDomainPool().connect();

      try {
        await runScopedTransactionOnClient(
          client,
          {
            userId: first.userId,
            workspaceId: first.workspaceId,
          },
          async () => {
            const ownProfile = await client.query<{
              user_id: string;
              display_name: string;
            }>(
              `
                SELECT
                  user_id,
                  display_name
                FROM core."user_profile"
              `,
            );

            expect(ownProfile.rows).toEqual([
              {
                user_id: first.userId,
                display_name: first.name,
              },
            ]);

            const ownWorkspace = await client.query<{
              id: string;
              owner_user_id: string;
            }>(
              `
                SELECT
                  id,
                  owner_user_id
                FROM core."workspace"
              `,
            );

            expect(ownWorkspace.rows).toEqual([
              {
                id: first.workspaceId,
                owner_user_id: first.userId,
              },
            ]);

            const ownPreference = await client.query<{
              workspace_id: string;
              theme: string;
            }>(
              `
                SELECT
                  workspace_id,
                  theme
                FROM core."workspace_preference"
              `,
            );

            expect(ownPreference.rows).toEqual([
              {
                workspace_id: first.workspaceId,
                theme: "system",
              },
            ]);

            const foreignWorkspace = await client.query<{ id: string }>(
              `
                SELECT id
                FROM core."workspace"
                WHERE id = $1
              `,
              [second.workspaceId],
            );

            expect(foreignWorkspace.rows).toEqual([]);

            const foreignPreference = await client.query<{
              workspace_id: string;
            }>(
              `
                SELECT workspace_id
                FROM core."workspace_preference"
                WHERE workspace_id = $1
              `,
              [second.workspaceId],
            );

            expect(foreignPreference.rows).toEqual([]);

            const foreignUpdate = await client.query(
              `
                UPDATE core."workspace"
                SET timezone = 'UTC'
                WHERE id = $1
              `,
              [second.workspaceId],
            );

            expect(foreignUpdate.rowCount).toBe(0);

            await expect(
              client.query(
                `
                  UPDATE core."workspace"
                  SET owner_user_id = $1
                  WHERE id = $2
                `,
                [second.userId, first.workspaceId],
              ),
            ).rejects.toThrow(/owner_user_id is immutable/i);
          },
        );
      } finally {
        client.release();
      }
    } finally {
      await removeTestData(identities);
    }
  });

  it("does not grant app_domain destructive ownership-root deletion", async () => {
    const identity = createTestIdentity("DeleteGuard");

    try {
      await createAuthUser(identity);
      await provisionCoreOwnership(identity);

      const client = await getDomainPool().connect();

      try {
        await expect(
          runScopedTransactionOnClient(
            client,
            {
              userId: identity.userId,
              workspaceId: identity.workspaceId,
            },
            async () => {
              await client.query(
                `
                  DELETE FROM core."workspace_preference"
                  WHERE workspace_id = $1
                `,
                [identity.workspaceId],
              );
            },
          ),
        ).rejects.toThrow(/permission denied/i);
      } finally {
        client.release();
      }
    } finally {
      await removeTestData([identity]);
    }
  });

  it("advances mutable aggregate versions and timestamps in PostgreSQL", async () => {
    const identity = createTestIdentity("MutableAggregate");

    try {
      await createAuthUser(identity);
      await provisionCoreOwnership(identity);

      const client = await getDomainPool().connect();

      try {
        await runScopedTransactionOnClient(
          client,
          {
            userId: identity.userId,
            workspaceId: identity.workspaceId,
          },
          async () => {
            const initialProfile = await client.query<MutableAggregateState>(
              `
                SELECT
                  version,
                  updated_at
                FROM core."user_profile"
                WHERE user_id = $1
              `,
              [identity.userId],
            );

            const initialWorkspace = await client.query<MutableAggregateState>(
              `
                  SELECT
                    version,
                    updated_at
                  FROM core."workspace"
                  WHERE id = $1
                `,
              [identity.workspaceId],
            );

            const initialPreference = await client.query<MutableAggregateState>(
              `
                  SELECT
                    version,
                    updated_at
                  FROM core."workspace_preference"
                  WHERE workspace_id = $1
                `,
              [identity.workspaceId],
            );

            expect(initialProfile.rows[0]?.version).toBe(1);
            expect(initialWorkspace.rows[0]?.version).toBe(1);
            expect(initialPreference.rows[0]?.version).toBe(1);

            const callerSuppliedTimestamp = new Date(
              "2000-01-01T00:00:00.000Z",
            );

            const updatedProfile = await client.query<MutableAggregateState>(
              `
                  UPDATE core."user_profile"
                  SET
                    display_name = $1,
                    version = 999,
                    updated_at = $2
                  WHERE user_id = $3
                  RETURNING
                    version,
                    updated_at
                `,
              [
                "Updated Mutable Aggregate User",
                callerSuppliedTimestamp,
                identity.userId,
              ],
            );

            expect(updatedProfile.rows[0]?.version).toBe(2);
            expect(
              updatedProfile.rows[0]?.updated_at.getTime(),
            ).toBeGreaterThan(callerSuppliedTimestamp.getTime());

            const updatedWorkspace = await client.query<MutableAggregateState>(
              `
                  UPDATE core."workspace"
                  SET
                    timezone = 'UTC',
                    version = 999,
                    updated_at = $1
                  WHERE id = $2
                  RETURNING
                    version,
                    updated_at
                `,
              [callerSuppliedTimestamp, identity.workspaceId],
            );

            expect(updatedWorkspace.rows[0]?.version).toBe(2);
            expect(
              updatedWorkspace.rows[0]?.updated_at.getTime(),
            ).toBeGreaterThan(callerSuppliedTimestamp.getTime());

            const updatedPreference = await client.query<MutableAggregateState>(
              `
                  UPDATE core."workspace_preference"
                  SET
                    theme = 'dark',
                    version = 999,
                    updated_at = $1
                  WHERE workspace_id = $2
                  RETURNING
                    version,
                    updated_at
                `,
              [callerSuppliedTimestamp, identity.workspaceId],
            );

            expect(updatedPreference.rows[0]?.version).toBe(2);
            expect(
              updatedPreference.rows[0]?.updated_at.getTime(),
            ).toBeGreaterThan(callerSuppliedTimestamp.getTime());

            const updatedWorkspaceAgain =
              await client.query<MutableAggregateState>(
                `
                  UPDATE core."workspace"
                  SET timezone = 'Asia/Manila'
                  WHERE id = $1
                  RETURNING
                    version,
                    updated_at
                `,
                [identity.workspaceId],
              );

            expect(updatedWorkspaceAgain.rows[0]?.version).toBe(3);

            expect(
              updatedWorkspaceAgain.rows[0]?.updated_at.getTime(),
            ).toBeGreaterThanOrEqual(
              updatedWorkspace.rows[0]?.updated_at.getTime() ?? 0,
            );
          },
        );
      } finally {
        client.release();
      }
    } finally {
      await removeTestData([identity]);
    }
  });
});
