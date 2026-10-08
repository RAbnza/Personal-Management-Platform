"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Panel } from "@/components/ui/panel";
import { ReconciliationHistory } from "./reconciliation-history";
import {
  adjustAccountBodySchema,
  adjustmentPreviewSchema,
  adjustmentResultSchema,
  reconcileAccountBodySchema,
  reconciliationPreviewSchema,
  reconciliationResultSchema,
  type AdjustAccountBody,
  type AdjustmentPreview,
  type ReconcileAccountBody,
  type ReconciliationItem,
  type ReconciliationPreview,
  type ReconciliationSetup,
} from "@/modules/finance/domain/reconciliation";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
type Pending =
  | {
      kind: "comparison";
      body: ReconcileAccountBody;
      preview: ReconciliationPreview;
    }
  | { kind: "adjustment"; body: AdjustAccountBody; preview: AdjustmentPreview };
function minor(value: string) {
  const s = value.trim(),
    negative = s.startsWith("-");
  return (
    (negative ? -1n : 1n) *
    parsePhpAmountToMinorUnits(negative ? s.slice(1) : s)
  ).toString();
}
function decimal(value: string) {
  const n = BigInt(value),
    a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}
export function AccountReconciliationForm({
  setup: suppliedSetup,
  today,
}: {
  setup: ReconciliationSetup;
  today: string;
}) {
  const [setup] = useState(() => structuredClone(suppliedSetup));
  const changed =
    suppliedSetup.financialRevision !== setup.financialRevision ||
    suppliedSetup.account.version !== setup.account.version ||
    suppliedSetup.history.map((r) => r.reconciliationId).join() !==
      setup.history.map((r) => r.reconciliationId).join();
  const [kind, setKind] = useState<"comparison" | "adjustment">("comparison");
  const [stage, setStage] = useState<
    | "editing"
    | "validating"
    | "reviewing"
    | "saving"
    | "unconfirmed"
    | "stale"
    | "saved"
  >("editing");
  const [date, setDate] = useState(today),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState(""),
    [selected, setSelected] = useState(""),
    [negative, setNegative] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false),
    reviewRef = useRef<HTMLDivElement>(null);
  const money = (s: string) => formatMoneyMinorUnits(setup.account.currency, s),
    base = `/api/v1/accounts/${setup.account.financialAccountId}`;
  const page = `/money/accounts/${setup.account.financialAccountId}/reconcile`;
  const wire = (p: Pick<Pending, "body">) => {
    const { financialAccountId: _account, ...body } = p.body;
    void _account;
    return JSON.stringify(body);
  };
  const endpoint = (k: typeof kind) =>
    `${base}/${k === "comparison" ? "reconciliations" : "adjustments"}`;
  useEffect(() => {
    if (["reviewing", "unconfirmed", "stale"].includes(stage))
      reviewRef.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (stage !== "saving" && stage !== "unconfirmed") return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const navigate = (e: MouseEvent) => {
      const a =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (
        a &&
        !window.confirm(
          "Save outcome is unconfirmed. Leaving discards the retained retry command. Stay here to retry safely.",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [stage]);
  function edit() {
    setMessage(null);
    setNegative(false);
  }
  async function send(url: string, body: string) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      return { response, data: await response.json() };
    } finally {
      clearTimeout(timer);
    }
  }
  async function review() {
    if (busy.current || changed) return;
    setMessage(null);
    let body: ReconcileAccountBody | AdjustAccountBody;
    try {
      const common = {
        clientCommandId: crypto.randomUUID(),
        financialAccountId: setup.account.financialAccountId,
        expectedFinancialRevision: setup.financialRevision,
        expectedAccountVersion: setup.account.version,
      };
      body =
        kind === "comparison"
          ? reconcileAccountBodySchema.parse({
              ...common,
              cutoffDate: date,
              observedMinor: minor(amount),
              reference: reference.trim() || null,
              notes: notes.trim() || null,
              supersedesReconciliationId: selected || null,
            })
          : adjustAccountBodySchema.parse({
              ...common,
              effectiveDate: date,
              signedAdjustmentMinor: minor(amount),
              reason,
              reconciliationId: selected || null,
              acknowledgeNegativeBalance: negative,
            });
    } catch {
      setMessage(
        kind === "comparison"
          ? "Enter a valid date and exact signed balance with at most two decimals."
          : "Enter a valid date, nonzero signed amount within the supported limit, and a reason.",
      );
      return;
    }
    busy.current = true;
    setStage("validating");
    try {
      const { response: res, data } = await send(
        `${endpoint(kind)}/preview`,
        wire({ body }),
      );
      if (!res.ok) {
        if (data?.code === "RECONCILIATION_PREVIEW_STALE") {
          setStage("stale");
          setMessage(data.message);
          return;
        }
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Preview is unavailable. No command was saved.",
        );
      }
      const p: Pending =
        kind === "comparison"
          ? {
              kind,
              body: reconcileAccountBodySchema.parse(body),
              preview: reconciliationPreviewSchema.parse(data),
            }
          : {
              kind,
              body: adjustAccountBodySchema.parse(body),
              preview: adjustmentPreviewSchema.parse(data),
            };
      if (
        p.preview.financialAccountId !== body.financialAccountId ||
        p.preview.financialRevision !== body.expectedFinancialRevision ||
        (p.kind === "comparison" &&
          (p.preview.cutoffDate !== p.body.cutoffDate ||
            p.preview.observedMinor !== p.body.observedMinor ||
            p.preview.supersedesReconciliationId !==
              p.body.supersedesReconciliationId)) ||
        (p.kind === "adjustment" &&
          (p.preview.effectiveDate !== p.body.effectiveDate ||
            p.preview.signedAdjustmentMinor !== p.body.signedAdjustmentMinor ||
            p.preview.reason !== p.body.reason ||
            (p.preview.reconciliation?.reconciliationId ?? null) !==
              p.body.reconciliationId))
      )
        throw new Error("Unexpected account preview.");
      setPending(p);
      setStage("reviewing");
    } catch (e) {
      setStage("editing");
      setMessage(
        e instanceof Error
          ? e.message
          : "Preview is unavailable. Nothing was saved.",
      );
    } finally {
      busy.current = false;
    }
  }
  async function save() {
    if (
      !pending ||
      busy.current ||
      stage === "stale" ||
      (changed && stage !== "unconfirmed")
    )
      return;
    busy.current = true;
    setStage("saving");
    setMessage(null);
    try {
      const { response: res, data } = await send(
        endpoint(pending.kind),
        wire(pending),
      );
      if (res.ok) {
        const r =
          pending.kind === "comparison"
            ? reconciliationResultSchema.parse(data)
            : adjustmentResultSchema.parse(data);
        if (
          r.clientCommandId !== pending.body.clientCommandId ||
          r.preview.financialAccountId !== pending.body.financialAccountId ||
          JSON.stringify(r.preview) !== JSON.stringify(pending.preview)
        )
          throw new Error("Unexpected command result.");
        setStage("saved");
        return;
      }
      if (
        data?.code === "RECONCILIATION_PREVIEW_STALE" ||
        data?.code === "IDEMPOTENCY_CONFLICT"
      ) {
        setStage("stale");
        setMessage(data.message);
        return;
      }
      if (res.status === 422 || res.status === 404) {
        setStage("reviewing");
        setMessage(
          typeof data?.message === "string"
            ? data.message
            : "The command was rejected. Edit and review again.",
        );
        return;
      }
      throw new Error("Unconfirmed save");
    } catch {
      setStage("unconfirmed");
      setMessage(
        "The save outcome is unconfirmed. Keep this page open and retry the identical command to recover its result safely.",
      );
    } finally {
      busy.current = false;
    }
  }
  function fromHistory(r: ReconciliationItem, mode: typeof kind) {
    if (stage !== "editing") return;
    setKind(mode);
    setDate(r.cutoffDate);
    setAmount(
      decimal(mode === "comparison" ? r.observedMinor : r.differenceMinor),
    );
    setSelected(r.reconciliationId);
    setReference(r.reference ?? "");
    setNotes(r.notes ?? "");
    edit();
    reviewRef.current?.focus();
  }
  const editing = stage === "editing";
  return (
    <div className="space-y-6">
      <Panel
        title={`Compare ${setup.account.name}`}
        description="Compare a provider or actual balance at the end of a chosen date. Saving a comparison never changes cash."
      >
        <p>
          Current tracked balance:{" "}
          <span className="numeric-value font-semibold">
            {money(setup.account.currentBalanceMinor)}
          </span>
          . Opening cutoff: {setup.account.openingCutoffDate}.
        </p>
        {message ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {message}
          </p>
        ) : null}
        {changed &&
        stage !== "unconfirmed" &&
        stage !== "saving" &&
        stage !== "saved" ? (
          <p role="alert" className="mt-4">
            The account snapshot changed.{" "}
            <Link href={page} className="text-link underline">
              Reload and review fresh information
            </Link>
            .
          </p>
        ) : null}
        {stage === "saved" ? (
          <div role="status" className="mt-4">
            <p>
              {pending?.kind === "adjustment"
                ? "Adjustment recorded. Compare again to verify the observed balance."
                : "Comparison recorded. No balance adjustment was made."}
            </p>
            <Link
              href={page}
              className="inline-flex min-h-11 text-link underline"
            >
              Load current comparison history
            </Link>
            <Link
              href={`/money/accounts/${setup.account.financialAccountId}/history`}
              className="ml-4 inline-flex min-h-11 text-link underline"
            >
              View account activity
            </Link>
          </div>
        ) : null}
        <div ref={reviewRef} tabIndex={-1} className="mt-4 outline-none">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void review();
              }}
              className="space-y-4"
            >
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setKind("comparison");
                    setSelected("");
                    edit();
                  }}
                >
                  Record comparison
                </Button>
                {!setup.account.archived ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setKind("adjustment");
                      setSelected("");
                      setAmount("");
                      edit();
                    }}
                  >
                    Record explicit adjustment
                  </Button>
                ) : null}
              </div>
              <fieldset disabled={changed} className="space-y-4">
                <legend className="text-lg font-semibold">
                  {kind === "comparison"
                    ? "Observed balance comparison"
                    : "Explicit cash/equity adjustment"}
                </legend>
                <FormField
                  label={
                    kind === "comparison"
                      ? "Comparison cutoff date"
                      : "Adjustment effective date"
                  }
                  htmlFor="reconcile-date"
                >
                  <Input
                    id="reconcile-date"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      edit();
                    }}
                    required
                  />
                </FormField>
                <FormField
                  label={
                    kind === "comparison"
                      ? "Observed/provider balance"
                      : "Signed adjustment amount"
                  }
                  htmlFor="reconcile-amount"
                  description={`Enter ${setup.account.currency} with up to two decimals. Use a minus sign for a negative balance or decrease.`}
                >
                  <Input
                    id="reconcile-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      edit();
                    }}
                    required
                  />
                </FormField>
                <FormField
                  label={
                    kind === "comparison"
                      ? "Comparison to supersede (optional)"
                      : "Link to comparison (optional)"
                  }
                  htmlFor="reconcile-source"
                >
                  <select
                    id="reconcile-source"
                    className="min-h-11 w-full rounded-control border border-input bg-surface p-2"
                    value={selected}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      edit();
                    }}
                  >
                    <option value="">
                      {kind === "comparison"
                        ? "New observation"
                        : "Standalone adjustment"}
                    </option>
                    {setup.history
                      .filter(
                        (r) =>
                          !r.supersededByReconciliationId &&
                          (kind === "comparison" || !r.needsReview),
                      )
                      .map((r) => (
                        <option
                          key={r.reconciliationId}
                          value={r.reconciliationId}
                        >
                          {r.cutoffDate}: {money(r.differenceMinor)} difference
                        </option>
                      ))}
                  </select>
                </FormField>
                {kind === "comparison" ? (
                  <>
                    <FormField
                      label="Statement/provider reference (optional)"
                      htmlFor="reconcile-reference"
                    >
                      <Input
                        id="reconcile-reference"
                        value={reference}
                        onChange={(e) => {
                          setReference(e.target.value);
                          edit();
                        }}
                        maxLength={2000}
                      />
                    </FormField>
                    <FormField
                      label="Notes (optional)"
                      htmlFor="reconcile-notes"
                    >
                      <textarea
                        id="reconcile-notes"
                        className="w-full rounded-control border border-input bg-surface p-2"
                        value={notes}
                        onChange={(e) => {
                          setNotes(e.target.value);
                          edit();
                        }}
                        maxLength={20000}
                      />
                    </FormField>
                  </>
                ) : (
                  <>
                    <p className="text-sm">
                      This action explicitly changes tracked cash against
                      adjustment equity. An unexplained increase is not income;
                      a decrease is not spending.
                    </p>
                    <FormField
                      label="Adjustment reason"
                      htmlFor="adjustment-reason"
                    >
                      <Input
                        id="adjustment-reason"
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          edit();
                        }}
                        maxLength={2000}
                        required
                      />
                    </FormField>
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={negative}
                        onChange={(e) => setNegative(e.target.checked)}
                      />
                      I acknowledge any negative tracked balance shown in the
                      review.
                    </label>
                  </>
                )}
                <Button type="submit">
                  {kind === "comparison"
                    ? "Review comparison"
                    : "Review adjustment"}
                </Button>
              </fieldset>
            </form>
          ) : null}
          {stage === "validating" ? (
            <p role="status">Validating exact preview...</p>
          ) : null}
          {stage === "saving" ? (
            <p role="status">Saving the reviewed command...</p>
          ) : null}
          {pending &&
          stage !== "editing" &&
          stage !== "validating" &&
          stage !== "saved" ? (
            <section
              aria-label="Exact confirmation preview"
              className="space-y-3"
            >
              <h2 className="text-lg font-semibold">
                {pending.kind === "comparison"
                  ? "Review comparison"
                  : "Review explicit balance adjustment"}
              </h2>
              <p>
                Account: {pending.preview.accountName}. Currency:{" "}
                {pending.preview.currency}.
              </p>
              {pending.kind === "comparison" ? (
                <>
                  <p>End-of-day cutoff: {pending.preview.cutoffDate}.</p>
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <dt>Observed/provider balance</dt>
                      <dd>{money(pending.preview.observedMinor)}</dd>
                    </div>
                    <div>
                      <dt>Calculated tracked balance</dt>
                      <dd>{money(pending.preview.calculatedMinor)}</dd>
                    </div>
                    <div>
                      <dt>Exact difference</dt>
                      <dd>{money(pending.preview.differenceMinor)}</dd>
                    </div>
                  </dl>
                  <p>
                    {pending.preview.status === "verified"
                      ? "Balances match. Saving this evidence creates no transaction."
                      : "Difference recorded for investigation. Saving does not adjust the balance."}
                  </p>
                  <p>
                    Statement reference: {pending.body.reference ?? "None"}.
                    Notes: {pending.body.notes ?? "None"}.
                  </p>
                  <p>
                    Superseded comparison:{" "}
                    {pending.body.supersedesReconciliationId ?? "None"}. Cutoff
                    source version: {pending.preview.sourceJournalCount}.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Effective date: {pending.preview.effectiveDate}. Reason:{" "}
                    {pending.body.reason}.
                  </p>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt>Cash adjustment</dt>
                      <dd>{money(pending.preview.signedAdjustmentMinor)}</dd>
                    </div>
                    <div>
                      <dt>Adjustment equity posting</dt>
                      <dd>{money(pending.preview.adjustmentEquityMinor)}</dd>
                    </div>
                    <div>
                      <dt>Tracked balance at date</dt>
                      <dd>
                        {money(pending.preview.balanceAtDateBeforeMinor)} to{" "}
                        {money(pending.preview.balanceAtDateAfterMinor)}
                      </dd>
                    </div>
                    <div>
                      <dt>Current tracked balance</dt>
                      <dd>
                        {money(pending.preview.currentBalanceBeforeMinor)} to{" "}
                        {money(pending.preview.currentBalanceAfterMinor)}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    Income: {money("0")}. Spending: {money("0")}. One explicit
                    cash movement.
                  </p>
                  {pending.preview.reconciliation ? (
                    <p>
                      Linked comparison{" "}
                      {pending.preview.reconciliation.reconciliationId}, cutoff{" "}
                      {pending.preview.reconciliation.cutoffDate}. Observed
                      balance{" "}
                      {money(pending.preview.reconciliation.observedMinor)};
                      tracked balance{" "}
                      {money(pending.preview.reconciliation.calculatedMinor)}.
                      Difference{" "}
                      {money(
                        pending.preview.reconciliation.differenceBeforeMinor,
                      )}{" "}
                      to{" "}
                      {money(
                        pending.preview.reconciliation.differenceAfterMinor,
                      )}
                      .
                    </p>
                  ) : (
                    <p>Standalone adjustment; no comparison linked.</p>
                  )}
                  <p>
                    The original comparison stays in history and needs review
                    after this write. Compare again to verify the result.
                  </p>
                  {pending.preview.negativeBalance ? (
                    <p className="text-warning">
                      Negative tracked balance acknowledged. The balance can
                      indicate incomplete history.
                    </p>
                  ) : null}
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Financial version {pending.preview.financialRevision}. Command{" "}
                {pending.body.clientCommandId}.
              </p>
              {stage === "stale" ? (
                <Link
                  href={page}
                  className="inline-flex min-h-11 text-link underline"
                >
                  Reload and review fresh information
                </Link>
              ) : (
                <Button
                  type="button"
                  disabled={
                    stage === "saving" || (changed && stage !== "unconfirmed")
                  }
                  onClick={() => void save()}
                >
                  {stage === "saving"
                    ? "Saving..."
                    : stage === "unconfirmed"
                      ? "Retry identical command"
                      : pending.kind === "comparison"
                        ? "Confirm comparison"
                        : "Confirm explicit adjustment"}
                </Button>
              )}
              {stage === "reviewing" ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPending(null);
                    setStage("editing");
                    setMessage(null);
                  }}
                >
                  Edit details
                </Button>
              ) : null}
            </section>
          ) : null}
          {stage === "stale" && !pending ? (
            <Link
              href={page}
              className="inline-flex min-h-11 text-link underline"
            >
              Reload and review fresh information
            </Link>
          ) : null}
        </div>
      </Panel>
      {["saved", "saving", "unconfirmed"].includes(stage) || changed ? (
        <Panel
          title="Refresh comparison history"
          description="A save or source change may have affected comparison statuses."
        >
          <Link
            href={page}
            className="inline-flex min-h-11 text-link underline"
          >
            Load current history
          </Link>
        </Panel>
      ) : (
        <ReconciliationHistory
          setup={setup}
          {...(editing
            ? {
                onCompare: (r: ReconciliationItem) =>
                  fromHistory(r, "comparison"),
                onAdjust: (r: ReconciliationItem) =>
                  fromHistory(r, "adjustment"),
              }
            : {})}
        />
      )}
    </div>
  );
}
