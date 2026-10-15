import {
  createApiRequestId,
  createApiJsonResponse,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createMutationOriginProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";
import { sharingGate, sharingProblem } from "@/platform/http/sharing";
import {
  invitationCommand,
  invitationCommandSchema,
} from "@/modules/sharing/services/invitations";
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const gate =
      sharingGate(requestId) ??
      createMutationOriginProblemResponse(request, requestId);
    if (gate) return gate;
    const a = await resolveApiActorForRequest(request, requestId);
    if (a.kind === "response") return a.response;
    return createApiJsonResponse(
      await invitationCommand(
        a.actor,
        invitationCommandSchema.parse(await readApiJsonBody(request)),
      ),
      200,
      requestId,
    );
  } catch (e) {
    return sharingProblem(e, requestId);
  }
}
