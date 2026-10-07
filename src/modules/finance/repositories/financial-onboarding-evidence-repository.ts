import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type FinancialOnboardingEvidenceQueryRow = {
  first_account_created_at: string | null;
  first_transaction_recorded_at: string | null;
};

/**
 * Read the minimum Finance evidence needed by the Guidance module.
 *
 * This deliberately does not calculate balances or load account details.
 * Guidance only needs evidence that the user has completed specific real
 * Finance workflows.
 *
 * Opening-balance actions are intentionally excluded from first-transaction
 * evidence. They establish an account baseline and are not ordinary financial
 * activity from the user's perspective.
 *
 * Raw SQL timestamp values are returned explicitly as text. This keeps the
 * repository contract deterministic instead of relying on driver-specific
 * timestamp conversion behavior.
 *
 * The caller must already be operating inside an authenticated, workspace-
 * scoped transaction. Other modules consume this through the Finance service
 * contract rather than querying Finance tables directly.
 */
export async function readFinancialOnboardingEvidence(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<FinancialOnboardingEvidenceQueryRow> {
  const result =
    await transaction.db.execute<FinancialOnboardingEvidenceQueryRow>(
      sql`
        SELECT
          (
            SELECT
              min(account."created_at")::text

            FROM finance."financial_account"
              AS account

            WHERE
              account."workspace_id" =
                ${input.workspaceId}::uuid
          )
            AS "first_account_created_at",

          (
            SELECT
              min(action."created_at")::text

            FROM finance."financial_action"
              AS action

            INNER JOIN finance."action_revision"
              AS current_revision
              ON current_revision."workspace_id" =
                action."workspace_id"

              AND current_revision."id" =
                action."current_revision_id"

            WHERE
              action."workspace_id" =
                ${input.workspaceId}::uuid

              AND current_revision."state" =
                'posted'

              AND current_revision."action_kind" <>
                'opening_cash'
          )
            AS "first_transaction_recorded_at"
      `,
    );

  return (
    result.rows[0] ?? {
      first_account_created_at: null,
      first_transaction_recorded_at: null,
    }
  );
}
