import { NextResponse } from "next/server";
import { z } from "zod";

import {
  listOnboardingProgress,
  OnboardingWorkspaceUnavailableError,
} from "@/modules/core/services/list-onboarding-progress";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";

const onboardingQuerySchema = z.object({}).strict();

/**
 * Return the current versioned onboarding guide and the authenticated
 * workspace's progress through its applicable steps.
 *
 * Reading onboarding is intentionally side-effect free. Virtual pending steps
 * remain virtual until the user explicitly changes their state.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    onboardingQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );

    const result = await listOnboardingProgress({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,
    });

    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message: "The onboarding request is invalid.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof OnboardingWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",
        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/onboarding failed unexpectedly. requestId=${requestId}`,
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
