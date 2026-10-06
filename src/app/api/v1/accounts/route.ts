import { NextResponse } from "next/server";
import { z } from "zod";

import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import {
  FinancialAccountWorkspaceUnavailableError,
  listFinancialAccounts,
} from "@/modules/finance/services/list-financial-accounts";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
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
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const accountsQuerySchema = z
  .object({
    includeArchived: z.enum(["true", "false"]).optional(),
  })
  .strict();

const openFinancialAccountBodySchema = z
  .object({
    clientCommandId: z.uuid(),

    name: z.string().trim().min(1).max(200),

    accountType: z.enum(["cash", "e_wallet", "checking", "savings"]),

    institutionName: z.string().trim().min(1).max(200).nullable().optional(),

    openingCutoffDate: z.string().refine(isCalendarDate, {
      message: "Opening cutoff date must be a valid YYYY-MM-DD calendar date.",
    }),

    openingBalanceMinor: z
      .string()
      .regex(/^(?:0|[1-9]\d*)$/, {
        message:
          "Opening balance must be a non-negative minor-unit integer string.",
      })
      .refine(
        (value) => {
          if (!/^(?:0|[1-9]\d*)$/.test(value)) {
            return true;
          }

          return BigInt(value) <= MAX_FINANCIAL_COMPONENT_MINOR;
        },
        {
          message: `Opening balance must not exceed ${MAX_FINANCIAL_COMPONENT_MINOR.toString()} minor units.`,
        },
      ),

    notes: z.string().max(20_000).nullable().optional(),
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

/**
 * Create one financial account in the authenticated personal workspace.
 *
 * The client supplies the idempotency command ID and financial account data.
 * Ownership and audit request attribution come exclusively from ActorContext.
 */
export async function POST(request: Request): Promise<NextResponse> {
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

    const body = openFinancialAccountBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await openFinancialAccount({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      clientCommandId: body.clientCommandId,

      requestId: actorResolution.actor.requestId,

      name: body.name,

      accountType: body.accountType,

      institutionName: body.institutionName,

      openingCutoffDate: body.openingCutoffDate,

      openingBalanceMinor: body.openingBalanceMinor,

      notes: body.notes,
    });

    return createApiJsonResponse(result, 201, requestId);
  } catch (error) {
    if (error instanceof ApiJsonBodyError) {
      return createJsonBodyProblemResponse(error, requestId);
    }

    if (error instanceof z.ZodError) {
      return createSchemaValidationProblemResponse(error, requestId);
    }

    if (error instanceof FinancialCommandConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "IDEMPOTENCY_CONFLICT",

        message:
          "The client command ID has already been used for a different command.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof FinancialWriteWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",

        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof FinancialCommandStateError) {
      return createApiProblemResponse({
        status: 503,

        code: "TEMPORARY_UNAVAILABLE",

        message:
          "The financial command could not be resolved safely. Retry the same command ID.",

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
      `POST /api/v1/accounts failed unexpectedly. requestId=${requestId}`,
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
