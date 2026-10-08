"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  scheduleHistoryResultSchema,
  type ScheduleHistoryResult,
} from "@/modules/finance/domain/debt-schedule-history";
export function DebtScheduleHistory({
  debtId,
  currency,
  timezone,
  initial,
}: {
  debtId: string;
  currency: string;
  timezone: string;
  initial: ScheduleHistoryResult;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (s: string | null) =>
    s === null ? "unknown" : formatMoneyMinorUnits(currency, s);
  async function load() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/debts/${debtId}/schedule-revisions?after=${cursor}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          "History could not be loaded. Retry to keep the displayed versions.",
        );
      const result = scheduleHistoryResultSchema.parse(await response.json());
      if (result.financialRevision !== initial.financialRevision)
        throw new Error(
          "The debt history changed. Refresh the debt before loading more versions.",
        );
      setItems((previous) => [
        ...previous,
        ...result.items.filter(
          (i) =>
            !previous.some((p) => p.scheduleVersionId === i.scheduleVersionId),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "History is temporarily unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="space-y-4" aria-label="Schedule history">
      <h2 className="text-lg font-semibold">Schedule history</h2>
      <p className="text-sm text-muted-foreground">
        Finalized terms and mappings are immutable. Historical mappings document
        projections of the same payments; they are not additional payments.
      </p>
      {items.map((v) => (
        <details
          key={v.scheduleVersionId}
          className="rounded-card border border-border p-4"
        >
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Version {v.versionNo} · {v.revisionKind.replaceAll("_", " ")} ·
            effective {v.effectiveDate}
            {v.current ? " · current" : " · previous"}
          </summary>
          <p>{v.reason}</p>
          <p className="mt-2 text-sm">
            Finalized{" "}
            {new Intl.DateTimeFormat("en-PH", {
              timeZone: timezone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(v.finalizedAt))}{" "}
            · frequency {v.frequency}
          </p>
          {v.chargeActionId ? (
            <p className="mt-2 text-sm">
              Includes an explicitly recognized noncash provider charge in the
              financial audit.
            </p>
          ) : null}
          <ul className="mt-3 space-y-3">
            {v.entries.map((i) => (
              <li key={i.installmentId}>
                Installment {i.sequenceNo} · {i.dueDate} · contractual{" "}
                {money(i.contractualMinor)} · opening satisfied{" "}
                {money(i.openingSatisfiedMinor)} · {i.disposition}
                {i.cancellationReason ? `: ${i.cancellationReason}` : ""}
                <p className="text-sm text-muted-foreground">
                  Known principal {money(i.knownPrincipalMinor)}; interest{" "}
                  {money(i.knownInterestMinor)}; fee {money(i.knownFeeMinor)}.{" "}
                  {i.breakdownComplete ? "Complete" : "Incomplete"} breakdown.
                </p>
                {i.notes ? <p>{i.notes}</p> : null}
              </li>
            ))}
          </ul>
          {!v.entries.length ? (
            <p className="mt-3">No supplied due dates in this version.</p>
          ) : null}
          <h3 className="mt-4 font-semibold">Finalized payment mapping</h3>
          {v.mappings.length ? (
            <ul className="mt-2 space-y-2">
              {v.mappings.map((m, index) => (
                <li key={index}>
                  {m.sourceAllocationId
                    ? "Original due allocation"
                    : "Original unapplied pool"}{" "}
                  →{" "}
                  {m.targetInstallmentId
                    ? `installment ${v.entries.find((i) => i.installmentId === m.targetInstallmentId)?.sequenceNo ?? "in this version"}`
                    : "explicit unapplied pool"}
                  : {money(m.amountMinor)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm">
              No carried payment mappings in this version. Direct payment
              allocations remain in payment history.
            </p>
          )}
        </details>
      ))}
      {error ? <p role="alert">{error}</p> : null}
      {cursor ? (
        <Button
          variant="secondary"
          onClick={load}
          loading={loading}
          loadingLabel="Loading schedule history…"
        >
          Load older schedules
        </Button>
      ) : null}
    </section>
  );
}
