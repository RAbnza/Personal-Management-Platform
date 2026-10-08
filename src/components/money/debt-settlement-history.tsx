import type { DebtSettlementRead } from "@/modules/finance/domain/debt-settlement";
import { formatMoneyMinorUnits } from "@/shared/money-display";
export function DebtSettlementHistory({
  settlement: s,
  currency,
}: {
  settlement: DebtSettlementRead | null;
  currency: string;
}) {
  if (!s) return null;
  const money = (v: string) => formatMoneyMinorUnits(currency, v);
  return (
    <section
      aria-labelledby="settlement-history-title"
      className="space-y-3 rounded-card border border-border bg-card p-5"
    >
      <h2 id="settlement-history-title" className="text-lg font-semibold">
        Settlement history
      </h2>
      <p>
        {s.settlementDate} ?{" "}
        {s.settlementKind === "early"
          ? "Early settlement"
          : "Normal settlement"}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ["Confirmed payoff", s.confirmedPayoffMinor],
          ["Actual cash paid", s.actualCashPaidMinor],
          [
            "External fee (excluded from due satisfaction)",
            (
              BigInt(s.actualCashPaidMinor) - BigInt(s.confirmedPayoffMinor)
            ).toString(),
          ],
          ["Resolved final-payoff unapplied pools", s.resolvedUnappliedMinor],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="numeric-value">{money(value!)}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-2">
        {s.components.map((c, i) => (
          <li key={i}>
            {c.kind.replaceAll("_", " ")}: {money(c.amountMinor)} ?{" "}
            {c.liabilityComponent ?? "unrecognized future charge"} ?{" "}
            {c.explanation}
            {c.unknownOpening
              ? " ? Disclosed imported opening adjustment; no expense reversal"
              : c.kind === "avoided_future_charge"
                ? " ? Metadata only; no expense reversal"
                : null}
          </li>
        ))}
      </ul>
      <p>
        {s.confirmationSource} confirmation: {s.confirmationNote}
      </p>
      {s.unappliedResolutionNote ? <p>{s.unappliedResolutionNote}</p> : null}
      <p>
        Provider reference: {s.providerReference ?? "None"}. Reason: {s.reason}
      </p>
      <p className="text-sm text-muted-foreground">
        Previous schedules and actual payment evidence remain in the histories
        below. Future unpaid reminders were cancelled by the closing schedule.
      </p>
    </section>
  );
}
