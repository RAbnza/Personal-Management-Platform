import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import {
  runScopedTransactionOnClient,
  type ScopedTransaction,
} from "@/platform/db/scoped-transaction";

const TEST_DATABASE_NAME = "personal_management_test";

const testContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
};

function getMigrationConnectionString() {
  const connectionString = process.env.DATABASE_MIGRATION_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_MIGRATION_URL is required for database integration tests.",
    );
  }

  return connectionString;
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("database integration foundation", () => {
  it("connects runtime roles only to the isolated test database", async () => {
    const [domainIdentity, authIdentity] = await Promise.all([
      getDomainPool().query<{
        user_name: string;
        database_name: string;
      }>(`
        SELECT
          current_user AS user_name,
          current_database() AS database_name
      `),
      getAuthPool().query<{
        user_name: string;
        database_name: string;
      }>(`
        SELECT
          current_user AS user_name,
          current_database() AS database_name
      `),
    ]);

    expect(domainIdentity.rows[0]).toEqual({
      user_name: "app_domain",
      database_name: TEST_DATABASE_NAME,
    });

    expect(authIdentity.rows[0]).toEqual({
      user_name: "auth_adapter",
      database_name: TEST_DATABASE_NAME,
    });
  });

  it("applies application migrations under migration_owner", async () => {
    const client = new Client({
      connectionString: getMigrationConnectionString(),
      application_name: "pmp-integration-migration-check",
    });

    try {
      await client.connect();

      const result = await client.query<{
        schema_name: string;
        owner: string;
      }>(`
        SELECT
          nspname AS schema_name,
          pg_get_userbyid(nspowner) AS owner
        FROM pg_namespace
        WHERE nspname IN (
          'audit',
          'auth',
          'career',
          'core',
          'drizzle',
          'finance',
          'ops',
          'time'
        )
        ORDER BY nspname
      `);

      expect(result.rows).toEqual([
        { schema_name: "audit", owner: "migration_owner" },
        { schema_name: "auth", owner: "migration_owner" },
        { schema_name: "career", owner: "migration_owner" },
        { schema_name: "core", owner: "migration_owner" },
        { schema_name: "drizzle", owner: "migration_owner" },
        { schema_name: "finance", owner: "migration_owner" },
        { schema_name: "ops", owner: "migration_owner" },
        { schema_name: "time", owner: "migration_owner" },
      ]);
    } finally {
      await client.end();
    }
  });

  it("keeps app_domain unable to create database schemas", async () => {
    const client = await getDomainPool().connect();

    try {
      await client.query("BEGIN");

      await expect(
        client.query("CREATE SCHEMA integration_forbidden_probe"),
      ).rejects.toThrow();

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("keeps scoped RLS context transaction-local", async () => {
    const client = await getDomainPool().connect();

    try {
      await runScopedTransactionOnClient(
        client,
        testContext,
        async (transaction: ScopedTransaction) => {
          await transaction.db.execute(sql`select 1`);

          const result = await client.query<{
            user_id: string | null;
            workspace_id: string | null;
          }>(`
            SELECT
              NULLIF(current_setting('app.user_id', true), '') AS user_id,
              NULLIF(current_setting('app.workspace_id', true), '') AS workspace_id
          `);

          expect(result.rows[0]).toEqual({
            user_id: testContext.userId,
            workspace_id: testContext.workspaceId,
          });
        },
      );

      const result = await client.query<{
        user_id: string | null;
        workspace_id: string | null;
      }>(`
        SELECT
          NULLIF(current_setting('app.user_id', true), '') AS user_id,
          NULLIF(current_setting('app.workspace_id', true), '') AS workspace_id
      `);

      expect(result.rows[0]).toEqual({
        user_id: null,
        workspace_id: null,
      });
    } finally {
      client.release();
    }
  });

  it("allows auth_adapter to perform Better Auth table lifecycle operations", async () => {
    const client = await getAuthPool().connect();

    try {
      await client.query("BEGIN");

      const insertedUser = await client.query<{ id: string }>(`
        INSERT INTO auth."user" (
          name,
          email
        )
        VALUES (
          'Integration Auth User',
          'integration-auth-user@example.test'
        )
        RETURNING id
      `);

      const userId = insertedUser.rows[0]?.id;

      expect(userId).toBeDefined();

      const updatedUser = await client.query<{ name: string }>(
        `
          UPDATE auth."user"
          SET name = $1
          WHERE id = $2
          RETURNING name
        `,
        ["Updated Integration Auth User", userId],
      );

      expect(updatedUser.rows[0]?.name).toBe("Updated Integration Auth User");

      const selectedUser = await client.query<{ email: string }>(
        `
          SELECT email
          FROM auth."user"
          WHERE id = $1
        `,
        [userId],
      );

      expect(selectedUser.rows[0]?.email).toBe(
        "integration-auth-user@example.test",
      );

      const deletedUser = await client.query<{ id: string }>(
        `
          DELETE FROM auth."user"
          WHERE id = $1
          RETURNING id
        `,
        [userId],
      );

      expect(deletedUser.rows[0]?.id).toBe(userId);

      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("prevents app_domain from reading Better Auth tables", async () => {
    await expect(
      getDomainPool().query(`
        SELECT id
        FROM auth."user"
        LIMIT 1
      `),
    ).rejects.toThrow();
  });
});
