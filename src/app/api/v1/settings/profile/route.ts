import {
  createApiJsonResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createMutationOriginProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";
import { lifecycleProblem } from "@/platform/http/lifecycle-problem";
import {
  getIdentityProfile,
  updateProfile,
  profileCommandSchema,
} from "@/modules/core/services/profile";

export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    return createApiJsonResponse(
      await getIdentityProfile(actor.actor.userId),
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
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    return createApiJsonResponse(
      await updateProfile(
        {
          userId: actor.actor.userId,
          workspaceId: actor.actor.workspaceId,
          requestId,
        },
        profileCommandSchema.parse(await readApiJsonBody(request)),
      ),
      200,
      requestId,
    );
  } catch (error) {
    return lifecycleProblem(error, requestId);
  }
}
