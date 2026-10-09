import type { ImplementedModuleKey } from "@/platform/db/schema/core";
import { z } from "zod";

export const ONBOARDING_GUIDE_VERSION = 1 as const;

export const ONBOARDING_STEP_STATES = [
  "pending",
  "completed",
  "skipped",
] as const;

export type OnboardingStepState = (typeof ONBOARDING_STEP_STATES)[number];

export const ONBOARDING_STEP_KEYS = [
  "choose-goal",
  "confirm-preferences",
  "add-first-account",
  "record-first-transaction",
  "add-job-application",
  "review-agenda",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export const setOnboardingStepStateResultSchema = z.object({
  guideVersion: z.literal(ONBOARDING_GUIDE_VERSION),
  stepKey: z.enum(ONBOARDING_STEP_KEYS),
  state: z.enum(ONBOARDING_STEP_STATES),
  completedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export type OnboardingStepDefinition = {
  stepKey: OnboardingStepKey;

  /**
   * Null means the step belongs to the shared onboarding flow.
   *
   * A module-specific step remains stored even when its module is later
   * disabled, but it is not considered applicable while that module is hidden.
   */
  requiredModule: ImplementedModuleKey | null;
};

export const ONBOARDING_GUIDE_STEPS: readonly OnboardingStepDefinition[] = [
  {
    stepKey: "choose-goal",
    requiredModule: null,
  },
  {
    stepKey: "confirm-preferences",
    requiredModule: null,
  },
  {
    stepKey: "add-first-account",
    requiredModule: "money",
  },
  {
    stepKey: "record-first-transaction",
    requiredModule: "money",
  },
  {
    stepKey: "add-job-application",
    requiredModule: "career",
  },
  {
    stepKey: "review-agenda",
    requiredModule: "time",
  },
];
