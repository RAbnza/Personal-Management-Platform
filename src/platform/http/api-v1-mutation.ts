import { z } from "zod";

import {
  createApiProblemResponse,
  isTrustedSameOriginRequest,
} from "@/platform/http/api-v1";

export const API_V1_JSON_BODY_MAX_BYTES = 64 * 1024;

export type ApiJsonBodyErrorReason =
  | "unsupported_media_type"
  | "body_too_large"
  | "malformed_content_length"
  | "malformed_json";

export class ApiJsonBodyError extends Error {
  constructor(readonly reason: ApiJsonBodyErrorReason) {
    super(reason);
    this.name = "ApiJsonBodyError";
  }
}

function isJsonMediaType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();

  if (!mediaType) {
    return false;
  }

  return (
    mediaType === "application/json" ||
    /^application\/[a-z0-9!#$&^_.+-]+\+json$/i.test(mediaType)
  );
}

function getDeclaredContentLength(request: Request): number | null {
  const value = request.headers.get("content-length");

  if (value === null) {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    throw new ApiJsonBodyError("malformed_content_length");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ApiJsonBodyError("malformed_content_length");
  }

  return parsed;
}

/**
 * Parse a bounded JSON command body.
 *
 * The service-layer schemas remain authoritative for field validation. This
 * helper is limited to transport concerns: media type, request size and JSON
 * syntax.
 */
export async function readApiJsonBody(
  request: Request,
  maximumBytes = API_V1_JSON_BODY_MAX_BYTES,
): Promise<unknown> {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0 ||
    maximumBytes > 8 * 1024 * 1024
  )
    throw new TypeError("Invalid server-owned JSON body limit.");
  if (!isJsonMediaType(request.headers.get("content-type"))) {
    throw new ApiJsonBodyError("unsupported_media_type");
  }

  const declaredLength = getDeclaredContentLength(request);

  if (declaredLength !== null && declaredLength > maximumBytes) {
    throw new ApiJsonBodyError("body_too_large");
  }

  const text = await request.text();

  const actualLength = new TextEncoder().encode(text).byteLength;

  if (actualLength > maximumBytes) {
    throw new ApiJsonBodyError("body_too_large");
  }

  if (text.trim().length === 0) {
    throw new ApiJsonBodyError("malformed_json");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiJsonBodyError("malformed_json");
  }
}

/**
 * Mutating API requests must originate from the configured application origin.
 *
 * This is separate from authentication: possession of a valid session cookie
 * does not make an arbitrary cross-origin mutation request trusted.
 */
export function createMutationOriginProblemResponse(
  request: Request,
  requestId: string,
  expectedOrigin?: string,
) {
  if (isTrustedSameOriginRequest(request, expectedOrigin)) {
    return null;
  }

  return createApiProblemResponse({
    status: 403,

    code: "FORBIDDEN_ORIGIN",

    message: "The request origin is not permitted.",

    requestId,

    retryable: false,
  });
}

export function createJsonBodyProblemResponse(
  error: ApiJsonBodyError,
  requestId: string,
) {
  switch (error.reason) {
    case "unsupported_media_type":
      return createApiProblemResponse({
        status: 415,

        code: "UNSUPPORTED_MEDIA_TYPE",

        message: "The request body must use application/json.",

        requestId,

        retryable: false,
      });

    case "body_too_large":
      return createApiProblemResponse({
        status: 413,

        code: "REQUEST_TOO_LARGE",

        message: "The request body is too large.",

        requestId,

        retryable: false,
      });

    case "malformed_content_length":
    case "malformed_json":
      return createApiProblemResponse({
        status: 400,

        code: "MALFORMED_JSON",

        message: "The request body is not valid JSON.",

        requestId,

        retryable: false,
      });
  }
}

function buildFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";

    fieldErrors[key] ??= [];
    fieldErrors[key].push(issue.message);
  }

  return fieldErrors;
}

export function createSchemaValidationProblemResponse(
  error: z.ZodError,
  requestId: string,
) {
  return createApiProblemResponse({
    status: 422,

    code: "VALIDATION_FAILED",

    message: "The submitted values are invalid.",

    fieldErrors: buildFieldErrors(error),

    requestId,

    retryable: false,
  });
}
