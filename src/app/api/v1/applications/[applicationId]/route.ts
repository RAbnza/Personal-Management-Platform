import { NextResponse } from "next/server";
import { z } from "zod";

import { JobApplicationUnavailableError } from "@/modules/career/domain/application";
import { getJobApplicationDetail } from "@/modules/career/services/get-job-application-detail";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";

const applicationParamsSchema = z
  .object({
    applicationId: z.uuid(),
  })
  .strict();

const applicationDetailQuerySchema = z.object({}).strict();

type ApplicationDetailRouteContext = {
  params: Promise<{
    applicationId: string;
  }>;
};

/**
 * Return the complete Career application detail/timeline projection.
 *
 * A missing and a nonowned application intentionally share the same 404
 * response so the API does not disclose another workspace's record existence.
 */
export async function GET(
  request: Request,
  context: ApplicationDetailRouteContext,
): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const params = applicationParamsSchema.parse(await context.params);

    applicationDetailQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );

    const result = await getJobApplicationDetail({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      applicationId: params.applicationId,
    });

    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message: "The application request is invalid.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof JobApplicationUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "APPLICATION_UNAVAILABLE",
        message: "The requested job application is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/applications/:applicationId failed unexpectedly. requestId=${requestId}`,
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
