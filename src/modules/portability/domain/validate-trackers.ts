import {
  definitionSchema,
  validateValues,
  migrationRulesSchema,
  migrateValues,
  TrackerError,
  type Definition,
  type Value,
} from "@/modules/trackers/domain/tracker";
import { previewDigest } from "./csv-preview";
type Row = Record<string, unknown>;
/** Also runs again against staged input immediately before replacement. No
 * executable template payload or unvalidated dynamic value reaches restoration. */
export function validateTrackerGraph(
  entities: { kind: string; records: Row[] }[],
) {
  const receipts = new Map(
    (
      entities.find((e) => e.kind === "core.command_receipt")?.records ?? []
    ).map((r) => [r.id, r]),
  );
  const isMigration = (r: Row) =>
    receipts.get(r.command_receipt_id)?.command_type === "tracker.batch";
  const rows = (kind: string) =>
    entities.find((e) => e.kind === `tracker.${kind}`)?.records ?? [];
  const map = (kind: string) =>
    new Map(rows(kind).map((r) => [String(r.id), r]));
  const templates = map("template"),
    versions = map("template_version"),
    identities = map("field_identity"),
    trackers = map("tracker"),
    entries = map("entry"),
    revisions = map("entry_revision"),
    migrations = rows("template_migration"),
    definitions = new Map<string, Definition>();
  const fail = () => {
    throw new TrackerError(
      422,
      "Tracker portable graph has inconsistent definitions, values or history.",
    );
  };
  const same = (a: unknown, b: unknown) =>
    previewDigest(a) === previewDigest(b);
  for (const v of versions.values()) {
    if (
      v.state !== "published" ||
      !templates.has(String(v.template_id)) ||
      !Number.isInteger(v.version_no) ||
      Number(v.version_no) < 1
    )
      fail();
    const key = (id: unknown) => {
      if (id === null) return null;
      const i = identities.get(String(id));
      if (!i || i.template_id !== v.template_id) fail();
      return String(i!.stable_key);
    };
    const completion = v.completion_json as {
      key?: unknown;
      statuses?: unknown;
    };
    if (
      !completion ||
      Object.keys(completion).sort().join(",") !== "key,statuses"
    )
      fail();
    const fields = rows("field_definition")
      .filter((f) => f.template_version_id === v.id)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((f) => {
        const identity = identities.get(String(f.field_id));
        if (
          !identity ||
          identity.template_id !== v.template_id ||
          f.template_id !== v.template_id
        )
          fail();
        return {
          key: identity!.stable_key,
          label: f.label,
          type: f.field_type,
          required: f.required,
          retired: f.retired,
          validation: f.validation_json,
          default: f.default_json,
          options: rows("field_option")
            .filter((o) => o.field_definition_id === f.id)
            .sort((a, b) => Number(a.position) - Number(b.position))
            .map((o) => ({
              key: o.option_key,
              label: o.label,
              retired: o.retired,
            })),
        };
      });
    const d = definitionSchema.parse({
      name: v.name,
      fields,
      titleKey: key(v.title_field_id),
      statusKey: key(v.status_field_id),
      deadlineKey: key(v.deadline_field_id),
      completionKey: completion.key,
      completedStatusKeys: completion.statuses,
    });
    definitions.set(String(v.id), d);
    if (v.previous_version_id === null) {
      if (v.version_no !== 1) fail();
    } else {
      const previous = versions.get(String(v.previous_version_id));
      if (
        !previous ||
        previous.template_id !== v.template_id ||
        Number(previous.version_no) + 1 !== v.version_no
      )
        fail();
    }
  }
  // Apply the same identity/retirement evolution rules as ordinary publication.
  for (const v of versions.values())
    if (v.previous_version_id !== null) {
      const previous = definitions.get(String(v.previous_version_id))!,
        next = definitions.get(String(v.id))!;
      for (const f of previous.fields) {
        const n = next.fields.find((n) => n.key === f.key);
        if (!n || (f.retired && !n.retired)) fail();
        if (
          f.type === "single_select" &&
          n!.type === "single_select" &&
          f.options.some(
            (o) =>
              !n!.options.some((x) => x.key === o.key) ||
              (o.retired && !n!.options.find((x) => x.key === o.key)?.retired),
          )
        )
          fail();
      }
    }
  for (const t of templates.values()) {
    const current = versions.get(String(t.current_version_id));
    if (
      current?.template_id !== t.id ||
      [...versions.values()].some(
        (v) =>
          v.template_id === t.id &&
          Number(v.version_no) > Number(current!.version_no),
      )
    )
      fail();
  }
  for (const i of identities.values())
    if (!templates.has(String(i.template_id))) fail();
  for (const f of rows("field_definition"))
    if (!versions.has(String(f.template_version_id))) fail();
  for (const o of rows("field_option"))
    if (
      !rows("field_definition").some(
        (f) =>
          f.id === o.field_definition_id && f.field_type === "single_select",
      )
    )
      fail();
  for (const t of trackers.values())
    if (
      versions.get(String(t.template_version_id))?.template_id !== t.template_id
    )
      fail();
  for (const r of revisions.values()) {
    const d = definitions.get(String(r.template_version_id)),
      entry = entries.get(String(r.entry_id)),
      tr = trackers.get(String(entry?.tracker_id));
    if (
      !d ||
      !entry ||
      versions.get(String(r.template_version_id))?.template_id !==
        tr?.template_id
    )
      fail();
    if (
      isMigration(r) &&
      !migrations.some(
        (m) =>
          r.reason === `Template migration ${m.id}` &&
          m.tracker_id === entry!.tracker_id,
      )
    )
      fail();
    const validated = validateValues(d!, r.values_json);
    if (!same(validated.values, r.values_json)) fail();
    if (r.previous_revision_id === null) {
      if (r.revision_no !== 1) fail();
    } else {
      const p = revisions.get(String(r.previous_revision_id));
      if (
        !p ||
        p.entry_id !== r.entry_id ||
        Number(p.revision_no) + 1 !== r.revision_no
      )
        fail();
    }
  }
  for (const e of entries.values()) {
    const r = revisions.get(String(e.current_revision_id)),
      t = trackers.get(String(e.tracker_id));
    if (
      !r ||
      r.entry_id !== e.id ||
      r.template_version_id !== e.template_version_id ||
      !t
    )
      fail();
    const d = definitions.get(String(e.template_version_id));
    if (!d) fail();
    const v = validateValues(d!, r!.values_json);
    if (
      e.title !== v.title ||
      (e.status_key ?? null) !== (v.status || null) ||
      (e.deadline_date ?? null) !== (v.deadline || null) ||
      (e.completed_at !== null) !== v.completed
    )
      fail();
    if (
      t!.template_version_id !== e.template_version_id &&
      !migrations.some(
        (m) =>
          m.tracker_id === e.tracker_id &&
          m.from_version_id === t!.template_version_id &&
          m.to_version_id === e.template_version_id &&
          ["confirmed", "running", "failed", "cancelled"].includes(
            String(m.state),
          ),
      )
    )
      fail();
    if (
      [...revisions.values()].some(
        (other) =>
          other.entry_id === e.id &&
          Number(other.revision_no) > Number(r!.revision_no),
      )
    )
      fail();
  }
  for (const m of migrations) {
    const t = trackers.get(String(m.tracker_id)),
      from = versions.get(String(m.from_version_id)),
      to = versions.get(String(m.to_version_id));
    if (
      !t ||
      !from ||
      !to ||
      from.template_id !== t.template_id ||
      to.template_id !== t.template_id ||
      Number(from.version_no) >= Number(to.version_no) ||
      ![
        "preview",
        "confirmed",
        "running",
        "completed",
        "failed",
        "cancelled",
      ].includes(String(m.state)) ||
      !Number.isInteger(m.migrated_count) ||
      Number(m.migrated_count) < 0
    )
      fail();
    const rules = migrationRulesSchema.parse(m.mapping_json);
    for (const r of revisions.values())
      if (isMigration(r) && r.reason === `Template migration ${m.id}`) {
        const p = revisions.get(String(r.previous_revision_id));
        if (
          !p ||
          entries.get(String(r.entry_id))?.tracker_id !== m.tracker_id ||
          p.template_version_id !== m.from_version_id ||
          r.template_version_id !== m.to_version_id ||
          !same(
            migrateValues(
              definitions.get(String(m.from_version_id))!,
              definitions.get(String(m.to_version_id))!,
              p.values_json as Record<string, Value>,
              rules,
            ).values,
            r.values_json,
          )
        )
          fail();
      }
    if (
      [...revisions.values()].filter(
        (r) => isMigration(r) && r.reason === `Template migration ${m.id}`,
      ).length !== m.migrated_count
    )
      fail();
  }
}
