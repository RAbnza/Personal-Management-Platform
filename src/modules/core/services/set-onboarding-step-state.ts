import { z } from "zod";

import {
  ONBOARDING_GUIDE_VERSION,
  ONBOARDING_STEP_KEYS,
  ONBOARDING_STEP_STATES,
} from "@/modules/core/domain/onboarding";
import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { setOnboardingStepState as persistOnboardingStepState } from "@/modules/core/repositories/onboarding-repository";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const SET_ONBOARDING_STEP_STATE_COMMAND_TYPE = "core.set_onboarding_step_state";

const setOnboardingStepStateInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    clientCommandId: z.uuid(),

    stepKey: z.enum(ONBOARDING_STEP_KEYS),

    state: z.enum(ONBOARDING_STEP_STATES),
  })
  .strict();

const setOnboardingStepStateResultSchema = z.object({
  guideVersion: z.literal(ONBOARDING_GUIDE_VERSION),

  stepKey: z.enum(ONBOARDING_STEP_KEYS),

  state: z.enum(ONBOARDING_STEP_STATES),

  completedAt: z.iso.datetime().nullable(),

  updatedAt: z.iso.datetime(),
});

export type SetOnboardingStepStateInput = z.input<
  typeof setOnboardingStepStateInputSchema
>;

export type SetOnboardingStepStateResult = z.infer<
  typeof setOnboardingStepStateResultSchema
>;

type NormalizedSetOnboardingStepStateInput = {
  userId: string;
  workspaceId: string;

  clientCommandId: string;

  stepKey: SetOnboardingStepStateResult["stepKey"];

  state: SetOnboardingStepStateResult["state"];
};

function normalizeInput(
  input: SetOnboardingStepStateInput,
): NormalizedSetOnboardingStepStateInput {
  return setOnboardingStepStateInputSchema.parse(input);
}

function getPayloadHash(input: NormalizedSetOnboardingStepStateInput) {
  return hashCommandPayload({
    guideVersion: ONBOARDING_GUIDE_VERSION,

    stepKey: input.stepKey,

    state: input.state,
  });
}

async function executeSetOnboardingStepState(
  transaction: ScopedTransaction,
  input: NormalizedSetOnboardingStepStateInput,
): Promise<SetOnboardingStepStateResult> {
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    clientCommandId: input.clientCommandId,

    commandType: SET_ONBOARDING_STEP_STATE_COMMAND_TYPE,

    payloadHash: getPayloadHash(input),
  });

  /*
   * Replay resolves before touching onboarding state. Replaying guidance or a
   * lost successful response cannot create another setup record or alter the
   * original completion timestamp.
   */
  if (receipt.kind === "replay") {
    return setOnboardingStepStateResultSchema.parse(receipt.result);
  }

  const stored = await persistOnboardingStepState(transaction, {
    workspaceId: input.workspaceId,

    guideVersion: ONBOARDING_GUIDE_VERSION,

    stepKey: input.stepKey,

    state: input.state,
  });

  const result: SetOnboardingStepStateResult = {
    guideVersion: ONBOARDING_GUIDE_VERSION,

    stepKey: stored.stepKey,

    state: stored.state,

    completedAt: stored.completedAt,

    updatedAt: stored.updatedAt,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    receiptId: receipt.receiptId,

    result,
  });

  return result;
}

export async function setOnboardingStepStateInTransaction(
  transaction: ScopedTransaction,
  input: SetOnboardingStepStateInput,
): Promise<SetOnboardingStepStateResult> {
  return executeSetOnboardingStepState(transaction, normalizeInput(input));
}

export async function setOnboardingStepState(
  input: SetOnboardingStepStateInput,
): Promise<SetOnboardingStepStateResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,
      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeSetOnboardingStepState(transaction, normalized),
  );
}
