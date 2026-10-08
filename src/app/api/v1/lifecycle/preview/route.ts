import { getDeletionPreview } from "@/modules/core/services/workspace-lifecycle";
import {
  createApiJsonResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import { lifecycleProblem } from "@/platform/http/lifecycle-problem";
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    return createApiJsonResponse(
      await getDeletionPreview({
        userId: actor.actor.userId,
        workspaceId: actor.actor.workspaceId,
      }),
      200,
      requestId,
    );
  } catch (error) {
    return lifecycleProblem(error, requestId);
  }
}
