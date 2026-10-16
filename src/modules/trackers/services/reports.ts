import { sql } from "drizzle-orm";
import { trackersEnabled } from "../feature";
import { z } from "zod";
import {
  withDomainTransaction,
  type ScopedDatabaseContext,
  type ScopedTransaction,
} from "@/platform/db";
import { readReportContext } from "@/modules/reporting/repositories/report-context-repository";
import { resolveReportPeriod } from "@/modules/reporting/domain/period";
import { readDefinition } from "../repositories/trackers";
import { TrackerError, validateValues, type Value } from "../domain/tracker";
export const trackerReportQuery = z
  .object({
    period: z
      .enum(["week", "month", "quarter", "year", "custom"])
      .default("month"),
    startDate: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().optional(),
    ),
    endDate: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().optional(),
    ),
    trackerId: z.uuid().optional(),
    archived: z.enum(["active", "archived", "all"]).default("active"),
  })
  .strict();
export async function trackerReportInTransaction(
  t: ScopedTransaction,
  workspaceId: string,
  raw: z.input<typeof trackerReportQuery> = {},
) {
  if (!trackersEnabled()) throw new TrackerError(404, "Trackers unavailable.");
  const q = trackerReportQuery.parse(raw),
    context = await readReportContext(t, workspaceId),
    period = resolveReportPeriod(
      {
        period: q.period,
        ...(q.startDate ? { startDate: q.startDate } : {}),
        ...(q.endDate ? { endDate: q.endDate } : {}),
      },
      context.today,
      context.weekStart,
    );
  if (
    q.trackerId &&
    !(
      await t.db.execute(
        sql`SELECT id FROM tracker.tracker WHERE id=${q.trackerId}::uuid`,
      )
    ).rows.length
  )
    throw new TrackerError(404, "Private tracker unavailable.");
  const entries = (
    await t.db.execute<{
      id: string;
      tracker_id: string;
      tracker_name: string;
      title: string;
      template_version_id: string;
      status_key: string | null;
      completed_at: string | null;
      archived: boolean;
      deadline_date: string | null;
    }>(
      sql`SELECT e.id,e.tracker_id,t.name tracker_name,e.title,e.template_version_id,e.status_key,e.completed_at::text,(e.archived_at IS NOT NULL OR t.archived_at IS NOT NULL) archived,e.deadline_date::text FROM tracker.entry e JOIN tracker.tracker t ON t.workspace_id=e.workspace_id AND t.id=e.tracker_id WHERE (${q.trackerId ?? null}::uuid IS NULL OR t.id=${q.trackerId ?? null}::uuid) AND (${q.archived}='all' OR (e.archived_at IS NOT NULL OR t.archived_at IS NOT NULL)=(${q.archived}='archived')) ORDER BY t.name,e.id LIMIT 10001`,
    )
  ).rows;
  if (entries.length > 10000)
    throw new TrackerError(
      422,
      "Filter this report to at most 10,000 entries.",
    );
  const activity = (
    await t.db.execute<{
      id: string;
      entry_id: string;
      tracker_id: string;
      title: string;
      template_version_id: string;
      values_json: Record<string, Value>;
      previous_revision_id: string | null;
      reason: string;
      command_type: string;
      revision_no: number;
      created_at: string;
      local_date: string;
      previous_version_id: string | null;
      previous_values: Record<string, Value> | null;
    }>(
      sql`SELECT r.id,r.entry_id,e.tracker_id,e.title,r.template_version_id,r.values_json,r.previous_revision_id,r.reason,c.command_type,r.revision_no,r.created_at::text,(r.created_at AT TIME ZONE ${context.timezone})::date::text local_date,p.template_version_id previous_version_id,p.values_json previous_values FROM tracker.entry_revision r JOIN core.command_receipt c ON c.id=r.command_receipt_id AND c.workspace_id=r.workspace_id JOIN tracker.entry e ON e.id=r.entry_id AND e.workspace_id=r.workspace_id JOIN tracker.tracker t ON t.id=e.tracker_id AND t.workspace_id=e.workspace_id LEFT JOIN tracker.entry_revision p ON p.workspace_id=r.workspace_id AND p.id=r.previous_revision_id WHERE (${q.trackerId ?? null}::uuid IS NULL OR t.id=${q.trackerId ?? null}::uuid) AND (${q.archived}='all' OR (e.archived_at IS NOT NULL OR t.archived_at IS NOT NULL)=(${q.archived}='archived')) AND (r.created_at AT TIME ZONE ${context.timezone})::date>=${period.startDate}::date AND (r.created_at AT TIME ZONE ${context.timezone})::date<${period.endDateExclusive}::date ORDER BY r.created_at,r.id LIMIT 20001`,
    )
  ).rows;
  if (activity.length > 20000)
    throw new TrackerError(
      422,
      "Narrow this report to at most 20,000 revisions.",
    );
  const versions = new Map<
    string,
    Awaited<ReturnType<typeof readDefinition>>
  >();
  for (const id of new Set([
    ...entries.map((e) => e.template_version_id),
    ...activity.flatMap((r) => [
      r.template_version_id,
      ...(r.previous_version_id ? [r.previous_version_id] : []),
    ]),
  ]))
    versions.set(id, await readDefinition(t, id));
  const events = activity.map((r) => {
    const d = versions.get(r.template_version_id)!.definition,
      done = validateValues(d, r.values_json).completed,
      previous =
        r.previous_values && r.previous_version_id
          ? validateValues(
              versions.get(r.previous_version_id)!.definition,
              r.previous_values,
            ).completed
          : false;
    const migration = r.command_type === "tracker.batch";
    return {
      revisionId: r.id,
      entryId: r.entry_id,
      trackerId: r.tracker_id,
      title: validateValues(d, r.values_json).title,
      versionId: r.template_version_id,
      date: r.local_date,
      kind: migration
        ? "template_migration"
        : r.revision_no === 1
          ? "created"
          : done && !previous
            ? "completed"
            : !done && previous
              ? "reopened"
              : "edited",
      recordedAt: r.created_at,
    };
  });
  const coverage = [...versions.values()].map((v) => ({
    versionId: v.id,
    templateId: v.templateId,
    name: v.definition.name,
    versionNo: v.versionNo,
    completionMapped:
      v.definition.completionKey !== null ||
      v.definition.completedStatusKeys.length > 0,
    currentEntries: entries.filter((e) => e.template_version_id === v.id)
      .length,
  }));
  const current = entries.map((e) => {
    const d = versions.get(e.template_version_id)!.definition;
    return {
      ...e,
      statusLabel:
        d.fields
          .find((f) => f.key === d.statusKey)
          ?.options.find((o) => o.key === e.status_key)?.label ??
        "No mapped status",
      completionMapped:
        d.completionKey !== null || d.completedStatusKeys.length > 0,
      href: `/trackers/entries/${e.id}`,
    };
  });
  const eligible = current.filter((e) => e.completionMapped),
    counts = {
      entries: current.length,
      completionEligible: eligible.length,
      completed: eligible.filter((e) => e.completed_at !== null).length,
      overdue: current.filter(
        (e) =>
          !e.completed_at &&
          e.deadline_date !== null &&
          e.deadline_date < context.today &&
          !e.archived,
      ).length,
      created: events.filter((e) => e.kind === "created").length,
      completedTransitions: events.filter((e) => e.kind === "completed").length,
      reopened: events.filter((e) => e.kind === "reopened").length,
      edits: events.filter((e) => e.kind === "edited").length,
      migrationRevisions: events.filter((e) => e.kind === "template_migration")
        .length,
    };
  return {
    definitionVersion: "v3-trackers-recorded-activity-1",
    context,
    period,
    filters: q,
    counts,
    coverage,
    current,
    events,
    semantics:
      "Current state is a snapshot, not period-end reconstruction. Activity uses immutable revisions in workspace local dates. A creation already completed counts as created, not a later completion transition. Template migration revisions are separate from user activity. Manually entered completion dates never become recorded transitions. Archived selection uses current entry or tracker archival state; incompatible completion mappings are excluded from the progress denominator.",
  };
}
export function getTrackerReport(
  actor: ScopedDatabaseContext,
  query: z.input<typeof trackerReportQuery> = {},
) {
  return withDomainTransaction(
    actor,
    (t) => trackerReportInTransaction(t, actor.workspaceId, query),
    { readOnlySnapshot: true },
  );
}
