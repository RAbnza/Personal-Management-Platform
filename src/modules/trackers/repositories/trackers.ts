import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  definitionSchema,
  TrackerError,
  type Definition,
  type Value,
  type MigrationRules,
} from "../domain/tracker";
export type TrackerRow = {
  id: string;
  template_id: string;
  template_version_id: string;
  name: string;
  archived_at: string | null;
  version: number;
};
export type EntryRow = {
  id: string;
  tracker_id: string;
  template_version_id: string;
  current_revision_id: string;
  title: string;
  status_key: string | null;
  deadline_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
  version: number;
  values: Record<string, Value>;
  revision_no: number;
};
export type MigrationRow = {
  id: string;
  tracker_id: string;
  from_version_id: string;
  to_version_id: string;
  mapping_json: MigrationRules;
  state: string;
  preview_counts_json: Preview;
  preview_hash: string;
  migrated_count: number;
  last_entry_id: string | null;
};
export type Preview = {
  total: number;
  valid: number;
  invalid: number;
  issues: { entryId: string; title: string; message: string }[];
  samples: {
    entryId: string;
    before: Record<string, Value>;
    after: Record<string, Value>;
  }[];
};
export async function readTracker(t: ScopedTransaction, id: string) {
  const r = (
    await t.db.execute<TrackerRow>(
      sql`SELECT id,template_id,template_version_id,name,archived_at::text,version FROM tracker.tracker WHERE id=${id}::uuid`,
    )
  ).rows[0];
  if (!r) throw new TrackerError(404, "Private tracker unavailable.");
  return r;
}
export async function readDefinition(
  t: ScopedTransaction,
  id: string,
): Promise<{
  id: string;
  templateId: string;
  versionNo: number;
  definition: Definition;
  archived: boolean;
}> {
  const v = (
    await t.db.execute<{
      id: string;
      template_id: string;
      version_no: number;
      name: string;
      title_key: string;
      status_key: string | null;
      deadline_key: string | null;
      completion_json: { key: string | null; statuses: string[] };
      archived: boolean;
    }>(
      sql`SELECT v.*,i.stable_key title_key,s.stable_key status_key,d.stable_key deadline_key,(p.archived_at IS NOT NULL) archived FROM tracker.template_version v JOIN tracker.template p ON p.id=v.template_id JOIN tracker.field_identity i ON i.id=v.title_field_id LEFT JOIN tracker.field_identity s ON s.id=v.status_field_id LEFT JOIN tracker.field_identity d ON d.id=v.deadline_field_id WHERE v.id=${id}::uuid AND v.state='published'`,
    )
  ).rows[0];
  if (!v)
    throw new TrackerError(404, "Published template version unavailable.");
  const fields = (
    await t.db.execute<{
      key: string;
      label: string;
      type: Definition["fields"][number]["type"];
      required: boolean;
      retired: boolean;
      validation: Record<string, unknown>;
      default: Value;
      options: Definition["fields"][number]["options"];
    }>(
      sql`SELECT i.stable_key key,f.label,f.field_type type,f.required,f.retired,f.validation_json validation,f.default_json AS "default",COALESCE((SELECT jsonb_agg(jsonb_build_object('key',o.option_key,'label',o.label,'retired',o.retired) ORDER BY o.position) FROM tracker.field_option o WHERE o.field_definition_id=f.id),'[]'::jsonb) options FROM tracker.field_definition f JOIN tracker.field_identity i ON i.id=f.field_id WHERE f.template_version_id=${id}::uuid ORDER BY f.position`,
    )
  ).rows;
  return {
    id,
    templateId: v.template_id,
    versionNo: v.version_no,
    archived: v.archived,
    definition: definitionSchema.parse({
      name: v.name,
      fields,
      titleKey: v.title_key,
      statusKey: v.status_key,
      deadlineKey: v.deadline_key,
      completionKey: v.completion_json.key,
      completedStatusKeys: v.completion_json.statuses,
    }),
  };
}
export async function readEntry(t: ScopedTransaction, id: string) {
  const e = (
    await t.db.execute<EntryRow>(
      sql`SELECT e.*,e.deadline_date::text,e.completed_at::text,e.archived_at::text,r.values_json AS values,r.revision_no FROM tracker.entry e JOIN tracker.entry_revision r ON r.id=e.current_revision_id WHERE e.id=${id}::uuid`,
    )
  ).rows[0];
  if (!e) throw new TrackerError(404, "Private entry unavailable.");
  return e;
}
export async function migrationEntries(
  t: ScopedTransaction,
  trackerId: string,
) {
  const rows = (
    await t.db.execute<EntryRow>(
      sql`SELECT e.*,e.deadline_date::text,e.completed_at::text,e.archived_at::text,r.values_json AS values,r.revision_no FROM tracker.entry e JOIN tracker.entry_revision r ON r.id=e.current_revision_id WHERE e.tracker_id=${trackerId}::uuid ORDER BY e.id LIMIT 10001`,
    )
  ).rows;
  if (rows.length > 10000)
    throw new TrackerError(
      422,
      "Migration previews support up to 10,000 entries per tracker.",
    );
  return rows;
}
export async function readMigration(t: ScopedTransaction, id: string) {
  const m = (
    await t.db.execute<MigrationRow>(
      sql`SELECT * FROM tracker.template_migration WHERE id=${id}::uuid`,
    )
  ).rows[0];
  if (!m) throw new TrackerError(404, "Private migration unavailable.");
  return m;
}
export async function assertEditable(t: ScopedTransaction, trackerId: string) {
  const r = await t.db.execute(
    sql`SELECT id FROM tracker.template_migration WHERE tracker_id=${trackerId}::uuid AND (state IN ('confirmed','running','failed') OR (state='cancelled' AND migrated_count>0)) LIMIT 1`,
  );
  if (r.rows.length)
    throw new TrackerError(
      409,
      "Entry editing and archival are paused during migration. Resume the reviewed migration to finish; cancellation preserves completed batches.",
    );
}
