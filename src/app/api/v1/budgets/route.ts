import { z } from "zod";
import {
  budgetCommandSchema,
  BudgetConflictError,
  BudgetUnavailableError,
} from "@/modules/planning/domain/budget";
import { planningId } from "@/modules/planning/domain/recurrence";
import { recordBudgetCommand } from "@/modules/planning/services/budgets";
import {
  budgetListQuerySchema,
  listBudgets,
  getBudget,
} from "@/modules/planning/services/read-budgets";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
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
function problem(error: unknown, requestId: string) {
  if (error instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(error, requestId);
  if (error instanceof z.ZodError)
    return createSchemaValidationProblemResponse(error, requestId);
  if (
    error instanceof BudgetConflictError ||
    error instanceof FinancialCommandConflictError
  )
    return createApiProblemResponse({
      status: 409,
      code: "BUDGET_CONFLICT",
      message: error.message,
      requestId,
      retryable: false,
    });
  if (
    error instanceof BudgetUnavailableError ||
    error instanceof FinancialWriteWorkspaceUnavailableError
  )
    return createApiProblemResponse({
      status: 404,
      code: "BUDGET_UNAVAILABLE",
      message: "The private budget or expense category is unavailable.",
      requestId,
      retryable: false,
    });
  if (error instanceof RangeError)
    return createApiProblemResponse({
      status: 422,
      code: "BUDGET_LIMIT",
      message: error.message,
      requestId,
      retryable: false,
    });
  console.error(`Budget request failed. requestId=${requestId}`);
  return createApiProblemResponse({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "The outcome could not be confirmed. Retry the same command.",
    requestId,
    retryable: true,
  });
}
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const a = await resolveApiActorForRequest(request, requestId);
    if (a.kind === "response") return a.response;
    const body = budgetCommandSchema.parse(await readApiJsonBody(request));
    return createApiJsonResponse(
      await recordBudgetCommand({
        ...body,
        userId: a.actor.userId,
        workspaceId: a.actor.workspaceId,
        requestId: a.actor.requestId,
      }),
      200,
      requestId,
    );
  } catch (e) {
    return problem(e, requestId);
  }
}
const detail = z
  .object({
    budgetId: planningId,
    historyCursor: planningId.optional(),
    contributionCursor: planningId.optional(),
  })
  .strict();
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, requestId);
    if (a.kind === "response") return a.response;
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].length !== new Set(params.keys()).size)
      throw new RangeError("Query fields cannot be repeated.");
    const raw = Object.fromEntries(params),
      scope = { userId: a.actor.userId, workspaceId: a.actor.workspaceId };
    return createApiJsonResponse(
      raw.budgetId
        ? await getBudget({ ...scope, ...detail.parse(raw) })
        : await listBudgets({ ...scope, ...budgetListQuerySchema.parse(raw) }),
      200,
      requestId,
    );
  } catch (e) {
    return problem(e, requestId);
  }
}
