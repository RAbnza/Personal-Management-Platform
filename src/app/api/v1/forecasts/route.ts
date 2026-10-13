import { z } from "zod";
import { getForecast } from "@/modules/planning/services/get-forecast";
import {
  forecastRangeSchema,
  forecastScenarioSchema,
} from "@/modules/planning/domain/forecast";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createMutationOriginProblemResponse,
  createSchemaValidationProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";
function problem(e: unknown, requestId: string) {
  if (e instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(e, requestId);
  if (e instanceof z.ZodError)
    return createSchemaValidationProblemResponse(e, requestId);
  if (e instanceof RangeError)
    return createApiProblemResponse({
      status: 422,
      code: "FORECAST_INPUT",
      message: e.message,
      requestId,
      retryable: false,
    });
  console.error(`Forecast read failed. requestId=${requestId}`);
  return createApiProblemResponse({
    status: 500,
    code: "INTERNAL_ERROR",
    message:
      "The private forecast could not be calculated. Reload current evidence.",
    requestId,
    retryable: true,
  });
}
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, requestId);
    if (a.kind === "response") return a.response;
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].length !== new Set(params.keys()).size)
      throw new RangeError("Forecast query fields cannot be repeated.");
    return createApiJsonResponse(
      await getForecast({
        userId: a.actor.userId,
        workspaceId: a.actor.workspaceId,
        scenario: forecastRangeSchema.parse(Object.fromEntries(params)),
      }),
      200,
      requestId,
    );
  } catch (e) {
    return problem(e, requestId);
  }
}
/** POST computes a private transient what-if; it never executes a command. */
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const a = await resolveApiActorForRequest(request, requestId);
    if (a.kind === "response") return a.response;
    return createApiJsonResponse(
      await getForecast({
        userId: a.actor.userId,
        workspaceId: a.actor.workspaceId,
        scenario: forecastScenarioSchema.parse(await readApiJsonBody(request)),
      }),
      200,
      requestId,
    );
  } catch (e) {
    return problem(e, requestId);
  }
}
