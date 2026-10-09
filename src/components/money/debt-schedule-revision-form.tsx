"use client";
import { useEffect, useRef, useState } from "react";
import { useClientReady } from "@/shared/use-client-ready";
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import {
  buildScheduleRevisionPreview,
  poolKey,
  reviseDebtScheduleBodySchema,
  revisionResultSchema,
  type RevisionBody,
  type ScheduleRevisionSetup,
} from "@/modules/finance/domain/debt-schedule-revision";

type EntryDraft = {
  entryKey: string;
  obligationId: string | null;
  replacesObligationId: string | null;
  dueDate: string;
  contractualMinor: string;
  knownPrincipalMinor: string;
  knownInterestMinor: string;
  knownFeeMinor: string;
  breakdownComplete: boolean;
  disposition: "scheduled" | "cancelled";
  cancellationReason: string;
  notes: string;
};
type Draft = {
  revisionKind: RevisionBody["revisionKind"];
  effectiveDate: string;
  reason: string;
  frequency: RevisionBody["frequency"];
  entries: EntryDraft[];
  mappings: {
    paymentRevisionId: string;
    sourceAllocationId: string | null;
    targetEntryKey: string;
    amountMinor: string;
  }[];
  confirmed: boolean;
  chargeEnabled: boolean;
  chargeKind: "interest" | "fee" | "penalty";
  chargeAmount: string;
  chargeExplanation: string;
  providerConfirmed: boolean;
};
const decimal = (s: string | null) =>
  s === null
    ? ""
    : `${BigInt(s) / 100n}.${(BigInt(s) % 100n).toString().padStart(2, "0")}`;
const selectClass =
  "min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base";
function defaults(setup: ScheduleRevisionSetup, today: string): Draft {
  const entries = setup.detail.installments.map((i) => ({
    entryKey: crypto.randomUUID(),
    obligationId: i.obligationId,
    replacesObligationId: null,
    dueDate: i.dueDate,
    contractualMinor: decimal(i.contractualMinor),
    knownPrincipalMinor: decimal(i.knownPrincipalMinor),
    knownInterestMinor: decimal(i.knownInterestMinor),
    knownFeeMinor: decimal(i.knownFeeMinor),
    breakdownComplete: i.breakdownComplete,
    disposition: i.disposition,
    cancellationReason: i.cancellationReason ?? "",
    notes: i.notes ?? "",
  }));
  return {
    revisionKind: "date_correction",
    effectiveDate: today,
    reason: "",
    frequency: setup.frequency,
    entries,
    mappings: setup.pools.flatMap((p) =>
      p.currentTargets.map((t) => ({
        paymentRevisionId: p.paymentRevisionId,
        sourceAllocationId: p.sourceAllocationId,
        targetEntryKey: t.obligationId
          ? entries.find((e) => e.obligationId === t.obligationId)!.entryKey
          : "",
        amountMinor: decimal(t.amountMinor),
      })),
    ),
    confirmed: false,
    chargeEnabled: false,
    chargeKind: "interest",
    chargeAmount: "",
    chargeExplanation: "",
    providerConfirmed: false,
  };
}
export function DebtScheduleRevisionForm({
  setup,
  today,
}: {
  setup: ScheduleRevisionSetup;
  today: string;
}) {
  const router = useRouter();
  const form = useForm<Draft>({ defaultValues: defaults(setup, today) });
  // Server-rendered controls cannot accept edits before the form's handlers
  // and field-array refs are attached. Otherwise hydration can replace an
  // early native date edit with the original schedule default.
  const hydrated = useClientReady();
  const entries = useFieldArray({ control: form.control, name: "entries" });
  const mappings = useFieldArray({ control: form.control, name: "mappings" });
  const values = useWatch({ control: form.control }) as Draft;
  const [stage, setStage] = useState<
    "editing" | "reviewing" | "saving" | "unconfirmed" | "saved"
  >("editing");
  const [pending, setPending] = useState<RevisionBody | null>(null);
  const [reviewSetup, setReviewSetup] = useState(setup);
  const [message, setMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const snapshot = useRef(
    `${setup.detail.debt.version}:${setup.detail.financialRevision}`,
  );
  const locked = stage !== "editing";
  const dirty =
    form.formState.isDirty || stage === "reviewing" || stage === "unconfirmed";
  const money = (s: string) =>
    formatMoneyMinorUnits(setup.detail.debt.currency, s);
  useEffect(() => {
    const next = `${setup.detail.debt.version}:${setup.detail.financialRevision}`;
    if (next !== snapshot.current && stage === "editing") {
      form.reset(defaults(setup, today));
      snapshot.current = next;
      setStale(false);
      setMessage(
        "The current schedule and payment mappings have been reloaded. Review a fresh revision.",
      );
    }
  }, [setup, today, stage, form]);
  useEffect(() => {
    if (stage === "reviewing") reviewRef.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (!dirty && stage !== "saving") return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("a[href]")
      )
        return;
      if (
        stage === "saving" ||
        !window.confirm(
          stage === "unconfirmed"
            ? "This schedule save is unconfirmed. Leaving loses the exact safe retry on this page. Leave anyway?"
            : "Leave and discard this unsaved schedule revision?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, stage]);
  function field(
    name: FieldPath<Draft>,
    label: string,
    type: "text" | "date" = "text",
    required = false,
  ) {
    const id = `revision-${name}`;
    const error = form.getFieldState(name, form.formState).error?.message;
    return (
      <FormField
        key={name}
        htmlFor={id}
        label={label}
        error={error}
        errorId={`${id}-error`}
      >
        <Input
          {...form.register(name)}
          id={id}
          type={type}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          inputMode={
            type === "text" && name.includes("Minor") ? "decimal" : undefined
          }
        />
      </FormField>
    );
  }
  function review(v: Draft) {
    setMessage(null);
    form.clearErrors();
    try {
      if (!v.confirmed)
        throw new Error(
          "Confirm the proposed payment mapping, including every explicit unapplied amount.",
        );
      const minor = (s: string) => parsePhpAmountToMinorUnits(s).toString();
      const body = reviseDebtScheduleBodySchema.parse({
        clientCommandId: crypto.randomUUID(),
        debtId: setup.detail.debt.debtId,
        expectedDebtVersion: setup.detail.debt.version,
        expectedScheduleVersionId: setup.detail.debt.scheduleVersionId,
        expectedFinancialRevision: setup.detail.financialRevision,
        revisionKind: v.revisionKind,
        effectiveDate: v.effectiveDate,
        reason: v.reason,
        frequency: v.frequency,
        entries: v.entries.map((e) => ({
          ...e,
          contractualMinor: minor(e.contractualMinor),
          knownPrincipalMinor:
            e.knownPrincipalMinor === "" ? null : minor(e.knownPrincipalMinor),
          knownInterestMinor:
            e.knownInterestMinor === "" ? null : minor(e.knownInterestMinor),
          knownFeeMinor: e.knownFeeMinor === "" ? null : minor(e.knownFeeMinor),
          cancellationReason:
            e.disposition === "cancelled" ? e.cancellationReason : null,
          notes: e.notes || null,
        })),
        mappings: v.mappings.map((m) => ({
          ...m,
          targetEntryKey: m.targetEntryKey || null,
          amountMinor: minor(m.amountMinor),
        })),
        allocationMappingConfirmed: true,
        recognizedCharge: v.chargeEnabled
          ? {
              kind: v.chargeKind,
              amountMinor: minor(v.chargeAmount),
              categoryId: null,
              explanation: v.chargeExplanation,
              providerConfirmed: v.providerConfirmed,
            }
          : null,
      });
      buildScheduleRevisionPreview(body, setup);
      setReviewSetup(setup);
      setPending(body);
      setStage("reviewing");
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues)
          if (issue.path.length && issue.path[0] !== "recognizedCharge")
            form.setError(issue.path.join(".") as FieldPath<Draft>, {
              type: "validate",
              message: issue.message,
            });
        setMessage([...new Set(error.issues.map((i) => i.message))].join(" "));
      } else
        setMessage(
          error instanceof Error
            ? error.message
            : "Review the revision fields.",
        );
    }
  }
  async function save() {
    if (!pending || stage === "saving") return;
    setStage("saving");
    setMessage(null);
    const uncertain = () => {
      setStage("unconfirmed");
      setMessage(
        "Save outcome is unconfirmed. Keep this page open and retry the same revision to recover its outcome safely.",
      );
    };
    try {
      const { debtId, ...body } = pending;
      const response = await fetch(
        `/api/v1/debts/${debtId}/schedule-revisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const result = revisionResultSchema.safeParse(data);
        if (
          !result.success ||
          result.data.debtId !== debtId ||
          result.data.scheduleVersionNo < 2
        ) {
          uncertain();
          return;
        }
        setStage("saved");
        setMessage(
          "Schedule revision saved. Agenda now uses the revised dates and remaining amounts.",
        );
        router.refresh();
        return;
      }
      const problem = data as { code?: string; message?: string } | null;
      if (
        response.status === 409 &&
        problem?.code === "SCHEDULE_PREVIEW_STALE"
      ) {
        setStage("editing");
        setPending(null);
        setStale(true);
        form.setValue("confirmed", false);
        setMessage(
          problem.message ?? "The preview is stale. Reload and review again.",
        );
        router.refresh();
        return;
      }
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 409 ||
        response.status >= 500 ||
        !problem?.code
      ) {
        uncertain();
        return;
      }
      setStage("editing");
      setPending(null);
      form.setValue("confirmed", false);
      setMessage(
        problem.message ??
          "The revision was rejected. Review and correct its fields.",
      );
    } catch {
      uncertain();
    }
  }
  const preview = pending
    ? buildScheduleRevisionPreview(pending, reviewSetup)
    : null;
  const targetLabel = (key: string | null) =>
    key
      ? `Installment ${pending!.entries.findIndex((e) => e.entryKey === key) + 1}`
      : "Explicit unapplied pool";
  return (
    <div className="space-y-6">
      {message ? (
        <p
          role={stage === "saved" ? "status" : "alert"}
          className="rounded-card border border-border p-4"
        >
          {message}
        </p>
      ) : null}
      {stale ? (
        <Button onClick={() => router.refresh()}>
          Reload current schedule
        </Button>
      ) : null}
      <form onSubmit={form.handleSubmit(review)} className="space-y-6">
        <fieldset
          disabled={locked || stale || !hydrated}
          onChange={(e) => {
            const target = e.target;
            if (
              (target instanceof HTMLInputElement ||
                target instanceof HTMLSelectElement) &&
              target.name !== "confirmed"
            )
              form.setValue("confirmed", false);
          }}
          className="space-y-6"
        >
          <legend className="text-lg font-semibold">Revision details</legend>
          <FormField htmlFor="revision-kind" label="Revision kind">
            <select
              id="revision-kind"
              {...form.register("revisionKind")}
              className={selectClass}
            >
              <option value="date_correction">Correct due dates</option>
              <option value="renegotiation">
                Renegotiated contractual terms
              </option>
              <option value="allocation_correction">
                Correct payment allocation
              </option>
            </select>
          </FormField>
          <p className="text-sm text-muted-foreground">
            Date corrections keep amounts and payment allocations. Allocation
            corrections keep dates and terms. Renegotiations record agreed term
            changes. Scheduled future interest does not recognize an expense.
          </p>
          {field("effectiveDate", "Revision effective date", "date", true)}
          {field("reason", "Revision reason", "text", true)}
          <FormField htmlFor="revision-frequency" label="Schedule frequency">
            <select
              id="revision-frequency"
              {...form.register("frequency")}
              className={selectClass}
            >
              {["manual", "weekly", "monthly", "other"].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </FormField>
          <section className="space-y-4" aria-label="Proposed schedule">
            <h2 className="text-lg font-semibold">Proposed schedule</h2>
            {entries.fields.map((e, index) => (
              <div
                key={e.id}
                className="space-y-3 rounded-card border border-border p-4"
              >
                <h3 className="font-semibold">Installment {index + 1}</h3>
                <p className="text-sm">
                  {e.obligationId
                    ? "Surviving obligation; historical opening satisfaction is carried unchanged."
                    : "New obligation identity; opening satisfaction is zero."}
                </p>
                {field(
                  `entries.${index}.dueDate`,
                  `Due date ${index + 1}`,
                  "date",
                  true,
                )}
                {field(
                  `entries.${index}.contractualMinor`,
                  `Contractual amount ${index + 1} (${setup.detail.debt.currency})`,
                  "text",
                  true,
                )}
                <details>
                  <summary className="min-h-11 cursor-pointer py-3">
                    Known contractual components and notes
                  </summary>
                  <div className="space-y-3">
                    <p className="text-sm">
                      Blank components remain unknown; these terms create no
                      financial posting.
                    </p>
                    {field(
                      `entries.${index}.knownPrincipalMinor`,
                      `Known principal ${index + 1} (${setup.detail.debt.currency})`,
                    )}
                    {field(
                      `entries.${index}.knownInterestMinor`,
                      `Known interest ${index + 1} (${setup.detail.debt.currency})`,
                    )}
                    {field(
                      `entries.${index}.knownFeeMinor`,
                      `Known fee ${index + 1} (${setup.detail.debt.currency})`,
                    )}
                    <label className="flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        {...form.register(`entries.${index}.breakdownComplete`)}
                      />
                      Complete contractual breakdown {index + 1}
                    </label>
                    {field(
                      `entries.${index}.notes`,
                      `Installment notes ${index + 1}`,
                    )}
                  </div>
                </details>
                {values.revisionKind === "renegotiation" ? (
                  <>
                    {!e.obligationId ? (
                      <FormField
                        htmlFor={`replace-${index}`}
                        label={`Replaces old obligation ${index + 1} (optional)`}
                      >
                        <select
                          id={`replace-${index}`}
                          className={selectClass}
                          {...form.register(
                            `entries.${index}.replacesObligationId`,
                            { setValueAs: (v) => v || null },
                          )}
                        >
                          <option value="">Additional new obligation</option>
                          {setup.detail.installments.map((i) => (
                            <option key={i.obligationId} value={i.obligationId}>
                              Previous installment {i.sequenceNo}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    ) : null}
                    <FormField
                      htmlFor={`disposition-${index}`}
                      label={`Contractual disposition ${index + 1}`}
                    >
                      <select
                        id={`disposition-${index}`}
                        className={selectClass}
                        {...form.register(`entries.${index}.disposition`)}
                      >
                        <option value="scheduled">Scheduled obligation</option>
                        <option value="cancelled">
                          Provider cancelled this due (liability unchanged)
                        </option>
                      </select>
                    </FormField>
                    {values.entries?.[index]?.disposition === "cancelled"
                      ? field(
                          `entries.${index}.cancellationReason`,
                          `Cancellation reason ${index + 1}`,
                          "text",
                          true,
                        )
                      : null}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        entries.remove(index);
                        form.setValue("confirmed", false);
                      }}
                    >
                      Remove installment {index + 1} from proposal
                    </Button>
                  </>
                ) : null}
              </div>
            ))}
            {values.revisionKind === "renegotiation" ? (
              <Button
                variant="secondary"
                onClick={() => {
                  entries.append({
                    entryKey: crypto.randomUUID(),
                    obligationId: null,
                    replacesObligationId: null,
                    dueDate: "",
                    contractualMinor: "",
                    knownPrincipalMinor: "",
                    knownInterestMinor: "",
                    knownFeeMinor: "",
                    breakdownComplete: false,
                    disposition: "scheduled",
                    cancellationReason: "",
                    notes: "",
                  });
                  form.setValue("confirmed", false);
                }}
              >
                Add new obligation
              </Button>
            ) : null}
          </section>
          <section
            aria-label="Payment allocation mapping"
            className="space-y-4"
          >
            <h2 className="text-lg font-semibold">
              Payment allocation mapping
            </h2>
            <p className="text-sm">
              The proposal carries the current confirmed allocations. Every
              original payment allocation and unapplied pool must be mapped in
              full. Mapping moves contractual satisfaction and does not deduct
              cash.
            </p>
            {!setup.pools.length ? (
              <p>No recorded payment pools to map.</p>
            ) : null}
            {setup.pools.map((p, poolIndex) => (
              <div
                key={poolKey(p)}
                className="space-y-3 rounded-card border border-border p-4"
              >
                <h3 className="font-semibold">
                  Payment pool {poolIndex + 1}: {p.paymentDate}
                </h3>
                <p>
                  {p.sourceAllocationId
                    ? `Originally allocated to due ${p.sourceDueDate}`
                    : "Original unapplied amount"}
                  : {money(p.amountMinor)}
                </p>
                {mappings.fields.map((m, index) =>
                  poolKey(m) !== poolKey(p) ? null : (
                    <div key={m.id} className="space-y-2">
                      <FormField
                        htmlFor={`map-${index}`}
                        label={`Mapping target ${index + 1}`}
                      >
                        <select
                          id={`map-${index}`}
                          {...form.register(`mappings.${index}.targetEntryKey`)}
                          value={values.mappings?.[index]?.targetEntryKey ?? ""}
                          className={selectClass}
                        >
                          <option value="">Explicit unapplied pool</option>
                          {values.mappings?.[index]?.targetEntryKey &&
                          !values.entries?.some(
                            (e) =>
                              e.entryKey ===
                                values.mappings[index]!.targetEntryKey &&
                              e.disposition === "scheduled",
                          ) ? (
                            <option
                              value={values.mappings[index]!.targetEntryKey}
                              disabled
                            >
                              Previous target removed or cancelled — choose a
                              target
                            </option>
                          ) : null}
                          {values.entries?.map((e, i) =>
                            e.disposition === "scheduled" ? (
                              <option key={e.entryKey} value={e.entryKey}>
                                Installment {i + 1}:{" "}
                                {e.dueDate || "date required"}
                              </option>
                            ) : null,
                          )}
                        </select>
                      </FormField>
                      {field(
                        `mappings.${index}.amountMinor`,
                        `Mapped amount ${index + 1} (${setup.detail.debt.currency})`,
                        "text",
                        true,
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => {
                          mappings.remove(index);
                          form.setValue("confirmed", false);
                        }}
                      >
                        Remove mapping {index + 1}
                      </Button>
                    </div>
                  ),
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    mappings.append({
                      paymentRevisionId: p.paymentRevisionId,
                      sourceAllocationId: p.sourceAllocationId,
                      targetEntryKey: "",
                      amountMinor: "",
                    });
                    form.setValue("confirmed", false);
                  }}
                >
                  Split payment pool {poolIndex + 1}
                </Button>
              </div>
            ))}
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" {...form.register("confirmed")} />I confirm
              every proposed payment mapping and explicit unapplied amount.
            </label>
          </section>
          {values.revisionKind === "renegotiation" ? (
            <section className="space-y-3 rounded-card border border-border p-4">
              <h2 className="text-lg font-semibold">
                Explicit newly recognized provider charge
              </h2>
              <p className="text-sm">
                Use only for a charge the provider confirms is now owed. It adds
                recognized liability and spending once, with no cash movement.
                Leave this off for expected future interest or already
                recognized amounts.
              </p>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" {...form.register("chargeEnabled")} />
                Recognize a new provider-confirmed charge
              </label>
              {values.chargeEnabled ? (
                <>
                  <FormField
                    htmlFor="charge-kind"
                    label="Recognized charge kind"
                  >
                    <select
                      id="charge-kind"
                      {...form.register("chargeKind")}
                      className={selectClass}
                    >
                      {["interest", "fee", "penalty"].map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {field(
                    "chargeAmount",
                    `Newly recognized charge (${setup.detail.debt.currency})`,
                    "text",
                    true,
                  )}
                  {field(
                    "chargeExplanation",
                    "Provider charge explanation",
                    "text",
                    true,
                  )}
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      {...form.register("providerConfirmed")}
                    />
                    The provider confirmed this new charge is recognized now.
                  </label>
                  <p className="text-sm">This charge will be uncategorized.</p>
                </>
              ) : null}
            </section>
          ) : null}
        </fieldset>
        {stage === "editing" ? (
          <Button type="submit" disabled={stale || !hydrated}>
            Review schedule revision
          </Button>
        ) : null}
      </form>
      {pending && preview ? (
        <div
          ref={reviewRef}
          tabIndex={-1}
          aria-label="Schedule revision review"
          className="space-y-5 rounded-card border border-border p-5"
        >
          <h2 className="text-lg font-semibold">Review schedule revision</h2>
          <p>
            Schedule frequency: {reviewSetup.frequency} â†’ {pending.frequency}.
          </p>
          <p>
            {pending.revisionKind.replaceAll("_", " ")} Â· effective{" "}
            {pending.effectiveDate} Â· {pending.reason}
          </p>
          <div
            className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
            tabIndex={0}
            role="region"
            aria-label="Old versus new schedule comparison table"
          >
            <table className="w-full text-left text-sm">
              <caption className="mb-3 text-left font-semibold">
                Old versus new schedule and Agenda projection
              </caption>
              <thead>
                <tr>
                  {[
                    "Obligation",
                    "Old date / amount / remaining",
                    "New date / amount",
                    "Carried opening / payments",
                    "New remaining / Agenda",
                  ].map((h) => (
                    <th key={h} className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.entries.map((e, index) => {
                  const old = e.obligationId
                    ? reviewSetup.detail.installments.find(
                        (i) => i.obligationId === e.obligationId,
                      )
                    : undefined;
                  return (
                    <tr key={e.entryKey}>
                      <td className="p-2">
                        Installment {index + 1} Â·{" "}
                        {old ? "survives" : "new identity"}
                      </td>
                      <td className="p-2">
                        {old
                          ? `${old.dueDate} / ${money(old.contractualMinor)} / ${money(old.remainingMinor)}`
                          : "New obligation"}
                      </td>
                      <td className="p-2">
                        {e.dueDate} / {money(e.contractualMinor)}
                      </td>
                      <td className="p-2">
                        {money(e.openingSatisfiedMinor)} /{" "}
                        {money(e.paymentSatisfiedMinor)}
                      </td>
                      <td className="p-2">
                        {money(e.remainingMinor)} Â·{" "}
                        {e.disposition === "cancelled"
                          ? `cancelled: ${e.cancellationReason}`
                          : e.remainingMinor === "0"
                            ? "satisfied; no due reminder"
                            : `due ${e.dueDate}`}
                      </td>
                    </tr>
                  );
                })}
                {reviewSetup.detail.installments
                  .filter(
                    (i) =>
                      !pending.entries.some(
                        (e) => e.obligationId === i.obligationId,
                      ),
                  )
                  .map((i) => (
                    <tr key={i.obligationId}>
                      <td className="p-2">Old installment {i.sequenceNo}</td>
                      <td className="p-2">
                        {i.dueDate} / {money(i.contractualMinor)} /{" "}
                        {money(i.remainingMinor)}
                      </td>
                      <td colSpan={3} className="p-2">
                        Replaced; old schedule remains in history. Previous
                        Agenda occurrence is removed.
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <section aria-label="Confirmed allocation mapping">
            <h3 className="font-semibold">Exact payment mapping</h3>
            {pending.mappings.map((m, i) => (
              <p key={i}>
                Payment pool{" "}
                {reviewSetup.pools.findIndex((p) => poolKey(p) === poolKey(m)) +
                  1}{" "}
                â†’ {targetLabel(m.targetEntryKey)}: {money(m.amountMinor)}
              </p>
            ))}
            <p>Explicit unapplied total: {money(preview.unappliedMinor)}</p>
          </section>
          <p>
            New remaining contractual total: {money(preview.remainingMinor)}.
            Opening satisfaction stays unchanged for surviving obligations.
          </p>
          <p>
            Actual cash movement: {money("0")}. Newly recognized liability:{" "}
            {money(preview.recognizedChargeMinor)}. Newly recognized spending:{" "}
            {money(preview.recognizedChargeMinor)}.
          </p>
          {pending.recognizedCharge ? (
            <p>
              Separate provider-confirmed {pending.recognizedCharge.kind}{" "}
              action: {pending.recognizedCharge.explanation}.
            </p>
          ) : null}
          <section
            className="space-y-3"
            aria-label="Reviewed contractual components"
          >
            <h3 className="font-semibold">
              Contractual components and obligation changes
            </h3>
            {pending.entries.map((e, index) => {
              const old = e.obligationId
                ? reviewSetup.detail.installments.find(
                    (i) => i.obligationId === e.obligationId,
                  )
                : undefined;
              const known = (value: string | null) =>
                value === null ? "unknown" : money(value);
              return (
                <div key={e.entryKey}>
                  <p>
                    Installment {index + 1}: principal{" "}
                    {known(e.knownPrincipalMinor)}, interest{" "}
                    {known(e.knownInterestMinor)}, fee {known(e.knownFeeMinor)};{" "}
                    {e.breakdownComplete ? "complete" : "incomplete"}{" "}
                    contractual breakdown.
                  </p>
                  {old ? (
                    <p className="text-sm text-muted-foreground">
                      Previously: principal {known(old.knownPrincipalMinor)},
                      interest {known(old.knownInterestMinor)}, fee{" "}
                      {known(old.knownFeeMinor)};{" "}
                      {old.breakdownComplete ? "complete" : "incomplete"}{" "}
                      breakdown.
                    </p>
                  ) : (
                    <p className="text-sm">
                      {e.replacesObligationId
                        ? `Replaces previous installment ${reviewSetup.detail.installments.find((i) => i.obligationId === e.replacesObligationId)!.sequenceNo}.`
                        : "Additional new obligation."}
                    </p>
                  )}
                  {e.notes ? <p>Notes: {e.notes}</p> : null}
                </div>
              );
            })}
          </section>
          {stage === "reviewing" ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={save}>Confirm schedule revision</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setStage("editing");
                  setPending(null);
                  form.setValue("confirmed", false);
                }}
              >
                Edit revision
              </Button>
            </div>
          ) : null}
          {stage === "saving" ? (
            <p role="status">Saving schedule revisionâ€¦</p>
          ) : null}
          {stage === "unconfirmed" ? (
            <Button onClick={save}>Retry same revision</Button>
          ) : null}
          {stage === "saved" ? (
            <Button
              onClick={() =>
                router.push(`/money/debts/${setup.detail.debt.debtId}`)
              }
            >
              Return to debt
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
