import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type FinancialOnboardingEvidenceQueryRow = {
  first_account_created_at: Date | null;
};

/**
 * Read the minimum Finance evidence needed by the Guidance module.
 *
 * This deliberately does not calculate balances or load account details.
 * Onboarding only needs to know whether the workspace has ever created a
 * financial account and when the first one was created.
 *
 * The caller must already be operating inside an authenticated, workspace-
 * scoped transaction. Other modules consume this through the Finance service
 * contract rather than querying finance tables directly.
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
          min(account."created_at")
            AS "first_account_created_at"

        FROM finance."financial_account"
          AS account

        WHERE
          account."workspace_id" =
            ${input.workspaceId}::uuid
      `,
    );

  return (
    result.rows[0] ?? {
      first_account_created_at: null,
    }
  );
}
