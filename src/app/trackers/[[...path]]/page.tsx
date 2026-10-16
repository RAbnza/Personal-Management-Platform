import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { trackerActor } from "../_actor";
import {
  readTrackers,
  type TrackerQuery,
} from "@/modules/trackers/services/reads";
import {
  TrackerError,
  type Definition,
  type Value,
} from "@/modules/trackers/domain/tracker";
import {
  ArchiveButton,
  CreateFromTemplate,
  EntryForm,
  PresetForm,
  TemplateBuilder,
} from "@/components/trackers/forms";
import { trackerControl as control } from "@/components/trackers/styles";
import {
  MigrationForm,
  MigrationControls,
} from "@/components/trackers/migration";
const link = "inline-flex min-h-11 items-center text-link underline";
function Values({
  values,
  definition,
}: {
  values: Record<string, Value>;
  definition: Definition;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {Object.entries(values).map(([key, v]) => {
        const f = definition.fields.find((x) => x.key === key);
        return (
          <div key={key} className="min-w-0">
            <dt className="text-sm text-muted-foreground">
              {f?.label ?? key}
              {f?.retired ? " (retired)" : ""}
            </dt>
            <dd className="whitespace-pre-wrap break-words">
              {v === null || v === ""
                ? "Not set"
                : typeof v === "boolean"
                  ? v
                    ? "Yes"
                    : "No"
                  : (f?.options.find((o) => o.key === v)?.label ?? v)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
function DefinitionView({ d }: { d: Definition }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Published definition</h2>
      <p>
        Title: {d.fields.find((f) => f.key === d.titleKey)?.label}. Status:{" "}
        {d.fields.find((f) => f.key === d.statusKey)?.label ?? "none"}.
        Deadline:{" "}
        {d.fields.find((f) => f.key === d.deadlineKey)?.label ?? "none"}.
      </p>
      <ul className="space-y-2">
        {d.fields.map((f) => (
          <li key={f.key}>
            {f.label} — {f.type}
            {f.required ? ", required" : ""}
            {f.retired ? ", retired" : ""}. Default:{" "}
            {String(f.default ?? "none")}
            {f.options.length
              ? `. Choices: ${f.options.map((o) => `${o.label}${o.retired ? " (retired)" : ""}`).join(", ")}`
              : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
export default async function TrackersPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await trackerActor(),
    path = (await params).path ?? [],
    raw = await searchParams;
  if (path.join("/") === "templates/new") return <TemplateBuilder />;
  const query: TrackerQuery = {};
  for (const key of [
    "cursor",
    "templateCursor",
    "search",
    "status",
    "archived",
  ] as const) {
    if (Array.isArray(raw[key])) notFound();
    if (raw[key] !== undefined) Object.assign(query, { [key]: raw[key] });
  }
  if (path.length === 1) Object.assign(query, { view: "tracker", id: path[0] });
  else if (
    path.length === 2 &&
    ["templates", "entries", "migrations", "versions"].includes(path[0]!)
  )
    Object.assign(query, {
      view: (
        {
          templates: "template",
          entries: "entry",
          migrations: "migration",
          versions: "version",
        } as const
      )[path[0] as "templates" | "entries" | "migrations" | "versions"],
      id: path[1],
    });
  else if (path.length) notFound();
  const data = await readTrackers(actor, query).catch((e) => {
    if (
      e instanceof z.ZodError ||
      (e instanceof TrackerError && e.status === 404)
    )
      notFound();
    throw e;
  });
  if (data.view === "overview")
    return (
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">My trackers</h1>
          <div className="flex flex-wrap gap-4">
            {["active", "archived", "all"].map((a) => (
              <Link className={link} key={a} href={`/trackers?archived=${a}`}>
                {a}
              </Link>
            ))}
          </div>
          <ul className="space-y-3">
            {data.trackers.map((t) => (
              <li key={t.id}>
                <Link className={link} href={`/trackers/${t.id}`}>
                  {t.name}
                  {t.archived_at ? " (archived)" : ""}
                </Link>
              </li>
            ))}
          </ul>
          {!data.trackers.length && <p>No trackers in this view.</p>}
          {data.nextCursor && (
            <Link
              className={link}
              href={`/trackers?cursor=${data.nextCursor}&archived=${query.archived ?? "active"}`}
            >
              Next trackers
            </Link>
          )}
          <PresetForm />
        </section>
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">My templates</h2>
          <ul>
            {data.templates.map((t) => (
              <li key={t.id}>
                <Link className={link} href={`/trackers/templates/${t.id}`}>
                  {t.name}
                  {t.archived_at ? " (archived)" : ""}
                </Link>
              </li>
            ))}
          </ul>
          {data.nextTemplateCursor && (
            <Link
              className={link}
              href={`/trackers?templateCursor=${data.nextTemplateCursor}`}
            >
              Next templates
            </Link>
          )}
          <Link className={link} href="/trackers/templates/new">
            Create custom template
          </Link>
        </section>
      </div>
    );
  if (data.view === "template")
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold">{data.template.name}</h1>
        <ArchiveButton
          kind="template"
          id={data.template.id}
          version={data.template.version}
          archived={!!data.template.archived_at}
        />
        <DefinitionView d={data.current.definition} />
        <h2 className="text-xl font-semibold">Version history</h2>
        <ul>
          {data.versions.map((v) => (
            <li key={v.id}>
              <Link className={link} href={`/trackers/versions/${v.id}`}>
                Version {v.version_no}: {v.name}
              </Link>{" "}
              — {v.reason}
            </li>
          ))}
        </ul>
        {data.nextVersionCursor && (
          <Link className={link} href={`?cursor=${data.nextVersionCursor}`}>
            Older template versions
          </Link>
        )}
        {!data.template.archived_at && (
          <>
            <CreateFromTemplate
              templateId={data.template.id}
              versionId={data.current.id}
              name={data.template.name}
            />
            <TemplateBuilder
              key={data.current.id}
              initial={data.current.definition}
              templateId={data.template.id}
              versionId={data.current.id}
            />
          </>
        )}
      </div>
    );
  if (data.view === "version")
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">
          {data.definition.definition.name} — version{" "}
          {data.definition.versionNo}
        </h1>
        <DefinitionView d={data.definition.definition} />
        <Link
          className={link}
          href={`/trackers/templates/${data.definition.templateId}`}
        >
          Manage template
        </Link>
        {!data.definition.archived && (
          <CreateFromTemplate
            templateId={data.definition.templateId}
            versionId={data.definition.id}
            name={data.definition.definition.name}
          />
        )}
      </div>
    );
  if (data.view === "entry")
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold">{data.entry.title}</h1>
        <Link className={link} href={`/trackers/${data.tracker.id}`}>
          Return to {data.tracker.name}
        </Link>
        <p>
          Template version {data.definition.versionNo}.{" "}
          {data.entry.completed_at
            ? `Completed ${data.entry.completed_at}`
            : "Not completed"}
          {data.entry.deadline_date
            ? `. Deadline ${data.entry.deadline_date}`
            : ""}
          .
        </p>
        <Link
          className={link}
          href={`/calendar/reminders/tracker_entry/${data.entry.id}`}
        >
          Deadline reminders
        </Link>
        <Values
          values={data.entry.values}
          definition={data.definition.definition}
        />
        {data.locked ? (
          <p role="status">
            Migration in progress or paused. Entry editing and archival are
            locked; resume the migration from the tracker.
          </p>
        ) : (
          <ArchiveButton
            kind="entry"
            id={data.entry.id}
            version={data.entry.version}
            archived={!!data.entry.archived_at}
          />
        )}
        <EntryForm
          key={data.entry.current_revision_id}
          tracker={data.tracker}
          definition={data.definition.definition}
          entry={data.entry}
          disabled={
            data.locked ||
            !!data.entry.archived_at ||
            !!data.tracker.archived_at
          }
        />
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Immutable revision history</h2>
          {data.history.map((r) => (
            <article
              key={r.id}
              className="space-y-3 rounded-card border border-border p-4"
            >
              <h3 className="font-semibold">
                Revision {r.revision_no} — {r.created_at}
              </h3>
              <p>{r.reason}</p>
              <Link
                className={link}
                href={`/trackers/versions/${r.template_version_id}`}
              >
                Definition for this revision
              </Link>
              <Values
                values={r.values_json}
                definition={
                  data.definitions.find((d) => d.id === r.template_version_id)!
                    .definition
                }
              />
            </article>
          ))}
          {data.nextCursor && (
            <Link className={link} href={`?cursor=${data.nextCursor}`}>
              Older revisions
            </Link>
          )}
        </section>
      </div>
    );
  if (data.view === "migration")
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">
          Migration review: {data.tracker.name}
        </h1>
        <p>
          Version {data.from.versionNo} → {data.to.versionNo}.{" "}
          {data.migration.preview_counts_json.valid} valid,{" "}
          {data.migration.preview_counts_json.invalid} invalid of{" "}
          {data.migration.preview_counts_json.total} entries, including archived
          entries. The tracker remains on its original version until every entry
          is migrated.
        </p>
        <DefinitionView d={data.to.definition} />
        <section>
          <h2 className="text-lg font-semibold">Reviewed field mappings</h2>
          <ul>
            {data.to.definition.fields
              .filter((f) => !f.retired)
              .map((f) => {
                const rule = data.migration.mapping_json[f.key];
                return (
                  <li key={f.key}>
                    {f.label}:{" "}
                    {rule?.value !== undefined
                      ? `supplied value ${String(rule.value)}`
                      : rule?.from === null
                        ? "published default"
                        : `from ${data.from.definition.fields.find((s) => s.key === (rule?.from ?? f.key))?.label ?? "new field default"}`}{" "}
                    ({rule?.conversion ?? "same type"})
                    {rule?.optionMap
                      ? `; choice mapping: ${Object.entries(rule.optionMap)
                          .map(([a, b]) => `${a} → ${b}`)
                          .join(", ")}`
                      : ""}
                  </li>
                );
              })}
          </ul>
        </section>
        {data.migration.preview_counts_json.issues.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">Invalid entries (first 50)</h2>
            <p>
              Fix entries or prepare a revised mapping before confirmation.
              Entries and prior values are retained.
            </p>
            {data.migration.preview_counts_json.issues.map((i) => (
              <p key={i.entryId}>
                <Link className={link} href={`/trackers/entries/${i.entryId}`}>
                  {i.title}
                </Link>
                : {i.message}
              </p>
            ))}
          </section>
        )}
        <section className="space-y-4">
          <h2 className="font-semibold">
            Before and after samples (up to 5 entries)
          </h2>
          {data.migration.preview_counts_json.samples.map((s) => (
            <article
              key={s.entryId}
              className="grid gap-4 rounded-card border border-border p-4 md:grid-cols-2"
            >
              <div>
                <h3>Before</h3>
                <Values values={s.before} definition={data.from.definition} />
              </div>
              <div>
                <h3>After</h3>
                <Values values={s.after} definition={data.to.definition} />
              </div>
            </article>
          ))}
        </section>
        <MigrationControls
          key={`${data.migration.state}-${data.migration.migrated_count}`}
          migration={data.migration}
        />
      </div>
    );
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{data.tracker.name}</h1>
      <Link
        className={link}
        href={`/trackers/reports?trackerId=${data.tracker.id}`}
      >
        Reports for this tracker
      </Link>
      <p>
        Template version {data.definition.versionNo}.{" "}
        {data.tracker.archived_at
          ? "Archived; history retained."
          : "Active private tracker."}
      </p>
      <Link
        className={link}
        href={`/trackers/templates/${data.tracker.template_id}`}
      >
        Manage template and versions
      </Link>
      {!data.locked && (
        <ArchiveButton
          kind="tracker"
          id={data.tracker.id}
          version={data.tracker.version}
          archived={!!data.tracker.archived_at}
        />
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Entries</h2>
        <form className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1">
            Search titles
            <input
              className={control}
              name="search"
              maxLength={120}
              defaultValue={query.search ?? ""}
            />
          </label>
          <label className="grid gap-1">
            Status
            <select
              className={control}
              name="status"
              defaultValue={query.status ?? ""}
            >
              <option value="">All statuses</option>
              {data.definition.definition.fields
                .find((f) => f.key === data.definition.definition.statusKey)
                ?.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                    {o.retired ? " (retired)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1">
            Lifecycle
            <select
              className={control}
              name="archived"
              defaultValue={query.archived ?? "active"}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>
          <button className={`${control} cursor-pointer`}>
            Filter entries
          </button>
        </form>
        <ul className="space-y-2">
          {data.entries.map((e) => (
            <li key={e.id} className="rounded-card border border-border p-3">
              <Link className={link} href={`/trackers/entries/${e.id}`}>
                {e.title}
              </Link>
              <p className="text-sm">
                {(e.template_version_id === data.candidate?.id
                  ? data.candidate.definition
                  : data.definition.definition
                ).fields
                  .find(
                    (f) =>
                      f.key ===
                      (e.template_version_id === data.candidate?.id
                        ? data.candidate.definition
                        : data.definition.definition
                      ).statusKey,
                  )
                  ?.options.find((o) => o.key === e.status_key)?.label ??
                  e.status_key ??
                  "No status"}
                {e.deadline_date ? ` · Due ${e.deadline_date}` : ""}
                {e.completed_at ? " · Completed" : ""}
                {e.archived_at ? " · Archived" : ""}
                {e.template_version_id !== data.tracker.template_version_id
                  ? " · Migrated; awaiting tracker completion"
                  : ""}
              </p>
            </li>
          ))}
        </ul>
        {!data.entries.length && <p>No entries match this view.</p>}
        {data.nextCursor && (
          <Link
            className={link}
            href={`?${new URLSearchParams({ cursor: data.nextCursor, search: query.search ?? "", status: query.status ?? "", archived: query.archived ?? "active" })}`}
          >
            Next entries
          </Link>
        )}
      </section>
      {!data.locked && !data.tracker.archived_at && (
        <EntryForm
          tracker={data.tracker}
          definition={data.definition.definition}
        />
      )}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Template migrations</h2>
        {data.locked && (
          <p role="status">
            Entry editing and archival are paused. Open the active or cancelled
            migration to continue.
          </p>
        )}
        <ul>
          {data.migrations.map((m) => (
            <li key={m.id}>
              <Link className={link} href={`/trackers/migrations/${m.id}`}>
                {m.state}: {m.migrated_count} entries migrated
              </Link>
            </li>
          ))}
        </ul>
        {!data.locked && !data.tracker.archived_at && data.candidate && (
          <MigrationForm
            trackerId={data.tracker.id}
            from={data.definition.definition}
            target={data.candidate}
          />
        )}
      </section>
    </div>
  );
}
