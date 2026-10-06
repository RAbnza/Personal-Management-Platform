import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getWorkspaceSettings,
  WorkspaceSettingsWorkspaceUnavailableError,
} from "@/modules/core/services/get-workspace-settings";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";

const settingsQuerySchema = z.object({}).strict();

/**
 * Return editable/read-only workspace settings for the authenticated personal
 * workspace.
 *
 * Ownership scope always comes from ActorContext. This endpoint intentionally
 * accepts no query-based workspace or owner fields.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    settingsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );

    const result = await getWorkspaceSettings({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,
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

    if (error instanceof WorkspaceSettingsWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",
        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/settings failed unexpectedly. requestId=${requestId}`,
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
