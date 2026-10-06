import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CategoryWorkspaceUnavailableError,
  listCategories,
} from "@/modules/core/services/list-categories";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";

const categoriesQuerySchema = z
  .object({
    kind: z.enum(["income", "expense"]).optional(),

    includeArchived: z.enum(["true", "false"]).optional(),
  })
  .strict();

type CategoriesQuery = {
  kind: "income" | "expense" | undefined;

  includeArchived: boolean;
};

function parseCategoriesQuery(request: Request): CategoriesQuery {
  const searchParams = new URL(request.url).searchParams;

  const parsed = categoriesQuerySchema.parse(
    Object.fromEntries(searchParams.entries()),
  );

  return {
    kind: parsed.kind,

    includeArchived: parsed.includeArchived === "true",
  };
}

/**
 * List the authenticated workspace's shared income/expense taxonomy.
 *
 * Active categories are returned by default. Archived categories can be
 * requested for management/history interfaces, but ownership scope always
 * comes from ActorContext.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const query = parseCategoriesQuery(request);

    const result = await listCategories({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      ...(query.kind
        ? {
            kind: query.kind,
          }
        : {}),

      includeArchived: query.includeArchived,
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

    if (error instanceof CategoryWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",
        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/categories failed unexpectedly. requestId=${requestId}`,
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
