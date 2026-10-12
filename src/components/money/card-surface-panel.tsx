import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import type { CardSurface } from "@/modules/finance/repositories/card-surface-repository";

export function CardSurfacePanel({
  data,
  currency,
}: {
  data: CardSurface;
  currency: string;
}) {
  const money = (v: string | null) =>
    v === null ? "Unknown" : formatMoneyMinorUnits(currency, v);
  const names = new Map(data.cards.map((c) => [c.cardId, c.name]));
  return (
    <Panel
      className="break-words"
      title="Credit card overview"
      description={`Current posted balances and provider evidence as of ${data.basisDate}. Projections cover ${data.projectionStart} through ${data.projectionEnd}.`}
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt>Posted card outstanding</dt>
          <dd>{money(data.totals.postedOutstandingMinor)}</dd>
        </div>
        <div>
          <dt>Card credit (separate from cash)</dt>
          <dd>{money(data.totals.cardCreditMinor)}</dd>
        </div>
        <div>
          <dt>Latest verified statement dues</dt>
          <dd>{money(data.totals.latestStatementDueMinor)}</dd>
        </div>
        <div>
          <dt>Aggregate estimated utilization</dt>
          <dd>{data.utilization.utilizationPercent ?? "Unavailable"}</dd>
          <dd className="text-sm text-muted-foreground">
            Posted use {money(data.utilization.usedMinor)} / verified eligible
            limits {money(data.utilization.limitMinor)};{" "}
            {data.utilization.excludedCount} cards excluded.
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">
        Available credit is an estimate from verified limits and posted
        outstanding. Pending authorizations and provider credit rules are
        unknown. Card credit does not increase this estimate.
      </p>
      <ul className="mt-4 divide-y divide-border">
        {data.cards.slice(0, 10).map((c) => (
          <li key={c.cardId} className="space-y-2 py-4">
            <Link
              href={`/money/cards/${c.cardId}`}
              className="inline-block min-h-11 max-w-full break-words py-2 text-link underline"
            >
              {c.name}
              {c.archived ? " (archived)" : ""}
            </Link>
            <p>
              Posted outstanding {money(c.postedOutstandingMinor)} · Card credit{" "}
              {money(c.cardCreditMinor)}
            </p>
            <p>
              Available credit estimate {money(c.availableCreditEstimateMinor)}{" "}
              · Utilization {c.utilizationPercent ?? "Unavailable"} · Limit{" "}
              {c.limitStatus}
              {c.limitVerifiedDate ? ` (${c.limitVerifiedDate})` : ""}
            </p>
            {c.latestStatement ? (
              <div>
                <Link
                  className="inline-block min-h-11 max-w-full break-words py-2 text-link underline"
                  href={`/money/cards/${c.cardId}/statements/${c.latestStatement.statementId}`}
                >
                  Latest verified statement: {c.latestStatement.statementDate}
                </Link>
                <p>
                  Provider balance {money(c.latestStatement.balanceMinor)} ·
                  Remaining due {money(c.latestStatement.remainingDueMinor)} ·
                  Recorded minimum due{" "}
                  {money(c.latestStatement.minimumDueMinor)} · Due{" "}
                  {c.latestStatement.dueDate}
                </p>
                <p>
                  Confirmed allocated {money(c.latestStatement.allocatedMinor)}{" "}
                  · Statement credit{" "}
                  {money(c.latestStatement.statementCreditMinor)}
                </p>
                {(c.latestStatement.unresolvedAllocationMinor !== "0" ||
                  c.latestStatement.unresolvedEntryCount !== "0") && (
                  <p>
                    Review reconciliation: unresolved allocations{" "}
                    {money(c.latestStatement.unresolvedAllocationMinor)};
                    unresolved provider lines{" "}
                    {c.latestStatement.unresolvedEntryCount}.
                  </p>
                )}
                <p>
                  Unexplained provider difference{" "}
                  {money(c.latestStatement.unexplainedDifferenceMinor)} ·
                  Unlinked recognized activity{" "}
                  {c.latestStatement.unlinkedRecognizedCount}
                </p>
                <Link
                  href={`/calendar/reminders/card_statement/${c.latestStatement.statementId}`}
                  className="inline-block min-h-11 max-w-full break-words py-2 text-link underline"
                >
                  Statement reminder controls
                </Link>
              </div>
            ) : (
              <p>
                No verified statement recorded. Provider dues remain unknown.
              </p>
            )}
            {c.olderUnpaidStatementCount > 0 && (
              <p>
                {c.olderUnpaidStatementCount} older recorded statements have
                remaining amounts; review for carried balances before combining
                dues.
              </p>
            )}
          </li>
        ))}
      </ul>
      {!data.cards.length && <p className="mt-4">No tracked cards.</p>}
      {data.cards.length > 10 && (
        <p>
          Showing 10 of {data.cards.length} cards. Totals include all owned
          cards.{" "}
          <Link
            className="inline-block min-h-11 max-w-full break-words py-2 text-link underline"
            href="/money/cards"
          >
            Manage recorded cards
          </Link>
        </p>
      )}
      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer">
          Provider installment projections
        </summary>
        <p>
          Expected remaining principal in this range{" "}
          {money(data.totals.projectedPrincipalMinor)} · Known total subtotal{" "}
          {money(data.totals.knownProjectedTotalMinor)} ·{" "}
          {data.totals.unknownProjectedTotalCount} totals unknown.
        </p>
        <p>
          {data.totals.unknownInstallmentDateCount} eligible installments have
          unknown dates. {data.totals.reconciliationPlanCount} active plans
          require source reconciliation and are excluded from projections.
        </p>
        <ul className="divide-y divide-border">
          {data.installments.slice(0, 20).map((i) => (
            <li key={i.installmentId} className="space-y-1 py-3">
              <Link
                className="inline-block min-h-11 max-w-full break-words py-2 text-link underline"
                href={`/money/cards/${i.cardId}/installments/${i.planId}`}
              >
                {names.get(i.cardId)} · Installment {i.sequenceNo} · Due{" "}
                {i.dueDate}
              </Link>
              <p>
                Expected remaining principal {money(i.remainingPrincipalMinor)}{" "}
                · Interest {money(i.remainingInterestMinor)} · Fees{" "}
                {money(i.remainingFeeMinor)} · Total{" "}
                {money(i.remainingTotalMinor)}
              </p>
              <Link
                className="inline-block min-h-11 max-w-full break-words py-2 text-link underline"
                href={`/calendar/reminders/card_installment/${i.installmentId}`}
              >
                Installment reminder controls
              </Link>
            </li>
          ))}
        </ul>
        {data.installments.length > 20 && (
          <p>
            Showing 20 of {data.installments.length} projections. Totals include
            the whole range. Open provider plans, Agenda or the report CSV for
            all source records.
          </p>
        )}
        {!data.installments.length && (
          <p>No eligible installment projections in this range.</p>
        )}
      </details>
      <p className="mt-4 text-sm text-muted-foreground">
        {data.warning} The recorded minimum due is historical provider evidence;
        its satisfaction is not inferred.
      </p>
    </Panel>
  );
}
