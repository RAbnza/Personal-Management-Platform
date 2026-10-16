import { z } from "zod";
import {
  createApiRequestId,
  createApiJsonResponse,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import { sharingGate, sharingProblem } from "@/platform/http/sharing";
import { id } from "@/modules/sharing/domain/sharing";
import { exportGroup } from "@/modules/sharing/services/export-group";
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const gate = sharingGate(requestId);
    if (gate) return gate;
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const params = new URL(request.url).searchParams;
    if (params.size !== new Set(params.keys()).size)
      throw new RangeError("Query fields cannot repeat.");
    const { groupId } = z
      .object({ groupId: id })
      .strict()
      .parse(Object.fromEntries(params));
    const response = createApiJsonResponse(
      await exportGroup(actor.actor, groupId),
      200,
      requestId,
    );
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="group-${groupId}.json"`,
    );
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (e) {
    return sharingProblem(e, requestId);
  }
}
