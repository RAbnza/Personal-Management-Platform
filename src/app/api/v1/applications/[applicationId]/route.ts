import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CAREER_APPLICATION_OUTCOMES,
  CAREER_APPLICATION_STAGES,
  JobApplicationArchivedError,
  JobApplicationUnavailableError,
  JobApplicationVersionConflictError,
} from "@/modules/career/domain/application";
import { getJobApplicationDetail } from "@/modules/career/services/get-job-application-detail";
import { transitionJobApplicationStage } from "@/modules/career/services/transition-job-application-stage";
import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
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
import { isCalendarDate } from "@/shared/calendar-date";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const applicationParamsSchema = z
  .object({
    applicationId: z.uuid(),
  })
  .strict();

const applicationDetailQuerySchema = z.object({}).strict();

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const transitionApplicationStageBodySchema = z
  .object({
    clientCommandId: z.uuid(),

    expectedVersion: z.number().int().min(1).max(POSTGRES_INTEGER_MAX),

    stage: z.enum(CAREER_APPLICATION_STAGES),

    outcome: z.enum(CAREER_APPLICATION_OUTCOMES).nullable().optional(),

    effectiveDate: calendarDateSchema,

    effectiveOrder: z
      .number()
      .int()
      .min(0)
      .max(POSTGRES_INTEGER_MAX)
      .optional(),

    appliedDate: calendarDateSchema.nullable().optional(),

    reason: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

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

/**
 * Append one stage/outcome history record and resolve the application's current
 * stage using optimistic version control.
 *
 * This PATCH intentionally implements the first-slice stage-transition portion
 * of the documented application mutation endpoint. Broader metadata editing
 * can extend this resource contract later without creating a second stage URL.
 */
export async function PATCH(
  request: Request,
  context: ApplicationDetailRouteContext,
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

    const params = applicationParamsSchema.parse(await context.params);

    const body = transitionApplicationStageBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await transitionJobApplicationStage({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      applicationId: params.applicationId,

      clientCommandId: body.clientCommandId,

      requestId: actorResolution.actor.requestId,

      expectedVersion: body.expectedVersion,

      stage: body.stage,

      outcome: body.outcome,

      effectiveDate: body.effectiveDate,

      effectiveOrder: body.effectiveOrder,

      appliedDate: body.appliedDate,

      reason: body.reason,
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

    if (error instanceof JobApplicationVersionConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "STALE_VERSION",

        message: "The job application changed since it was loaded.",

        fieldErrors: {
          expectedVersion: [
            `The current application version is ${error.currentVersion}. Reload the application before saving another stage change.`,
          ],
        },

        requestId,

        retryable: false,
      });
    }

    if (
      error instanceof JobApplicationUnavailableError ||
      error instanceof PrivateDomainWriteUnavailableError
    ) {
      return createApiProblemResponse({
        status: 404,

        code:
          error instanceof JobApplicationUnavailableError
            ? "APPLICATION_UNAVAILABLE"
            : "WORKSPACE_UNAVAILABLE",

        message:
          error instanceof JobApplicationUnavailableError
            ? "The requested job application is unavailable."
            : "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof JobApplicationArchivedError) {
      return createApiProblemResponse({
        status: 422,

        code: "APPLICATION_ARCHIVED",

        message:
          "An archived job application cannot receive new stage history.",

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

    if (error instanceof RangeError) {
      return createApiProblemResponse({
        status: 422,

        code: "BUSINESS_RULE_VIOLATION",

        message: error.message,

        requestId,

        retryable: false,
      });
    }

    console.error(
      `PATCH /api/v1/applications/:applicationId failed unexpectedly. requestId=${requestId}`,
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
