"use client";

import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  debtPaymentHistoryItemSchema,
  type DebtPaymentHistoryItem,
} from "@/modules/finance/domain/debt";
import { paymentDispositionLabels } from "@/modules/finance/domain/debt-payment";
import { formatMoneyMinorUnits } from "@/shared/money-display";

const pageSchema = z.object({
  financialRevision: z.string(),
  items: z.array(debtPaymentHistoryItemSchema),
  nextCursor: z.uuid().nullable(),
});
export function DebtPaymentHistory({
  debtId,
  currency,
  financialRevision,
  timezone,
  initialItems,
  initialCursor,
}: {
  debtId: string;
  currency: string;
  financialRevision: string;
  timezone: string;
  initialItems: DebtPaymentHistoryItem[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (value: string | null) =>
    value === null
      ? "No replacement payment"
      : formatMoneyMinorUnits(currency, value);
  async function load() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/debts/${debtId}/payments?after=${cursor}`,
        { cache: "no-store", headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("History unavailable");
      const page = pageSchema.parse(await response.json());
      if (page.financialRevision !== financialRevision)
        throw new Error("History changed");
      setItems((previous) => [
        ...previous,
        ...page.items.filter(
          (item) =>
            !previous.some((p) => p.actionRevisionId === item.actionRevisionId),
        ),
      ]);
      setCursor(page.nextCursor);
    } catch {
      setError(
        "Payment history could not be loaded consistently. Retry, or refresh the debt if financial information changed.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section aria-labelledby="payment-history-title" className="space-y-4">
      <h2 id="payment-history-title" className="text-lg font-semibold">
        Payment and audit history
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Each payment has one cash effect. Superseded and reversed revisions
        remain evidence; they are not additional payments.
      </p>
      {items.length === 0 ? (
        <p className="rounded-card border border-border p-5 text-sm">
          No payments recorded during tracked history.
        </p>
      ) : (
        <ol className="space-y-4">
          {items.map((item) => (
            <li
              key={item.actionRevisionId}
              className="space-y-3 rounded-card border border-border bg-card p-5"
            >
              <h3 className="font-semibold">
                <time dateTime={item.paymentDate}>{item.paymentDate}</time> ·{" "}
                {item.current
                  ? item.changeKind === "void"
                    ? "Reversed"
                    : "Current payment"
                  : "Superseded evidence"}{" "}
                · revision {item.revisionNo}
              </h3>
              <p className="text-sm wrap-break-word">
                <Link
                  href={`/money/actions/${item.actionId}`}
                  className="text-link underline"
                >
                  {item.description}
                </Link>
                {item.reference ? ` · ${item.reference}` : ""}
              </p>
              {item.changeKind !== "void" ? (
                <>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    {[
                      ["Account", item.payingAccountName ?? "Unavailable"],
                      ["Actual cash paid", money(item.actualPaidMinor)],
                      ["Contractual portion", money(item.contractualMinor)],
                      [
                        "External fee, excluded from dues",
                        money(item.externalFeeMinor),
                      ],
                      [
                        "Original unapplied amount",
                        money(item.unappliedContractualMinor),
                      ],
                      [
                        "Accounting certainty",
                        item.allocationCertainty?.replaceAll("_", " ") ??
                          "Not recorded",
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="numeric-value mt-1">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <details className="text-sm">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium">
                      Accounting and original contractual allocation
                    </summary>
                    <ul className="space-y-2">
                      {item.components.map((component, index) => (
                        <li key={index}>
                          {paymentDispositionLabels[component.disposition]}
                          {component.liabilityComponent
                            ? ` (${component.liabilityComponent})`
                            : ""}
                          : {money(component.amountMinor)}
                          {component.label ? ` · ${component.label}` : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 font-medium">
                      Original confirmed installment allocations
                    </p>
                    {item.dueAllocations.length ? (
                      <ul className="mt-2 space-y-2">
                        {item.dueAllocations.map((allocation) => (
                          <li key={allocation.installmentId}>
                            Installment {allocation.sequenceNo} ·{" "}
                            {allocation.dueDate}:{" "}
                            {money(allocation.amountMinor)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2">
                        No installment allocation; contractual amount explicitly
                        unapplied.
                      </p>
                    )}
                  </details>
                  <p className="text-sm leading-6">
                    Due confirmation:{" "}
                    {item.confirmationSource === "provider"
                      ? "provider confirmation reported by you"
                      : item.confirmationSource === "user"
                        ? "you confirmed"
                        : "confirmation metadata not supplied"}
                    {item.confirmationNote ? ` · ${item.confirmationNote}` : ""}
                    .
                  </p>
                  {item.allocationCertainty === "unresolved" ? (
                    <p className="text-sm text-warning">
                      Accounting classification remains unresolved in this
                      payment&apos;s original evidence.
                    </p>
                  ) : null}
                  {item.negativeBalanceAcknowledged ? (
                    <p className="text-sm text-muted-foreground">
                      Negative tracked account balance warning acknowledged at
                      entry.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm">
                  The prior economic payment was reversed; the original evidence
                  remains in history.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Recorded{" "}
                <time dateTime={item.recordedAt}>
                  {new Intl.DateTimeFormat("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: timezone,
                  }).format(new Date(item.recordedAt))}
                </time>
                . Financial audit evidence retained.
              </p>
            </li>
          ))}
        </ol>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {cursor ? (
        <Button
          variant="secondary"
          loading={loading}
          loadingLabel="Loading payment history…"
          onClick={() => void load()}
        >
          Load older payment history
        </Button>
      ) : null}
    </section>
  );
}
