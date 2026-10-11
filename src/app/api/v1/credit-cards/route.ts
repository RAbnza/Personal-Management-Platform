import { z } from "zod";
import {
  createCreditCardInputSchema,
  CreditCardUnavailableError,
} from "@/modules/finance/domain/credit-card";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { createCreditCard } from "@/modules/finance/services/credit-cards";
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

const bodySchema = createCreditCardInputSchema.omit({
  userId: true,
  workspaceId: true,
  requestId: true,
});
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const body = bodySchema.parse(await readApiJsonBody(request));
    const result = await createCreditCard({
      ...body,
      userId: actor.actor.userId,
      workspaceId: actor.actor.workspaceId,
      requestId: actor.actor.requestId,
    });
    // Ledger identity is internal; the UI needs only the card and revisions.
    return createApiJsonResponse(
      {
        cardId: result.cardId,
        version: result.version,
        financialRevision: result.financialRevision,
      },
      201,
      requestId,
    );
  } catch (error) {
    if (error instanceof ApiJsonBodyError)
      return createJsonBodyProblemResponse(error, requestId);
    if (error instanceof z.ZodError)
      return createSchemaValidationProblemResponse(error, requestId);
    if (error instanceof FinancialCommandConflictError)
      return createApiProblemResponse({
        status: 409,
        code: "IDEMPOTENCY_CONFLICT",
        message: "This command ID was used for different card details.",
        requestId,
        retryable: false,
      });
    if (
      error instanceof CreditCardUnavailableError ||
      error instanceof FinancialWriteWorkspaceUnavailableError
    )
      return createApiProblemResponse({
        status: 404,
        code: "CREDIT_CARD_UNAVAILABLE",
        message: "The requested private card is unavailable.",
        requestId,
        retryable: false,
      });
    console.error(`Card creation failed. requestId=${requestId}`);
    return createApiProblemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "The save could not be confirmed. Retry the same command.",
      requestId,
      retryable: true,
    });
  }
}
