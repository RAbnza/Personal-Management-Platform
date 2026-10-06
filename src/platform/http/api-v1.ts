import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getServerEnvironment } from "@/platform/env/server";

export type ApiProblem = {
  status: number;

  code: string;
  message: string;

  requestId: string;

  retryable: boolean;

  fieldErrors?: Record<string, string[]>;
};

export function createApiRequestId(): string {
  return randomUUID();
}

function createResponseHeaders(requestId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
  };

  if (requestId) {
    headers["X-Request-Id"] = requestId;
  }

  return headers;
}

export function createApiJsonResponse<TBody>(
  body: TBody,
  status = 200,
  requestId?: string,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: createResponseHeaders(requestId),
  });
}

export function createApiProblemResponse(input: {
  status: number;

  code: string;
  message: string;

  requestId: string;

  retryable: boolean;

  fieldErrors?: Record<string, string[]>;
}): NextResponse {
  const problem: ApiProblem = {
    status: input.status,

    code: input.code,
    message: input.message,

    requestId: input.requestId,

    retryable: input.retryable,

    ...(input.fieldErrors
      ? {
          fieldErrors: input.fieldErrors,
        }
      : {}),
  };

  return createApiJsonResponse(problem, input.status, input.requestId);
}

/**
 * State-changing same-origin routes require the browser's Origin header to
 * match the configured application origin exactly.
 *
 * Safe GET/HEAD reads do not require Origin because browsers and non-browser
 * clients may legitimately omit it.
 */
export function isTrustedSameOriginRequest(
  request: Request,
  expectedOrigin: string = new URL(getServerEnvironment().BETTER_AUTH_URL)
    .origin,
): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  return origin === expectedOrigin;
}
