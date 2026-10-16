import { z } from "zod";
import { FileBoundaryError } from "@/modules/files/domain/supporting-file";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
import { createApiProblemResponse } from "./api-v1";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createSchemaValidationProblemResponse,
} from "./api-v1-mutation";
export function hProblem(e: unknown, id: string) {
  if (
    e instanceof FileBoundaryError &&
    e.code === "TRACKER_PORTABILITY_PENDING"
  )
    return createApiProblemResponse({
      status: 409,
      code: e.code,
      message:
        "Workspace export and replacement are unavailable while tracker records exist in this preview. Tracker definitions and history must be supported before these operations can proceed.",
      requestId: id,
      retryable: false,
    });
  if (
    e instanceof Error &&
    [
      "BUNDLE_DUPLICATE_JSON_KEY",
      "BUNDLE_NESTING_LIMIT",
      "BUNDLE_VALUE_LIMIT",
    ].includes(e.message)
  )
    return createApiProblemResponse({
      status: 400,
      code: "INVALID_PORTABLE_JSON",
      message: "Ambiguous or excessive JSON cannot be accepted.",
      requestId: id,
      retryable: false,
    });
  if (e instanceof SyntaxError)
    return createApiProblemResponse({
      status: 400,
      code: "INVALID_PORTABLE_JSON",
      message: "A valid bounded JSON document is required.",
      requestId: id,
      retryable: false,
    });
  if (e instanceof z.ZodError)
    return createSchemaValidationProblemResponse(e, id);
  if (e instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(e, id);
  if (
    e instanceof FileBoundaryError ||
    e instanceof CommandReceiptConflictError
  )
    return createApiProblemResponse({
      status:
        e.code.includes("STORAGE") || e.code.includes("SCANNER")
          ? 503
          : e.code.includes("UNAVAILABLE") || e.code.includes("UNLINKED")
            ? 404
            : 409,
      code: e.code,
      message:
        "The private operation cannot proceed. Refresh its evidence or retry the identical command.",
      requestId: id,
      retryable: false,
    });
  return createApiProblemResponse({
    status: 503,
    code: "PORTABILITY_UNAVAILABLE",
    message:
      "The operation could not be confirmed. Retry with the identical command.",
    requestId: id,
    retryable: true,
  });
}
