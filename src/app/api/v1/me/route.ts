import { NextResponse } from "next/server";

import {
  CurrentUserOverviewUnavailableError,
  getCurrentUserOverview,
} from "@/modules/core/services/get-current-user-overview";
import { resolveActorContext } from "@/platform/auth/actor-context";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";

/**
 * Return the minimal authenticated private-workspace bootstrap payload required
 * by the application shell.
 *
 * Authentication/session ownership and workspace resolution happen entirely on
 * the server. No workspace or owner identifier is accepted from the request.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveActorContext(
      request.headers,
      requestId,
    );

    if (actorResolution.kind === "unauthorized") {
      return createApiProblemResponse({
        status: 401,

        code: "UNAUTHORIZED",

        message: "Authentication is required.",

        requestId,

        retryable: false,
      });
    }

    if (actorResolution.kind === "workspace_unavailable") {
      return createApiProblemResponse({
        status: 409,

        code: "WORKSPACE_UNAVAILABLE",

        message:
          "An active personal workspace is required before this operation.",

        requestId,

        retryable: false,
      });
    }

    const actor = actorResolution.actor;

    const overview = await getCurrentUserOverview({
      userId: actor.userId,
      workspaceId: actor.workspaceId,
    });

    return createApiJsonResponse(
      {
        user: {
          id: actor.userId,
        },

        workspace: {
          id: actor.workspaceId,

          ...overview.workspace,
        },

        preference: overview.preference,

        modules: overview.modules,
      },
      200,
      requestId,
    );
  } catch (error) {
    if (error instanceof CurrentUserOverviewUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",

        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    /*
     * Keep private data, SQL details, session contents and stack traces out of
     * the public response. The correlation ID is sufficient to connect the
     * client-visible failure to sanitized server observability.
     */
    console.error(`GET /api/v1/me failed unexpectedly. requestId=${requestId}`);

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
