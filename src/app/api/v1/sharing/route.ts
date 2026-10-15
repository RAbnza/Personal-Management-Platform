import { z } from "zod";
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
import { recordGroupCommand } from "@/modules/sharing/services/groups";
import {
  listGroups,
  getGroup,
  getBill,
} from "@/modules/sharing/services/read-groups";
import { id, groupCommandSchema } from "@/modules/sharing/domain/sharing";
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
      await recordGroupCommand(
        a.actor,
        groupCommandSchema.parse(await readApiJsonBody(request)),
      ),
      200,
      requestId,
    );
  } catch (e) {
    return sharingProblem(e, requestId);
  }
}
const query = z
  .object({
    groupId: id.optional(),
    expenseId: id.optional(),
    cursor: id.optional(),
  })
  .strict();
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
    const q = query.parse(Object.fromEntries(params));
    if (q.expenseId && !q.groupId) throw new RangeError("Select a group.");
    const result = q.groupId
      ? q.expenseId
        ? await getBill(a.actor, q.groupId, q.expenseId)
        : await getGroup(a.actor, q.groupId, q.cursor)
      : await listGroups(a.actor);
    return createApiJsonResponse(result, 200, requestId);
  } catch (e) {
    return sharingProblem(e, requestId);
  }
}
