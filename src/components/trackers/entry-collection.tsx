"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle, CalendarDays } from "lucide-react";
import type { Definition } from "@/modules/trackers/domain/tracker";
import type { EntryRow } from "@/modules/trackers/repositories/trackers";

export function EntryCollection({
  entries,
  definition,
  versionId,
  candidate,
}: {
  entries: EntryRow[];
  definition: Definition;
  versionId: string;
  candidate: { id: string; definition: Definition } | null;
}) {
  const [mode, setMode] = useState("list");
  const schema = (entry: EntryRow) =>
    entry.template_version_id === candidate?.id
      ? candidate.definition
      : definition;
  const status = (entry: EntryRow) => {
    const d = schema(entry);
    return (
      d.fields
        .find((field) => field.key === d.statusKey)
        ?.options.find((option) => option.key === entry.status_key)?.label ??
      entry.status_key ??
      "No status"
    );
  };
  const groups = [...new Set(entries.map(status))];
  const value = (entry: EntryRow, key: string) => {
    const f = schema(entry).fields.find((field) => field.key === key);
    const v = entry.values[key];
    return v === null || v === undefined || v === ""
      ? "Not set"
      : typeof v === "boolean"
        ? v
          ? "Yes"
          : "No"
        : (f?.options.find((o) => o.key === v)?.label ?? v);
  };
  const card = (entry: EntryRow) => (
    <article
      key={entry.id}
      className="rounded-card border border-border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        {entry.completed_at ? (
          <CheckCircle2
            aria-hidden="true"
            className="mt-3 size-5 shrink-0 text-success"
          />
        ) : (
          <Circle
            aria-hidden="true"
            className="mt-3 size-5 shrink-0 text-muted-foreground"
          />
        )}
        <div className="min-w-0 flex-1">
          <Link
            className="inline-flex min-h-11 items-center break-words font-semibold text-link"
            href={`/trackers/entries/${entry.id}`}
          >
            {entry.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {status(entry)}
            {entry.completed_at ? " · Completed" : ""}
            {entry.archived_at ? " · Archived" : ""}
          </p>
          {entry.deadline_date ? (
            <p className="mt-3 flex items-center gap-2 text-sm">
              <CalendarDays className="size-4" />
              Due {entry.deadline_date}
            </p>
          ) : null}
          <dl className="mt-3 grid gap-2 text-sm">
            {schema(entry)
              .fields.filter(
                (f) =>
                  !f.retired &&
                  ![
                    schema(entry).titleKey,
                    schema(entry).statusKey,
                    schema(entry).deadlineKey,
                    schema(entry).completionKey,
                  ].includes(f.key),
              )
              .slice(0, 3)
              .map((f) => (
                <div
                  key={f.key}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="max-w-full break-words">
                    {value(entry, f.key)}
                  </dd>
                </div>
              ))}
          </dl>
          {entry.template_version_id !== versionId ? (
            <p className="mt-3 text-xs text-warning">
              Migrated; awaiting tracker completion
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          This page: {entries.length} records ·{" "}
          {entries.filter((e) => e.completed_at).length} completed ·{" "}
          {entries.filter((e) => e.deadline_date && !e.completed_at).length}{" "}
          with open deadlines
        </p>
        <div
          role="group"
          aria-label="Tracker entry view"
          className="flex rounded-full bg-surface-subtle p-1"
        >
          {["list", ...(definition.statusKey ? ["status"] : []), "table"].map(
            (option) => (
              <button
                type="button"
                key={option}
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
                className={`min-h-11 rounded-full px-4 text-sm capitalize ${mode === option ? "bg-primary text-primary-foreground" : ""}`}
              >
                {option}
              </button>
            ),
          )}
        </div>
      </div>
      {!entries.length ? (
        <p className="rounded-card bg-(--teal-surface) p-6">
          No entries match this view.
        </p>
      ) : mode === "table" ? (
        <div className="overflow-auto rounded-card border border-border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                {["Entry", "Status", "Deadline", "Recorded values"].map(
                  (label) => (
                    <th key={label} className="p-4" scope="col">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border align-top">
                  <td className="p-4">
                    <Link
                      href={`/trackers/entries/${entry.id}`}
                      className="inline-flex min-h-11 font-semibold text-link"
                    >
                      {entry.title}
                    </Link>
                    <p className="text-xs">
                      Revision {entry.revision_no}
                      {entry.archived_at ? " · Archived" : ""}
                      {entry.completed_at ? " · Completed" : ""}
                    </p>
                  </td>
                  <td className="p-4">{status(entry)}</td>
                  <td className="p-4">{entry.deadline_date ?? "None"}</td>
                  <td className="p-4">
                    <details>
                      <summary className="min-h-11 cursor-pointer text-link">
                        View fields
                      </summary>
                      <dl className="space-y-2">
                        {schema(entry).fields.map((f) => (
                          <div key={f.key}>
                            <dt className="text-muted-foreground">
                              {f.label}
                              {f.retired ? " (retired)" : ""}
                            </dt>
                            <dd className="break-words">
                              {value(entry, f.key)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : mode === "status" ? (
        <div className="flex snap-x gap-4 overflow-x-auto pb-4">
          {groups.map((group) => (
            <section
              key={group}
              className="w-[min(85vw,21rem)] shrink-0 snap-start space-y-3 rounded-card bg-surface-subtle p-3"
            >
              <h3 className="p-2 font-semibold">
                {group} · {entries.filter((e) => status(e) === group).length}
              </h3>
              {entries.filter((e) => status(e) === group).map(card)}
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{entries.map(card)}</div>
      )}
    </div>
  );
}
