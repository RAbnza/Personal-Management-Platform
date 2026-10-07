import { z } from "zod";

import { readFinancialOnboardingEvidence } from "@/modules/finance/repositories/financial-onboarding-evidence-repository";
import type { ScopedTransaction } from "@/platform/db";

const financialOnboardingEvidenceInputSchema = z
  .object({
    workspaceId: z.uuid(),
  })
  .strict();

export type FinancialOnboardingEvidence = {
  /**
   * Null means no financial account has ever been created in this workspace.
   *
   * Archived accounts still count because onboarding is concerned with
   * whether the real account-creation workflow has already been completed,
   * not whether the account is currently active.
   */
  firstAccountCreatedAt: string | null;
};

/**
 * Expose narrowly scoped Finance evidence to coordinating application
 * services without leaking Finance table access across module boundaries.
 *
 * This is intentionally transaction-only. The coordinating Guidance service
 * already owns the authenticated scoped transaction and has already verified
 * that the private workspace is available.
 */
export async function getFinancialOnboardingEvidenceInTransaction(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<FinancialOnboardingEvidence> {
  const normalized = financialOnboardingEvidenceInputSchema.parse(input);

  const evidence = await readFinancialOnboardingEvidence(transaction, {
    workspaceId: normalized.workspaceId,
  });

  return {
    firstAccountCreatedAt:
      evidence.first_account_created_at?.toISOString() ?? null,
  };
}
