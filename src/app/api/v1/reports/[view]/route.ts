import { z } from "zod";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createApiRequestId,
  createApiJsonResponse,
  createApiProblemResponse,
} from "@/platform/http/api-v1";
import {
  getFinancialReport,
  getCareerReport,
  getFinancialDetail,
} from "@/modules/reporting/services/get-reports";
import {
  reportQuerySchema,
  financialDetailQuerySchema,
  ReportLimitError,
} from "@/modules/reporting/domain/reports";
import { reportSearchParams } from "@/modules/reporting/domain/search-params";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ view: string }> },
) {
  const requestId = createApiRequestId();
  try {
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const { view } = await params,
      query = reportSearchParams(new URL(request.url).searchParams);
    if (!["financial", "career", "contributions"].includes(view))
      return createApiProblemResponse({
        status: 404,
        code: "UNAVAILABLE",
        message: "Report unavailable.",
        requestId,
        retryable: false,
      });
    const result =
      view === "contributions"
        ? await getFinancialDetail({
            ...actor.actor,
            query: financialDetailQuerySchema.parse(query),
          })
        : view === "career"
          ? await getCareerReport({
              ...actor.actor,
              query: reportQuerySchema.parse(query),
            })
          : await getFinancialReport({
              ...actor.actor,
              query: reportQuerySchema.parse(query),
            });
    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    const limited = error instanceof ReportLimitError,
      invalid = error instanceof z.ZodError || error instanceof RangeError;
    return createApiProblemResponse({
      status: limited ? 413 : invalid ? 400 : 503,
      code: limited
        ? "REPORT_LIMIT"
        : invalid
          ? "VALIDATION_FAILED"
          : "TEMPORARY_UNAVAILABLE",
      message: limited
        ? "Choose a smaller report range (up to 10,000 detail rows)."
        : invalid
          ? "Choose supported filters and valid dates (up to 366 days); Career as-of dates cannot be in the future."
          : "Report could not be loaded. Retry shortly.",
      requestId,
      retryable: !invalid && !limited,
    });
  }
}
