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
  getGroupEffectPreview,
  adoptGroupEffect,
  effectReferenceSchema,
  effectAdoptionSchema,
} from "@/modules/finance/services/adopt-group-effect";
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const gate = sharingGate(requestId);
    if (gate) return gate;
    const a = await resolveApiActorForRequest(request, requestId);
    if (a.kind === "response") return a.response;
    const params = new URL(request.url).searchParams;
    if (params.size !== new Set(params.keys()).size)
      throw new RangeError("Query fields cannot repeat.");
    return createApiJsonResponse(
      await getGroupEffectPreview(
        a.actor,
        effectReferenceSchema.parse(Object.fromEntries(params)),
      ),
      200,
      requestId,
    );
  } catch (e) {
    return sharingProblem(e, requestId);
  }
}
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
      await adoptGroupEffect(
        a.actor,
        effectAdoptionSchema.parse(await readApiJsonBody(request)),
      ),
      200,
      requestId,
    );
  } catch (e) {
    return sharingProblem(e, requestId);
  }
}
