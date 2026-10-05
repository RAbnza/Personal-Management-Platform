import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { z } from "zod";

import { getDomainPool } from "@/platform/db/pools";

const scopedDatabaseContextSchema = z.object({
  userId: z.uuid(),
  workspaceId: z.uuid(),
});

export type ScopedDatabaseContext = z.infer<typeof scopedDatabaseContextSchema>;

function createScopedDatabase(client: PoolClient) {
  return drizzle({ client });
}

type ScopedDatabase = ReturnType<typeof createScopedDatabase>;

declare const scopedTransactionBrand: unique symbol;

/**
 * Database handle guaranteed to be bound to one checked-out PostgreSQL
 * connection inside an active transaction with trusted RLS context installed.
 *
 * Repositories for private domain data should accept this type rather than a
 * general Pool or unrestricted database handle.
 */
export type ScopedTransaction = {
  readonly db: ScopedDatabase;
  readonly [scopedTransactionBrand]: true;
};

export type ScopedTransactionOperation<TResult> = (
  transaction: ScopedTransaction,
) => Promise<TResult>;

export async function runScopedTransactionOnClient<TResult>(
  client: PoolClient,
  context: ScopedDatabaseContext,
  operation: ScopedTransactionOperation<TResult>,
): Promise<TResult> {
  const trustedContext = scopedDatabaseContextSchema.parse(context);

  let transactionOpen = false;
  let destroyClient = false;

  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    transactionOpen = true;

    const installedContext = await client.query<{
      user_id: string;
      workspace_id: string;
    }>(
      `
        SELECT
          set_config('app.user_id', $1, true) AS user_id,
          set_config('app.workspace_id', $2, true) AS workspace_id
      `,
      [trustedContext.userId, trustedContext.workspaceId],
    );

    const installed = installedContext.rows[0];

    if (
      !installed ||
      installed.user_id !== trustedContext.userId ||
      installed.workspace_id !== trustedContext.workspaceId
    ) {
      throw new Error("Failed to install scoped database context.");
    }

    const transaction = {
      db: createScopedDatabase(client),
    } as ScopedTransaction;

    const result = await operation(transaction);

    await client.query("COMMIT");
    transactionOpen = false;

    return result;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
        transactionOpen = false;
      } catch (rollbackError) {
        destroyClient = true;

        throw new AggregateError(
          [error, rollbackError],
          "Scoped database transaction failed and rollback also failed.",
        );
      }
    }

    throw error;
  } finally {
    if (destroyClient) {
      client.release(true);
    }
  }
}

export async function withDomainTransaction<TResult>(
  context: ScopedDatabaseContext,
  operation: ScopedTransactionOperation<TResult>,
): Promise<TResult> {
  const client = await getDomainPool().connect();

  try {
    return await runScopedTransactionOnClient(client, context, operation);
  } finally {
    client.release();
  }
}
