import { ScreenHeader } from "@/components/patterns/work-area";
import { CardSurfacePanel } from "@/components/money/card-surface-panel";
import { CardCreateForm } from "@/components/money/card-create-form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Panel } from "@/components/ui/panel";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { getCardActivity } from "@/modules/finance/services/read-card-activity";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../../debts/_workspace";

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ offset?: string }>;
}) {
  const { user, workspace } = await debtWorkspace(),
    id = z.uuid().safeParse((await params).cardId);
  if (!id.success) notFound();
  const page = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .safeParse((await searchParams).offset ?? 0);
  if (!page.success) notFound();
  let data;
  try {
    data = await getCardActivity({
      userId: user.id,
      workspaceId: workspace.id,
      cardId: id.data,
      offset: page.data,
    });
  } catch (e) {
    if (e instanceof CreditCardUnavailableError) notFound();
    return (
      <p role="alert">Card activity could not be loaded. Retry this page.</p>
    );
  }
  const money = (n: string) => formatMoneyMinorUnits(data.card.currency, n);
  return (
    <div className="space-y-6 break-words">
      <Link href="/money/cards" className="action-link">
        Credit cards
      </Link>
      <ScreenHeader scope="Money" title={data.card.name} />
      <p>
        {data.card.issuerName} · Posted outstanding{" "}
        {money(data.card.postedOutstandingMinor)} · Card credit{" "}
        {money(data.card.cardCreditMinor)}
      </p>
      <Link href="/money/transactions" className="action-link">
        Add Expense
      </Link>
      <Link href={`/money/actions?cardId=${id.data}`} className="action-link">
        Financial history for this card
      </Link>
      <Link href={`/money/cards/${id.data}/statements`} className="action-link">
        Provider statements and reconciliation
      </Link>
      <nav
        aria-label="Card views"
        className="flex flex-wrap gap-2 border-b border-border pb-3 text-sm font-semibold text-link"
      >
        <a
          href="#card-overview"
          className="inline-flex min-h-11 items-center px-3"
        >
          Overview
        </a>
        <a
          href="#card-activity"
          className="inline-flex min-h-11 items-center px-3"
        >
          Activity
        </a>
        <Link
          href={`/money/cards/${id.data}/statements`}
          className="inline-flex min-h-11 items-center px-3"
        >
          Statements
        </Link>
        <Link
          href={`/money/cards/${id.data}/installments`}
          className="inline-flex min-h-11 items-center px-3"
        >
          Installments
        </Link>
      </nav>
      <div id="card-overview">
        <CardSurfacePanel
          data={data.cardSurface}
          currency={data.card.currency}
        />
      </div>
      <Panel
        title="Installment details"
        description="Optional provider schedules for already recognized purchases."
      >
        <details>
          <summary className="min-h-11 cursor-pointer">
            Provider installment plans
          </summary>
          <Link
            href={`/money/cards/${id.data}/installments`}
            className="action-link"
          >
            Manage provider schedules and confirmed applications
          </Link>
        </details>
      </Panel>
      <Panel
        title="Payments and credits"
        description="Actual cash transfers, provider charges and refunds preserve distinct accounting effects."
      >
        <Link
          href={`/money/cards/${id.data}/commands/new`}
          className="action-link"
        >
          Record payment, fee, interest or refund
        </Link>
      </Panel>
      <Panel
        title="Card management"
        description="Provider limit evidence, notes and reversible archiving preserve financial history."
      >
        <details>
          <summary className="min-h-11 cursor-pointer">
            Edit card metadata
          </summary>
          <CardCreateForm key={data.card.version} card={data.card} />
        </details>
      </Panel>
      <Panel
        id="card-activity"
        title="Card activity history"
        description="Every preserved purchase, payment, fee, interest and refund revision. Transaction dates determine reporting periods; provider posting dates retain evidence. Liability changes include reversals and replacements."
      >
        <ol className="divide-y divide-border">
          {data.items.map((i) => (
            <li key={i.actionRevisionId} className="space-y-1 py-4">
              <Link
                href={`/money/actions/${i.actionId}`}
                className="action-link"
              >
                {i.description}
              </Link>
              <p>
                Transaction {i.transactionDate} · Posted {i.postingDate} ·
                Revision {i.revisionNo} · {i.current ? "Current" : "Preserved"}
                {i.changeKind === "void" ? " · Reversed" : ""}
              </p>
              <p>
                {i.actionKind.replace("card_", "")}{" "}
                {i.amountMinor !== null ? money(i.amountMinor) : ""}
              </p>
              <p>
                {i.purchaseMinor !== null
                  ? `Purchase ${money(i.purchaseMinor)} · `
                  : ""}
                Liability change {money(i.signedLiabilityMinor)}
              </p>
              {i.providerReference && (
                <p>Provider reference: {i.providerReference}</p>
              )}
              {i.reason && <p>Reason: {i.reason}</p>}
            </li>
          ))}
        </ol>
        {!data.items.length && <p>No posted card activity yet.</p>}
        {data.hasMore && (
          <Link href={`?offset=${page.data + 100}`} className="action-link">
            Older activity
          </Link>
        )}
        {page.data > 0 && (
          <Link href="?offset=0" className="action-link">
            Latest activity
          </Link>
        )}
      </Panel>
    </div>
  );
}
