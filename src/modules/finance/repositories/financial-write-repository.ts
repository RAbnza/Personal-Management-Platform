import { sql } from "drizzle-orm";

import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import type { ScopedTransaction } from "@/platform/db";

type FinancialWorkspaceRow = {
  currency: string;
};

type FinancialRevisionRow = {
  financial_revision: string;
};

type PostgresErrorLike = {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
};

export class FinancialWriteWorkspaceUnavailableError extends Error {
  readonly code = "FINANCIAL_WRITE_WORKSPACE_UNAVAILABLE";

  constructor() {
    super("The active financial workspace is unavailable for this write.");

    this.name = "FinancialWriteWorkspaceUnavailableError";
  }
}

function findPostgresError(error: unknown): {
  code: string;
  message: string;
} | null {
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return null;
    }

    const candidate = current as PostgresErrorLike;

    if (
      typeof candidate.code === "string" &&
      typeof candidate.message === "string"
    ) {
      return {
        code: candidate.code,
        message: candidate.message,
      };
    }

    current = candidate.cause;
  }

  return null;
}

function isExpectedFinancialWorkspaceUnavailableError(error: unknown): boolean {
  const postgresError = findPostgresError(error);

  if (postgresError?.code !== "42501") {
    return false;
  }

  return (
    postgresError.message.includes(
      "financial write requires an active user profile",
    ) ||
    postgresError.message.includes(
      "financial write requires an active owned workspace",
    )
  );
}

export async function lockActiveFinancialWorkspace(
  transaction: ScopedTransaction,
  workspaceId: string,
): Promise<{
  currency: string;
}> {
  try {
    await transaction.db.execute(sql`
      SELECT "finance"."lock_active_workspace"(
        ${workspaceId}::uuid
      )
    `);
  } catch (error) {
    /*
     * The database lock function also uses SQLSTATE 42501 for programming
     * errors such as missing app.user_id or a workspace that does not match
     * app.workspace_id.
     *
     * Translate only the two expected lifecycle/ownership disappearance cases.
     * Scope-installation bugs must continue surfacing as unexpected failures.
     */
    if (isExpectedFinancialWorkspaceUnavailableError(error)) {
      throw new FinancialWriteWorkspaceUnavailableError();
    }

    throw error;
  }

  const result = await transaction.db.execute<FinancialWorkspaceRow>(sql`
    SELECT "currency"
    FROM "core"."workspace"
    WHERE "id" = ${workspaceId}::uuid
  `);

  const workspace = result.rows[0];

  if (!workspace) {
    throw new Error("The active financial workspace could not be resolved.");
  }

  return {
    currency: workspace.currency,
  };
}

export async function createPrivateFinancialRevision(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    commandReceiptId: string;
    subjectKind: string;
    subjectId: string;
    subjectVersion: number;
    operation: string;
    afterJson: Record<string, unknown>;
    effectiveDate: string | null;
    recordedByUserId: string;
    requestId: string | null;
  },
): Promise<void> {
  await createPrivateRevision(transaction, {
    id: input.id,
    workspaceId: input.workspaceId,
    commandReceiptId: input.commandReceiptId,

    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    subjectVersion: input.subjectVersion,
    operation: input.operation,

    beforeJson: null,
    afterJson: input.afterJson,

    reason: null,
    effectiveDate: input.effectiveDate,

    recordedByUserId: input.recordedByUserId,
    actorKind: "user",
    requestId: input.requestId,
  });
}

export async function finalizeJournal(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    journalId: string;
  },
): Promise<void> {
  const result = await transaction.db.execute<{ id: string }>(sql`
    UPDATE "finance"."journal"
    SET
      "state" = 'posted',
      "finalized_at" = clock_timestamp()
    WHERE
      "workspace_id" = ${input.workspaceId}::uuid
      AND "id" = ${input.journalId}::uuid
      AND "state" = 'building'
    RETURNING "id"
  `);

  if (!result.rows[0]) {
    throw new Error("The financial journal could not be finalized.");
  }
}

export async function finalizeActionRevision(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    actionRevisionId: string;
  },
): Promise<void> {
  const result = await transaction.db.execute<{ id: string }>(sql`
    UPDATE "finance"."action_revision"
    SET
      "state" = 'posted',
      "finalized_at" = clock_timestamp()
    WHERE
      "workspace_id" = ${input.workspaceId}::uuid
      AND "id" = ${input.actionRevisionId}::uuid
      AND "state" = 'building'
    RETURNING "id"
  `);

  if (!result.rows[0]) {
    throw new Error("The financial action revision could not be finalized.");
  }
}

export async function advanceWorkspaceFinancialRevision(
  transaction: ScopedTransaction,
  workspaceId: string,
): Promise<string> {
  const result = await transaction.db.execute<FinancialRevisionRow>(sql`
    UPDATE "core"."workspace"
    SET
      "financial_revision" =
        "financial_revision" + 1
    WHERE "id" = ${workspaceId}::uuid
    RETURNING
      "financial_revision"::text
        AS "financial_revision"
  `);

  const row = result.rows[0];

  if (!row) {
    throw new Error("The workspace financial revision could not be advanced.");
  }

  return row.financial_revision;
}

/**
 * Surface deferred financial-integrity failures inside the current service
 * rather than postponing them until transaction COMMIT.
 *
 * SET CONSTRAINTS ... IMMEDIATE performs a retroactive check of currently
 * deferred constraints. If any invariant is broken, PostgreSQL raises here
 * and the transaction is failed.
 *
 * A successful check must restore deferred mode afterward. Financial commands
 * intentionally rely on DEFERRABLE INITIALLY DEFERRED relationships while
 * assembling cyclic action/revision graphs. Leaving constraints in IMMEDIATE
 * mode would make a second financial command in the same transaction fail
 * while inserting an otherwise valid intermediate state.
 */
export async function enforceDeferredFinancialConstraints(
  transaction: ScopedTransaction,
): Promise<void> {
  await transaction.db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);

  await transaction.db.execute(sql`SET CONSTRAINTS ALL DEFERRED`);
}
