import { z } from "zod";
import { settleDebtBodySchema } from "@/modules/finance/domain/debt-settlement";
import { settleDebt } from "@/modules/finance/services/settle-debt";
import {
  createApiJsonResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import { debtProblem } from "@/platform/http/debt-problem";
import {
  createMutationOriginProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";
const intentSchema = z
  .object(settleDebtBodySchema.shape)
  .omit({ debtId: true })
  .strict();
export async function POST(
  request: Request,
  context: { params: Promise<{ debtId: string }> },
) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const resolution = await resolveApiActorForRequest(request, requestId);
    if (resolution.kind === "response") return resolution.response;
    const { debtId } = z
      .object({ debtId: z.uuid() })
      .parse(await context.params);
    const body = settleDebtBodySchema.parse({
      ...intentSchema.parse(await readApiJsonBody(request, 8 * 1024 * 1024)),
      debtId,
    });
    const result = await settleDebt({
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

import { getDebtWithScheduleHistory } from "@/modules/finance/services/read-debt-schedules";
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
    const loaded = await getDebtWithScheduleHistory({
      userId: resolution.actor.userId,
      workspaceId: resolution.actor.workspaceId,
      debtId,
    });
    return createApiJsonResponse(
      {
        financialRevision: loaded.detail.financialRevision,
        settlement: loaded.settlement,
      },
      200,
      requestId,
    );
  } catch (e) {
    return debtProblem(e, requestId);
  }
}
