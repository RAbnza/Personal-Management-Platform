import { NextResponse } from "next/server";
import { z } from "zod";

import { CAREER_APPLICATION_STAGES } from "@/modules/career/domain/application";
import {
  InvalidJobApplicationListCursorError,
  JobApplicationListWorkspaceUnavailableError,
  listJobApplications,
} from "@/modules/career/services/list-job-applications";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";

const pageSizeQuerySchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(100));

const applicationsQuerySchema = z
  .object({
    archive: z.enum(["active", "archived", "all"]).optional(),

    stage: z.enum(CAREER_APPLICATION_STAGES).optional(),

    search: z.string().max(200).optional(),

    pageSize: pageSizeQuerySchema.optional(),

    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();

function parseApplicationsQuery(request: Request) {
  return applicationsQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
}

/**
 * List Career applications and saved opportunities for the authenticated
 * workspace.
 *
 * Filters and pagination are client-controlled; ownership scope is not.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const query = parseApplicationsQuery(request);

    const result = await listJobApplications({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      ...(query.archive
        ? {
            archive: query.archive,
          }
        : {}),

      ...(query.stage
        ? {
            stage: query.stage,
          }
        : {}),

      ...(query.search !== undefined
        ? {
            search: query.search,
          }
        : {}),

      ...(query.pageSize !== undefined
        ? {
            pageSize: query.pageSize,
          }
        : {}),

      ...(query.cursor
        ? {
            cursor: query.cursor,
          }
        : {}),
    });

    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message: "The request query parameters are invalid.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof InvalidJobApplicationListCursorError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message:
          "The pagination cursor is invalid for the requested application filters.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof JobApplicationListWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",
        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/applications failed unexpectedly. requestId=${requestId}`,
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
