import { z } from "zod";
import { reviseDebtScheduleBodySchema } from "@/modules/finance/domain/debt-schedule-revision";
import { reviseDebtSchedule } from "@/modules/finance/services/revise-debt-schedule";
import { listDebtSchedules } from "@/modules/finance/services/read-debt-schedules";
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
  .object(reviseDebtScheduleBodySchema.shape)
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
    const body = reviseDebtScheduleBodySchema.parse({
      // Bounded full revisions can carry 360 terms and 10,000 source maps.
      ...intentSchema.parse(await readApiJsonBody(request, 8 * 1024 * 1024)),
      debtId,
    });
    const result = await reviseDebtSchedule({
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
    const query = z
      .object({ after: z.uuid().optional() })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return createApiJsonResponse(
      await listDebtSchedules({
        userId: resolution.actor.userId,
        workspaceId: resolution.actor.workspaceId,
        debtId,
        ...query,
      }),
      200,
      requestId,
    );
  } catch (error) {
    return debtProblem(error, requestId);
  }
}
