import { z } from "zod";
import {
  getTrackerReport,
  trackerReportQuery,
} from "@/modules/trackers/services/reports";
import { TrackerError } from "@/modules/trackers/domain/tracker";
import { serializeCsv } from "@/modules/reporting/services/export-csv";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
export async function GET(request: Request) {
  const id = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    const p = new URL(request.url).searchParams;
    if ([...p.keys()].length !== new Set(p.keys()).size)
      throw new TrackerError(422, "Query fields cannot repeat.");
    const format = p.get("format") ?? "json";
    p.delete("format");
    if (!["json", "csv"].includes(format))
      throw new TrackerError(422, "Choose JSON or CSV.");
    const r = await getTrackerReport(
      a.actor,
      trackerReportQuery.parse(Object.fromEntries(p)),
    );
    if (format === "json") return createApiJsonResponse(r, 200, id);
    const meta = {
      definition_version: r.definitionVersion,
      generated_at: r.context.generatedAt,
      timezone: r.context.timezone,
      period_start: r.period.startDate,
      period_end: r.period.endDate,
      archived_selection: r.filters.archived,
    };
    const rows = [
      ...r.current.map((e) => ({
        ...meta,
        record_kind: "current_entry",
        entry_id: e.id,
        tracker_id: e.tracker_id,
        title: e.title,
        template_version_id: e.template_version_id,
        status: e.statusLabel,
        deadline_date: e.deadline_date ?? "",
        completed_at: e.completed_at ?? "",
        archived: String(e.archived),
      })),
      ...r.events.map((e) => ({
        ...meta,
        record_kind: `activity_${e.kind}`,
        entry_id: e.entryId,
        tracker_id: e.trackerId,
        title: e.title,
        template_version_id: e.versionId,
        recorded_at: e.recordedAt,
        local_date: e.date,
      })),
    ];
    const csv = await serializeCsv(
      rows.length ? rows : [{ ...meta, record_kind: "empty_report" }],
    );
    return new Response(String(csv), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pmp-trackers-${r.period.startDate}-${r.period.endDate}.csv"`,
        "Cache-Control": "no-store",
        "X-Request-Id": id,
      },
    });
  } catch (e) {
    const known =
      e instanceof TrackerError ||
      e instanceof RangeError ||
      e instanceof z.ZodError;
    return createApiProblemResponse({
      status: e instanceof TrackerError ? e.status : known ? 422 : 500,
      code: known ? "TRACKER_REPORT_REJECTED" : "INTERNAL_ERROR",
      message: known ? e.message : "Tracker report unavailable.",
      requestId: id,
      retryable: !known,
    });
  }
}
