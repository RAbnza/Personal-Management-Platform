import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export class PrivateDomainWriteUnavailableError extends Error {
  readonly code = "PRIVATE_DOMAIN_WRITE_UNAVAILABLE";

  constructor() {
    super("The active private workspace could not be resolved for this write.");

    this.name = "PrivateDomainWriteUnavailableError";
  }
}

/**
 * Acquire the documented nonfinancial private-domain lifecycle guard before
 * performing application writes.
 *
 * Lifecycle transitions lock core.user_profile FOR UPDATE. Ordinary private
 * domain writes lock the same row FOR SHARE, so deletion waits for in-flight
 * writes and new writes cannot begin after the profile leaves active state.
 */
export async function lockActivePrivateWorkspace(
  transaction: ScopedTransaction,
  input: {
    userId: string;
    workspaceId: string;
  },
): Promise<void> {
  const result = await transaction.db.execute<{ user_id: string }>(sql`
    SELECT
      profile."user_id"
    FROM core."user_profile" AS profile
    INNER JOIN core."workspace" AS workspace
      ON workspace."owner_user_id" = profile."user_id"
    WHERE
      profile."user_id" = ${input.userId}::uuid
      AND workspace."id" = ${input.workspaceId}::uuid
      AND profile."lifecycle" = 'active'
      AND workspace."state" = 'active'
    FOR SHARE OF profile
  `);

  if (!result.rows[0]) {
    throw new PrivateDomainWriteUnavailableError();
  }
}
