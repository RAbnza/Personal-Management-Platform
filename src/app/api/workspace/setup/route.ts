import { NextResponse } from "next/server";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { getVerifiedAuthenticatedSession } from "@/platform/auth/session-boundary";
import { getServerEnvironment } from "@/platform/env/server";

function createJsonResponse(
  body: Record<string, boolean | string>,
  status: number,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isTrustedSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  const expectedOrigin = new URL(getServerEnvironment().BETTER_AUTH_URL).origin;

  return origin === expectedOrigin;
}

/**
 * Idempotently establish the authenticated user's private S0 workspace.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isTrustedSameOriginRequest(request)) {
    return createJsonResponse(
      {
        error: "forbidden",
      },
      403,
    );
  }

  try {
    const authenticatedSession = await getVerifiedAuthenticatedSession(
      request.headers,
    );

    if (!authenticatedSession) {
      return createJsonResponse(
        {
          error: "unauthorized",
        },
        401,
      );
    }

    const result = await provisionPersonalWorkspace({
      userId: authenticatedSession.user.id,
      displayName: authenticatedSession.user.name,
    });

    return createJsonResponse(
      {
        workspaceId: result.workspaceId,
        created: result.created,
      },
      200,
    );
  } catch {
    /*
     * Do not expose database, session or ownership details in the public
     * response.
     */
    console.error(
      "Personal workspace setup failed because of an unexpected server error.",
    );

    return createJsonResponse(
      {
        error: "internal_error",
      },
      500,
    );
  }
}
