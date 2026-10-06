import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { z } from "zod";

import { getDomainPool } from "@/platform/db/pools";

const identityContextSchema = z.object({
  userId: z.uuid(),
});

export type IdentityContext = z.infer<typeof identityContextSchema>;

function createIdentityScopedDatabase(client: PoolClient) {
  return drizzle({
    client,
  });
}

type IdentityScopedDatabase = ReturnType<typeof createIdentityScopedDatabase>;

declare const identityScopedTransactionBrand: unique symbol;

/**
 * Narrow database context used only while resolving ownership roots from a
 * trusted authenticated identity.
 *
 * Only app.user_id is installed. app.workspace_id is explicitly cleared, so
 * child workspace-scoped tables remain inaccessible through their RLS
 * policies.
 *
 * This transaction type is intentionally distinct from ScopedTransaction.
 * Ordinary domain repositories must continue to require the full trusted
 * { userId, workspaceId } context.
 */
export type IdentityScopedTransaction = {
  readonly db: IdentityScopedDatabase;

  readonly [identityScopedTransactionBrand]: true;
};

export type IdentityScopedTransactionOperation<TResult> = (
  transaction: IdentityScopedTransaction,
) => Promise<TResult>;

export async function runIdentityTransactionOnClient<TResult>(
  client: PoolClient,
  context: IdentityContext,
  operation: IdentityScopedTransactionOperation<TResult>,
): Promise<TResult> {
  const trustedContext = identityContextSchema.parse(context);

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
            set_config(
              'app.user_id',
              $1,
              true
            ) AS user_id,

            set_config(
              'app.workspace_id',
              '',
              true
            ) AS workspace_id
        `,
      [trustedContext.userId],
    );

    const installed = installedContext.rows[0];

    if (
      !installed ||
      installed.user_id !== trustedContext.userId ||
      installed.workspace_id !== ""
    ) {
      throw new Error("Failed to install identity-scoped database context.");
    }

    const transaction = {
      db: createIdentityScopedDatabase(client),
    } as IdentityScopedTransaction;

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
          "Identity-scoped database transaction failed and rollback also failed.",
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

export async function withIdentityTransaction<TResult>(
  context: IdentityContext,
  operation: IdentityScopedTransactionOperation<TResult>,
): Promise<TResult> {
  const client = await getDomainPool().connect();

  try {
    return await runIdentityTransactionOnClient(client, context, operation);
  } finally {
    client.release();
  }
}
