import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  withDomainTransaction,
  type ScopedDatabaseContext,
} from "@/platform/db";
import { trackersEnabled } from "../feature";
import { TrackerError, trackerId } from "../domain/tracker";
import {
  readTracker,
  readEntry,
  readDefinition,
  readMigration,
  type EntryRow,
  type TrackerRow,
} from "../repositories/trackers";
export const querySchema = z
  .object({
    view: z
      .enum([
        "overview",
        "tracker",
        "entry",
        "template",
        "migration",
        "version",
      ])
      .default("overview"),
    id: trackerId.optional(),
    cursor: trackerId.optional(),
    templateCursor: trackerId.optional(),
    search: z.string().max(120).default(""),
    status: z.string().max(40).default(""),
    archived: z.enum(["active", "archived", "all"]).default("active"),
  })
  .strict();
export type TrackerQuery = z.input<typeof querySchema>;
export async function readTrackers(
  actor: ScopedDatabaseContext,
  raw: TrackerQuery = {},
) {
  if (!trackersEnabled())
    throw new TrackerError(404, "Tracker preview unavailable.");
  const q = querySchema.parse(raw);
  return withDomainTransaction(
    actor,
    async (t) => {
      if (q.view === "overview") {
        const trackers = (
          await t.db.execute<TrackerRow>(
            sql`SELECT id,template_id,template_version_id,name,archived_at::text,version FROM tracker.tracker WHERE (${q.archived}='all' OR (archived_at IS NOT NULL)=(${q.archived}='archived')) AND (${q.cursor ?? null}::uuid IS NULL OR id>${q.cursor ?? null}::uuid) ORDER BY id LIMIT 51`,
          )
        ).rows;
        const templates = (
          await t.db.execute<{
            id: string;
            name: string;
            current_version_id: string;
            archived_at: string | null;
            version: number;
          }>(
            sql`SELECT id,name,current_version_id,archived_at::text,version FROM tracker.template WHERE (${q.templateCursor ?? null}::uuid IS NULL OR id>${q.templateCursor ?? null}::uuid) ORDER BY id LIMIT 51`,
          )
        ).rows;
        return {
          view: "overview" as const,
          trackers: trackers.slice(0, 50),
          nextCursor: trackers.length > 50 ? trackers[49]!.id : null,
          templates: templates.slice(0, 50),
          nextTemplateCursor: templates.length > 50 ? templates[49]!.id : null,
        };
      }
      if (!q.id) throw new TrackerError(422, "Select a private record.");
      if (q.view === "version")
        return {
          view: "version" as const,
          definition: await readDefinition(t, q.id),
        };
      if (q.view === "template") {
        const template = (
          await t.db.execute<{
            id: string;
            name: string;
            current_version_id: string;
            archived_at: string | null;
            version: number;
          }>(
            sql`SELECT id,name,current_version_id,archived_at::text,version FROM tracker.template WHERE id=${q.id}::uuid`,
          )
        ).rows[0];
        if (!template)
          throw new TrackerError(404, "Private template unavailable.");
        const versions = (
          await t.db.execute<{
            id: string;
            version_no: number;
            name: string;
            reason: string;
          }>(
            sql`SELECT id,version_no,name,reason FROM tracker.template_version WHERE template_id=${q.id}::uuid AND state='published' AND (${q.cursor ?? null}::uuid IS NULL OR version_no<(SELECT version_no FROM tracker.template_version WHERE template_id=${q.id}::uuid AND id=${q.cursor ?? null}::uuid)) ORDER BY version_no DESC LIMIT 51`,
          )
        ).rows;
        return {
          view: "template" as const,
          template,
          versions: versions.slice(0, 50),
          nextVersionCursor: versions.length > 50 ? versions[49]!.id : null,
          current: await readDefinition(t, template.current_version_id),
        };
      }
      if (q.view === "entry") {
        const entry = await readEntry(t, q.id),
          tr = await readTracker(t, entry.tracker_id);
        const history = (
          await t.db.execute<{
            id: string;
            revision_no: number;
            template_version_id: string;
            values_json: EntryRow["values"];
            reason: string;
            created_at: string;
          }>(
            sql`SELECT id,revision_no,template_version_id,values_json,reason,created_at::text FROM tracker.entry_revision WHERE entry_id=${entry.id}::uuid AND (${q.cursor ?? null}::uuid IS NULL OR revision_no<(SELECT revision_no FROM tracker.entry_revision WHERE entry_id=${entry.id}::uuid AND id=${q.cursor ?? null}::uuid)) ORDER BY revision_no DESC LIMIT 51`,
          )
        ).rows;
        const ids = [...new Set(history.map((r) => r.template_version_id))];
        const definitions = await Promise.all(
          ids.map((id) => readDefinition(t, id)),
        );
        return {
          view: "entry" as const,
          entry,
          tracker: tr,
          definition: await readDefinition(t, entry.template_version_id),
          history: history.slice(0, 50),
          definitions,
          nextCursor: history.length > 50 ? history[49]!.id : null,
          locked:
            (
              await t.db.execute(
                sql`SELECT id FROM tracker.template_migration WHERE tracker_id=${tr.id}::uuid AND (state IN ('confirmed','running','failed') OR (state='cancelled' AND migrated_count>0)) LIMIT 1`,
              )
            ).rows.length > 0,
        };
      }
      if (q.view === "migration") {
        const migration = await readMigration(t, q.id);
        return {
          view: "migration" as const,
          migration,
          tracker: await readTracker(t, migration.tracker_id),
          from: await readDefinition(t, migration.from_version_id),
          to: await readDefinition(t, migration.to_version_id),
        };
      }
      const tr = await readTracker(t, q.id),
        definition = await readDefinition(t, tr.template_version_id);
      const search = `%${q.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      const entries = (
        await t.db.execute<EntryRow>(
          sql`SELECT e.*,e.deadline_date::text,e.completed_at::text,e.archived_at::text,r.values_json AS values,r.revision_no FROM tracker.entry e JOIN tracker.entry_revision r ON r.id=e.current_revision_id WHERE e.tracker_id=${q.id}::uuid AND e.title ILIKE ${search} AND (${q.status}='' OR e.status_key=${q.status}) AND (${q.archived}='all' OR (e.archived_at IS NOT NULL)=(${q.archived}='archived')) AND (${q.cursor ?? null}::uuid IS NULL OR e.id>${q.cursor ?? null}::uuid) ORDER BY e.id LIMIT 51`,
        )
      ).rows;
      const migrations = (
        await t.db.execute<{
          id: string;
          state: string;
          migrated_count: number;
          to_version_id: string;
        }>(
          sql`SELECT id,state,migrated_count,to_version_id FROM tracker.template_migration WHERE tracker_id=${tr.id}::uuid ORDER BY CASE WHEN state IN ('confirmed','running','failed') OR (state='cancelled' AND migrated_count>0) THEN 0 ELSE 1 END,created_at DESC LIMIT 50`,
        )
      ).rows;
      const versions = (
        await t.db.execute<{ id: string; version_no: number }>(
          sql`SELECT id,version_no FROM tracker.template_version WHERE template_id=${tr.template_id}::uuid AND state='published' ORDER BY version_no DESC LIMIT 100`,
        )
      ).rows;
      return {
        view: "tracker" as const,
        tracker: tr,
        definition,
        candidate:
          versions[0] && versions[0].version_no > definition.versionNo
            ? await readDefinition(t, versions[0].id)
            : null,
        entries: entries.slice(0, 50),
        nextCursor: entries.length > 50 ? entries[49]!.id : null,
        migrations,
        versions,
        locked: migrations.some(
          (m) =>
            ["confirmed", "running", "failed"].includes(m.state) ||
            (m.state === "cancelled" && m.migrated_count > 0),
        ),
      };
    },
    { readOnlySnapshot: true },
  );
}
export type TrackerView = Awaited<ReturnType<typeof readTrackers>>;
