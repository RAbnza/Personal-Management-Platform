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
import { getFinancialOnboardingEvidenceInTransaction } from "@/modules/finance/services/get-financial-onboarding-evidence";
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

  /**
   * For evidence-backed steps, this can come from the authoritative domain
   * event rather than core.onboarding_step.
   */
  completedAt: string | null;

  /**
   * This describes explicit onboarding-state storage only.
   *
   * Null means the step has never been explicitly changed in
   * core.onboarding_step. An evidence-backed step can therefore be completed
   * while updatedAt remains null.
   */
  updatedAt: string | null;
};

export type ListOnboardingProgressResult = {
  guideVersion: typeof ONBOARDING_GUIDE_VERSION;

  steps: OnboardingProgressItem[];

  applicableStepCount: number;
  resolvedApplicableStepCount: number;

  /**
   * Both completed and explicitly skipped applicable steps count as resolved.
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
   * A ScopedTransaction owns one checked-out PostgreSQL connection. Keep
   * these reads sequential rather than issuing concurrent client queries.
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

  /*
   * Guidance consumes a narrow Finance read contract instead of querying
   * Finance tables itself.
   *
   * Do not use account/history read models here. Those queries derive richer
   * ledger projections and would make a lightweight onboarding read more
   * expensive as financial history grows.
   */
  const financialEvidence = await getFinancialOnboardingEvidenceInTransaction(
    transaction,
    {
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

  const hasFinancialAccount = financialEvidence.firstAccountCreatedAt !== null;

  const hasRealFinancialTransaction =
    financialEvidence.firstTransactionRecordedAt !== null;

  const steps = ONBOARDING_GUIDE_STEPS.map(
    (definition): OnboardingProgressItem => {
      const stored = storedByKey.get(definition.stepKey);

      const applicable =
        definition.requiredModule === null ||
        moduleEnabled.get(definition.requiredModule) === true;

      let state: OnboardingStepState = stored?.state ?? "pending";

      let completedAt = stored?.completedAt ?? null;

      /*
       * A real financial account is authoritative evidence that this lesson
       * has been completed.
       *
       * The onboarding row is guidance metadata, not authority for whether a
       * financial account exists. This also repairs the recovery case where
       * the Finance command committed but a later onboarding write did not.
       */
      if (definition.stepKey === "add-first-account") {
        if (hasFinancialAccount) {
          state = "completed";

          completedAt = financialEvidence.firstAccountCreatedAt;
        } else if (state === "completed") {
          /*
           * Do not let an explicit guide-state write manufacture completion
           * of a real domain workflow.
           *
           * Skipped remains meaningful because onboarding explicitly permits
           * optional/resumable steps.
           */
          state = "pending";
          completedAt = null;
        }
      }

      /*
       * A posted non-opening financial action is authoritative evidence that
       * the user has recorded real financial activity.
       *
       * opening_cash is deliberately excluded by Finance because opening
       * balances establish a baseline and must not be misclassified as the
       * user's first income, expense or transfer.
       */
      if (definition.stepKey === "record-first-transaction") {
        if (hasRealFinancialTransaction) {
          state = "completed";

          completedAt = financialEvidence.firstTransactionRecordedAt;
        } else if (state === "completed") {
          state = "pending";
          completedAt = null;
        }
      }

      return {
        stepKey: definition.stepKey,

        requiredModule: definition.requiredModule,

        applicable,

        state,

        completedAt,

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
