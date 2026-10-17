import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { BorrowingCreateForm } from "@/components/money/borrowing-create-form";
import { Panel } from "@/components/ui/panel";
import {
  listCategories,
  type ListCategoriesResult,
} from "@/modules/core/services/list-categories";
import {
  listFinancialAccounts,
  type ListFinancialAccountsResult,
} from "@/modules/finance/services/list-financial-accounts";
import { debtWorkspace } from "../_workspace";

export default async function BorrowDebtPage() {
  const { user, workspace } = await debtWorkspace();

  let accounts: ListFinancialAccountsResult | null = null;

  let categories: ListCategoriesResult | null = null;

  try {
    accounts = await listFinancialAccounts({
      userId: user.id,

      workspaceId: workspace.id,

      includeArchived: false,
    });

    categories = await listCategories({
      userId: user.id,

      workspaceId: workspace.id,

      kind: "expense",

      includeArchived: false,
    });
  } catch {
    console.error("Borrowing setup data could not be loaded.");
  }

  const setup =
    accounts !== null && categories !== null
      ? {
          accounts,

          categories,
        }
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/money/debts" className="action-link">
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.9} />
          Back to debts
        </Link>

        <p className="mt-3 text-sm font-medium text-link">Money</p>

        <ScreenHeader scope="Money" title="Record new borrowing" />

        <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
          Record a loan or obligation that begins during your tracked history.
          The actual proceeds increase the selected account, while the debt
          liability and any provider fees remain separately identifiable.
        </p>
      </div>

      {setup === null ? (
        <Panel
          title="Borrowing entry temporarily unavailable"
          description="The required account or category information could not be loaded safely."
        >
          <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
            No financial data has been changed. Retry before recording this
            borrowing.
          </p>

          <Link href="/money/debts/borrow" className="action-link">
            <RotateCcw
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Retry borrowing setup
          </Link>
        </Panel>
      ) : setup.accounts.items.length === 0 ? (
        <Panel
          title="Add an account first"
          description="A new borrowing must identify where the actual loan proceeds were received."
        >
          <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
            Add the cash, e-wallet, checking or savings account where the
            provider deposited the money.
          </p>

          <Link href="/money/accounts" className="action-link">
            Add financial account
          </Link>
        </Panel>
      ) : (
        <BorrowingCreateForm
          currency={workspace.currency}
          accounts={setup.accounts.items}
          categories={setup.categories.items}
        />
      )}
    </div>
  );
}
