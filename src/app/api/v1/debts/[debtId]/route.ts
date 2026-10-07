import { z } from "zod";
import { getDebtDetail } from "@/modules/finance/services/read-debts";
import {
  createApiJsonResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import { debtProblem } from "@/platform/http/debt-problem";

export async function GET(
  request: Request,
  context: { params: Promise<{ debtId: string }> },
) {
  const requestId = createApiRequestId();
  try {
    const resolution = await resolveApiActorForRequest(request, requestId);
    if (resolution.kind === "response") return resolution.response;
    const { debtId } = z
      .object({ debtId: z.uuid() })
      .parse(await context.params);
    const result = await getDebtDetail({
      userId: resolution.actor.userId,
      workspaceId: resolution.actor.workspaceId,
      debtId,
    });
    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    return debtProblem(error, requestId);
  }
}
