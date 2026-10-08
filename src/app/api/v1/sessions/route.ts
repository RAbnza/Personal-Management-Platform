import { z } from "zod";
import {
  listOwnerSessions,
  revokeOwnerSessions,
} from "@/platform/auth/session-management";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import {
  createMutationOriginProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";
import { lifecycleProblem } from "@/platform/http/lifecycle-problem";
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("one"), sessionId: z.uuid() }).strict(),
  z.object({ kind: z.enum(["all", "others"]) }).strict(),
]);
const unauthorized = (requestId: string) =>
  createApiProblemResponse({
    status: 401,
    code: "UNAUTHORIZED",
    message: "Sign in to review sessions.",
    requestId,
    retryable: false,
  });
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const sessions = await listOwnerSessions(request.headers);
    return sessions
      ? createApiJsonResponse({ sessions }, 200, requestId)
      : unauthorized(requestId);
  } catch (error) {
    return lifecycleProblem(error, requestId);
  }
}
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const result = await revokeOwnerSessions(
      request.headers,
      schema.parse(await readApiJsonBody(request)),
    );
    if (!result) return unauthorized(requestId);
    if (!result.found)
      return createApiProblemResponse({
        status: 404,
        code: "NOT_FOUND",
        message: "Session unavailable. Refresh the list.",
        requestId,
        retryable: false,
      });
    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    return lifecycleProblem(error, requestId);
  }
}
