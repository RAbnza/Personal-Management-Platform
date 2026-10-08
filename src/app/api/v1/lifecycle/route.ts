import { z } from "zod";
import {
  cancelDeletion,
  getLifecycleState,
  lifecyclePolicy,
  requestDeletion,
  deletionCommandSchema,
} from "@/modules/core/services/workspace-lifecycle";
import { resolveLifecycleActor } from "@/platform/auth/lifecycle-actor";
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
const cancelSchema = z.object({ requestId: z.uuid() }).strict();
const unauthorized = (requestId: string) =>
  createApiProblemResponse({
    status: 401,
    code: "UNAUTHORIZED",
    message: "Sign in to review your account lifecycle.",
    requestId,
    retryable: false,
  });
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const actor = await resolveLifecycleActor(request.headers);
    if (!actor) return unauthorized(requestId);
    return createApiJsonResponse(
      {
        request: await getLifecycleState(actor.userId),
        policy: lifecyclePolicy,
      },
      200,
      requestId,
    );
  } catch (error) {
    return lifecycleProblem(error, requestId);
  }
}
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const actor = await resolveLifecycleActor(request.headers);
    if (!actor) return unauthorized(requestId);
    return createApiJsonResponse(
      await requestDeletion(
        actor,
        deletionCommandSchema.parse(await readApiJsonBody(request)),
        request.headers,
      ),
      200,
      requestId,
    );
  } catch (error) {
    return lifecycleProblem(error, requestId);
  }
}
export async function PATCH(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const actor = await resolveLifecycleActor(request.headers);
    if (!actor) return unauthorized(requestId);
    const c = cancelSchema.parse(await readApiJsonBody(request));
    return createApiJsonResponse(
      await cancelDeletion(actor, c.requestId),
      200,
      requestId,
    );
  } catch (error) {
    return lifecycleProblem(error, requestId);
  }
}
