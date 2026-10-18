import { BreadcrumbRecords } from "@/components/shell/breadcrumbs";
import { ScreenHeader } from "@/components/patterns/work-area";
import { Attachments } from "@/components/files/attachments";
import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { FinancialActionUnavailableError } from "@/modules/finance/domain/financial-correction";
import { FinancialActionReviewForm } from "@/components/money/financial-action-review-form";
import { Panel } from "@/components/ui/panel";
import { getFinancialActionDetail } from "@/modules/finance/services/correct-financial-action";
import { listFinancialAccounts } from "@/modules/finance/services/list-financial-accounts";
import {
  getCreditCardDetail,
  listCreditCards,
} from "@/modules/finance/services/read-credit-cards";
import { listCategories } from "@/modules/core/services/list-categories";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../../debts/_workspace";
export default async function FinancialActionPage({
  params,
}: {
  params: Promise<{ actionId: string }>;
}) {
  const { user, workspace } = await debtWorkspace(),
    id = z.uuid().safeParse((await params).actionId);
  if (!id.success) notFound();
  let detail, accounts, categories, cards;
  try {
    [detail, accounts, categories, cards] = await Promise.all([
      getFinancialActionDetail({
        userId: user.id,
        workspaceId: workspace.id,
        actionId: id.data,
      }),
      listFinancialAccounts({
        userId: user.id,
        workspaceId: workspace.id,
        includeArchived: true,
      }),
      listCategories({
        userId: user.id,
        workspaceId: workspace.id,
        includeArchived: true,
      }),
      listCreditCards({
        userId: user.id,
        workspaceId: workspace.id,
        includeArchived: true,
        pageSize: 100,
      }),
    ]);
    // Preserve access to the bound historical card beyond the bounded picker.
    const boundCardId = detail.current.evidence.cardId;
    if (
      typeof boundCardId === "string" &&
      !cards.items.some((card) => card.cardId === boundCardId)
    ) {
      const bound = await getCreditCardDetail({
        userId: user.id,
        workspaceId: workspace.id,
        cardId: boundCardId,
      });
      cards.items.push(bound.card);
    }
  } catch (error) {
    if (error instanceof FinancialActionUnavailableError) notFound();
    return (
      <Panel
        title="Financial evidence unavailable"
        description="Current evidence could not be loaded safely."
      >
        <Link href={`/money/actions/${id.data}`} className="action-link">
          Retry loading evidence
        </Link>
      </Panel>
    );
  }
  return (
    <div className="space-y-6">
      <Link href="/money/actions" className="action-link">
        Financial activity
      </Link>
      <BreadcrumbRecords
        path={`/money/actions/${id.data}`}
        labels={{ [`/money/actions/${id.data}`]: detail.current.description }}
      />
      <ScreenHeader scope="Money" title={detail.current.description} />
      <Panel
        title="Current logical action"
        description="One business action with its current revision and complete correction history."
      >
        <p>
          {detail.current.actionKind === "group_effect"
            ? "Shared payment or refund"
            : detail.current.actionKind === "group_adoption"
              ? "Shared expense"
              : detail.current.actionKind.replaceAll("_", " ")}{" "}
          · Revision {detail.current.revisionNo} ·{" "}
          {detail.current.changeKind === "void" ? "Reversed" : "Current"} ·
          Effective {detail.current.effectiveDate}
        </p>
        <ul>
          {detail.cashEffects.map((e, i) => (
            <li key={i}>
              {String(e.accountName)}:{" "}
              {formatMoneyMinorUnits(workspace.currency, String(e.signedMinor))}{" "}
              effective {String(e.effectiveDate)}
            </li>
          ))}
        </ul>
      </Panel>
      {detail.recurringLinks?.length ? (
        <details className="space-y-3 rounded-md border border-border p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Recurring occurrence confirmations
          </summary>
          <p>
            These confirmations do not post money. Reverse each effective
            planning link before correcting this actual transaction.
          </p>
          <ul className="space-y-3">
            {detail.recurringLinks.map((link) => (
              <li key={link.occurrenceId}>
                <Link
                  href={`/money/recurring/occurrences/${link.occurrenceId}`}
                  className="action-link"
                >
                  {link.name} · {link.dueDate} ·{" "}
                  {formatMoneyMinorUnits(workspace.currency, link.linkedMinor)}{" "}
                  linked · {link.state}
                </Link>
              </li>
            ))}
          </ul>
          {detail.recurringLinksHaveMore && (
            <p>
              Showing the first 100 confirmations. Remaining confirmations are
              available through recurring definition management.
            </p>
          )}
        </details>
      ) : null}
      {detail.current.actionKind === "card_purchase" &&
        detail.current.changeKind !== "void" &&
        typeof detail.current.evidence.cardId === "string" && (
          <details className="space-y-3 rounded-md border border-border p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Installment details
            </summary>
            <p>
              Provider installment scheduling is optional. This purchase already
              recognizes spending; a plan creates no additional expense,
              liability or cash movement.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                className="action-link"
                href={`/money/cards/${detail.current.evidence.cardId}/installments/new?purchaseActionId=${id.data}`}
              >
                Record provider installment schedule
              </Link>
              <Link
                className="action-link"
                href={`/money/cards/${detail.current.evidence.cardId}/installments`}
              >
                View provider installment plans
              </Link>
            </div>
          </details>
        )}
      {detail.privateGroupLink && (
        <Panel
          title="Your private group adoption"
          description={
            detail.privateGroupLink.reviewedDifferenceReason
              ? "Reviewed group/private difference; prior private evidence retained."
              : detail.privateGroupLink.needsPrivateCorrection
                ? "Needs private correction: the group source changed after your approval."
                : "Retained accounting for your approved group allocation."
          }
        >
          <p>
            Accepted source amount{" "}
            {formatMoneyMinorUnits("PHP", detail.privateGroupLink.paidMinor)} ·
            Accepted share amount{" "}
            {formatMoneyMinorUnits("PHP", detail.privateGroupLink.shareMinor)}
          </p>
          {detail.privateGroupLink.reviewedDifferenceReason && (
            <p>
              Review reason: {detail.privateGroupLink.reviewedDifferenceReason}
            </p>
          )}
          <Link
            className="action-link"
            href={
              detail.privateGroupLink.expenseId
                ? `/sharing/${detail.privateGroupLink.groupId}/expenses/${detail.privateGroupLink.expenseId}`
                : `/sharing/${detail.privateGroupLink.groupId}/effects/${detail.privateGroupLink.refundId ? `refund/${detail.privateGroupLink.refundId}` : `settlement/${detail.privateGroupLink.settlementId}`}`
            }
          >
            Review group source and your private adoption
          </Link>
        </Panel>
      )}
      {detail.current.changeKind !== "void" && !detail.privateGroupLink && (
        <FinancialActionReviewForm
          detail={detail}
          accounts={accounts.items}
          categories={categories.items}
          cards={cards.items}
          today={new Intl.DateTimeFormat("en-CA", {
            timeZone: workspace.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date())}
        />
      )}
      <Panel
        title="Preserved revision history"
        description="Effective dates determine financial periods. Recorded times show when evidence was saved."
      >
        <ol className="space-y-4">
          {detail.history.map((h, i) => (
            <li key={i} className="rounded-md border border-border p-3">
              <p>
                Revision {String(h.revisionNo)} · {String(h.changeKind)} ·
                Effective {String(h.effectiveDate)}
              </p>
              <p>Recorded {String(h.recordedAt)}</p>
              {h.reason != null && <p>Reason: {String(h.reason)}</p>}
              {h.evidence != null &&
                typeof h.evidence === "object" &&
                "description" in h.evidence && (
                  <p>{String(h.evidence.description)}</p>
                )}
            </li>
          ))}
        </ol>
      </Panel>
      <Attachments sourceKind="financial_action" sourceId={id.data} />
    </div>
  );
}
