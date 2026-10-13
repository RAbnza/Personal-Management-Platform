import { z } from "zod";
import {
  planningCommandSchema,
  planningId,
  PlanningConflictError,
  PlanningUnavailableError,
} from "@/modules/planning/domain/recurrence";
import { recordRecurringCommand } from "@/modules/planning/services/recurring";
import {
  listRecurringObligations,
  getRecurringObligation,
  getRecurringOccurrence,
} from "@/modules/planning/services/read-recurring";
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
    error instanceof PlanningConflictError ||
    error instanceof FinancialCommandConflictError
  )
    return createApiProblemResponse({
      status: 409,
      code: "RECURRING_CONFLICT",
      message: error.message,
      requestId,
      retryable: false,
    });
  if (
    error instanceof PlanningUnavailableError ||
    error instanceof FinancialWriteWorkspaceUnavailableError
  )
    return createApiProblemResponse({
      status: 404,
      code: "RECURRING_UNAVAILABLE",
      message: "The requested private recurring record is unavailable.",
      requestId,
      retryable: false,
    });
  if (error instanceof RangeError)
    return createApiProblemResponse({
      status: 422,
      code: "RECURRING_LIMIT",
      message: error.message,
      requestId,
      retryable: false,
    });
  console.error(`Recurring request failed. requestId=${requestId}`);
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
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const body = planningCommandSchema.parse(await readApiJsonBody(request));
    return createApiJsonResponse(
      await recordRecurringCommand({
        ...body,
        userId: actor.actor.userId,
        workspaceId: actor.actor.workspaceId,
        requestId: actor.actor.requestId,
      }),
      200,
      requestId,
    );
  } catch (error) {
    return problem(error, requestId);
  }
}
const querySchema = z
  .object({
    obligationId: planningId.optional(),
    occurrenceId: planningId.optional(),
    cursor: planningId.optional(),
    actualCursor: planningId.optional(),
    preferredActionId: planningId.optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (q) =>
      !(q.obligationId && q.occurrenceId) &&
      (!q.actualCursor || !!q.occurrenceId) &&
      (!q.preferredActionId || !!q.occurrenceId) &&
      (!q.occurrenceId || (!q.cursor && !q.pageSize)),
    "Use one supported recurring query.",
  );
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].length !== new Set(params.keys()).size)
      throw new RangeError("Query fields cannot be repeated.");
    const q = querySchema.parse(Object.fromEntries(params));
    const scope = {
      userId: actor.actor.userId,
      workspaceId: actor.actor.workspaceId,
    };
    const result = q.occurrenceId
      ? await getRecurringOccurrence({
          ...scope,
          occurrenceId: q.occurrenceId,
          ...(q.actualCursor ? { actualCursor: q.actualCursor } : {}),
          ...(q.preferredActionId
            ? { preferredActionId: q.preferredActionId }
            : {}),
        })
      : q.obligationId
        ? await getRecurringObligation({
            ...scope,
            obligationId: q.obligationId,
            ...(q.cursor ? { cursor: q.cursor } : {}),
            ...(q.pageSize ? { pageSize: q.pageSize } : {}),
          })
        : await listRecurringObligations({
            ...scope,
            ...(q.cursor ? { cursor: q.cursor } : {}),
            ...(q.pageSize ? { pageSize: q.pageSize } : {}),
          });
    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    return problem(error, requestId);
  }
}
