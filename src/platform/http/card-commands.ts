import { z } from "zod";
import {
  recordCardCommandBodySchema,
  cardAllocationBodySchema,
  reverseCardAllocationBodySchema,
  CardEvidenceConflictError,
  CardEvidenceUnavailableError,
} from "@/modules/finance/domain/card-command";
import {
  statementIdentifierSchema as id,
  StatementUnavailableError,
} from "@/modules/finance/domain/card-statement";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import { recordCardCommand } from "@/modules/finance/services/record-card-command";
import {
  recordCardAllocation,
  reverseCardAllocation,
} from "@/modules/finance/services/card-allocations";
import { getCardCommandSetup } from "@/modules/finance/services/read-card-command-setup";
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
// The path owns the card identity. Validate the complete intent before dispatch.
const bodySchema = z
  .object(recordCardCommandBodySchema.shape)
  .omit({ cardId: true })
  .strict();
export async function handleCardCommand(
  request: Request,
  params: Promise<{ cardId: string }>,
  mode: "read" | "record" | "allocate" | "reverse" = "read",
) {
  const requestId = createApiRequestId();
  try {
    if (mode !== "read") {
      const origin = createMutationOriginProblemResponse(request, requestId);
      if (origin) return origin;
    }
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const parsed = id.safeParse((await params).cardId);
    if (!parsed.success) throw new CardEvidenceUnavailableError();
    const scope = {
      userId: actor.actor.userId,
      workspaceId: actor.actor.workspaceId,
      cardId: parsed.data,
    };
    if (mode === "read") {
      const u = new URL(request.url),
        offset = z.coerce
          .number()
          .int()
          .min(0)
          .max(10000)
          .parse(u.searchParams.get("offset") ?? 0),
        purchaseActionId = u.searchParams.has("purchaseActionId")
          ? id.parse(u.searchParams.get("purchaseActionId"))
          : undefined;
      return createApiJsonResponse(
        await getCardCommandSetup({ ...scope, offset, purchaseActionId }),
        200,
        requestId,
      );
    }
    const raw = await readApiJsonBody(request),
      a = { ...scope, requestId: actor.actor.requestId };
    const result =
      mode === "record"
        ? await recordCardCommand({
            ...recordCardCommandBodySchema.parse({
              ...bodySchema.parse(raw),
              cardId: scope.cardId,
            }),
            ...a,
          })
        : mode === "allocate"
          ? await recordCardAllocation({
              ...cardAllocationBodySchema.parse(raw),
              ...a,
            })
          : await reverseCardAllocation({
              ...reverseCardAllocationBodySchema.parse(raw),
              ...a,
            });
    return createApiJsonResponse(result, 201, requestId);
  } catch (e) {
    if (e instanceof ApiJsonBodyError)
      return createJsonBodyProblemResponse(e, requestId);
    if (e instanceof z.ZodError)
      return createSchemaValidationProblemResponse(e, requestId);
    if (
      e instanceof CardEvidenceConflictError ||
      e instanceof FinancialCommandConflictError
    )
      return createApiProblemResponse({
        status: 409,
        code: "CARD_EVIDENCE_CONFLICT",
        message: e.message,
        requestId,
        retryable: false,
      });
    if (e instanceof RangeError)
      return createApiProblemResponse({
        status: 422,
        code: "INVALID_CARD_EVIDENCE",
        message: e.message,
        requestId,
        retryable: false,
      });
    if (
      e instanceof CardEvidenceUnavailableError ||
      e instanceof StatementUnavailableError ||
      e instanceof CreditCardUnavailableError ||
      e instanceof FinancialWriteWorkspaceUnavailableError ||
      e instanceof FinancialAccountReferenceUnavailableError ||
      e instanceof FinancialCategoryReferenceUnavailableError
    )
      return createApiProblemResponse({
        status: 404,
        code: "CARD_EVIDENCE_UNAVAILABLE",
        message: "The requested private card evidence is unavailable.",
        requestId,
        retryable: false,
      });
    console.error(`Card command outcome unconfirmed. requestId=${requestId}`);
    return createApiProblemResponse({
      status: 500,
      code: "INTERNAL_ERROR",
      message:
        "The outcome could not be confirmed. Retry the identical command.",
      requestId,
      retryable: true,
    });
  }
}
