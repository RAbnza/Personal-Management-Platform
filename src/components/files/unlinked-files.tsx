"use client";
import { useEffect, useRef, useState } from "react";
type Row = {
  id: string;
  original_filename: string;
  status: string;
  version: number;
};
export function UnlinkedFiles() {
  const [rows, setRows] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<object | null>(null);
  async function refresh() {
    const r = await fetch("/api/v1/files?unlinked=true", { cache: "no-store" });
    if (!r.ok) throw Error();
    const j = await r.json();
    if (!Array.isArray(j.attachments)) throw Error();
    setRows(j.attachments);
  }
  useEffect(() => {
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => setMessage("Unlinked files could not be loaded."));
  }, []);
  async function remove(row?: Row) {
    if (row)
      pending.current = {
        clientCommandId: crypto.randomUUID(),
        attachmentId: row.id,
        expectedVersion: row.version,
        operation: "delete",
      };
    if (!pending.current) return;
    setBusy(true);
    try {
      const r = await fetch("/api/v1/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current),
      });
      if (!r.ok) throw Error();
      const j = await r.json();
      if (typeof j.attachmentId !== "string") throw Error();
      await refresh();
      pending.current = null;
      setUncertain(false);
      setMessage("Deletion requested; storage acknowledgement is required.");
    } catch {
      setUncertain(true);
      setMessage("Deletion unconfirmed. Retry the identical command.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3">Unlinked files</summary>
      <p>
        Unlinked files retain storage quota for up to 30 days. Delete them here
        to request earlier cleanup.
      </p>
      <button
        className="min-h-11 rounded border px-4"
        onClick={() =>
          void refresh().catch(() => setMessage("Refresh failed."))
        }
      >
        Refresh unlinked files
      </button>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="break-words">
            {r.original_filename}: {r.status}{" "}
            <button
              className="min-h-11 rounded border px-4"
              disabled={busy || uncertain || r.status === "deleting"}
              onClick={() => void remove(r)}
            >
              Delete stored file
            </button>
          </li>
        ))}
      </ul>
      {uncertain && (
        <button
          className="min-h-11 rounded border px-4"
          disabled={busy}
          onClick={() => void remove()}
        >
          Retry identical deletion
        </button>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
