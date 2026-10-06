import { sql } from "drizzle-orm";

import { DEFAULT_CATEGORY_SEEDS } from "@/modules/core/domain/default-categories";
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

/**
 * Workspace provisioning starts with a candidate UUID because the caller may
 * be racing another first-time setup request.
 *
 * If that candidate loses the unique-owner race, the existing workspace ID is
 * resolved from the authenticated user's own workspace row and installed as
 * the remaining transaction-local workspace scope before repairing child
 * defaults.
 *
 * This helper is deliberately provisioning-specific. Ordinary domain services
 * must not switch workspace scope inside an already-authorized transaction.
 */
export async function installProvisioningWorkspaceContext(
  transaction: ScopedTransaction,
  workspaceId: string,
): Promise<void> {
  const result = await transaction.db.execute<{
    workspace_id: string;
  }>(sql`
    SELECT
      set_config(
        'app.workspace_id',
        ${workspaceId},
        true
      ) AS "workspace_id"
  `);

  if (result.rows[0]?.workspace_id !== workspaceId) {
    throw new Error(
      "Personal workspace provisioning could not install the resolved workspace context.",
    );
  }
}

export async function createWorkspacePreferenceIfMissing(
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
    ON CONFLICT ("workspace_id") DO NOTHING
  `);
}

/**
 * Install the documented first-use classification defaults.
 *
 * ON CONFLICT without an explicit conflict target is intentional:
 *
 * - a seed code may already exist;
 * - a legacy/user-created active category may already use the same name.
 *
 * Provisioning must never replace, rename or otherwise rewrite existing user
 * classification data merely to attach a seed code.
 */
export async function createDefaultCategoriesIfMissing(
  transaction: ScopedTransaction,
  workspaceId: string,
): Promise<void> {
  for (const category of DEFAULT_CATEGORY_SEEDS) {
    await transaction.db.execute(sql`
      INSERT INTO core."category" (
        "workspace_id",
        "kind",
        "code",
        "name",
        "sort_order"
      )
      VALUES (
        ${workspaceId}::uuid,
        ${category.kind},
        ${category.code},
        ${category.name},
        ${category.sortOrder}
      )
      ON CONFLICT DO NOTHING
    `);
  }
}
