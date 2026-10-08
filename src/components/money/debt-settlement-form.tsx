"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { liabilityComponents } from "@/modules/finance/domain/debt";
import {
  settleDebtBodySchema,
  settlementPreviewSchema,
  settlementResultSchema,
  type SettlementBody,
  type SettlementPreview,
} from "@/modules/finance/domain/debt-settlement";
import type { getDebtSettlementSetup } from "@/modules/finance/services/settle-debt";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
type Setup = Awaited<ReturnType<typeof getDebtSettlementSetup>>;
type Adjustment = {
  kind:
    | "recognized_charge"
    | "recognized_waiver"
    | "avoided_future_charge"
    | "rounding_correction";
  roundingTreatment: "recognized_charge" | "recognized_waiver";
  component: string;
  amount: string;
  source: string;
  unknownOpening: boolean;
  category: string;
  explanation: string;
};
const decimal = (s: string) => {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s.trim()))
    throw new RangeError(
      "Enter exact amounts with at most two decimal places.",
    );
  return parsePhpAmountToMinorUnits(s.trim()).toString();
};
const display = (s: string) =>
  `${BigInt(s) / 100n}.${(BigInt(s) % 100n).toString().padStart(2, "0")}`;
const selectClass =
  "min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base";
export function DebtSettlementForm({
  setup: suppliedSetup,
  today,
}: {
  setup: Setup;
  today: string;
}) {
  // Keep the complete reviewed snapshot with the retry command. A refreshed
  // server prop must never change the meaning of an uncertain save preview.
  const [setup] = useState(() => structuredClone(suppliedSetup));
  const snapshotChanged =
    suppliedSetup.detail.financialRevision !== setup.detail.financialRevision ||
    suppliedSetup.detail.debt.version !== setup.detail.debt.version;
  const { detail, pools } = setup;
  const { debt } = detail;
  const money = (v: string) => formatMoneyMinorUnits(debt.currency, v);
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
    [kind, setKind] = useState<"early" | "normal">("early"),
    [account, setAccount] = useState(setup.accounts.items[0]?.accountId ?? ""),
    [cash, setCash] = useState(""),
    [payoff, setPayoff] = useState(""),
    [fee, setFee] = useState("0"),
    [feeLabel, setFeeLabel] = useState("External settlement fee"),
    [feeCategory, setFeeCategory] = useState("");
  const [payments, setPayments] = useState(
    Object.fromEntries(
      liabilityComponents.map((k) => [
        k,
        display(debt.recognizedLiabilityComponents[k]),
      ]),
    ),
  );
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [dues, setDues] = useState(
      Object.fromEntries(
        detail.installments.map((i) => [i.installmentId, "0"]),
      ),
    ),
    [unapplied, setUnapplied] = useState("0");
  const [maps, setMaps] = useState(
    pools.flatMap((p) =>
      p.currentTargets.map((t) => ({
        paymentRevisionId: p.paymentRevisionId,
        sourceAllocationId: p.sourceAllocationId,
        targetObligationId: t.obligationId,
        amount: display(t.amountMinor),
      })),
    ),
  );
  const [resolution, setResolution] = useState(""),
    [confirmationSource, setConfirmationSource] = useState<"user" | "provider">(
      "provider",
    ),
    [confirmationNote, setConfirmationNote] = useState(""),
    [reference, setReference] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [negative, setNegative] = useState(false);
  const [message, setMessage] = useState<string | null>(null),
    [pending, setPending] = useState<SettlementBody | null>(null),
    [preview, setPreview] = useState<SettlementPreview | null>(null);
  const busy = useRef(false),
    reviewRef = useRef<HTMLDivElement>(null);
  const edit = (fn: () => void) => {
    fn();
    setConfirmed(false);
    setNegative(false);
    setMessage(null);
  };
  useEffect(() => {
    if (stage === "reviewing" || stage === "unconfirmed" || stage === "stale")
      reviewRef.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (stage !== "saving" && stage !== "unconfirmed") return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const navigate = (e: MouseEvent) => {
      const target =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (
        target &&
        !window.confirm(
          "Settlement outcome is unconfirmed. Leaving discards the retained retry command. Stay here to retry safely.",
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
  const endpoint = `/api/v1/debts/${debt.debtId}/settlement`;
  const wire = (b: SettlementBody) => {
    const { debtId: ignored, ...body } = b;
    void ignored;
    return JSON.stringify(body);
  };
  async function validate() {
    if (busy.current) return;
    setMessage(null);
    let b: SettlementBody;
    try {
      b = settleDebtBodySchema.parse({
        clientCommandId: crypto.randomUUID(),
        debtId: debt.debtId,
        expectedDebtVersion: debt.version,
        expectedScheduleVersionId: debt.scheduleVersionId,
        expectedFinancialRevision: detail.financialRevision,
        settlementDate: date,
        settlementKind: kind,
        payingAccountId: BigInt(decimal(cash)) > 0n ? account : null,
        actualCashPaidMinor: decimal(cash),
        confirmedPayoffMinor: decimal(payoff),
        externalFeeMinor: decimal(fee),
        externalFeeLabel: feeLabel,
        externalFeeCategoryId: feeCategory || null,
        liabilityPayments: liabilityComponents.flatMap((k) => {
          const v = decimal(payments[k]!);
          return BigInt(v) > 0n ? [{ kind: k, amountMinor: v }] : [];
        }),
        adjustments: adjustments.map((a) => ({
          kind: a.kind,
          roundingTreatment:
            a.kind === "rounding_correction" ? a.roundingTreatment : null,
          liabilityComponent:
            a.kind === "avoided_future_charge" ? null : a.component,
          amountMinor: decimal(a.amount),
          recognizedSourcePostingId:
            (a.kind === "recognized_waiver" ||
              (a.kind === "rounding_correction" &&
                a.roundingTreatment === "recognized_waiver")) &&
            !a.unknownOpening
              ? a.source || null
              : null,
          unknownOpening:
            (a.kind === "recognized_waiver" ||
              (a.kind === "rounding_correction" &&
                a.roundingTreatment === "recognized_waiver")) &&
            a.unknownOpening,
          categoryId:
            a.kind === "recognized_charge" ||
            (a.kind === "rounding_correction" &&
              a.roundingTreatment === "recognized_charge")
              ? a.category || null
              : null,
          explanation: a.explanation,
          providerConfirmed: true,
        })),
        dueAllocations: detail.installments.flatMap((i) => {
          const v = decimal(dues[i.installmentId]!);
          return BigInt(v) > 0n
            ? [{ installmentId: i.installmentId, amountMinor: v }]
            : [];
        }),
        unappliedContractualMinor: decimal(unapplied),
        poolMappings: maps.map((m) => ({
          paymentRevisionId: m.paymentRevisionId,
          sourceAllocationId: m.sourceAllocationId,
          targetObligationId: m.targetObligationId,
          amountMinor: decimal(m.amount),
        })),
        unappliedResolutionNote: resolution.trim() || null,
        allocationConfirmed: confirmed,
        confirmationSource,
        confirmationNote,
        acknowledgeNegativeBalance: negative,
        providerReference: reference.trim() || null,
        reason,
      });
    } catch (e) {
      setMessage(
        e instanceof Error && "issues" in e
          ? "Review required fields, exact amounts, accounting totals and explicit allocation confirmation."
          : e instanceof Error
            ? e.message
            : "Review settlement details.",
      );
      return;
    }
    busy.current = true;
    setStage("validating");
    try {
      const res = await fetch(`${endpoint}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: wire(b),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === "SETTLEMENT_PREVIEW_STALE") {
          setStage("stale");
          setMessage(data.message);
          return;
        }
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Settlement could not be validated.",
        );
      }
      const parsed = settlementPreviewSchema.parse(data);
      setPending(b);
      setPreview(parsed);
      setStage("reviewing");
    } catch (e) {
      setStage("editing");
      setMessage(
        e instanceof Error
          ? e.message
          : "Validation is unavailable. No settlement was saved.",
      );
    } finally {
      busy.current = false;
    }
  }
  async function save() {
    if (!pending || busy.current) return;
    busy.current = true;
    setStage("saving");
    setMessage(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: wire(pending),
      });
      const data = await res.json();
      if (res.ok) {
        const r = settlementResultSchema.parse(data);
        if (r.debtId !== pending.debtId)
          throw new Error("Unexpected settlement result.");
        setStage("saved");
        return;
      }
      if (data?.code === "SETTLEMENT_PREVIEW_STALE") {
        setStage("stale");
        setMessage(data.message);
        return;
      }
      if (res.status === 422 || res.status === 404) {
        setStage("reviewing");
        setMessage(
          typeof data?.message === "string"
            ? data.message
            : "Settlement was rejected. Edit and review the details again.",
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
  function propose() {
    try {
      let left = BigInt(decimal(payoff));
      const proposed = Object.fromEntries(
        detail.installments.map((i) => [i.installmentId, "0"]),
      );
      for (const i of [...detail.installments].sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) || a.sequenceNo - b.sequenceNo,
      )) {
        if (i.disposition !== "scheduled") continue;
        const amount =
          left < BigInt(i.remainingMinor) ? left : BigInt(i.remainingMinor);
        proposed[i.installmentId] = display(amount.toString());
        left -= amount;
      }
      edit(() => {
        setDues(proposed);
        setUnapplied(display(left.toString()));
      });
    } catch {
      setMessage("Enter the confirmed payoff before proposing allocations.");
    }
  }
  const field = (
    label: string,
    id: string,
    value: string,
    set: (v: string) => void,
    type = "text",
  ) => (
    <FormField key={id} label={label} htmlFor={id}>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => edit(() => set(e.target.value))}
      />
    </FormField>
  );
  const adjustmentChange = (index: number, change: Partial<Adjustment>) =>
    edit(() =>
      setAdjustments((rows) =>
        rows.map((row, i) => {
          if (i !== index) return row;
          const next = { ...row, ...change };
          if (
            (next.kind === "recognized_charge" ||
              (next.kind === "rounding_correction" &&
                next.roundingTreatment === "recognized_charge")) &&
            !["interest", "fee", "penalty"].includes(next.component)
          )
            next.component = "interest";
          return next;
        }),
      ),
    );
  if (stage === "saved")
    return (
      <section
        role="status"
        className="space-y-3 rounded-card border border-border p-5"
      >
        <h2 className="text-lg font-semibold">Settlement saved</h2>
        <p>
          The verified liability is zero. The closing schedule and payment
          evidence are preserved; future unpaid reminders are cancelled.
        </p>
        <Link
          className="inline-flex min-h-11 items-center text-link underline"
          href={`/money/debts/${debt.debtId}`}
        >
          View debt and settlement history
        </Link>
      </section>
    );
  if (stage !== "editing" && stage !== "validating")
    return (
      <div
        ref={reviewRef}
        tabIndex={-1}
        className="space-y-5 rounded-card border border-border p-5"
      >
        <h2 className="text-lg font-semibold">Review verified settlement</h2>
        {message ? <p role="alert">{message}</p> : null}
        {preview && pending ? (
          <>
            <p>
              {pending.settlementDate} ·{" "}
              {pending.settlementKind === "early"
                ? "Early settlement"
                : "Normal settlement"}{" "}
              ·{" "}
              {setup.accounts.items.find(
                (a) => a.accountId === pending.payingAccountId,
              )?.name ?? "Zero cash payoff"}
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Recognized liability before", preview.recognizedBeforeMinor],
                ["Newly recognized charges", preview.newChargesMinor],
                ["Confirmed payoff", preview.confirmedPayoffMinor],
                ["External fee (excluded from dues)", preview.externalFeeMinor],
                ["Actual cash deduction", preview.actualCashPaidMinor],
                ["Recognized waiver", preview.recognizedWaiverMinor],
                [
                  "Avoided future charges (no expense reversal)",
                  preview.avoidedFutureMinor,
                ],
                ["Verified recognized liability after", preview.residualMinor],
                [
                  "Resolved final-payoff unapplied pools",
                  preview.resolvedUnappliedMinor,
                ],
                [
                  "Cancelled unpaid contractual remainder",
                  preview.cancelledRemainingMinor,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="numeric-value">{money(value!)}</dd>
                </div>
              ))}
            </dl>
            {preview.payingBalanceBeforeMinor !== null ? (
              <p>
                Tracked paying account:{" "}
                {money(preview.payingBalanceBeforeMinor)} before ?{" "}
                {money(preview.payingBalanceAfterMinor!)} after.
              </p>
            ) : null}
            <h3 className="font-semibold">Accounting payment components</h3>
            <ul>
              {pending.liabilityPayments.map((p) => (
                <li key={p.kind}>
                  {p.kind}: {money(p.amountMinor)} liability repayment
                </li>
              ))}
            </ul>
            {pending.adjustments.map((a, i) => (
              <p key={i}>
                {a.kind.replaceAll("_", " ")}: {money(a.amountMinor)} ·{" "}
                {a.liabilityComponent ?? "unrecognized future charge"} ·{" "}
                {a.unknownOpening
                  ? "Imported opening adjustment; no expense reversal"
                  : a.recognizedSourcePostingId
                    ? `Recognized charge: ${setup.chargeSources.find((s) => s.postingId === a.recognizedSourcePostingId)?.label ?? a.recognizedSourcePostingId}`
                    : a.kind === "avoided_future_charge"
                      ? "Metadata only; no expense reversal"
                      : "Provider-confirmed charge"}{" "}
                · {a.explanation}
                {a.categoryId
                  ? ` · Category: ${setup.categories.items.find((c) => c.categoryId === a.categoryId)?.name}`
                  : ""}
              </p>
            ))}
            <h3 className="font-semibold">Contractual payoff allocations</h3>
            {pending.dueAllocations.map((a) => {
              const i = detail.installments.find(
                (i) => i.installmentId === a.installmentId,
              )!;
              return (
                <p key={a.installmentId}>
                  Due {i.dueDate}: {money(a.amountMinor)}
                </p>
              );
            })}
            <p>
              Explicit unapplied payoff:{" "}
              {money(pending.unappliedContractualMinor)}.{" "}
              {pending.unappliedResolutionNote}
            </p>
            <h3 className="font-semibold">Historical pool mapping</h3>
            {preview.poolMappings.map((m, i) => {
              const pool = pools.find(
                (p) =>
                  p.paymentRevisionId === m.paymentRevisionId &&
                  p.sourceAllocationId === m.sourceAllocationId,
              )!;
              return (
                <p key={i}>
                  Payment {pool.paymentDate} ·{" "}
                  {pool.sourceDueDate
                    ? `original due ${pool.sourceDueDate}`
                    : "original unapplied pool"}{" "}
                  →{" "}
                  {m.targetObligationId
                    ? `due ${detail.installments.find((i) => i.obligationId === m.targetObligationId)?.dueDate}`
                    : "resolved final-payoff unapplied pool"}
                  : {money(m.amountMinor)}
                </p>
              );
            })}
            <h3 className="font-semibold">Old versus closing schedule</h3>
            <ul className="space-y-2">
              {preview.entries.map((e) => (
                <li key={e.obligationId}>
                  Due {e.dueDate} · original contractual{" "}
                  {money(e.contractualMinor)} · opening satisfaction{" "}
                  {money(e.openingSatisfiedMinor)} · current payment
                  satisfaction {money(e.paymentSatisfiedMinor)} · cancelled
                  remainder {money(e.cancelledMinor)} ·{" "}
                  {e.disposition === "cancelled"
                    ? "Future reminder cancelled"
                    : "Satisfied; no remaining reminder"}
                </li>
              ))}
            </ul>
            <p>
              External fee: {pending.externalFeeLabel}
              {pending.externalFeeCategoryId
                ? ` · ${setup.categories.items.find((c) => c.categoryId === pending.externalFeeCategoryId)?.name}`
                : ""}
              .
            </p>
            <p>
              Confirmation: {pending.confirmationSource} ·{" "}
              {pending.confirmationNote}. Provider reference:{" "}
              {pending.providerReference ?? "None"}. Reason: {pending.reason}.
            </p>
            {pending.acknowledgeNegativeBalance ? (
              <p>Negative tracked account balance explicitly acknowledged.</p>
            ) : null}
          </>
        ) : null}
        {stage === "saving" ? (
          <p role="status">
            Saving settlement. Keep this page open until the outcome is
            confirmed.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {stage === "stale" ? (
            <a
              className="inline-flex min-h-11 items-center text-link underline"
              href={`/money/debts/${debt.debtId}/settle`}
            >
              Reload current settlement information
            </a>
          ) : (
            <>
              <Button
                type="button"
                disabled={
                  stage === "saving" ||
                  (snapshotChanged && stage === "reviewing")
                }
                onClick={() => void save()}
              >
                {stage === "saving"
                  ? "Saving settlement…"
                  : stage === "unconfirmed"
                    ? "Retry identical settlement"
                    : "Confirm and save settlement"}
              </Button>
              {stage === "reviewing" ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPending(null);
                    setPreview(null);
                    setConfirmed(false);
                    setNegative(false);
                    setStage("editing");
                  }}
                >
                  Edit settlement
                </Button>
              ) : null}
            </>
          )}
        </div>
        {snapshotChanged && stage === "reviewing" ? (
          <a
            href={`/money/debts/${debt.debtId}/settle`}
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Reload changed settlement information
          </a>
        ) : null}
      </div>
    );
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void validate();
      }}
    >
      {stage === "validating" ? (
        <p role="status">
          Validating settlement. No settlement has been saved.
        </p>
      ) : null}
      {snapshotChanged ? (
        <p role="alert">
          Financial information changed. Reload this page before reviewing a new
          settlement.
        </p>
      ) : null}
      {snapshotChanged ? (
        <a
          href={`/money/debts/${debt.debtId}/settle`}
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Reload changed settlement information
        </a>
      ) : null}
      <fieldset
        disabled={stage === "validating" || snapshotChanged}
        className="space-y-6"
      >
        <p>
          Record the provider-confirmed actual event. Recognized waivers and
          avoided future charges have different accounting effects. Liability
          must resolve to zero before closure.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("Settlement date", "settlement-date", date, setDate, "date")}
          <FormField label="Settlement kind" htmlFor="settlement-kind">
            <select
              id="settlement-kind"
              className={selectClass}
              value={kind}
              onChange={(e) =>
                edit(() => setKind(e.target.value as typeof kind))
              }
            >
              <option value="early">Early settlement</option>
              <option value="normal">Normal settlement</option>
            </select>
          </FormField>
          <FormField label="Paying account" htmlFor="settlement-account">
            <select
              id="settlement-account"
              className={selectClass}
              value={account}
              onChange={(e) => edit(() => setAccount(e.target.value))}
            >
              <option value="">No account (zero cash only)</option>
              {setup.accounts.items.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.name}
                </option>
              ))}
            </select>
          </FormField>
          {field("Actual cash paid", "settlement-cash", cash, setCash)}
          {field(
            "Provider-confirmed payoff (excluding external fee)",
            "settlement-payoff",
            payoff,
            setPayoff,
          )}
          {field("External settlement fee", "settlement-fee", fee, setFee)}
          {field(
            "External fee label",
            "settlement-fee-label",
            feeLabel,
            setFeeLabel,
          )}
          <FormField
            label="External fee category"
            htmlFor="settlement-fee-category"
          >
            <select
              id="settlement-fee-category"
              className={selectClass}
              value={feeCategory}
              onChange={(e) => edit(() => setFeeCategory(e.target.value))}
            >
              <option value="">Uncategorized</option>
              {setup.categories.items.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Recognized liability payment components
          </h2>
          <p>
            Current liability: {money(debt.recognizedLiabilityMinor)}. Repayment
            is not spending.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {liabilityComponents.map((k) =>
              field(
                `${k} repayment`,
                `settlement-payment-${k}`,
                payments[k]!,
                (v) => setPayments((p) => ({ ...p, [k]: v })),
              ),
            )}
          </div>
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Confirmed adjustments and avoided charges
          </h2>
          {adjustments.map((a, i) => (
            <fieldset
              key={i}
              className="space-y-3 rounded-card border border-border p-4"
            >
              <legend>Adjustment {i + 1}</legend>
              <FormField label="Adjustment kind" htmlFor={`adjust-kind-${i}`}>
                <select
                  id={`adjust-kind-${i}`}
                  className={selectClass}
                  value={a.kind}
                  onChange={(e) =>
                    adjustmentChange(i, {
                      kind: e.target.value as Adjustment["kind"],
                      source: "",
                      unknownOpening: false,
                      category: "",
                    })
                  }
                >
                  <option value="recognized_charge">
                    Newly recognized charge
                  </option>
                  <option value="recognized_waiver">Recognized waiver</option>
                  <option value="avoided_future_charge">
                    Avoided future unrecognized charge
                  </option>
                  <option value="rounding_correction">
                    Explicit rounding correction
                  </option>
                </select>
              </FormField>
              {a.kind === "rounding_correction" ? (
                <FormField
                  label="Rounding accounting treatment"
                  htmlFor={`rounding-treatment-${i}`}
                >
                  <select
                    id={`rounding-treatment-${i}`}
                    className={selectClass}
                    value={a.roundingTreatment}
                    onChange={(e) =>
                      adjustmentChange(i, {
                        roundingTreatment: e.target
                          .value as Adjustment["roundingTreatment"],
                        source: "",
                        unknownOpening: false,
                      })
                    }
                  >
                    <option value="recognized_charge">
                      Confirmed new charge
                    </option>
                    <option value="recognized_waiver">
                      Confirmed recognized waiver
                    </option>
                  </select>
                </FormField>
              ) : null}
              {a.kind !== "avoided_future_charge" ? (
                <FormField
                  label="Liability component"
                  htmlFor={`adjust-component-${i}`}
                >
                  <select
                    id={`adjust-component-${i}`}
                    className={selectClass}
                    value={a.component}
                    onChange={(e) =>
                      adjustmentChange(i, {
                        component: e.target.value,
                        source: "",
                      })
                    }
                  >
                    {(a.kind === "recognized_charge" ||
                    (a.kind === "rounding_correction" &&
                      a.roundingTreatment === "recognized_charge")
                      ? ["interest", "fee", "penalty"]
                      : liabilityComponents
                    ).map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </FormField>
              ) : null}
              {field("Adjustment amount", `adjust-amount-${i}`, a.amount, (v) =>
                adjustmentChange(i, { amount: v }),
              )}
              {a.kind === "recognized_waiver" ||
              (a.kind === "rounding_correction" &&
                a.roundingTreatment === "recognized_waiver") ? (
                <>
                  <label className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={a.unknownOpening}
                      onChange={(e) =>
                        adjustmentChange(i, {
                          unknownOpening: e.target.checked,
                          source: "",
                        })
                      }
                    />
                    Imported opening liability: disclose adjustment equity, with
                    no recorded expense to reverse
                  </label>
                  {!a.unknownOpening ? (
                    <FormField
                      label="Recognized charge being waived"
                      htmlFor={`adjust-source-${i}`}
                    >
                      <select
                        id={`adjust-source-${i}`}
                        className={selectClass}
                        value={a.source}
                        onChange={(e) =>
                          adjustmentChange(i, { source: e.target.value })
                        }
                      >
                        <option value="">
                          Select recognized charge evidence
                        </option>
                        {setup.chargeSources
                          .filter((s) => s.kind === a.component)
                          .map((s) => (
                            <option key={s.postingId} value={s.postingId}>
                              {s.effectiveDate} · {s.label} ·{" "}
                              {money(s.amountMinor)}
                            </option>
                          ))}
                      </select>
                    </FormField>
                  ) : null}
                </>
              ) : null}
              {a.kind === "recognized_charge" ||
              (a.kind === "rounding_correction" &&
                a.roundingTreatment === "recognized_charge") ? (
                <FormField
                  label="Charge category"
                  htmlFor={`adjust-category-${i}`}
                >
                  <select
                    id={`adjust-category-${i}`}
                    className={selectClass}
                    value={a.category}
                    onChange={(e) =>
                      adjustmentChange(i, { category: e.target.value })
                    }
                  >
                    <option value="">Uncategorized</option>
                    {setup.categories.items.map((c) => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : null}
              {field(
                "Provider-confirmed explanation",
                `adjust-explanation-${i}`,
                a.explanation,
                (v) => adjustmentChange(i, { explanation: v }),
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  edit(() =>
                    setAdjustments((rows) => rows.filter((_, j) => j !== i)),
                  )
                }
              >
                Remove adjustment {i + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={adjustments.length >= 30}
            onClick={() =>
              edit(() =>
                setAdjustments((rows) => [
                  ...rows,
                  {
                    kind: "recognized_charge",
                    roundingTreatment: "recognized_charge",
                    component: "interest",
                    amount: "",
                    source: "",
                    unknownOpening: false,
                    category: "",
                    explanation: "",
                  },
                ]),
              )
            }
          >
            Add confirmed adjustment
          </Button>
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Contractual payoff allocation
          </h2>
          <p>
            Review each proposed allocation explicitly. External fees do not
            satisfy dues.
          </p>
          <Button type="button" variant="secondary" onClick={propose}>
            Propose oldest due first
          </Button>
          {detail.installments
            .filter((i) => i.disposition === "scheduled")
            .map((i) =>
              field(
                `Due ${i.dueDate} — remaining ${money(i.remainingMinor)}`,
                `settle-due-${i.installmentId}`,
                dues[i.installmentId]!,
                (v) => setDues((d) => ({ ...d, [i.installmentId]: v })),
              ),
            )}
          {field(
            "Explicit unapplied contractual payoff",
            "settlement-unapplied",
            unapplied,
            setUnapplied,
          )}
          <h3 className="font-semibold">Historical payment pools</h3>
          {maps.map((m, i) => {
            const p = pools.find(
              (p) =>
                p.paymentRevisionId === m.paymentRevisionId &&
                p.sourceAllocationId === m.sourceAllocationId,
            )!;
            return (
              <div
                key={i}
                className="space-y-3 rounded-card border border-border p-4"
              >
                <p>
                  Payment {p.paymentDate}: original{" "}
                  {p.sourceDueDate ? `due ${p.sourceDueDate}` : "unapplied"}{" "}
                  pool {money(p.amountMinor)}
                </p>
                <FormField
                  label={`Pool ${i + 1} target`}
                  htmlFor={`pool-target-${i}`}
                >
                  <select
                    id={`pool-target-${i}`}
                    className={selectClass}
                    value={m.targetObligationId ?? ""}
                    onChange={(e) =>
                      edit(() =>
                        setMaps((rows) =>
                          rows.map((row, j) =>
                            j === i
                              ? {
                                  ...row,
                                  targetObligationId: e.target.value || null,
                                }
                              : row,
                          ),
                        ),
                      )
                    }
                  >
                    <option value="">
                      Resolved final-payoff unapplied pool
                    </option>
                    {detail.installments.map((d) => (
                      <option key={d.obligationId} value={d.obligationId}>
                        Due {d.dueDate}
                      </option>
                    ))}
                  </select>
                </FormField>
                {field(
                  `Pool ${i + 1} mapped amount`,
                  `pool-amount-${i}`,
                  m.amount,
                  (v) =>
                    setMaps((rows) =>
                      rows.map((row, j) =>
                        j === i ? { ...row, amount: v } : row,
                      ),
                    ),
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    edit(() =>
                      setMaps((rows) => [
                        ...rows,
                        { ...m, targetObligationId: null, amount: "" },
                      ]),
                    )
                  }
                >
                  Split pool {i + 1}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    edit(() =>
                      setMaps((rows) => rows.filter((_, j) => j !== i)),
                    )
                  }
                >
                  Remove mapping {i + 1}
                </Button>
              </div>
            );
          })}
          {field(
            "Final-payoff explanation for all unapplied pools",
            "settlement-resolution",
            resolution,
            setResolution,
          )}
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm the contractual allocations, historical mappings,
            cancellation of unpaid remainders, and final-payoff treatment of
            unapplied pools.
          </label>
        </section>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Confirmation source"
            htmlFor="settlement-confirm-source"
          >
            <select
              id="settlement-confirm-source"
              className={selectClass}
              value={confirmationSource}
              onChange={(e) =>
                edit(() =>
                  setConfirmationSource(
                    e.target.value as typeof confirmationSource,
                  ),
                )
              }
            >
              <option value="provider">Provider</option>
              <option value="user">User</option>
            </select>
          </FormField>
          {field(
            "Confirmation evidence",
            "settlement-confirm-note",
            confirmationNote,
            setConfirmationNote,
          )}
          {field(
            "Provider reference",
            "settlement-reference",
            reference,
            setReference,
          )}
          {field("Settlement reason", "settlement-reason", reason, setReason)}
        </div>
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={negative}
            onChange={(e) => setNegative(e.target.checked)}
          />
          I acknowledge a negative tracked account balance if this payoff
          exceeds recorded cash.
        </label>
        {message ? <p role="alert">{message}</p> : null}
        <Button type="submit">
          {stage === "validating"
            ? "Validating settlement…"
            : "Validate and review settlement"}
        </Button>
      </fieldset>
    </form>
  );
}
