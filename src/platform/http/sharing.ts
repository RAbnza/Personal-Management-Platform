import { z } from "zod";
import { createApiProblemResponse } from "./api-v1";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createSchemaValidationProblemResponse,
} from "./api-v1-mutation";
import {
  SharingConflictError,
  SharingUnavailableError,
  sharingEnabled,
} from "@/modules/sharing/domain/sharing";
import { RecentAuthenticationRequiredError } from "@/modules/core/services/workspace-lifecycle";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
export function sharingGate(requestId: string) {
  return sharingEnabled()
    ? null
    : createApiProblemResponse({
        status: 404,
        code: "UNAVAILABLE",
        message: "Shared Expenses preview is unavailable.",
        requestId,
        retryable: false,
      });
}
export function sharingProblem(error: unknown, requestId: string) {
  if (error instanceof z.ZodError)
    return createSchemaValidationProblemResponse(error, requestId);
  if (error instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(error, requestId);
  let candidate = error as { code?: string; cause?: unknown };
  for (let i = 0; i < 5 && candidate?.cause; i++)
    candidate = candidate.cause as typeof candidate;
  const code = candidate?.code;
  const unavailable =
    error instanceof SharingUnavailableError ||
    error instanceof FinancialAccountReferenceUnavailableError ||
    error instanceof FinancialCategoryReferenceUnavailableError ||
    error instanceof CreditCardUnavailableError ||
    error instanceof FinancialWriteWorkspaceUnavailableError;
  const status =
    error instanceof RecentAuthenticationRequiredError
      ? 403
      : error instanceof SharingConflictError ||
          error instanceof FinancialCommandConflictError ||
          code === "40001" ||
          code === "23505"
        ? 409
        : unavailable || code === "42501"
          ? 404
          : error instanceof RangeError || code === "23514" || code === "23503"
            ? 422
            : 500;
  return createApiProblemResponse({
    status,
    code:
      status === 403
        ? "RECENT_AUTH_REQUIRED"
        : status === 409
          ? "SHARING_CONFLICT"
          : status === 404
            ? "SHARING_UNAVAILABLE"
            : status === 422
              ? "SHARING_VALIDATION"
              : "INTERNAL_ERROR",
    message:
      status === 500
        ? "The outcome could not be confirmed. Retry the same command."
        : status === 404
          ? "The group, invitation or private source is unavailable."
          : status === 403
            ? "Verify your password again in Settings before this change."
            : error instanceof SharingConflictError ||
                error instanceof RangeError
              ? error.message
              : status === 409
                ? "The group changed or this command ID was reused. Reload and review."
                : "The request does not satisfy the group or private accounting rules.",
    requestId,
    retryable: status === 500,
  });
}
