import { loadEnvFile } from "node:process";

import { sql } from "drizzle-orm";

import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import {
  runScopedTransactionOnClient,
  type ScopedTransaction,
} from "@/platform/db/scoped-transaction";

const testContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
};

function loadRuntimeEnvironment() {
  try {
    loadEnvFile(".env");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      throw new Error(
        "Missing .env. Copy .env.example to .env before checking runtime database connections.",
      );
    }

    throw error;
  }
}

async function verifyRole(
  expectedRole: "app_domain" | "auth_adapter",
  query: () => Promise<{
    rows: Array<{
      user_name: string;
      database_name: string;
    }>;
  }>,
) {
  const result = await query();
  const identity = result.rows[0];

  if (!identity) {
    throw new Error(
      `PostgreSQL returned no identity information for "${expectedRole}".`,
    );
  }

  if (identity.user_name !== expectedRole) {
    throw new Error(
      `Expected PostgreSQL role "${expectedRole}" but connected as "${identity.user_name}".`,
    );
  }

  if (identity.database_name !== "personal_management") {
    throw new Error(
      `Expected database "personal_management" but connected to "${identity.database_name}".`,
    );
  }
}

async function verifyScopedTransactionIsolation() {
  const client = await getDomainPool().connect();

  try {
    await runScopedTransactionOnClient(
      client,
      testContext,
      async (transaction: ScopedTransaction) => {
        await transaction.db.execute(sql`select 1`);

        const insideTransaction = await client.query<{
          user_id: string | null;
          workspace_id: string | null;
        }>(`
          SELECT
            NULLIF(current_setting('app.user_id', true), '') AS user_id,
            NULLIF(current_setting('app.workspace_id', true), '') AS workspace_id
        `);

        const scopedContext = insideTransaction.rows[0];

        if (
          !scopedContext ||
          scopedContext.user_id !== testContext.userId ||
          scopedContext.workspace_id !== testContext.workspaceId
        ) {
          throw new Error(
            "Scoped database context is not visible inside the transaction.",
          );
        }
      },
    );

    const afterTransaction = await client.query<{
      user_id: string | null;
      workspace_id: string | null;
    }>(`
      SELECT
        NULLIF(current_setting('app.user_id', true), '') AS user_id,
        NULLIF(current_setting('app.workspace_id', true), '') AS workspace_id
    `);

    const clearedContext = afterTransaction.rows[0];

    if (
      !clearedContext ||
      clearedContext.user_id !== null ||
      clearedContext.workspace_id !== null
    ) {
      throw new Error(
        "Scoped database context leaked beyond the transaction boundary.",
      );
    }
  } finally {
    client.release();
  }
}

async function main() {
  loadRuntimeEnvironment();

  const domainPool = getDomainPool();
  const authPool = getAuthPool();

  try {
    await verifyRole("app_domain", () =>
      domainPool.query<{
        user_name: string;
        database_name: string;
      }>(`
        SELECT
          current_user AS user_name,
          current_database() AS database_name
      `),
    );

    await verifyRole("auth_adapter", () =>
      authPool.query<{
        user_name: string;
        database_name: string;
      }>(`
        SELECT
          current_user AS user_name,
          current_database() AS database_name
      `),
    );

    await verifyScopedTransactionIsolation();

    console.log("Runtime database connections verified.");
    console.log("Domain role: app_domain");
    console.log("Auth role: auth_adapter");
    console.log("Scoped transaction context: installed successfully");
    console.log("Scoped transaction context: cleared after commit");
    console.log("Drizzle scoped connection: verified");
  } finally {
    await closeRuntimeDatabasePools();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown runtime database verification error.";

  console.error(message);
  process.exitCode = 1;
});
