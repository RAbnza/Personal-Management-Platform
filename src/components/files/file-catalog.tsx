"use client";
import { useEffect, useState } from "react";
import { Folder, Search } from "lucide-react";
import { UnlinkedFiles } from "./unlinked-files";
import { Attachments } from "./attachments";
const kinds = [
  ["financial_action", "Transactions"],
  ["debt", "Debts"],
  ["debt_settlement", "Debt payments"],
  ["reconciliation", "Reconciliations"],
  ["card_statement_revision", "Statement revisions"],
  ["job_application", "Applications"],
  ["application_event", "Career events"],
  ["resume_version", "Resume versions"],
] as const;
export function FileCatalog() {
  const [kind, setKind] = useState<string>("financial_action"),
    [selected, setSelected] = useState<{ id: string; label: string } | null>(
      null,
    ),
    [rows, setRows] = useState<{ id: string; label: string }[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [after, setAfter] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [locked, setLocked] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/v1/files?catalog=true&sourceKind=${kind}${after ? `&afterId=${after}` : ""}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        const j = await r.json();
        if (!controller.signal.aborted) {
          setRows(j.sources);
          setCursor(j.nextCursor);
          setLoading(false);
          setMessage("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setMessage(
            "Source evidence is unavailable. Retry to load authorized records.",
          );
        }
      });
    return () => controller.abort();
  }, [kind, after, retry]);
  function navigate(nextKind: string, nextAfter: string | null) {
    setKind(nextKind);
    setAfter(nextAfter);
    setSelected(null);
    setRows([]);
    setCursor(null);
    setLoading(true);
    setMessage("");
  }
  return (
    <div className="min-w-0 space-y-6">
      <p className="text-sm text-muted-foreground">
        Browse files by their source record. Statement and resume folders retain
        the exact version relationship.
      </p>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="File source folders"
          className="flex flex-wrap content-start gap-2 lg:flex-col"
        >
          {kinds.map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={locked}
              aria-pressed={kind === key}
              onClick={() => {
                if (kind !== key) navigate(key, null);
              }}
              className={`flex min-h-11 items-center gap-2 rounded-control px-3 py-2 text-left text-sm ${kind === key ? "bg-primary text-primary-foreground" : "bg-surface-subtle"}`}
            >
              <Folder size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <label className="flex items-center gap-2 rounded-control border border-input bg-surface px-3">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Filter source folders on this page</span>
            <input
              className="min-h-11 min-w-0 flex-1 bg-transparent"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a source on this page"
            />
          </label>
          {loading ? (
            <p role="status">Loading source folders...</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows
                .filter((r) =>
                  r.label.toLowerCase().includes(query.toLowerCase()),
                )
                .map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={locked}
                      aria-pressed={selected?.id === r.id}
                      onClick={() => setSelected(r)}
                      className={`flex min-h-20 w-full items-center gap-3 rounded-card border p-4 text-left ${selected?.id === r.id ? "border-primary bg-[var(--blue-surface)]" : "border-border bg-surface"}`}
                    >
                      <Folder
                        className="shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 break-words font-medium">
                        {r.label}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {!loading &&
            !message &&
            rows.length > 0 &&
            !rows.some((r) =>
              r.label.toLowerCase().includes(query.toLowerCase()),
            ) && <p>No source folders match this page filter.</p>}
          {!loading && !message && !rows.length && (
            <p>No source records on this page.</p>
          )}
          {message && (
            <p role="alert">
              {message}{" "}
              <button
                type="button"
                className="action-link"
                onClick={() => {
                  setLoading(true);
                  setRetry((v) => v + 1);
                }}
              >
                Retry
              </button>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="action-link"
              disabled={!after || locked || loading}
              onClick={() => navigate(kind, null)}
            >
              First source page
            </button>
            <button
              type="button"
              className="action-link"
              disabled={!cursor || locked || loading}
              onClick={() => navigate(kind, cursor)}
            >
              Next source page
            </button>
          </div>
          {selected ? (
            <section aria-label={`Files for ${selected.label}`}>
              <h2 className="mb-3 text-xl font-semibold">{selected.label}</h2>
              <Attachments
                key={`${kind}:${selected.id}`}
                sourceKind={kind}
                sourceId={selected.id}
                initiallyExpanded
                onLockChange={setLocked}
              />
            </section>
          ) : (
            <div className="rounded-card border border-dashed border-border p-8 text-center text-muted-foreground">
              Open a source folder to browse or upload its supporting files.
            </div>
          )}
        </div>
      </div>
      <UnlinkedFiles />
    </div>
  );
}
