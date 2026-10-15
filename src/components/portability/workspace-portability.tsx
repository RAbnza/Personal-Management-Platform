"use client";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
type Account = {
  id: string;
  name: string;
  opening_cutoff_date: string;
  opening_minor: string;
};
type PreviewRow = {
  rowNo: number;
  normalized: {
    effectiveDate: string;
    kind: string;
    amountMinor: string;
    description: string;
  } | null;
  errors: string[];
  duplicateWarnings: string[];
};
type Batch = {
  id: string;
  state: string;
  preview_json: {
    previewHash: string;
    expenseMinor: string;
    incomeMinor: string;
    cashDeltaMinor: string;
    blockers: string[];
    rows: PreviewRow[];
  };
};
type RestorePreview = {
  runId: string;
  previewHash: string;
  preview: {
    blockers: string[];
    sourceRows: number;
    currentRows: number;
    sourceTotals: {
      cashMinor: string;
      expenseMinor: string;
      incomeMinor: string;
    };
    currentTotals: {
      cashMinor: string;
      expenseMinor: string;
      incomeMinor: string;
    };
    identityMapping: string;
  };
};
export function WorkspacePortability() {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [accountId, setAccountId] = useState(""),
    [dateMode, setDateMode] = useState(""),
    [rebase, setRebase] = useState(false),
    [earlierDate, setEarlierDate] = useState(""),
    [earlierMinor, setEarlierMinor] = useState(""),
    [batch, setBatch] = useState<Batch | null>(null),
    [rowStates, setRowStates] = useState<
      {
        row_no: number;
        state: string;
        financial_action_id: string | null;
        safe_error_code: string | null;
      }[]
    >([]),
    [choices, setChoices] = useState<Record<number, boolean>>({}),
    [ack, setAck] = useState(false),
    [duplicates, setDuplicates] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [restore, setRestore] = useState<RestorePreview | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [exports, setExports] = useState<string | null>(null),
    [history, setHistory] = useState<
      {
        id: string;
        state: string;
        recovery_retained: boolean;
        last_error_code: string | null;
      }[]
    >([]),
    [batches, setBatches] = useState<{ id: string; state: string }[]>([]);
  const csvInput = useRef<HTMLInputElement>(null),
    bundleInput = useRef<HTMLInputElement>(null),
    pending = useRef<{ url: string; payload: unknown } | null>(null);
  async function refreshLists() {
    const [a, b, h] = await Promise.all([
      fetch("/api/v1/imports?setup=true"),
      fetch("/api/v1/imports"),
      fetch("/api/v1/portability"),
    ]);
    if (a.ok) setAccounts((await a.json()).accounts);
    if (b.ok) setBatches((await b.json()).batches);
    if (h.ok) setHistory((await h.json()).restores);
  }
  useEffect(() => {
    void Promise.resolve()
      .then(() => refreshLists())
      .catch(() => setMessage("Private status could not be loaded."));
  }, []);
  async function loadBatch(id: string) {
    const r = await fetch(`/api/v1/imports?batchId=${id}`, {
      cache: "no-store",
    });
    if (!r.ok) throw Error();
    const j = await r.json();
    setBatch(j.batch);
    setRowStates(j.rows);
    setChoices(
      Object.fromEntries(
        j.batch.preview_json.rows.map((row: PreviewRow) => [
          row.rowNo,
          !row.errors.length && !row.duplicateWarnings.length,
        ]),
      ),
    );
  }
  async function request(url: string, payload: unknown) {
    pending.current = { url, payload };
    setBusy(true);
    try {
      const r = await fetch(url, {
        method:
          url.includes("imports") && !(payload as { csv?: string }).csv
            ? "PATCH"
            : "POST",
        headers: {
          "Content-Type":
            typeof (payload as { bundleText?: string }).bundleText === "string"
              ? "application/vnd.pmp.private-workspace-graph+json"
              : "application/json",
        },
        body:
          typeof (payload as { bundleText?: string }).bundleText === "string"
            ? (payload as { bundleText: string }).bundleText
            : JSON.stringify(payload),
      });
      if (!r.ok) {
        if (
          r.status >= 400 &&
          r.status < 500 &&
          ![408, 429].includes(r.status)
        ) {
          pending.current = null;
          setUncertain(false);
          setMessage(
            "Operation rejected. Review recorded status before a new command.",
          );
          await refreshLists();
          return;
        }
        throw Error();
      }
      const j = await r.json();
      if (!j || typeof j !== "object") throw Error();
      const operation = (payload as { operation?: string }).operation;
      if (
        (url.includes("imports") && typeof j.batchId !== "string") ||
        (operation === "export" && typeof j.exportRunId !== "string") ||
        (operation === "preview" &&
          (typeof j.runId !== "string" ||
            typeof j.previewHash !== "string" ||
            !Array.isArray(j.preview?.blockers))) ||
        (operation === "restore" && typeof j.restored !== "boolean")
      )
        throw Error();

      if (j.batchId) await loadBatch(j.batchId);
      if (j.runId && j.preview) setRestore(j);
      if (j.exportRunId) setExports(j.exportRunId);
      if (j.restored !== undefined) {
        setMessage(
          j.restored
            ? "Workspace replaced. Notification consent is disabled; recovery evidence is retained for 24 hours. Reload source pages."
            : "Restore failed. The previous workspace remains active.",
        );
        setRestore(null);
      } else setMessage("Command confirmed. Review the recorded status.");
      await refreshLists();
      pending.current = null;
      setUncertain(false);
    } catch {
      setUncertain(true);
      setMessage(
        "Operation unconfirmed or rejected. Retry keeps the exact command. Refresh status before choosing a new operation.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function stage() {
    const f = csvInput.current?.files?.[0],
      a = accounts.find((a) => a.id === accountId);
    if (!f || !a || !dateMode || f.size > 1048576) {
      setMessage(
        "Choose an owned account, explicit date interpretation and CSV up to 1 MiB.",
      );
      return;
    }
    let csvText: string;
    try {
      csvText = new TextDecoder("utf-8", { fatal: true }).decode(
        await f.arrayBuffer(),
      );
    } catch {
      setMessage("CSV must be valid UTF-8.");
      return;
    }
    await request("/api/v1/imports", {
      clientCommandId: crypto.randomUUID(),
      csv: csvText,
      assumptions: {
        sourceFormat: "pmp-cash-activity",
        formatVersion: 1,
        mapping: {
          date: "date",
          kind: "kind",
          amountMinor: "amount_minor",
          classification: "classification",
          description: "description",
          reference: "reference",
        },
        dateInterpretation: dateMode,
        currency: "PHP",
        targetAccountId: a.id,
        cutoffStrategy: rebase ? "rebase_history" : "after_opening",
        cutoffDate: a.opening_cutoff_date,
        earlierOpeningDate: rebase ? earlierDate : null,
        earlierOpeningMinor: rebase ? earlierMinor : null,
      },
    });
  }
  const disabled = busy || uncertain;
  return (
    <div className="space-y-6">
      <p role="status" className="break-words">
        {message}
      </p>
      {uncertain && (
        <button
          className="min-h-11 rounded border px-4"
          disabled={busy}
          onClick={() => {
            if (pending.current)
              void request(pending.current.url, pending.current.payload);
          }}
        >
          Retry identical command
        </button>
      )}
      <Panel
        title="CSV cash history"
        description="Review before posting. No bank, card, debt, transfer, refund or Career CSV format is inferred."
      >
        <details>
          <summary className="min-h-11 cursor-pointer py-3">
            Prepare an import
          </summary>
          <div className="space-y-4">
            <p className="text-sm break-words">
              Required header:
              date,kind,amount_minor,classification,description,reference.
              UTF-8; 500 rows; positive integer minor units. Expense
              classification is expense; income is earned, gift, reward or
              other.
            </p>
            <label className="block">
              Owned financial account
              <select
                className="mt-1 block min-h-11 w-full rounded border bg-background p-2"
                value={accountId}
                disabled={disabled}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Choose account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · opening {a.opening_cutoff_date} ·{" "}
                    {a.opening_minor} minor units
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Date interpretation
              <select
                className="mt-1 block min-h-11 w-full rounded border bg-background p-2"
                value={dateMode}
                disabled={disabled}
                onChange={(e) => setDateMode(e.target.value)}
              >
                <option value="">Choose explicitly</option>
                {["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={rebase}
                disabled={disabled}
                onChange={(e) => setRebase(e.target.checked)}
              />
              Rebase earlier history instead of adding it to the current opening
              balance
            </label>
            {rebase && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  Confirmed earlier opening date
                  <input
                    className="block min-h-11 w-full rounded border bg-background p-2"
                    type="date"
                    disabled={disabled}
                    value={earlierDate}
                    onChange={(e) => setEarlierDate(e.target.value)}
                  />
                </label>
                <label>
                  Confirmed earlier opening minor units
                  <input
                    className="block min-h-11 w-full rounded border bg-background p-2"
                    inputMode="numeric"
                    disabled={disabled}
                    value={earlierMinor}
                    onChange={(e) => setEarlierMinor(e.target.value)}
                  />
                </label>
              </div>
            )}
            <label className="block">
              UTF-8 cash CSV
              <input
                type="file"
                className="block w-full min-w-0"
                accept=".csv,text/csv"
                ref={csvInput}
                disabled={disabled}
              />
            </label>
            <button
              className="min-h-11 rounded border px-4"
              disabled={disabled}
              onClick={() => void stage()}
            >
              Create reviewed preview
            </button>
          </div>
        </details>
        <details>
          <summary className="min-h-11 cursor-pointer py-3">
            Resume an import batch
          </summary>
          <ul>
            {batches.map((b) => (
              <li key={b.id}>
                <button
                  className="min-h-11 max-w-full break-words text-link underline"
                  disabled={disabled}
                  onClick={() =>
                    void loadBatch(b.id).catch(() =>
                      setMessage("Batch unavailable."),
                    )
                  }
                >
                  {b.state} · {b.id.slice(0, 8)}
                </button>
              </li>
            ))}
          </ul>
        </details>
        {batch && (
          <div className="mt-4 space-y-4">
            <p>
              Batch: {batch.state}. Exact minor units: expense{" "}
              {batch.preview_json.expenseMinor}, income{" "}
              {batch.preview_json.incomeMinor}, cash change{" "}
              {batch.preview_json.cashDeltaMinor}.
            </p>
            <ul>
              {batch.preview_json.blockers.map((b) => (
                <li key={b} className="break-words">
                  Blocked: {b}
                </li>
              ))}
            </ul>
            <ol className="space-y-2">
              {batch.preview_json.rows.map((row) => (
                <li key={row.rowNo} className="rounded border p-3">
                  <label className="flex gap-3">
                    <input
                      type="checkbox"
                      disabled={
                        disabled ||
                        batch.state !== "previewed" ||
                        row.errors.length > 0
                      }
                      checked={choices[row.rowNo] ?? false}
                      onChange={(e) =>
                        setChoices((c) => ({
                          ...c,
                          [row.rowNo]: e.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0 break-words">
                      Row {row.rowNo}: {row.normalized?.effectiveDate}{" "}
                      {row.normalized?.kind} {row.normalized?.amountMinor} ·{" "}
                      {row.normalized?.description}
                    </span>
                  </label>
                  {row.errors.map((e) => (
                    <p key={e} className="break-words">
                      Invalid: {e}
                    </p>
                  ))}
                  {row.duplicateWarnings.map((w) => (
                    <p key={w} className="break-words">
                      Possible duplicate: {w}
                    </p>
                  ))}
                  {rowStates.find((s) => s.row_no === row.rowNo) && (
                    <p>
                      Recorded status:{" "}
                      {rowStates.find((s) => s.row_no === row.rowNo)!.state}
                    </p>
                  )}
                  {rowStates.find((s) => s.row_no === row.rowNo)
                    ?.financial_action_id && (
                    <a
                      className="inline-flex min-h-11 items-center text-link underline"
                      href={`/money/actions/${rowStates.find((s) => s.row_no === row.rowNo)!.financial_action_id}`}
                    >
                      Review posted action
                    </a>
                  )}
                </li>
              ))}
            </ol>
            {batch.state === "previewed" && (
              <>
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={duplicates}
                    onChange={(e) => setDuplicates(e.target.checked)}
                  />
                  I explicitly approve importing selected rows with duplicate
                  warnings
                </label>
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  I acknowledge any negative-balance effects of this reviewed
                  import
                </label>
                <button
                  className="min-h-11 rounded border px-4"
                  disabled={disabled || batch.preview_json.blockers.length > 0}
                  onClick={() =>
                    void request("/api/v1/imports", {
                      clientCommandId: crypto.randomUUID(),
                      batchId: batch.id,
                      operation: "confirm",
                      previewHash: batch.preview_json.previewHash,
                      decisions: batch.preview_json.rows.map((r) => ({
                        rowNo: r.rowNo,
                        choice: choices[r.rowNo] ? "import" : "skip",
                        acknowledgeDuplicates: duplicates,
                      })),
                      acknowledgeNegativeBalance: ack,
                    })
                  }
                >
                  Confirm exact preview
                </button>
              </>
            )}
            {["confirmed", "partial", "running"].includes(batch.state) && (
              <button
                className="min-h-11 rounded border px-4"
                disabled={disabled}
                onClick={() =>
                  void request("/api/v1/imports", {
                    clientCommandId: crypto.randomUUID(),
                    batchId: batch.id,
                    operation: "process",
                  })
                }
              >
                Process next safe chunk
              </button>
            )}
            {!["completed", "cancelled"].includes(batch.state) && (
              <button
                className="ml-3 min-h-11 rounded border px-4"
                disabled={disabled}
                onClick={() =>
                  void request("/api/v1/imports", {
                    clientCommandId: crypto.randomUUID(),
                    batchId: batch.id,
                    operation: "cancel",
                  })
                }
              >
                Cancel remaining rows
              </button>
            )}
            <p className="text-sm">
              Already posted rows remain immutable financial history. Correct or
              reverse their individual actions explicitly.
            </p>
          </div>
        )}
      </Panel>
      <Panel
        title="Portable workspace"
        description="Full recognized private history within 10,000 rows / 10 MiB. Authentication, jobs, export artifacts and attachment bytes are excluded."
      >
        <div className="space-y-4">
          <button
            className="min-h-11 rounded border px-4"
            disabled={disabled}
            onClick={() =>
              void request("/api/v1/portability", {
                operation: "export",
                clientCommandId: crypto.randomUUID(),
              })
            }
          >
            Prepare private workspace export
          </button>
          {exports && (
            <a
              className="ml-3 inline-flex min-h-11 items-center text-link underline"
              href={`/api/v1/portability?exportRunId=${exports}`}
            >
              Download private bundle · expires within 24 hours
            </a>
          )}
          <details>
            <summary className="min-h-11 cursor-pointer py-3">
              Preview replacement from a bundle
            </summary>
            <p className="text-sm">
              Replacement is destructive after confirmation. Recovery is
              retained for 24 hours. Current stored files must be explicitly
              deleted unless byte recovery is available. External delivery in
              flight blocks restoration. Consent stays disabled, pending imports
              are cancelled and executed command receipts remain retired.
            </p>
            <label className="block mt-3">
              Workspace JSON bundle
              <input
                ref={bundleInput}
                type="file"
                className="block w-full min-w-0"
                accept=".json,application/json"
                disabled={disabled}
              />
            </label>
            <button
              className="mt-3 min-h-11 rounded border px-4"
              disabled={disabled}
              onClick={() => {
                const f = bundleInput.current?.files?.[0];
                if (!f || f.size > 10 * 1024 * 1024) {
                  setMessage("Choose a JSON bundle up to 10 MiB.");
                  return;
                }
                void f
                  .arrayBuffer()
                  .then((bytes) =>
                    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
                  )
                  .then((text) =>
                    request(
                      "/api/v1/portability?operation=preview&clientCommandId=" +
                        crypto.randomUUID(),
                      { operation: "preview", bundleText: text },
                    ),
                  )
                  .catch(() => setMessage("Bundle JSON is invalid."));
              }}
            >
              Validate restoration preview
            </button>
            {restore && (
              <div className="mt-4 space-y-3">
                <p>
                  Current rows {restore.preview.currentRows}; replacement rows{" "}
                  {restore.preview.sourceRows}.
                </p>
                <p className="break-words">{restore.preview.identityMapping}</p>
                <p>
                  Exact current cash {restore.preview.currentTotals.cashMinor};
                  replacement cash {restore.preview.sourceTotals.cashMinor}{" "}
                  minor units.
                </p>
                <p>
                  Replacement recognized expense{" "}
                  {restore.preview.sourceTotals.expenseMinor}; income{" "}
                  {restore.preview.sourceTotals.incomeMinor} minor units.
                </p>
                {restore.preview.blockers.map((b) => (
                  <p key={b} className="break-words">
                    Blocked: {b}
                  </p>
                ))}
                <label className="block">
                  Type replace-private-workspace to approve this exact preview
                  <input
                    className="block min-h-11 w-full rounded border bg-background p-2"
                    value={confirmation}
                    disabled={disabled}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
                <button
                  className="min-h-11 rounded border px-4"
                  disabled={
                    disabled ||
                    confirmation !== "replace-private-workspace" ||
                    restore.preview.blockers.length > 0
                  }
                  onClick={() =>
                    void request("/api/v1/portability", {
                      operation: "restore",
                      clientCommandId: crypto.randomUUID(),
                      runId: restore.runId,
                      previewHash: restore.previewHash,
                      confirmation,
                    })
                  }
                >
                  Replace after verified preview
                </button>
              </div>
            )}
          </details>
          <ul>
            {history.map((h) => (
              <li key={h.id} className="break-words">
                Restoration {h.id.slice(0, 8)}: {h.state} · recovery{" "}
                {h.recovery_retained ? "retained" : "not retained"}{" "}
                {h.last_error_code}
                {h.recovery_retained && (
                  <a
                    className="block underline min-h-11"
                    href={`/api/v1/portability?recoveryRunId=${h.id}`}
                  >
                    Download recovery bundle (within 24 hours)
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}
