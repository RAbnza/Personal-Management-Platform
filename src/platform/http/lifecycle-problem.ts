import { z } from "zod";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import {
  LifecycleConflictError,
  LifecycleUnavailableError,
  RecentAuthenticationRequiredError,
} from "@/modules/core/services/workspace-lifecycle";
import { createApiProblemResponse } from "./api-v1";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createSchemaValidationProblemResponse,
} from "./api-v1-mutation";

export function lifecycleProblem(error: unknown, requestId: string) {
  if (error instanceof z.ZodError)
    return createSchemaValidationProblemResponse(error, requestId);
  if (error instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(error, requestId);
  const recent = error instanceof RecentAuthenticationRequiredError;
  const conflict =
    error instanceof LifecycleConflictError ||
    error instanceof CommandReceiptConflictError;
  const missing =
    error instanceof LifecycleUnavailableError ||
    error instanceof PrivateDomainWriteUnavailableError;
  return createApiProblemResponse({
    status: recent ? 403 : conflict ? 409 : missing ? 404 : 503,
    code: recent
      ? "RECENT_AUTH_REQUIRED"
      : error instanceof CommandReceiptConflictError
        ? "IDEMPOTENCY_CONFLICT"
        : conflict
          ? "STALE_VERSION"
          : missing
            ? "NOT_FOUND"
            : "SAVE_OUTCOME_UNKNOWN",
    message: recent
      ? "Verify your password again before this action."
      : conflict
        ? "The command or reviewed version changed. Reload and review again."
        : missing
          ? "This private action is unavailable."
          : "The result could not be confirmed. Check current status before retrying the same command.",
    requestId,
    retryable: !recent && !conflict && !missing,
  });
}
