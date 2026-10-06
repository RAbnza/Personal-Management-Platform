import { sql } from "drizzle-orm";

import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import type { ScopedTransaction } from "@/platform/db";

type FinancialWorkspaceRow = {
  currency: string;
};

type FinancialRevisionRow = {
  financial_revision: string;
};

export async function lockActiveFinancialWorkspace(
  transaction: ScopedTransaction,
  workspaceId: string,
): Promise<{
  currency: string;
}> {
  await transaction.db.execute(sql`
    SELECT "finance"."lock_active_workspace"(
      ${workspaceId}::uuid
    )
  `);

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

export async function enforceDeferredFinancialConstraints(
  transaction: ScopedTransaction,
): Promise<void> {
  await transaction.db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
}
