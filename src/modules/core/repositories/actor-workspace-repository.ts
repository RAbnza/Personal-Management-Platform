import { sql } from "drizzle-orm";

import type { IdentityScopedTransaction } from "@/platform/db";

type PersonalWorkspaceRow = {
  id: string;
};

/**
 * Resolve the active personal workspace visible through the authenticated
 * identity-only RLS context.
 *
 * There is intentionally no userId or workspaceId input here. app.user_id was
 * installed from the validated server session before this repository is
 * called, and core.workspace RLS exposes only that identity's owned workspace.
 */
export async function resolveActivePersonalWorkspaceIdForActor(
  transaction: IdentityScopedTransaction,
): Promise<string | null> {
  const result = await transaction.db.execute<PersonalWorkspaceRow>(sql`
      SELECT
        workspace."id"

      FROM core."workspace"
        AS workspace

      INNER JOIN core."user_profile"
        AS profile
        ON profile."user_id" =
          workspace."owner_user_id"

      WHERE
        workspace."kind" =
          'personal'

        AND workspace."state" =
          'active'

        AND profile."lifecycle" =
          'active'

      ORDER BY
        workspace."id"

      LIMIT 2
    `);

  if (result.rows.length > 1) {
    /*
     * The database unique-owner invariant should make this impossible. Fail
     * closed rather than silently selecting one ownership root if corruption
     * is ever detected.
     */
    throw new Error(
      "Authenticated identity resolved more than one active personal workspace.",
    );
  }

  return result.rows[0]?.id ?? null;
}
