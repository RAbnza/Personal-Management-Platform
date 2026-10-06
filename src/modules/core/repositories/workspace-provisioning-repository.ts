import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

type WorkspaceIdRow = {
  id: string;
};

export async function createUserProfileIfMissing(
  transaction: ScopedTransaction,
  input: {
    userId: string;
    displayName: string;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO core."user_profile" (
      "user_id",
      "display_name"
    )
    VALUES (
      ${input.userId}::uuid,
      ${input.displayName}
    )
    ON CONFLICT ("user_id") DO NOTHING
  `);
}

export async function createPersonalWorkspaceIfMissing(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    userId: string;
  },
): Promise<string | null> {
  const result = await transaction.db.execute<WorkspaceIdRow>(sql`
    INSERT INTO core."workspace" (
      "id",
      "owner_user_id",
      "kind"
    )
    VALUES (
      ${input.workspaceId}::uuid,
      ${input.userId}::uuid,
      'personal'
    )
    ON CONFLICT ("owner_user_id")
      WHERE "kind" = 'personal'
    DO NOTHING
    RETURNING "id"
  `);

  return result.rows[0]?.id ?? null;
}

export async function findPersonalWorkspaceIdByOwner(
  transaction: ScopedTransaction,
  userId: string,
): Promise<string | null> {
  const result = await transaction.db.execute<WorkspaceIdRow>(sql`
    SELECT "id"
    FROM core."workspace"
    WHERE
      "owner_user_id" = ${userId}::uuid
      AND "kind" = 'personal'
    LIMIT 1
  `);

  return result.rows[0]?.id ?? null;
}

export async function createWorkspacePreference(
  transaction: ScopedTransaction,
  workspaceId: string,
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO core."workspace_preference" (
      "workspace_id"
    )
    VALUES (
      ${workspaceId}::uuid
    )
  `);
}
