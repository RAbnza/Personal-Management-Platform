import { NextResponse } from "next/server";
import { z } from "zod";

import {
  FinancialAccountWorkspaceUnavailableError,
  listFinancialAccounts,
} from "@/modules/finance/services/list-financial-accounts";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";

const accountsQuerySchema = z
  .object({
    includeArchived: z.enum(["true", "false"]).optional(),
  })
  .strict();

type AccountsQuery = {
  includeArchived: boolean;
};

function parseAccountsQuery(request: Request): AccountsQuery {
  const searchParams = new URL(request.url).searchParams;

  const parsed = accountsQuerySchema.parse(
    Object.fromEntries(searchParams.entries()),
  );

  return {
    includeArchived: parsed.includeArchived === "true",
  };
}

/**
 * List financial accounts visible to the authenticated personal workspace.
 *
 * Current balances are derived by the Finance query service from posted ledger
 * movements. No workspace/owner scope is accepted from the client.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const query = parseAccountsQuery(request);

    const result = await listFinancialAccounts({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

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

    if (error instanceof FinancialAccountWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",
        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/accounts failed unexpectedly. requestId=${requestId}`,
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
