import styles from "@/components/money/money-workspace.module.css";
import { ArrowUpRight, CreditCard } from "lucide-react";
import { ScreenHeader } from "@/components/patterns/work-area";
import {
  MoneyColumns,
  MoneyCreation,
} from "@/components/money/money-workspace";
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
        <Link href="/money/cards" className="action-link">
          Retry loading cards
        </Link>
      </Panel>
    );
  }
  return (
    <div className="space-y-6 break-words">
      <ScreenHeader scope="Money" title="Credit cards" />
      <Link href="/money/transactions" className="action-link">
        Add Expense
      </Link>
      <CardSurfacePanel data={surface} currency={workspace.currency} />
      <MoneyColumns>
        <Panel
          title="Recorded cards"
          descriptionAsHelp
          description="Outstanding comes from posted activity. Unrecorded provider history remains unknown. Available credit is excluded from liquid funds."
        >
          <ul className={styles.creditCards}>
            {surface.cards.slice(0, 100).map((c) => (
              <li key={c.cardId} className={styles.creditCard}>
                <div className="flex items-center justify-between gap-3">
                  <CreditCard size={25} />
                  <small>
                    {c.issuerName}
                    {c.archived ? " \u00b7 Archived" : ""}
                  </small>
                </div>
                <div>
                  <small>Posted outstanding</small>
                  <strong>
                    {formatMoneyMinorUnits(
                      c.currency,
                      c.postedOutstandingMinor,
                    )}
                  </strong>
                  {c.cardCreditMinor !== "0" && (
                    <small>
                      Card credit{" "}
                      {formatMoneyMinorUnits(c.currency, c.cardCreditMinor)}
                    </small>
                  )}
                </div>
                <Link href={`/money/cards/${c.cardId}`}>
                  {c.name}
                  <ArrowUpRight size={18} />
                </Link>
              </li>
            ))}
          </ul>
          {!surface.cards.length && <p>No cards yet.</p>}
          {surface.cards.length > 100 && <p>Showing the first 100 cards.</p>}
        </Panel>
        <MoneyCreation title="Add credit card">
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Give the card a recognizable name and identify its issuer.
          </p>
          <CardCreateForm />
        </MoneyCreation>
      </MoneyColumns>
    </div>
  );
}
