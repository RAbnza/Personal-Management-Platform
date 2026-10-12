import { z } from "zod";
import {
  createCreditCardInputSchema,
  updateCreditCardInputSchema,
  CreditCardVersionConflictError,
  CreditCardUnavailableError,
} from "@/modules/finance/domain/credit-card";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import {
  createCreditCard,
  updateCreditCard,
} from "@/modules/finance/services/credit-cards";
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
async function mutate(request: Request, update: boolean) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const raw = await readApiJsonBody(request);
    const scope = {
      userId: actor.actor.userId,
      workspaceId: actor.actor.workspaceId,
      requestId: actor.actor.requestId,
    };
    const result = update
      ? await updateCreditCard({
          ...updateCreditCardInputSchema
            .omit({ userId: true, workspaceId: true, requestId: true })
            .parse(raw),
          ...scope,
        })
      : await createCreditCard({ ...bodySchema.parse(raw), ...scope });
    // Ledger identity is internal; the UI needs only the card and revisions.
    return createApiJsonResponse(
      {
        cardId: result.cardId,
        version: result.version,
        financialRevision: result.financialRevision,
      },
      update ? 200 : 201,
      requestId,
    );
  } catch (error) {
    if (error instanceof ApiJsonBodyError)
      return createJsonBodyProblemResponse(error, requestId);
    if (error instanceof z.ZodError)
      return createSchemaValidationProblemResponse(error, requestId);
    if (error instanceof CreditCardVersionConflictError)
      return createApiProblemResponse({
        status: 409,
        code: "CREDIT_CARD_VERSION_CONFLICT",
        message: error.message,
        requestId,
        retryable: false,
      });
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
    console.error(`Card metadata mutation failed. requestId=${requestId}`);
    return createApiProblemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "The save could not be confirmed. Retry the same command.",
      requestId,
      retryable: true,
    });
  }
}

export const POST = (request: Request) => mutate(request, false);
export const PATCH = (request: Request) => mutate(request, true);
