import { MoneyColumns } from "@/components/money/money-workspace";
import { Panel } from "@/components/ui/panel";
import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { getCardInstallmentPlan } from "@/modules/finance/services/read-card-installments";
import { statementIdentifierSchema as id } from "@/modules/finance/domain/card-statement";
import { notFound } from "next/navigation";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { statementOffset } from "../../statements/_context";
import { installmentContext, installmentPageError } from "../_context";
export default async function InstallmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string; planId: string }>;
  searchParams: Promise<{ revisionId?: string; offset?: string }>;
}) {
  const scope = await installmentContext(params),
    q = await searchParams,
    historyOffset = statementOffset(q.offset),
    rev = q.revisionId ? id.safeParse(q.revisionId) : null;
  if (rev && !rev.success) notFound();
  let d;
  try {
    d = await getCardInstallmentPlan({
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      cardId: scope.cardId,
      planId: scope.planId!,
      asOfDate: scope.today,
      historyOffset,
      ...(rev?.success ? { revisionId: rev.data } : {}),
    });
  } catch (e) {
    installmentPageError(e);
    return (
      <p role="alert">
        Installment evidence could not be loaded. Retry this page.
      </p>
    );
  }
  const base = `/money/cards/${scope.cardId}/installments/${d.planId}`,
    money = (n: string | null) =>
      n === null
        ? "Unknown / unavailable"
        : formatMoneyMinorUnits(d.card.currency, n);
  return (
    <div className="space-y-6 break-words">
      <Link
        className="action-link"
        href={`/money/cards/${scope.cardId}/installments`}
      >
        Provider installment plans
      </Link>
      <ScreenHeader scope="Money" title="Installment plan details" />
      <p>
        Revision {d.version} —{" "}
        {d.isCurrent
          ? "Current provider evidence"
          : "Preserved historical evidence"}
      </p>
      <MoneyColumns>
        <Panel title="Provider schedule and status">
          <p>
            Status: {d.status.kind}. Provider reference:{" "}
            {d.snapshot.providerReference ?? "Not supplied"}. Verified{" "}
            {d.snapshot.verifiedDate}: {d.snapshot.verificationSource}.
          </p>
          {d.status.kind === "reconciliation required" && (
            <p role="status">
              Purchase or linked refund evidence changed. Projections are
              suspended until the provider arrangement is reconciled. Original
              schedule history is preserved.
            </p>
          )}
          <p>
            Remaining scheduled principal:{" "}
            {money(d.totals.remainingPrincipalMinor)}
          </p>
          <p>
            Remaining scheduled interest:{" "}
            {money(d.totals.remainingInterestMinor)}; fees:{" "}
            {money(d.totals.remainingFeeMinor)}; total obligations:{" "}
            {money(d.totals.remainingTotalMinor)}.
          </p>
          <p>
            Unknown provider due dates: {d.totals.unknownDueDateCount}.
            Unresolved prior applications:{" "}
            {money(d.applications.unresolvedMinor)}. Statement payments and
            unallocated credits are not automatically applied to installments.
          </p>
        </Panel>
        <Panel
          title="Recognized card position"
          description="Provider schedules do not post an additional purchase, liability or payment."
        >
          <p>
            Current recorded card outstanding{" "}
            {money(d.card.postedOutstandingMinor)}; card credit{" "}
            {money(d.card.cardCreditMinor)}. Schedule amounts are projections
            and do not change these financial balances.
          </p>
          <Link
            className="action-link"
            href={`/money/actions/${d.snapshot.purchaseActionId}`}
          >
            Original purchase and correction history
          </Link>
        </Panel>
      </MoneyColumns>
      {d.isCurrent && (
        <div className="flex flex-wrap gap-3">
          <Link className="action-link" href={`${base}/revise`}>
            Revise or cancel provider schedule
          </Link>
          <Link className="action-link" href={`${base}/applications`}>
            Confirm installment applications
          </Link>
          <Link
            className="action-link"
            href={`/money/cards/${scope.cardId}/commands/new`}
          >
            Record actual card payment or charge
          </Link>
          <Link
            className="action-link"
            href={`/money/cards/${scope.cardId}/statements`}
          >
            Verified statements and allocations
          </Link>
        </div>
      )}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          Upcoming recorded installments
        </h2>
        <p>
          As of {d.asOfDate}; {d.overdue.length} past due supported schedule
          rows. No scheduled transaction is posted automatically.
        </p>
        {d.upcoming.length === 0 ? (
          <p>No eligible upcoming dated installment is recorded.</p>
        ) : (
          <ul className="space-y-2">
            {d.upcoming.slice(0, 12).map((l) => (
              <li key={l.sequenceNo}>
                Installment {l.sequenceNo}: due {l.dueDate}; remaining principal{" "}
                {money(l.remainingPrincipalMinor)}, total{" "}
                {money(l.remainingTotalMinor)}.
              </li>
            ))}
          </ul>
        )}
        {d.upcoming.length > 12 && (
          <p>
            The complete provider schedule below includes the remaining upcoming
            rows.
          </p>
        )}
      </section>
      <details className="space-y-3">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Complete provider schedule ({d.snapshot.installmentCount}{" "}
          installments)
        </summary>
        <ol className="space-y-4">
          {d.lines.map((l) => (
            <li
              key={l.sequenceNo}
              className="rounded-md border border-border p-3"
            >
              <p>
                Installment {l.sequenceNo}; due {l.dueDate ?? "Unknown"}.
                Expected principal {money(l.principalMinor)}, interest{" "}
                {money(l.interestMinor)}, fees {money(l.feeMinor)}; provider
                total {money(l.totalMinor)}.
              </p>
              <p>
                Remaining supported principal {money(l.remainingPrincipalMinor)}
                ; total {money(l.remainingTotalMinor)}. Reference{" "}
                {l.providerReference ?? "Not supplied"}.
              </p>
              {l.notes && <p>{l.notes}</p>}
            </li>
          ))}
        </ol>
      </details>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          Immutable provider revision history
        </h2>
        <ul>
          {d.history.map((h) => (
            <li key={h.revisionId}>
              <Link
                className="action-link"
                href={`${base}?revisionId=${h.revisionId}`}
              >
                Revision {h.version}
              </Link>{" "}
              — {h.lifecycle}; verified {h.verifiedDate}; recorded {h.createdAt}
              ; {h.reason ?? "Original provider evidence"}
            </li>
          ))}
        </ul>
        {d.historyHasMore && (
          <Link
            className="action-link"
            href={`?offset=${historyOffset + 25}${rev?.success ? `&revisionId=${rev.data}` : ""}`}
          >
            Older provider revisions
          </Link>
        )}
      </section>
      {d.snapshot.notes && <p>{d.snapshot.notes}</p>}
    </div>
  );
}
