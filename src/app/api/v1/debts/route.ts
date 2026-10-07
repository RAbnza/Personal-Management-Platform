import {
  importDebtBodySchema,
  debtReadQuerySchema,
} from "@/modules/finance/domain/debt";
import { importExistingDebt } from "@/modules/finance/services/import-existing-debt";
import { listDebts } from "@/modules/finance/services/read-debts";
import {
  createApiJsonResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createMutationOriginProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";
import { debtProblem } from "@/platform/http/debt-problem";

export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const resolution = await resolveApiActorForRequest(request, requestId);
    if (resolution.kind === "response") return resolution.response;
    const query = debtReadQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return createApiJsonResponse(
      await listDebts({
        userId: resolution.actor.userId,
        workspaceId: resolution.actor.workspaceId,
        ...query,
      }),
      200,
      requestId,
    );
  } catch (error) {
    return debtProblem(error, requestId);
  }
}
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const originProblem = createMutationOriginProblemResponse(
      request,
      requestId,
    );
    if (originProblem) return originProblem;
    const resolution = await resolveApiActorForRequest(request, requestId);
    if (resolution.kind === "response") return resolution.response;
    const body = importDebtBodySchema.parse(await readApiJsonBody(request));
    const result = await importExistingDebt({
      ...body,
      userId: resolution.actor.userId,
      workspaceId: resolution.actor.workspaceId,
      requestId: resolution.actor.requestId,
    });
    return createApiJsonResponse(result, 201, requestId);
  } catch (error) {
    return debtProblem(error, requestId);
  }
}
