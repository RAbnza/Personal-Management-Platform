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
import { id } from "@/modules/sharing/domain/sharing";
import {
  adoptGroupExpense,
  recordIntegratedSharedExpense,
  getAdoptionPreview,
  adoptionSchema,
  integratedExpenseSchema,
} from "@/modules/finance/services/adopt-group-expense";
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const gate =
      sharingGate(requestId) ??
      createMutationOriginProblemResponse(request, requestId);
    if (gate) return gate;
    const a = await resolveApiActorForRequest(request, requestId);
    if (a.kind === "response") return a.response;
    const body = await readApiJsonBody(request);
    return createApiJsonResponse(
      await (typeof body === "object" && body !== null && "groupCommand" in body
        ? recordIntegratedSharedExpense(
            a.actor,
            integratedExpenseSchema.parse(body),
          )
        : adoptGroupExpense(a.actor, adoptionSchema.parse(body))),
      200,
      requestId,
    );
  } catch (e) {
    return sharingProblem(e, requestId);
  }
}
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
    const q = z
      .object({ groupId: id, expenseId: id })
      .strict()
      .parse(Object.fromEntries(params));
    return createApiJsonResponse(
      await getAdoptionPreview(a.actor, q.groupId, q.expenseId),
      200,
      requestId,
    );
  } catch (e) {
    return sharingProblem(e, requestId);
  }
}
