import { z } from "zod";
import { recordDebtPaymentBodySchema } from "@/modules/finance/domain/debt-payment";
import { recordDebtPayment } from "@/modules/finance/services/record-debt-payment";
import { listDebtPayments } from "@/modules/finance/services/read-debts";
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

const paymentIntentSchema = z
  .object(recordDebtPaymentBodySchema.shape)
  .omit({ debtId: true })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ debtId: string }> },
) {
  const requestId = createApiRequestId();
  try {
    const originProblem = createMutationOriginProblemResponse(
      request,
      requestId,
    );
    if (originProblem) return originProblem;
    const resolution = await resolveApiActorForRequest(request, requestId);
    if (resolution.kind === "response") return resolution.response;
    const { debtId } = z
      .object({ debtId: z.uuid() })
      .parse(await context.params);
    const intent = paymentIntentSchema.parse(await readApiJsonBody(request));
    const body = recordDebtPaymentBodySchema.parse({ ...intent, debtId });
    const result = await recordDebtPayment({
      ...body,
      userId: resolution.actor.userId,
      workspaceId: resolution.actor.workspaceId,
      requestId: resolution.actor.requestId,
    });
    return createApiJsonResponse(
      { actionKind: "debt_payment", ...result },
      201,
      requestId,
    );
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
      await listDebtPayments({
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
