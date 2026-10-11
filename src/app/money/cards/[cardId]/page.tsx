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
      <Link href="/money/cards" className="text-link underline">
        Credit cards
      </Link>
      <h1 className="text-2xl font-semibold">{data.card.name}</h1>
      <p>
        {data.card.issuerName} · Posted outstanding{" "}
        {money(data.card.postedOutstandingMinor)} · Card credit{" "}
        {money(data.card.cardCreditMinor)}
      </p>
      <Link
        href="/money/transactions"
        className="inline-flex min-h-11 items-center text-link underline"
      >
        Add Expense
      </Link>
      <Link
        href={`/money/actions?cardId=${id.data}`}
        className="ml-4 inline-flex min-h-11 items-center text-link underline"
      >
        Expense history for this card
      </Link>
      <Link
        href={`/money/cards/${id.data}/statements`}
        className="block min-h-11 text-link underline"
      >
        Provider statements and reconciliation
      </Link>
      <Panel
        title="Card purchase history"
        description="Every preserved purchase revision. Transaction dates determine spending periods; posting dates preserve provider evidence. Liability changes include reversals and replacements."
      >
        <ol className="divide-y divide-border">
          {data.items.map((i) => (
            <li key={i.actionRevisionId} className="space-y-1 py-4">
              <Link
                href={`/money/actions/${i.actionId}`}
                className="text-link underline"
              >
                {i.description}
              </Link>
              <p>
                Transaction {i.transactionDate} · Posted {i.postingDate} ·
                Revision {i.revisionNo} · {i.current ? "Current" : "Preserved"}
                {i.changeKind === "void" ? " · Reversed" : ""}
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
        {!data.items.length && <p>No posted card purchases yet.</p>}
        {data.hasMore && (
          <Link
            href={`?offset=${page.data + 100}`}
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Older activity
          </Link>
        )}
        {page.data > 0 && (
          <Link
            href="?offset=0"
            className="ml-4 inline-flex min-h-11 items-center text-link underline"
          >
            Latest activity
          </Link>
        )}
      </Panel>
    </div>
  );
}
