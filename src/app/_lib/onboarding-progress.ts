import {
  listOnboardingProgress,
  type ListOnboardingProgressResult,
} from "@/modules/core/services/list-onboarding-progress";

export async function resolveOnboardingProgress(input: {
  userId: string;
  workspaceId: string;
}): Promise<ListOnboardingProgressResult | null> {
  try {
    return await listOnboardingProgress({
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
  } catch {
    /*
     * Guidance must not block otherwise-authorized product access.
     *
     * Keep private workspace identifiers and database details out of ordinary
     * logs while allowing the dashboard to remain usable if onboarding cannot
     * currently be read.
     */
    console.error("Onboarding progress could not be loaded.");

    return null;
  }
}
