"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { useClientReady } from "@/shared/use-client-ready";
type Row = {
  id: string;
  original_filename: string;
  status: string;
  version: number;
  scan_result_code: string | null;
  total: string;
  declared_mime: string;
  declared_bytes: string;
};
export function Attachments({
  sourceKind,
  sourceId,
  initiallyExpanded = false,
  onLockChange,
}: {
  sourceKind: string;
  sourceId: string;
  initiallyExpanded?: boolean;
  onLockChange?: (locked: boolean) => void;
}) {
  const ready = useClientReady();
  const [expanded, setExpanded] = useState(initiallyExpanded),
    [afterId, setAfterId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [mutationUncertain, setMutationUncertain] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(""),
    [status, setStatus] = useState("all");
  useEffect(() => {
    onLockChange?.(busy || uncertain || mutationUncertain);
  }, [busy, uncertain, mutationUncertain, onLockChange]);
  const mutation = useRef<{
    row: Row;
    operation: "delete" | "unlink";
    clientCommandId: string;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null),
    frozen = useRef<{ file: File; reserveId: string; uploadId: string } | null>(
      null,
    );
  const url = `/api/v1/files?sourceKind=${encodeURIComponent(sourceKind)}&sourceId=${encodeURIComponent(sourceId)}${afterId ? `&afterId=${afterId}` : ""}`;
  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw Error();
      const j = await r.json();
      setRows(j.attachments);
      setMessage((m) =>
        m.startsWith("Evidence could not be loaded") ? "" : m,
      );
    } catch {
      setMessage("Evidence could not be loaded. Refresh to retry.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    void fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const j = await r.json();
        if (live) {
          setRows(j.attachments);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setMessage("Evidence could not be loaded.");
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [url, expanded]);
  async function upload() {
    setBusy(true);
    setMessage("");
    try {
      if (!frozen.current) {
        const file = input.current?.files?.[0];
        if (
          !file ||
          file.size < 1 ||
          file.size > 10485760 ||
          !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
        ) {
          setMessage("Choose a PDF, JPEG or PNG up to 10 MiB.");
          return;
        }
        frozen.current = {
          file,
          reserveId: crypto.randomUUID(),
          uploadId: crypto.randomUUID(),
        };
      }
      const c = frozen.current;
      const r = await fetch("/api/v1/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientCommandId: c.reserveId,
          sourceKind,
          sourceId,
          originalFilename: c.file.name,
          declaredMime: c.file.type,
          declaredBytes: c.file.size,
        }),
      });
      if (!r.ok) throw Error();
      const j = await r.json();
      if (typeof j.attachmentId !== "string") throw Error();
      const put = await fetch(`/api/v1/files/${j.attachmentId}`, {
        method: "PUT",
        headers: {
          "x-command-id": c.uploadId,
          "Content-Type": "application/octet-stream",
        },
        body: c.file,
      });
      if (!put.ok) throw Error();
      frozen.current = null;
      setUncertain(false);
      if (input.current) input.current.value = "";
      setMessage(
        "Uploaded privately. Download is disabled until verification and malware scanning pass.",
      );
      await refresh();
    } catch {
      setUncertain(true);
      setMessage(
        "Upload unconfirmed or unavailable. Retry uses the same file and commands. Storage and scanning must be configured.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function mutate(row: Row, operation: "delete" | "unlink") {
    mutation.current ??= {
      row,
      operation,
      clientCommandId: crypto.randomUUID(),
    };
    const saved = mutation.current;
    setBusy(true);
    try {
      const r = await fetch("/api/v1/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientCommandId: saved.clientCommandId,
          attachmentId: saved.row.id,
          sourceKind,
          sourceId,
          expectedVersion: saved.row.version,
          operation: saved.operation,
        }),
      });
      if (!r.ok) {
        if (
          r.status >= 400 &&
          r.status < 500 &&
          ![408, 429].includes(r.status)
        ) {
          mutation.current = null;
          setMutationUncertain(false);
          setMessage(
            "Change rejected. Refresh the current file version before a new change.",
          );
          await refresh();
          return;
        }
        throw Error();
      }
      const response = await r.json();
      if (response.attachmentId !== saved.row.id) throw Error();
      setMessage(
        saved.operation === "delete"
          ? "Deletion requested. Storage cleanup is retryable."
          : "Unlinked. The stored object remains until explicit deletion or retention cleanup.",
      );
      await refresh();
      mutation.current = null;
      setMutationUncertain(false);
    } catch {
      setMutationUncertain(true);
      setMessage("Change unconfirmed. Retry the identical change.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Supporting files"
      description="Private evidence only. Files do not change money, statements or application history."
    >
      <fieldset disabled={!ready} className="min-w-0">
        <details
          open={expanded}
          onToggle={(e) => setExpanded(e.currentTarget.open)}
        >
          <summary className="min-h-11 cursor-pointer py-3">
            Manage evidence files
          </summary>
          <div className="space-y-4">
            <p className="text-sm">
              PDF, JPEG or PNG; 10 MiB per file, 1 GiB per workspace. Original
              file metadata is retained. No inline document previews.
            </p>
            <details className="rounded-card border border-dashed border-border p-4">
              <summary className="action-link">
                Upload a supporting file
              </summary>
              <label className="block">
                Evidence file
                <input
                  ref={input}
                  disabled={busy || uncertain || mutationUncertain}
                  className="mt-2 block w-full min-w-0"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="min-h-11 rounded border px-4"
                  disabled={busy || mutationUncertain}
                  onClick={() => void upload()}
                >
                  {uncertain ? "Retry identical upload" : "Upload privately"}
                </button>
              </div>
            </details>
            <button
              type="button"
              className="min-h-11 rounded border px-4"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Refresh scan status
            </button>
            {mutationUncertain && (
              <button
                className="min-h-11 rounded border px-4"
                disabled={busy}
                onClick={() => {
                  const m = mutation.current;
                  if (m) void mutate(m.row, m.operation);
                }}
              >
                Retry identical file change
              </button>
            )}
            <p role="status" className="break-words">
              {message}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="min-h-11 rounded border px-4"
                disabled={busy || rows.length < 50}
                onClick={() => {
                  setLoading(true);
                  setAfterId(rows.at(-1)!.id);
                  setRows([]);
                }}
              >
                Next file page
              </button>
              <button
                className="min-h-11 rounded border px-4"
                disabled={busy || !afterId}
                onClick={() => {
                  setLoading(true);
                  setAfterId(null);
                  setRows([]);
                }}
              >
                First file page
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Find file on this page
                <input
                  className="min-h-11 rounded-control border border-input bg-surface px-3"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                File status
                <select
                  className="min-h-11 rounded-control border border-input bg-surface px-3"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All states</option>
                  {[...new Set(rows.map((r) => r.status))].map((state) => (
                    <option key={state} value={state}>
                      {state.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {loading && <p role="status">Loading evidence files...</p>}
            {!loading && !rows.length && !message && (
              <p>No supporting files on this page.</p>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows
                .filter(
                  (row) =>
                    row.original_filename
                      .toLowerCase()
                      .includes(filter.toLowerCase()) &&
                    (status === "all" || row.status === status),
                )
                .map((row) => (
                  <li
                    key={row.id}
                    className="space-y-2 rounded-card border border-border bg-surface p-4"
                  >
                    {row.declared_mime?.startsWith("image/") ? (
                      <ImageIcon aria-hidden="true" className="text-primary" />
                    ) : (
                      <FileText aria-hidden="true" className="text-primary" />
                    )}
                    <p className="break-words font-medium">
                      {row.original_filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.declared_mime ?? "Type unavailable"} /{" "}
                      {row.declared_bytes
                        ? `${Number(row.declared_bytes).toLocaleString()} bytes declared`
                        : "Size unavailable"}
                    </p>
                    <p
                      className={`inline-flex rounded-control px-2 py-1 text-xs font-semibold ${row.status === "available" ? "bg-[var(--teal-surface)]" : "bg-[var(--warm-surface)]"}`}
                    >
                      {row.status.replaceAll("_", " ")}
                    </p>
                    {row.status === "available" && (
                      <a
                        className="inline-flex min-h-11 items-center text-link underline"
                        href={`/api/v1/files/${row.id}`}
                      >
                        Download verified evidence
                      </a>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <button
                        disabled={busy || uncertain || mutationUncertain}
                        className="min-h-11 underline"
                        onClick={() => void mutate(row, "unlink")}
                      >
                        Unlink evidence
                      </button>
                      <button
                        disabled={
                          busy ||
                          row.status === "deleted" ||
                          row.status === "deleting"
                        }
                        className="min-h-11 underline"
                        onClick={() => void mutate(row, "delete")}
                      >
                        Delete stored file
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
            {rows[0] && (
              <p className="text-sm">
                Loaded {rows.length} evidence records on this page;{" "}
                {rows[0].total} at or after this cursor. Filters apply to this
                page.
              </p>
            )}
          </div>
        </details>
      </fieldset>
    </Panel>
  );
}
