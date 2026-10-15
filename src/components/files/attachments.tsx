"use client";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
type Row = {
  id: string;
  original_filename: string;
  status: string;
  version: number;
  scan_result_code: string | null;
  total: string;
};
export function Attachments({
  sourceKind,
  sourceId,
}: {
  sourceKind: string;
  sourceId: string;
}) {
  const [expanded, setExpanded] = useState(false),
    [afterId, setAfterId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [mutationUncertain, setMutationUncertain] = useState(false);
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
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw Error();
      const j = await r.json();
      setRows(j.attachments);
    } catch {
      setMessage("Evidence could not be loaded. Refresh to retry.");
    }
  }
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    void fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const j = await r.json();
        if (live) setRows(j.attachments);
      })
      .catch(() => {
        if (live) setMessage("Evidence could not be loaded.");
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
      <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer py-3">
          Manage evidence files
        </summary>
        <div className="space-y-4">
          <p className="text-sm">
            PDF, JPEG or PNG; 10 MiB per file, 1 GiB per workspace. Original
            file metadata is retained. No inline document previews.
          </p>
          <label className="block">
            Evidence file
            <input
              ref={input}
              disabled={busy || uncertain}
              className="mt-2 block w-full min-w-0"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="min-h-11 rounded border px-4"
              disabled={busy}
              onClick={() => void upload()}
            >
              {uncertain ? "Retry identical upload" : "Upload privately"}
            </button>
            <button
              type="button"
              className="min-h-11 rounded border px-4"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Refresh scan status
            </button>
          </div>
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
              onClick={() => setAfterId(rows.at(-1)!.id)}
            >
              Next file page
            </button>
            <button
              className="min-h-11 rounded border px-4"
              disabled={busy || !afterId}
              onClick={() => setAfterId(null)}
            >
              First file page
            </button>
          </div>
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded border p-3">
                <p className="break-words font-medium">
                  {row.original_filename}
                </p>
                <p>{row.status.replaceAll("_", " ")}</p>
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
                    disabled={busy}
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
              Showing {rows.length} of {rows[0].total} evidence records.
            </p>
          )}
        </div>
      </details>
    </Panel>
  );
}
