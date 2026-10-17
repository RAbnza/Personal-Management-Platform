import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { getCardInstallmentPlan } from "@/modules/finance/services/read-card-installments";
import { CardInstallmentApplicationForm } from "@/components/money/card-installment-form";
import { statementOffset } from "../../../statements/_context";
import { installmentContext, installmentPageError } from "../../_context";
export default async function InstallmentApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string; planId: string }>;
  searchParams: Promise<{ applicationOffset?: string; choiceOffset?: string }>;
}) {
  const scope = await installmentContext(params),
    q = await searchParams,
    applicationOffset = statementOffset(q.applicationOffset),
    choiceOffset = statementOffset(q.choiceOffset);
  let d;
  try {
    d = await getCardInstallmentPlan({
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      cardId: scope.cardId,
      planId: scope.planId!,
      applicationOffset,
      choiceOffset,
      asOfDate: scope.today,
    });
  } catch (e) {
    installmentPageError(e);
    return (
      <p role="alert">
        Application evidence could not be loaded. Retry this page.
      </p>
    );
  }
  const base = `/money/cards/${scope.cardId}/installments/${d.planId}/applications`;
  return (
    <div className="space-y-6 break-words">
      <Link
        className="action-link"
        href={`/money/cards/${scope.cardId}/installments/${d.planId}`}
      >
        Provider installment plan
      </Link>
      <ScreenHeader scope="Money" title="Confirm installment applications" />
      {!d.status.eligible && (
        <p role="status">
          This plan requires reconciliation or is cancelled. New applications
          are disabled; original confirmations can still be reversed.
        </p>
      )}
      <CardInstallmentApplicationForm key={d.revisionId} detail={d} />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          Unapplied payment and credit evidence
        </h2>
        <p>
          These records remain separate until a statement allocation and an
          installment application are explicitly confirmed.
        </p>
        <ul>
          {d.unappliedCredits.items.map((c) => (
            <li key={c.actionRevisionId}>
              {c.description}: unapplied{" "}
              {formatMoneyMinorUnits(d.card.currency, c.unappliedMinor)}
            </li>
          ))}
        </ul>
        <Link
          className="action-link"
          href={`/money/cards/${scope.cardId}/statements`}
        >
          Manage verified statement allocations
        </Link>
      </section>
      {d.allocationChoices.hasMore ||
      d.chargeChoices.hasMore ||
      d.unappliedCredits.hasMore ? (
        <Link
          className="action-link"
          href={`${base}?choiceOffset=${choiceOffset + 100}&applicationOffset=${applicationOffset}`}
        >
          Older allocation, charge and credit choices
        </Link>
      ) : null}
      {d.applications.hasMore && (
        <Link
          className="action-link"
          href={`${base}?choiceOffset=${choiceOffset}&applicationOffset=${applicationOffset + 100}`}
        >
          Older immutable application evidence
        </Link>
      )}
    </div>
  );
}
