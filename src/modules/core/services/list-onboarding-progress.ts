import { z } from "zod";

import {
  ONBOARDING_GUIDE_STEPS,
  ONBOARDING_GUIDE_VERSION,
  type OnboardingStepKey,
  type OnboardingStepState,
} from "@/modules/core/domain/onboarding";
import {
  canReadActiveOnboardingWorkspace,
  readStoredOnboardingSteps,
} from "@/modules/core/repositories/onboarding-repository";
import { listModulePreferencesInTransaction } from "@/modules/core/services/list-module-preferences";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import type { ImplementedModuleKey } from "@/platform/db/schema/core";

const listOnboardingProgressInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
  })
  .strict();

export type ListOnboardingProgressInput = z.input<
  typeof listOnboardingProgressInputSchema
>;

export type OnboardingProgressItem = {
  stepKey: OnboardingStepKey;

  requiredModule: ImplementedModuleKey | null;

  /**
   * Module-specific progress is retained when the module is hidden. The step
   * simply stops participating in the currently applicable onboarding path.
   */
  applicable: boolean;

  state: OnboardingStepState;

  completedAt: string | null;

  /**
   * Null means the step is still using its virtual pending state and has never
   * been explicitly changed.
   */
  updatedAt: string | null;
};

export type ListOnboardingProgressResult = {
  guideVersion: typeof ONBOARDING_GUIDE_VERSION;

  steps: OnboardingProgressItem[];

  applicableStepCount: number;
  resolvedApplicableStepCount: number;

  /**
   * Both completed and explicitly skipped steps count as resolved.
   */
  complete: boolean;
};

export class OnboardingWorkspaceUnavailableError extends Error {
  readonly code = "ONBOARDING_WORKSPACE_UNAVAILABLE";

  constructor() {
    super(
      "The active workspace could not be resolved for onboarding progress.",
    );

    this.name = "OnboardingWorkspaceUnavailableError";
  }
}

type NormalizedListOnboardingProgressInput = {
  userId: string;
  workspaceId: string;
};

function normalizeInput(
  input: ListOnboardingProgressInput,
): NormalizedListOnboardingProgressInput {
  return listOnboardingProgressInputSchema.parse(input);
}

async function executeListOnboardingProgress(
  transaction: ScopedTransaction,
  input: NormalizedListOnboardingProgressInput,
): Promise<ListOnboardingProgressResult> {
  const workspaceAvailable = await canReadActiveOnboardingWorkspace(
    transaction,
    {
      workspaceId: input.workspaceId,
    },
  );

  if (!workspaceAvailable) {
    throw new OnboardingWorkspaceUnavailableError();
  }

  /*
   * A ScopedTransaction owns one checked-out PostgreSQL connection. Keep these
   * reads sequential instead of issuing concurrent client queries.
   */
  const storedSteps = await readStoredOnboardingSteps(transaction, {
    workspaceId: input.workspaceId,
    guideVersion: ONBOARDING_GUIDE_VERSION,
  });

  const modulePreferences = await listModulePreferencesInTransaction(
    transaction,
    {
      userId: input.userId,
      workspaceId: input.workspaceId,
    },
  );

  const storedByKey = new Map(storedSteps.map((step) => [step.stepKey, step]));

  const moduleEnabled = new Map(
    modulePreferences.items.map((preference) => [
      preference.moduleKey,
      preference.enabled,
    ]),
  );

  const steps = ONBOARDING_GUIDE_STEPS.map(
    (definition): OnboardingProgressItem => {
      const stored = storedByKey.get(definition.stepKey);

      const applicable =
        definition.requiredModule === null ||
        moduleEnabled.get(definition.requiredModule) === true;

      return {
        stepKey: definition.stepKey,

        requiredModule: definition.requiredModule,

        applicable,

        state: stored?.state ?? "pending",

        completedAt: stored?.completedAt ?? null,

        updatedAt: stored?.updatedAt ?? null,
      };
    },
  );

  const applicableSteps = steps.filter((step) => step.applicable);

  const resolvedApplicableStepCount = applicableSteps.filter(
    (step) => step.state === "completed" || step.state === "skipped",
  ).length;

  return {
    guideVersion: ONBOARDING_GUIDE_VERSION,

    steps,

    applicableStepCount: applicableSteps.length,

    resolvedApplicableStepCount,

    complete:
      applicableSteps.length > 0 &&
      resolvedApplicableStepCount === applicableSteps.length,
  };
}

export async function listOnboardingProgressInTransaction(
  transaction: ScopedTransaction,
  input: ListOnboardingProgressInput,
): Promise<ListOnboardingProgressResult> {
  return executeListOnboardingProgress(transaction, normalizeInput(input));
}

export async function listOnboardingProgress(
  input: ListOnboardingProgressInput,
): Promise<ListOnboardingProgressResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,
      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeListOnboardingProgress(transaction, normalized),
  );
}
