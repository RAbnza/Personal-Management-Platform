"use client";
import { useEffect, useRef, useState } from "react";
import { WorkspaceViews } from "@/components/ui/workspace-views";
import { inspectCashCsv, cashColumnDefaults } from "./csv-columns";
import { formatMoneyMinorUnits } from "@/shared/money-display";
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
  const [step, setStep] = useState(0),
    [columns, setColumns] = useState<string[]>([]),
    [sample, setSample] = useState<string[]>([]),
    [mapping, setMapping] = useState(cashColumnDefaults),
    [csvCount, setCsvCount] = useState(0),
    [rowFilter, setRowFilter] = useState("all");
  const readSequence = useRef(0);
  async function inspectFile(file: File | undefined) {
    const sequence = ++readSequence.current;
    setColumns([]);
    setSample([]);
    setCsvCount(0);
    setStep(0);
    if (!file) return;
    if (file.size > 1048576) {
      setMessage("Choose a CSV up to 1 MiB.");
      return;
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      const result = inspectCashCsv(text);
      if (sequence !== readSequence.current) return;
      setColumns(result.columns);
      setSample(result.sample);
      setCsvCount(result.count);
      setMapping(
        Object.fromEntries(
          Object.entries(cashColumnDefaults).map(([key, value]) => [
            key,
            result.columns.includes(value) ? value : "",
          ]),
        ) as typeof cashColumnDefaults,
      );
      setMessage("");
    } catch (e) {
      if (sequence === readSequence.current)
        setMessage(e instanceof Error ? e.message : "CSV could not be read.");
    }
  }
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
    setStep(j.batch.state === "previewed" ? 2 : 3);
    setAck(false);
    setDuplicates(false);
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
      if (j.runId && j.preview) {
        setRestore(j);
        setConfirmation("");
      }
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
    if (
      !f ||
      !a ||
      !dateMode ||
      f.size > 1048576 ||
      columns.length !== 6 ||
      new Set(Object.values(mapping)).size !== 6 ||
      Object.values(mapping).some((v) => !columns.includes(v))
    ) {
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
        mapping,
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
      <WorkspaceViews
        label="Data management tasks"
        views={[
          {
            label: "Import cash CSV",
            content: (
              <>
                <Panel
                  title="CSV cash history"
                  description="Review before posting. No bank, card, debt, transfer, refund or Career CSV format is inferred."
                >
                  <ol
                    aria-label="CSV import steps"
                    className="mb-5 grid gap-2 sm:grid-cols-4"
                  >
                    {[
                      "Choose file",
                      "Map and interpret",
                      "Review and confirm",
                      "Process and outcome",
                    ].map((label, i) => (
                      <li
                        key={label}
                        aria-current={step === i ? "step" : undefined}
                        className={`rounded-control p-3 text-sm font-semibold ${step === i ? "bg-primary text-primary-foreground" : "bg-surface-subtle"}`}
                      >
                        {i + 1}. {label}
                      </li>
                    ))}
                  </ol>
                  <div
                    hidden={step !== 0}
                    className="space-y-4 rounded-card border border-dashed border-border p-5"
                  >
                    <p className="text-sm">
                      UTF-8 cash activity only; 1 MiB, 500 rows, six columns.
                      Amounts must be positive integer minor units. Map your
                      column names in the next step.
                    </p>
                    <label className="grid gap-2">
                      UTF-8 cash CSV
                      <input
                        type="file"
                        className="block w-full min-w-0"
                        accept=".csv,text/csv"
                        ref={csvInput}
                        disabled={disabled}
                        onChange={(e) => void inspectFile(e.target.files?.[0])}
                      />
                    </label>
                    {columns.length > 0 && (
                      <p>
                        {csvCount} data rows; {columns.length} columns ready to
                        map.
                      </p>
                    )}
                    <button
                      type="button"
                      className="action-link"
                      disabled={disabled || columns.length !== 6}
                      onClick={() => setStep(1)}
                    >
                      Continue to column mapping
                    </button>
                  </div>
                  <div hidden={step !== 1} className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      Map each cash field
                    </h3>
                    <p className="text-sm">
                      Use each column once. Expense classification is expense;
                      income is earned, gift, reward or other. The server
                      validates every row before confirmation.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.entries(mapping).map(([key, value]) => (
                        <label
                          key={key}
                          className="grid gap-2 rounded-control bg-surface-subtle p-3 text-sm"
                        >
                          {key.replaceAll(/([A-Z])/g, " $1")}
                          <select
                            aria-label={`CSV column for ${key}`}
                            disabled={disabled}
                            className="min-h-11 rounded-control border border-input bg-surface px-3"
                            value={value}
                            onChange={(e) =>
                              setMapping({ ...mapping, [key]: e.target.value })
                            }
                          >
                            <option value="">Choose source column</option>
                            {columns.map((column) => (
                              <option key={column}>{column}</option>
                            ))}
                          </select>
                          <span className="break-words text-xs text-muted-foreground">
                            First row:{" "}
                            {value
                              ? sample[columns.indexOf(value)] || "(empty)"
                              : "Select a column"}
                          </span>
                        </label>
                      ))}
                    </div>
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
                      Rebase earlier history instead of adding it to the current
                      opening balance
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
                    <button
                      className="min-h-11 rounded border px-4"
                      disabled={
                        disabled ||
                        !accountId ||
                        !dateMode ||
                        new Set(Object.values(mapping)).size !== 6 ||
                        Object.values(mapping).some((v) => !columns.includes(v))
                      }
                      onClick={() => void stage()}
                    >
                      Create reviewed preview
                    </button>
                    <button
                      type="button"
                      className="action-link ml-3"
                      disabled={disabled}
                      onClick={() => setStep(0)}
                    >
                      Back to file
                    </button>
                  </div>
                  {step >= 2 && (
                    <button
                      type="button"
                      className="action-link"
                      disabled={disabled}
                      onClick={() => setStep(0)}
                    >
                      Choose another CSV (current batch stays in history)
                    </button>
                  )}
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
                  {batch && step >= 2 && (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        {[
                          [
                            "Valid rows",
                            batch.preview_json.rows.filter(
                              (r) => !r.errors.length,
                            ).length,
                          ],
                          [
                            "Rows with problems",
                            batch.preview_json.rows.filter(
                              (r) => r.errors.length,
                            ).length,
                          ],
                          [
                            "Possible duplicates",
                            batch.preview_json.rows.filter(
                              (r) => r.duplicateWarnings.length,
                            ).length,
                          ],
                        ].map(([label, count]) => (
                          <div
                            className="rounded-card bg-surface-subtle p-4"
                            key={label}
                          >
                            <p className="text-sm">{label}</p>
                            <p className="text-2xl font-semibold">{count}</p>
                          </div>
                        ))}
                      </div>
                      {step === 3 && (
                        <div className="rounded-card bg-[var(--teal-surface)] p-4">
                          <p className="font-semibold">
                            {
                              rowStates.filter((r) => r.state === "posted")
                                .length
                            }{" "}
                            posted /{" "}
                            {
                              rowStates.filter((r) => r.state === "skipped")
                                .length
                            }{" "}
                            skipped /{" "}
                            {
                              rowStates.filter((r) => r.state === "failed")
                                .length
                            }{" "}
                            failed
                          </p>
                          <progress
                            className="mt-3 h-3 w-full"
                            aria-label="Import rows posted or skipped"
                            max={Math.max(1, rowStates.length)}
                            value={
                              rowStates.filter((r) =>
                                ["posted", "skipped"].includes(r.state),
                              ).length
                            }
                          />
                          <p className="text-sm">
                            Progress reflects recorded rows. Cancellation
                            preserves already posted history.
                          </p>
                        </div>
                      )}
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
                      <label className="grid gap-2 text-sm">
                        Review rows
                        <select
                          className="min-h-11 rounded-control border border-input bg-surface px-3"
                          value={rowFilter}
                          onChange={(e) => setRowFilter(e.target.value)}
                        >
                          <option value="all">All rows</option>
                          <option value="problems">
                            Problems and duplicate warnings
                          </option>
                          <option value="selected">Selected to import</option>
                        </select>
                      </label>
                      <ol
                        className="max-h-[32rem] space-y-2 overflow-y-auto rounded-control border border-border p-2"
                        tabIndex={0}
                        aria-label="Import row evidence"
                      >
                        {batch.preview_json.rows
                          .filter(
                            (row) =>
                              rowFilter === "all" ||
                              (rowFilter === "problems"
                                ? row.errors.length ||
                                  row.duplicateWarnings.length
                                : choices[row.rowNo]),
                          )
                          .map((row) => (
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
                                  Row {row.rowNo}:{" "}
                                  {row.normalized?.effectiveDate}{" "}
                                  {row.normalized?.kind}{" "}
                                  {row.normalized?.amountMinor} ·{" "}
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
                              {rowStates.find(
                                (s) => s.row_no === row.rowNo,
                              ) && (
                                <p>
                                  Recorded status:{" "}
                                  {
                                    rowStates.find(
                                      (s) => s.row_no === row.rowNo,
                                    )!.state
                                  }
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
                            I explicitly approve importing selected rows with
                            duplicate warnings
                          </label>
                          <label className="flex gap-3">
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={ack}
                              onChange={(e) => setAck(e.target.checked)}
                            />
                            I acknowledge any negative-balance effects of this
                            reviewed import
                          </label>
                          <button
                            className="min-h-11 rounded border px-4"
                            disabled={
                              disabled || batch.preview_json.blockers.length > 0
                            }
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
                      {["confirmed", "partial", "running"].includes(
                        batch.state,
                      ) && (
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
                        Already posted rows remain immutable financial history.
                        Correct or reverse their individual actions explicitly.
                      </p>
                    </div>
                  )}
                </Panel>
              </>
            ),
          },
          {
            label: "Export and replace",
            content: (
              <>
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
                        Replacement is destructive after confirmation. Recovery
                        is retained for 24 hours. Current stored files must be
                        explicitly deleted unless byte recovery is available.
                        External delivery in flight blocks restoration. Consent
                        stays disabled, pending imports are cancelled and
                        executed command receipts remain retired.
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
                              new TextDecoder("utf-8", { fatal: true }).decode(
                                bytes,
                              ),
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
                          <div
                            className="overflow-x-auto"
                            role="region"
                            aria-label="Workspace replacement comparison"
                            tabIndex={0}
                          >
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr>
                                  <th className="p-3">Scope</th>
                                  <th className="p-3">Current</th>
                                  <th className="p-3">Replacement</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  [
                                    "Records",
                                    String(restore.preview.currentRows),
                                    String(restore.preview.sourceRows),
                                  ],
                                  [
                                    "Cash",
                                    formatMoneyMinorUnits(
                                      "PHP",
                                      restore.preview.currentTotals.cashMinor,
                                    ),
                                    formatMoneyMinorUnits(
                                      "PHP",
                                      restore.preview.sourceTotals.cashMinor,
                                    ),
                                  ],
                                  [
                                    "Recognized expenses",
                                    formatMoneyMinorUnits(
                                      "PHP",
                                      restore.preview.currentTotals
                                        .expenseMinor,
                                    ),
                                    formatMoneyMinorUnits(
                                      "PHP",
                                      restore.preview.sourceTotals.expenseMinor,
                                    ),
                                  ],
                                  [
                                    "Recognized income",
                                    formatMoneyMinorUnits(
                                      "PHP",
                                      restore.preview.currentTotals.incomeMinor,
                                    ),
                                    formatMoneyMinorUnits(
                                      "PHP",
                                      restore.preview.sourceTotals.incomeMinor,
                                    ),
                                  ],
                                ].map(([label, current, next]) => (
                                  <tr
                                    key={label}
                                    className="border-t border-border"
                                  >
                                    <th className="p-3">{label}</th>
                                    <td className="p-3 tabular-nums">
                                      {current}
                                    </td>
                                    <td className="p-3 tabular-nums">{next}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="break-words">
                            {restore.preview.identityMapping}
                          </p>
                          {restore.preview.blockers.map((b) => (
                            <p key={b} className="break-words">
                              Blocked:{" "}
                              {b ===
                              "SHARED_PRIVATE_HISTORY_REQUIRES_UNMODIFIED_TRUSTED_OWN_EXPORT"
                                ? "Adopted shared history requires an unmodified export from this same account. Shared group authority cannot be imported from a private bundle."
                                : b}
                            </p>
                          ))}
                          <label className="block">
                            Type replace-private-workspace to approve this exact
                            preview
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
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
