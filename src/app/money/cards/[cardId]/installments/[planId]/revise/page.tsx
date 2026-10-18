import { BreadcrumbRecords } from "@/components/shell/breadcrumbs";
import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { getCardInstallmentPlan } from "@/modules/finance/services/read-card-installments";
import { CardInstallmentPlanForm } from "@/components/money/card-installment-form";
import { installmentContext, installmentPageError } from "../../_context";
export default async function ReviseInstallmentPage({
  params,
}: {
  params: Promise<{ cardId: string; planId: string }>;
}) {
  const scope = await installmentContext(params);
  let d;
  try {
    d = await getCardInstallmentPlan({
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      cardId: scope.cardId,
      planId: scope.planId!,
      asOfDate: scope.today,
    });
  } catch (e) {
    installmentPageError(e);
    return (
      <p role="alert">
        Installment evidence could not be loaded. Retry this page.
      </p>
    );
  }
  const purchase = d.currentPurchase ?? {
    actionId: d.snapshot.purchaseActionId,
    actionRevisionId: d.snapshot.purchaseActionRevisionId,
    description: "Preserved original purchase",
    amountMinor: d.status.recognizedPurchaseMinor,
    transactionDate: "",
    postingDate: "",
  };
  return (
    <div className="space-y-6 break-words">
      <Link
        className="action-link"
        href={`/money/cards/${scope.cardId}/installments/${d.planId}`}
      >
        Current provider plan
      </Link>
      <BreadcrumbRecords
        path={`/money/cards/${scope.cardId}/installments/${scope.planId}/revise`}
        labels={{
          [`/money/cards/${scope.cardId}`]: d.card.name,
          [`/money/cards/${scope.cardId}/installments/${scope.planId}`]:
            d.currentPurchase?.description ?? "Installment plan",
        }}
      />
      <ScreenHeader scope="Money" title="Revise or cancel provider schedule" />
      <p>
        This command creates a new immutable provider revision. Existing
        application confirmations tied to the old revision require fresh
        confirmation.
      </p>
      {!d.currentPurchase && (
        <p role="status">
          The original purchase was reversed or moved to another card. Only a
          provider-confirmed cancellation can retain its historical source here.
        </p>
      )}
      <CardInstallmentPlanForm
        key={`${d.planId}:${d.revisionId}:${purchase.actionRevisionId}`}
        setup={{
          card: d.card,
          financialRevision: d.financialRevision,
          purchases: [purchase],
          hasMore: false,
        }}
        purchase={purchase}
        detail={d}
        today={scope.today}
      />
    </div>
  );
}
