import { z } from "zod";
import { statementIdentifierSchema as id } from "@/modules/finance/domain/card-statement";
import {
  cardInstallmentCommandSchema,
  cardInstallmentApplicationSchema,
  reverseInstallmentApplicationSchema,
  CardInstallmentConflictError,
  CardInstallmentUnavailableError,
} from "@/modules/finance/domain/card-installment";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import {
  recordCardInstallmentPlan,
  recordInstallmentApplication,
  reverseInstallmentApplication,
} from "@/modules/finance/services/card-installments";
import {
  listCardInstallmentPlans,
  getCardInstallmentPlan,
  getCardInstallmentSetup,
} from "@/modules/finance/services/read-card-installments";
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
const bodySchema = z
  .object(cardInstallmentCommandSchema.shape)
  .omit({ cardId: true, planId: true })
  .strict();
type Params = { cardId: string; planId?: string };
type Mode = "read" | "setup" | "record" | "apply" | "reverse";
// 360 bounded schedule lines, references and notes may require up to 8 MiB in UTF-8.
const planBodyMaximumBytes = 8 * 1024 * 1024;
const pageOffset = z.coerce.number().int().min(0).max(10000);
export async function handleCardInstallment(
  request: Request,
  params: Promise<Params>,
  mode: Mode = "read",
) {
  const requestId = createApiRequestId();
  try {
    if (!["read", "setup"].includes(mode)) {
      const origin = createMutationOriginProblemResponse(request, requestId);
      if (origin) return origin;
    }
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const paths = await params,
      card = id.safeParse(paths.cardId),
      plan = paths.planId === undefined ? null : id.safeParse(paths.planId);
    if (!card.success || (plan !== null && !plan.success))
      throw new CardInstallmentUnavailableError();
    const scope = {
        userId: actor.actor.userId,
        workspaceId: actor.actor.workspaceId,
        cardId: card.data,
      },
      planId = plan?.success ? plan.data : undefined;
    if (mode === "read" || mode === "setup") {
      const url = new URL(request.url),
        offset = pageOffset.parse(url.searchParams.get("offset") ?? 0),
        purchaseActionId = url.searchParams.has("purchaseActionId")
          ? id.parse(url.searchParams.get("purchaseActionId"))
          : undefined;
      const result =
        mode === "setup"
          ? await getCardInstallmentSetup({
              ...scope,
              offset,
              purchaseActionId,
            })
          : planId
            ? await getCardInstallmentPlan({
                ...scope,
                planId,
                historyOffset: offset,
                applicationOffset: pageOffset.parse(
                  url.searchParams.get("applicationOffset") ?? 0,
                ),
                choiceOffset: pageOffset.parse(
                  url.searchParams.get("choiceOffset") ?? 0,
                ),
                ...(url.searchParams.has("revisionId")
                  ? { revisionId: id.parse(url.searchParams.get("revisionId")) }
                  : {}),
                ...(url.searchParams.has("asOfDate")
                  ? { asOfDate: url.searchParams.get("asOfDate")! }
                  : {}),
              })
            : await listCardInstallmentPlans({
                ...scope,
                offset,
                purchaseActionId,
              });
      return createApiJsonResponse(result, 200, requestId);
    }
    const raw = await readApiJsonBody(
        request,
        mode === "record" ? planBodyMaximumBytes : undefined,
      ),
      attribution = { ...scope, requestId: actor.actor.requestId };
    if (mode !== "record" && !planId)
      throw new CardInstallmentUnavailableError();
    const result =
      mode === "record"
        ? await recordCardInstallmentPlan({
            ...cardInstallmentCommandSchema.parse({
              ...bodySchema.parse(raw),
              cardId: scope.cardId,
              ...(planId ? { planId } : {}),
            }),
            ...attribution,
          })
        : mode === "apply"
          ? await recordInstallmentApplication({
              ...cardInstallmentApplicationSchema.parse(raw),
              ...attribution,
              planId: planId!,
            })
          : await reverseInstallmentApplication({
              ...reverseInstallmentApplicationSchema.parse(raw),
              ...attribution,
              planId: planId!,
            });
    return createApiJsonResponse(result, 201, requestId);
  } catch (e) {
    if (e instanceof ApiJsonBodyError)
      return createJsonBodyProblemResponse(e, requestId);
    if (e instanceof z.ZodError)
      return createSchemaValidationProblemResponse(e, requestId);
    if (
      e instanceof CardInstallmentConflictError ||
      e instanceof FinancialCommandConflictError
    )
      return createApiProblemResponse({
        status: 409,
        code:
          e instanceof FinancialCommandConflictError
            ? "IDEMPOTENCY_CONFLICT"
            : "INSTALLMENT_EVIDENCE_CONFLICT",
        message: e.message,
        requestId,
        retryable: false,
      });
    if (
      e instanceof CardInstallmentUnavailableError ||
      e instanceof CreditCardUnavailableError ||
      e instanceof FinancialWriteWorkspaceUnavailableError
    )
      return createApiProblemResponse({
        status: 404,
        code: "INSTALLMENT_EVIDENCE_UNAVAILABLE",
        message: "The requested private installment evidence is unavailable.",
        requestId,
        retryable: false,
      });
    if (e instanceof RangeError)
      return createApiProblemResponse({
        status: 422,
        code: "INVALID_INSTALLMENT_EVIDENCE",
        message: e.message,
        requestId,
        retryable: false,
      });
    console.error(
      `Installment command outcome unconfirmed. requestId=${requestId}`,
    );
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
