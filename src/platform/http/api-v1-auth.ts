import type { NextResponse } from "next/server";

import {
  resolveActorContext,
  type ActorContext,
} from "@/platform/auth/actor-context";
import { createApiProblemResponse } from "@/platform/http/api-v1";

export type ApiActorResolution =
  | {
      kind: "authenticated";
      actor: ActorContext;
    }
  | {
      kind: "response";
      response: NextResponse;
    };

/**
 * Resolve the trusted authenticated actor for an API v1 business route.
 *
 * Route handlers never accept user/workspace ownership scope from client
 * input. ActorContext derives it from the verified server session and the
 * database-owned personal workspace.
 */
export async function resolveApiActorForRequest(
  request: Request,
  requestId: string,
): Promise<ApiActorResolution> {
  const resolution = await resolveActorContext(request.headers, requestId);

  if (resolution.kind === "unauthorized") {
    return {
      kind: "response",

      response: createApiProblemResponse({
        status: 401,

        code: "UNAUTHORIZED",
        message: "Authentication is required.",

        requestId,

        retryable: false,
      }),
    };
  }

  if (resolution.kind === "workspace_unavailable") {
    return {
      kind: "response",

      response: createApiProblemResponse({
        status: 409,

        code: "WORKSPACE_UNAVAILABLE",
        message:
          "An active personal workspace is required before this operation.",

        requestId,

        retryable: false,
      }),
    };
  }

  return {
    kind: "authenticated",
    actor: resolution.actor,
  };
}
