import { z } from "zod";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import {
  statementEvidenceSchema,
  statementIdentifierSchema,
  StatementConflictError,
  StatementUnavailableError,
} from "@/modules/finance/domain/card-statement";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { recordCardStatement } from "@/modules/finance/services/card-statements";
import {
  listCardStatements,
  getCardStatement,
} from "@/modules/finance/services/read-card-statements";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "./api-v1";
import { resolveApiActorForRequest } from "./api-v1-auth";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createMutationOriginProblemResponse,
  createSchemaValidationProblemResponse,
  readApiJsonBody,
} from "./api-v1-mutation";
type Params = { cardId: string; statementId?: string };
const createBody = statementEvidenceSchema.extend({
  clientCommandId: statementIdentifierSchema,
});
const reviseBody = createBody.extend({
  expectedVersion: z.number().int().min(1).max(2147483646),
  reason: z.string().trim().min(1).max(20000),
});
// 100 bounded provider lines plus correction evidence may exceed the ordinary
// 64 KiB command limit. Keep this allowance local to authenticated statements.
const statementBodyMaximumBytes = 3 * 1024 * 1024;
export async function handleCardStatement(
  request: Request,
  params: Promise<Params>,
  mutation = false,
) {
  const requestId = createApiRequestId();
  try {
    if (mutation) {
      const origin = createMutationOriginProblemResponse(request, requestId);
      if (origin) return origin;
    }
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const p = await params;
    if (
      !z.uuid().safeParse(p.cardId).success ||
      (p.statementId !== undefined &&
        !z.uuid().safeParse(p.statementId).success)
    )
      throw new StatementUnavailableError();
    const scope = {
      userId: actor.actor.userId,
      workspaceId: actor.actor.workspaceId,
      cardId: p.cardId,
    };
    if (mutation) {
      const body = (p.statementId ? reviseBody : createBody).parse(
        await readApiJsonBody(request, statementBodyMaximumBytes),
      );
      const result = await recordCardStatement({
        ...scope,
        ...body,
        ...(p.statementId ? { statementId: p.statementId } : {}),
        requestId: actor.actor.requestId,
      });
      return createApiJsonResponse(result, 201, requestId);
    }
    const url = new URL(request.url),
      offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(url.searchParams.get("offset") ?? 0);
    const result = p.statementId
      ? await getCardStatement({
          ...scope,
          statementId: p.statementId,
          historyOffset: offset,
          ...(url.searchParams.has("revisionId")
            ? { revisionId: z.uuid().parse(url.searchParams.get("revisionId")) }
            : {}),
        })
      : await listCardStatements({ ...scope, offset });
    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof ApiJsonBodyError)
      return createJsonBodyProblemResponse(error, requestId);
    if (error instanceof z.ZodError)
      return createSchemaValidationProblemResponse(error, requestId);
    if (
      error instanceof StatementConflictError ||
      error instanceof FinancialCommandConflictError
    )
      return createApiProblemResponse({
        status: 409,
        code:
          error instanceof FinancialCommandConflictError
            ? "IDEMPOTENCY_CONFLICT"
            : "STATEMENT_CONFLICT",
        message: error.message,
        requestId,
        retryable: false,
      });
    if (
      error instanceof CreditCardUnavailableError ||
      error instanceof StatementUnavailableError ||
      error instanceof FinancialWriteWorkspaceUnavailableError
    )
      return createApiProblemResponse({
        status: 404,
        code: "STATEMENT_UNAVAILABLE",
        message: "The requested private statement or activity is unavailable.",
        requestId,
        retryable: false,
      });
    console.error(`Statement request failed. requestId=${requestId}`);
    return createApiProblemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message:
        "The statement outcome could not be confirmed. Retry the same command.",
      requestId,
      retryable: true,
    });
  }
}
