"use client";
import { useEffect, useState } from "react";
import { UnlinkedFiles } from "./unlinked-files";
import { Attachments } from "./attachments";
const kinds = [
  ["financial_action", "Financial action / card purchase"],
  ["debt", "Debt"],
  ["debt_settlement", "Debt settlement"],
  ["reconciliation", "Account reconciliation"],
  ["card_statement_revision", "Exact credit-card statement revision"],
  ["job_application", "Career application"],
  ["application_event", "Application event"],
  ["resume_version", "Exact resume version"],
] as const;
export function FileCatalog() {
  const [kind, setKind] = useState<string>("financial_action"),
    [id, setId] = useState(""),
    [rows, setRows] = useState<{ id: string; label: string }[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [after, setAfter] = useState<string | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void fetch(
      `/api/v1/files?catalog=true&sourceKind=${kind}${after ? `&afterId=${after}` : ""}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        const j = await r.json();
        if (live) {
          setRows(j.sources);
          setCursor(j.nextCursor);
        }
      })
      .catch(() => {
        if (live) setMessage("Source evidence is unavailable.");
      });
    return () => {
      live = false;
    };
  }, [kind, after]);
  return (
    <div className="space-y-4">
      <UnlinkedFiles />
      <p>
        Choose an owned record. Statement and resume files attach to the exact
        immutable version you select.
      </p>
      <label className="block">
        Evidence record type
        <select
          className="block min-h-11 w-full rounded border bg-background p-2"
          value={kind}
          onChange={(e) => {
            setId("");
            setKind(e.target.value);
            setAfter(null);
          }}
        >
          {kinds.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Owned source record
        <select
          className="block min-h-11 w-full rounded border bg-background p-2"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">Choose record</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          className="min-h-11 rounded border px-4"
          disabled={!cursor}
          onClick={() => setAfter(cursor)}
        >
          Next source page
        </button>
        <button
          className="min-h-11 rounded border px-4"
          disabled={!after}
          onClick={() => setAfter(null)}
        >
          First source page
        </button>
      </div>
      <p role="status">{message}</p>
      {id && (
        <Attachments key={`${kind}:${id}`} sourceKind={kind} sourceId={id} />
      )}
    </div>
  );
}
