import { z } from "zod";
import {
  correctFinancialActionBodySchema,
  reverseFinancialActionBodySchema,
  resolveClearingBodySchema,
  FinancialCorrectionStaleError,
} from "@/modules/finance/domain/financial-correction";
import { resolvePaymentClearing } from "@/modules/finance/services/resolve-payment-clearing";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import {
  correctFinancialAction,
  reverseFinancialAction,
  getFinancialActionDetail,
} from "@/modules/finance/services/correct-financial-action";
import {
  recordRefund,
  recordRefundBodySchema,
} from "@/modules/finance/services/record-refund";
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
export function financialCorrectionProblem(error: unknown, requestId: string) {
  if (error instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(error, requestId);
  if (error instanceof z.ZodError)
    return createSchemaValidationProblemResponse(error, requestId);
  if (
    error instanceof FinancialAccountReferenceUnavailableError ||
    error instanceof FinancialCategoryReferenceUnavailableError
  )
    return createApiProblemResponse({
      status: 404,
      code: "FINANCIAL_REFERENCE_UNAVAILABLE",
      message: "The selected financial reference is unavailable.",
      retryable: false,
      requestId,
    });
  if (
    error instanceof FinancialCorrectionStaleError ||
    error instanceof FinancialCommandConflictError
  )
    return createApiProblemResponse({
      status: 409,
      code:
        error instanceof FinancialCorrectionStaleError
          ? "FINANCIAL_PREVIEW_STALE"
          : "IDEMPOTENCY_CONFLICT",
      message: error.message,
      retryable: false,
      requestId,
    });
  if (error instanceof RangeError)
    return createApiProblemResponse({
      status: 422,
      code: "BUSINESS_RULE_VIOLATION",
      message: error.message,
      retryable: false,
      requestId,
    });
  let cause = error;
  for (let i = 0; i < 8 && cause && typeof cause === "object"; i++) {
    const e = cause as { code?: string; message?: string; cause?: unknown };
    if (e.code === "23514" && e.message?.startsWith("dependent refunds"))
      return createApiProblemResponse({
        status: 422,
        code: "DEPENDENT_REFUNDS_REQUIRE_RESOLUTION",
        message:
          "Reverse or reallocate dependent refunds explicitly before reducing or recategorizing their purchase or fee portions.",
        retryable: false,
        requestId,
      });
    if (
      e.code === "23514" &&
      e.message?.startsWith("correction would over-repay")
    )
      return createApiProblemResponse({
        status: 422,
        code: "DEPENDENT_PAYMENTS_REQUIRE_RESOLUTION",
        message:
          "Correct dependent payments before reducing the recognized liability they repay.",
        retryable: false,
        requestId,
      });
    cause = e.cause;
  }
  console.error(`Financial correction request failed. requestId=${requestId}`);
  return createApiProblemResponse({
    status: 500,
    code: "INTERNAL_ERROR",
    message:
      "Outcome could not be confirmed. Retain and retry the identical command.",
    retryable: false,
    requestId,
  });
}
export async function financialActionRequest(
  request: Request,
  context: { params: Promise<{ actionId: string }> },
  kind: "detail" | "correct" | "reverse",
) {
  const requestId = createApiRequestId();
  try {
    if (kind !== "detail") {
      const origin = createMutationOriginProblemResponse(request, requestId);
      if (origin) return origin;
    }
    const auth = await resolveApiActorForRequest(request, requestId);
    if (auth.kind === "response") return auth.response;
    const { actionId } = z
        .object({ actionId: z.uuid() })
        .parse(await context.params),
      actor = {
        userId: auth.actor.userId,
        workspaceId: auth.actor.workspaceId,
        requestId: auth.actor.requestId,
        actionId,
      };
    const result =
      kind === "detail"
        ? await getFinancialActionDetail(actor)
        : kind === "correct"
          ? await correctFinancialAction({
              ...actor,
              ...correctFinancialActionBodySchema.parse(
                await readApiJsonBody(request),
              ),
            })
          : await reverseFinancialAction({
              ...actor,
              ...reverseFinancialActionBodySchema.parse(
                await readApiJsonBody(request),
              ),
            });
    return createApiJsonResponse(
      result,
      kind === "detail" ? 200 : 201,
      requestId,
    );
  } catch (e) {
    return financialCorrectionProblem(e, requestId);
  }
}
export async function postRefund(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const auth = await resolveApiActorForRequest(request, requestId);
    if (auth.kind === "response") return auth.response;
    const result = await recordRefund({
      ...recordRefundBodySchema.parse(await readApiJsonBody(request)),
      userId: auth.actor.userId,
      workspaceId: auth.actor.workspaceId,
      requestId: auth.actor.requestId,
    });
    return createApiJsonResponse(result, 201, requestId);
  } catch (e) {
    return financialCorrectionProblem(e, requestId);
  }
}
export async function postClearingResolution(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const auth = await resolveApiActorForRequest(request, requestId);
    if (auth.kind === "response") return auth.response;
    const result = await resolvePaymentClearing({
      ...resolveClearingBodySchema.parse(await readApiJsonBody(request)),
      userId: auth.actor.userId,
      workspaceId: auth.actor.workspaceId,
      requestId: auth.actor.requestId,
    });
    return createApiJsonResponse(result, 201, requestId);
  } catch (e) {
    return financialCorrectionProblem(e, requestId);
  }
}
