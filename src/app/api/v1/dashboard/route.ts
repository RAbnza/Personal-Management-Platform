import { z } from "zod";
import { getDashboard } from "@/modules/dashboard/services/get-dashboard";
import { dashboardQuerySchema } from "@/modules/reporting/domain/period";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const params = new URL(request.url).searchParams;
    if (new Set(params.keys()).size !== [...params.keys()].length)
      throw new RangeError("Duplicate filters.");
    const query = dashboardQuerySchema.parse(Object.fromEntries(params));
    return createApiJsonResponse(
      await getDashboard({ ...actor.actor, query }),
      200,
      requestId,
    );
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof RangeError;
    return createApiProblemResponse({
      status: invalid ? 400 : 503,
      code: invalid ? "VALIDATION_FAILED" : "TEMPORARY_UNAVAILABLE",
      message: invalid
        ? "Select a valid period of at most 366 days and supported source filters."
        : "Dashboard could not be loaded. Retry shortly.",
      requestId,
      retryable: !invalid,
    });
  }
}
