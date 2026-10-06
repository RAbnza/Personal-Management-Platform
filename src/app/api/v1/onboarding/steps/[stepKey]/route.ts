import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import {
  ONBOARDING_STEP_KEYS,
  ONBOARDING_STEP_STATES,
} from "@/modules/core/domain/onboarding";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import { setOnboardingStepState } from "@/modules/core/services/set-onboarding-step-state";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createMutationOriginProblemResponse,
  createSchemaValidationProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";

const onboardingStepParamsSchema = z
  .object({
    stepKey: z.enum(ONBOARDING_STEP_KEYS),
  })
  .strict();

const onboardingStepBodySchema = z
  .object({
    clientCommandId: z.uuid(),

    state: z.enum(ONBOARDING_STEP_STATES),
  })
  .strict();

type OnboardingStepRouteContext = {
  params: Promise<{
    stepKey: string;
  }>;
};

/**
 * Set one step in the current versioned onboarding guide.
 *
 * The step key comes from the documented guide definition. The service owns
 * the guide version so clients cannot write progress against an arbitrary
 * onboarding version.
 */
export async function PATCH(
  request: Request,
  context: OnboardingStepRouteContext,
): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const originProblem = createMutationOriginProblemResponse(
      request,
      requestId,
    );

    if (originProblem) {
      return originProblem;
    }

    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const params = onboardingStepParamsSchema.parse(await context.params);

    const body = onboardingStepBodySchema.parse(await readApiJsonBody(request));

    const result = await setOnboardingStepState({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      clientCommandId: body.clientCommandId,

      stepKey: params.stepKey,

      state: body.state,
    });

    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof ApiJsonBodyError) {
      return createJsonBodyProblemResponse(error, requestId);
    }

    if (error instanceof z.ZodError) {
      return createSchemaValidationProblemResponse(error, requestId);
    }

    if (error instanceof CommandReceiptConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "IDEMPOTENCY_CONFLICT",

        message:
          "The client command ID has already been used for a different command.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof PrivateDomainWriteUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",

        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof CommandReceiptStateError) {
      return createApiProblemResponse({
        status: 503,

        code: "TEMPORARY_UNAVAILABLE",

        message:
          "The command could not be resolved safely. Retry the same command ID.",

        requestId,

        retryable: true,
      });
    }

    console.error(
      `PATCH /api/v1/onboarding/steps/:stepKey failed unexpectedly. requestId=${requestId}`,
    );

    return createApiProblemResponse({
      status: 500,

      code: "INTERNAL_ERROR",

      message:
        "The request could not be completed because of an unexpected server error.",

      requestId,

      retryable: false,
    });
  }
}
