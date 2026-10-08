import { SettlementPreviewStaleError } from "@/modules/finance/domain/debt-settlement";
import { z } from "zod";
import { PaymentPreviewStaleError } from "@/modules/finance/domain/debt-payment";
import { SchedulePreviewStaleError } from "@/modules/finance/domain/debt-schedule-revision";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { createApiProblemResponse } from "@/platform/http/api-v1";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createSchemaValidationProblemResponse,
} from "@/platform/http/api-v1-mutation";

export function debtProblem(error: unknown, requestId: string) {
  if (error instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(error, requestId);
  if (error instanceof z.ZodError)
    return createSchemaValidationProblemResponse(error, requestId);
  if (error instanceof SettlementPreviewStaleError)
    return createApiProblemResponse({
      status: 409,
      code: "SETTLEMENT_PREVIEW_STALE",
      message: error.message,
      requestId,
      retryable: false,
    });
  if (error instanceof SchedulePreviewStaleError)
    return createApiProblemResponse({
      status: 409,
      code: "SCHEDULE_PREVIEW_STALE",
      message: error.message,
      requestId,
      retryable: false,
    });
  if (error instanceof PaymentPreviewStaleError)
    return createApiProblemResponse({
      status: 409,
      code: "PAYMENT_PREVIEW_STALE",
      message: error.message,
      requestId,
      retryable: false,
    });
  if (error instanceof RangeError)
    return createApiProblemResponse({
      status: 422,
      code: "BUSINESS_RULE_VIOLATION",
      message: error.message,
      requestId,
      retryable: false,
    });
  if (
    error instanceof FinancialAccountReferenceUnavailableError ||
    error instanceof FinancialCategoryReferenceUnavailableError
  )
    return createApiProblemResponse({
      status: 404,
      code:
        error instanceof FinancialAccountReferenceUnavailableError
          ? "FINANCIAL_ACCOUNT_UNAVAILABLE"
          : "FINANCIAL_CATEGORY_UNAVAILABLE",
      message: "The selected private financial reference is unavailable.",
      requestId,
      retryable: false,
    });
  if (
    error instanceof DebtUnavailableError ||
    error instanceof FinancialWriteWorkspaceUnavailableError
  )
    return createApiProblemResponse({
      status: 404,
      code: "DEBT_UNAVAILABLE",
      message: "The requested private debt or workspace is unavailable.",
      requestId,
      retryable: false,
    });
  if (error instanceof FinancialCommandConflictError)
    return createApiProblemResponse({
      status: 409,
      code: "IDEMPOTENCY_CONFLICT",
      message: "This command ID already belongs to a different command.",
      requestId,
      retryable: false,
    });
  if (error instanceof FinancialCommandStateError)
    return createApiProblemResponse({
      status: 503,
      code: "TEMPORARY_UNAVAILABLE",
      message: "Retry the same command to resolve its outcome safely.",
      requestId,
      retryable: true,
    });
  console.error(`Debt request failed. requestId=${requestId}`);
  return createApiProblemResponse({
    status: 500,
    code: "INTERNAL_ERROR",
    message:
      "The request could not be completed. Retain the same command when retrying a save.",
    requestId,
    retryable: false,
  });
}
