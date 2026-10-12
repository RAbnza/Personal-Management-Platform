import { CardSurfacePanel } from "@/components/money/card-surface-panel";
import { getCardSurface } from "@/modules/finance/services/read-card-surface";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { CardCreateForm } from "@/components/money/card-create-form";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../debts/_workspace";

export default async function CardsPage() {
  const { user, workspace } = await debtWorkspace();
  let surface;
  try {
    surface = await getCardSurface({
      userId: user.id,
      workspaceId: workspace.id,
    });
  } catch {
    return (
      <Panel
        title="Credit cards unavailable"
        description="Your private cards could not be loaded safely."
      >
        <Link href="/money/cards" className="text-link underline">
          Retry loading cards
        </Link>
      </Panel>
    );
  }
  return (
    <div className="space-y-6 break-words">
      <h1 className="text-2xl font-semibold">Credit cards</h1>
      <Link
        href="/money/transactions"
        className="inline-flex min-h-11 items-center text-link underline"
      >
        Add Expense
      </Link>
      <CardSurfacePanel data={surface} currency={workspace.currency} />
      <Panel
        title="Recorded cards"
        description="Outstanding comes from posted activity. Unrecorded provider history remains unknown. Available credit is excluded from liquid funds."
      >
        <ul className="divide-y divide-border">
          {surface.cards.slice(0, 100).map((c) => (
            <li key={c.cardId} className="py-3">
              <Link
                href={`/money/cards/${c.cardId}`}
                className="text-link underline"
              >
                {c.name}
              </Link>
              <p>
                {c.issuerName}
                {c.archived ? " · Archived" : ""} · Posted outstanding{" "}
                {formatMoneyMinorUnits(c.currency, c.postedOutstandingMinor)} ·
                Card credit{" "}
                {formatMoneyMinorUnits(c.currency, c.cardCreditMinor)}
              </p>
            </li>
          ))}
        </ul>
        {!surface.cards.length && <p>No cards yet.</p>}
        {surface.cards.length > 100 && <p>Showing the first 100 cards.</p>}
      </Panel>
      <Panel
        title="Add credit card"
        description="Give the card a recognizable name and identify its issuer."
      >
        <CardCreateForm />
      </Panel>
    </div>
  );
}
