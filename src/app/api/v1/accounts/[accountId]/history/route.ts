import { NextResponse } from "next/server";
import { z } from "zod";

import {
  FinancialAccountNotFoundError,
  getAccountHistory,
  InvalidAccountHistoryCursorError,
} from "@/modules/finance/services/get-account-history";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";

const accountHistoryParamsSchema = z
  .object({
    accountId: z.uuid(),
  })
  .strict();

const accountHistoryQuerySchema = z
  .object({
    pageSize: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),

    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();

type AccountHistoryRouteContext = {
  params: Promise<{
    accountId: string;
  }>;
};

/**
 * Return one financial account's immutable ledger-derived history projection.
 *
 * Missing and nonowned account IDs intentionally share the same 404 response.
 * The cursor remains opaque to clients; its interpretation belongs to the
 * Finance query service.
 */
export async function GET(
  request: Request,
  context: AccountHistoryRouteContext,
): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const params = accountHistoryParamsSchema.parse(await context.params);

    const query = accountHistoryQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );

    const result = await getAccountHistory({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      accountId: params.accountId,

      pageSize: query.pageSize,

      cursor: query.cursor,
    });

    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message: "The account-history request is invalid.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof InvalidAccountHistoryCursorError) {
      return createApiProblemResponse({
        status: 400,

        code: "INVALID_CURSOR",
        message: "The account-history cursor is invalid.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof FinancialAccountNotFoundError) {
      return createApiProblemResponse({
        status: 404,

        code: "FINANCIAL_ACCOUNT_UNAVAILABLE",
        message: "The requested financial account is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/accounts/:accountId/history failed unexpectedly. requestId=${requestId}`,
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
