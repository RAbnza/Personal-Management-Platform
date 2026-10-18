"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useClientReady } from "@/shared/use-client-ready";
import {
  statementCommandSchema,
  statementResultSchema,
  type StatementCommand,
  type StatementEvidence,
} from "@/modules/finance/domain/card-statement";
import type {
  RecognizedStatementPurchase,
  StatementSnapshot,
} from "@/modules/finance/repositories/card-statement-repository";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
function decimal(minor: string | null) {
  if (minor === null) return "";
  const n = BigInt(minor),
    a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}
function minor(value: string, optional = false) {
  if (optional && value === "") return null;
  return (
    value.startsWith("-")
      ? -parsePhpAmountToMinorUnits(value.slice(1))
      : parsePhpAmountToMinorUnits(value)
  ).toString();
}
const blank = () => ({
  description: "",
  postingDate: "",
  amountMinor: "",
  providerReference: "",
  actionRevisionId: "",
});
type Entry = ReturnType<typeof blank>;
export function CardStatementForm({
  cardId,
  currency,
  candidates,
  snapshot,
}: {
  cardId: string;
  currency: string;
  candidates: RecognizedStatementPurchase[];
  snapshot?: StatementSnapshot;
}) {
  const router = useRouter(),
    prefix = useId(),
    ready = useClientReady(),
    busy = useRef(false);
  const [entries, setEntries] = useState<Entry[]>(
    snapshot
      ? snapshot.entries.map((e) => ({
          ...e,
          postingDate: e.postingDate ?? "",
          amountMinor: decimal(e.amountMinor),
          providerReference: e.providerReference ?? "",
          actionRevisionId: e.actionRevisionId ?? "",
        }))
      : [],
  );
  const [review, setReview] = useState<StatementCommand | null>(null),
    [pending, setPending] = useState<StatementCommand | null>(null),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState<string | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null),
    errorMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  useEffect(() => {
    if (error) errorMessage.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!pending) return;
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    const navigation = (e: MouseEvent) => {
      if ((e.target as Element).closest("a[href]")) {
        e.preventDefault();
        setError("Retry the same save to resolve its outcome before leaving.");
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigation, true);
    };
  }, [pending]);
  async function save(command: StatementCommand) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setPending(command);
    setError(null);
    const abort = new AbortController(),
      timeout = setTimeout(() => abort.abort(), 20000);
    const { cardId: _cardId, statementId, ...body } = command;
    void _cardId;
    try {
      const response = await fetch(
        `/api/v1/credit-cards/${cardId}/statements${statementId ? `/${statementId}/revisions` : ""}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: abort.signal,
        },
      );
      if (response.ok) {
        const result = statementResultSchema.parse(await response.json());
        setPending(null);
        setSaved(true);
        router.push(`/money/cards/${cardId}/statements/${result.statementId}`);
        router.refresh();
      } else if (response.status >= 500)
        setError("The save outcome is unconfirmed. Retry the same save.");
      else {
        setPending(null);
        setReview(null);
        setError(
          response.status === 409
            ? "Statement evidence changed or a purchase is already linked. Refresh and review before saving."
            : "Review statement dates, amounts and owned activity links before saving.",
        );
      }
    } catch {
      setError(
        "The save outcome is unconfirmed. Keep this page open and retry the same save.",
      );
    } finally {
      clearTimeout(timeout);
      setSaving(false);
      busy.current = false;
    }
  }
  const editEntry = (i: number, key: keyof Entry, value: string) =>
    setEntries((old) =>
      old.map((e, n) => {
        if (n !== i) return e;
        if (key !== "actionRevisionId") return { ...e, [key]: value };
        const source = candidates.find((c) => c.actionRevisionId === value);
        return source
          ? {
              ...e,
              actionRevisionId: value,
              postingDate: source.postingDate,
              amountMinor: decimal(source.amountMinor),
              description: e.description || source.description,
              providerReference:
                e.providerReference || source.providerReference || "",
            }
          : { ...e, actionRevisionId: value };
      }),
    );
  function field(
    name: keyof StatementEvidence,
    label: string,
    type = "text",
    initial = "",
    required = true,
  ) {
    const id = `${prefix}-${name}`;
    return (
      <FormField key={name} htmlFor={id} label={label}>
        <Input
          id={id}
          name={name}
          type={type}
          defaultValue={initial}
          required={required}
          maxLength={type === "date" ? undefined : 2000}
        />
      </FormField>
    );
  }
  return (
    <form
      className="space-y-5 break-words"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || busy.current || review) return;
        setError(null);
        const form = e.currentTarget,
          data = new FormData(form),
          get = (k: string) => String(data.get(k) ?? "").trim();
        try {
          const parsed = statementCommandSchema.parse({
            clientCommandId: crypto.randomUUID(),
            cardId,
            cycleStart: get("cycleStart"),
            cycleEnd: get("cycleEnd"),
            statementDate: get("statementDate"),
            dueDate: get("dueDate"),
            balanceMinor: minor(get("balanceMinor")),
            minimumDueMinor: minor(get("minimumDueMinor")),
            openingBalanceMinor: minor(get("openingBalanceMinor"), true),
            providerReference: get("providerReference") || null,
            verificationSource: get("verificationSource"),
            verifiedDate: get("verifiedDate"),
            entries: entries.map((line) => ({
              ...line,
              postingDate: line.postingDate || null,
              amountMinor: minor(line.amountMinor.trim(), true),
              providerReference: line.providerReference.trim() || null,
              actionRevisionId: line.actionRevisionId || null,
            })),
            ...(snapshot
              ? {
                  statementId: snapshot.statementId,
                  expectedVersion: snapshot.version,
                  reason: get("reason"),
                }
              : {}),
          });
          setReview(parsed);
        } catch {
          setError(
            "Review the provider dates, signed amounts, required verification source and correction reason. Linked amounts and dates must match the recognized purchase.",
          );
          form.querySelector<HTMLInputElement>("input:invalid")?.focus();
        }
      }}
    >
      <fieldset
        hidden={review !== null}
        disabled={
          !ready || saving || pending !== null || saved || review !== null
        }
        className="space-y-4"
      >
        <legend className="font-semibold">Provider statement evidence</legend>
        <p>
          Copy verified provider values. Positive line amounts increase the
          balance; payments or credits use negative amounts. Leave unknown line
          dates or amounts blank. Every line stays unresolved until linked to
          supported recognized activity.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("cycleStart", "Cycle start", "date", snapshot?.cycleStart)}
          {field("cycleEnd", "Cycle end", "date", snapshot?.cycleEnd)}
          {field(
            "statementDate",
            "Statement date",
            "date",
            snapshot?.statementDate,
          )}
          {field("dueDate", "Due date", "date", snapshot?.dueDate)}
          {field(
            "balanceMinor",
            `Statement balance (${currency})`,
            "text",
            decimal(snapshot?.balanceMinor ?? null),
          )}
          {field(
            "minimumDueMinor",
            `Minimum due (${currency})`,
            "text",
            decimal(snapshot?.minimumDueMinor ?? null),
          )}
          {field(
            "openingBalanceMinor",
            `Provider opening balance (${currency}, optional)`,
            "text",
            decimal(snapshot?.openingBalanceMinor ?? null),
            false,
          )}
          {field(
            "providerReference",
            "Statement provider reference (optional)",
            "text",
            snapshot?.providerReference ?? "",
            false,
          )}
          {field(
            "verifiedDate",
            "Provider verification date",
            "date",
            snapshot?.verifiedDate,
          )}
          {field(
            "verificationSource",
            "Verification source",
            "text",
            snapshot?.verificationSource ?? "",
          )}
        </div>
        {snapshot && (
          <FormField
            htmlFor={`${prefix}-reason`}
            label="Required correction reason"
          >
            <Input
              id={`${prefix}-reason`}
              name="reason"
              required
              maxLength={20000}
            />
          </FormField>
        )}
        <p>
          Link only when the provider confirms membership. A purchase may fall
          outside the cycle dates; the application will retain that explicit
          membership.
        </p>
        {entries.map((line, i) => (
          <fieldset
            key={i}
            className="space-y-3 rounded-control border border-border p-3"
          >
            <legend className="px-1 font-semibold">
              Provider line {i + 1}
            </legend>
            {(
              [
                ["description", "Description"],
                ["postingDate", "Provider posting date (optional)"],
                ["amountMinor", `Signed amount (${currency}, optional)`],
                ["providerReference", "Provider line reference (optional)"],
              ] as const
            ).map(([key, label]) => (
              <FormField
                key={key}
                htmlFor={`${prefix}-${i}-${key}`}
                label={label}
              >
                <Input
                  id={`${prefix}-${i}-${key}`}
                  type={key === "postingDate" ? "date" : "text"}
                  value={line[key]}
                  required={key === "description"}
                  maxLength={2000}
                  onChange={(e) => editEntry(i, key, e.target.value)}
                />
              </FormField>
            ))}
            <FormField
              htmlFor={`${prefix}-${i}-link`}
              label="Recognized card activity link"
            >
              <select
                id={`${prefix}-${i}-link`}
                className="min-h-11 w-full rounded-control border border-input bg-surface p-2 text-foreground"
                value={line.actionRevisionId}
                onChange={(e) =>
                  editEntry(i, "actionRevisionId", e.target.value)
                }
              >
                <option value="">Unresolved provider line</option>
                {line.actionRevisionId &&
                  !candidates.some(
                    (c) => c.actionRevisionId === line.actionRevisionId,
                  ) && (
                    <option value={line.actionRevisionId}>
                      Preserved linked revision {line.actionRevisionId}
                    </option>
                  )}
                {candidates
                  .filter(
                    (c) =>
                      !c.statementId || c.statementId === snapshot?.statementId,
                  )
                  .map((c) => (
                    <option key={c.actionRevisionId} value={c.actionRevisionId}>
                      {c.description} · {c.postingDate} ·{" "}
                      {formatMoneyMinorUnits(currency, c.amountMinor)}
                    </option>
                  ))}
              </select>
            </FormField>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEntries((old) => old.filter((_, n) => n !== i))}
            >
              Remove provider line {i + 1}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={entries.length >= 100}
          onClick={() => setEntries((old) => [...old, blank()])}
        >
          Add provider line
        </Button>
        <p>
          Recording a statement changes provider evidence only. It does not
          create spending, cash movements or card liability.
        </p>
        <Button type="submit">Review statement</Button>
      </fieldset>
      {review && (
        <section
          aria-label="Statement review"
          className="space-y-4 rounded-control border border-border p-4"
        >
          <h2 ref={reviewHeading} tabIndex={-1} className="font-semibold">
            Review verified statement
          </h2>
          <p>
            Cycle {review.cycleStart} to {review.cycleEnd}. Statement{" "}
            {review.statementDate}; due {review.dueDate}.
          </p>
          <p>
            Historical balance{" "}
            {formatMoneyMinorUnits(currency, review.balanceMinor)}; minimum due{" "}
            {formatMoneyMinorUnits(currency, review.minimumDueMinor)}.{" "}
            {review.entries.length} provider lines;{" "}
            {review.entries.filter((e) => e.actionRevisionId).length} explicit
            purchase links.
          </p>
          <p>
            Verification: {review.verificationSource} · {review.verifiedDate}
          </p>
          {review.reason && <p>Correction reason: {review.reason}</p>}
          <p>
            Financial postings: none. Recorded remaining due uses this verified
            balance and recorded allocations only. Unrecorded payments are not
            assumed.
          </p>
          <ol>
            {review.entries.map((line, i) => (
              <li key={i}>
                {line.description} · Posted {line.postingDate ?? "Unknown"} ·{" "}
                {line.amountMinor == null
                  ? "Unknown amount"
                  : formatMoneyMinorUnits(currency, line.amountMinor)}{" "}
                ·{" "}
                {line.actionRevisionId
                  ? `Linked revision ${line.actionRevisionId}`
                  : "Unresolved"}
                {line.providerReference
                  ? ` · Reference ${line.providerReference}`
                  : ""}
              </li>
            ))}
          </ol>
          <Button
            type="button"
            className="max-w-full whitespace-normal"
            disabled={saving || pending !== null || saved}
            onClick={() => void save(review)}
          >
            Confirm provider-verified statement
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saving || pending !== null || saved}
            onClick={() => setReview(null)}
          >
            Edit statement
          </Button>
        </section>
      )}
      {error && (
        <p
          ref={errorMessage}
          tabIndex={-1}
          role="alert"
          className="text-danger"
        >
          {error}
        </p>
      )}
      {pending && !saving && (
        <Button type="button" onClick={() => void save(pending)}>
          Retry same save
        </Button>
      )}
    </form>
  );
}
