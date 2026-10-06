import { isAPIError } from "better-auth/api";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/platform/auth/server";

const verificationRequestSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, "Verification token is required.")
    .max(4096, "Verification token is invalid."),
});

function createJsonResponse(
  body: Record<string, string>,
  status: number,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Consume a verification token from a JSON request body.
 *
 * Better Auth's native verify-email HTTP endpoint accepts its token in the
 * query string. The application intentionally avoids exposing bearer tokens in
 * request URLs, so the browser posts the fragment token here and this route
 * invokes Better Auth directly on the server.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createJsonResponse(
      {
        status: "invalid",
      },
      400,
    );
  }

  const result = verificationRequestSchema.safeParse(body);

  if (!result.success) {
    return createJsonResponse(
      {
        status: "invalid",
      },
      400,
    );
  }

  try {
    await auth.api.verifyEmail({
      query: {
        token: result.data.token,
      },
      headers: request.headers,
    });

    return createJsonResponse(
      {
        status: "verified",
      },
      200,
    );
  } catch (error) {
    if (isAPIError(error)) {
      return createJsonResponse(
        {
          status: "invalid",
        },
        400,
      );
    }

    /*
     * Never log the request body, token or caught error object here.
     * Authentication failures can contain security-sensitive context.
     */
    console.error(
      "Email verification failed because of an unexpected server error.",
    );

    return createJsonResponse(
      {
        status: "error",
      },
      500,
    );
  }
}
