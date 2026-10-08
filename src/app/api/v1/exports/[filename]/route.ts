import { z } from "zod";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createApiRequestId,
  createApiProblemResponse,
} from "@/platform/http/api-v1";
import {
  prepareCsvExport,
  exportKindSchema,
} from "@/modules/reporting/services/export-csv";
import {
  reportQuerySchema,
  ReportLimitError,
} from "@/modules/reporting/domain/reports";
import { reportSearchParams } from "@/modules/reporting/domain/search-params";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const requestId = createApiRequestId();
  try {
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const { filename } = await params;
    const kind = exportKindSchema.safeParse(
      filename.endsWith(".csv") ? filename.slice(0, -4) : "",
    );
    if (!kind.success)
      return createApiProblemResponse({
        status: 404,
        code: "UNAVAILABLE",
        message: "Export unavailable.",
        requestId,
        retryable: false,
      });
    const result = await prepareCsvExport({
      ...actor.actor,
      kind: kind.data,
      query: reportQuerySchema.parse(
        reportSearchParams(new URL(request.url).searchParams),
      ),
    });
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= result.buffer.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 65536, result.buffer.length);
        controller.enqueue(new Uint8Array(result.buffer.subarray(offset, end)));
        offset = end;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
        "X-Export-Run-Id": result.exportRunId,
        "X-Export-Row-Count": String(result.rowCount),
      },
    });
  } catch (error) {
    const limited = error instanceof ReportLimitError,
      invalid = error instanceof z.ZodError || error instanceof RangeError;
    return createApiProblemResponse({
      status: limited ? 413 : invalid ? 400 : 503,
      code: limited
        ? "EXPORT_LIMIT"
        : invalid
          ? "VALIDATION_FAILED"
          : "TEMPORARY_UNAVAILABLE",
      message: limited
        ? "Choose a smaller export range (10,000 rows, 10 MiB maximum)."
        : invalid
          ? "Choose supported filters and valid dates."
          : "CSV could not be prepared. Retry shortly.",
      requestId,
      retryable: !invalid && !limited,
    });
  }
}
