import { z } from "zod";

import { readCareerOnboardingEvidence } from "@/modules/career/repositories/career-onboarding-evidence-repository";
import type { ScopedTransaction } from "@/platform/db";

const careerOnboardingEvidenceInputSchema = z
  .object({
    workspaceId: z.uuid(),
  })
  .strict();

export type CareerOnboardingEvidence = {
  /**
   * Null means this workspace has never created a real Career application
   * attempt or saved opportunity.
   *
   * Archived applications still count as historical onboarding evidence.
   */
  firstApplicationCreatedAt: string | null;

  /**
   * Null means no application has ever established a real actionable Career
   * event as its next action through the normal Career command service.
   *
   * This remains populated after that action is completed, cancelled or
   * replaced because onboarding completion describes a learned workflow, not
   * the application's current scheduling state.
   */
  firstNextActionSetAt: string | null;
};

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

/**
 * Expose narrow Career evidence to Guidance without giving Core direct access
 * to Career tables or richer application projections.
 *
 * Like the Finance onboarding evidence service, this contract is
 * transaction-only because Guidance already owns the authenticated scoped
 * transaction.
 */
export async function getCareerOnboardingEvidenceInTransaction(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<CareerOnboardingEvidence> {
  const normalized = careerOnboardingEvidenceInputSchema.parse(input);

  const evidence = await readCareerOnboardingEvidence(transaction, {
    workspaceId: normalized.workspaceId,
  });

  return {
    firstApplicationCreatedAt: normalizeInstant(
      evidence.first_application_created_at,
    ),

    firstNextActionSetAt: normalizeInstant(evidence.first_next_action_set_at),
  };
}
