import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { TransactionCreateForm } from "@/components/money/transaction-create-form";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import {
  listCategories,
  type ListCategoriesResult,
} from "@/modules/core/services/list-categories";
import {
  listFinancialAccounts,
  type ListFinancialAccountsResult,
} from "@/modules/finance/services/list-financial-accounts";

export default async function MoneyTransactionsPage() {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());

  if (bootstrap.kind === "unauthorized") {
    redirect("/auth/sign-in");
  }

  if (bootstrap.kind === "unavailable") {
    return (
      <AuthCard
        eyebrow="Money"
        title="We couldn't prepare your workspace"
        description="Your private workspace couldn't be loaded safely. No financial information has been changed."
      >
        <Link
          href="/money/transactions"
          className={[
            "inline-flex min-h-11 w-full items-center justify-center gap-2",
            "rounded-button border border-primary-border",
            "bg-primary px-4 py-2.5",
            "text-sm font-semibold text-primary-foreground",
            "transition-colors duration-(--motion-duration-fast) ease-state",
            "hover:bg-primary-hover active:bg-primary-pressed",
            "motion-reduce:transition-none",
          ].join(" ")}
        >
          <RotateCcw aria-hidden="true" className="size-5" strokeWidth={1.9} />
          Retry
        </Link>
      </AuthCard>
    );
  }

  const { user, workspace, preference, modules } = bootstrap;

  const moneyEnabled =
    modules.find((module) => module.moduleKey === "money")?.enabled === true;

  if (!moneyEnabled) {
    return (
      <AppShell
        pageTitle="Transactions"
        activePath="/money/transactions"
        userName={user.name}
        userEmail={user.email}
        workspaceTheme={preference.theme}
        workspacePreferenceVersion={preference.version}
        gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
      >
        <Panel
          title="Money is currently disabled"
          description="Existing financial data remains preserved."
        >
          <Link
            href="/onboarding"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
          >
            Enable Money from Getting Started
          </Link>
        </Panel>
      </AppShell>
    );
  }

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
      includeArchived: false,
    });
  } catch {
    console.error("Transaction setup data could not be loaded.");
  }

  /*
   * Preserve the successfully loaded objects themselves rather than reducing
   * their availability to a boolean. TypeScript can then safely narrow both
   * results for every subsequent render branch.
   */
  const transactionSetup =
    accounts !== null && categories !== null
      ? {
          accounts,
          categories,
        }
      : null;

  return (
    <AppShell
      pageTitle="Transactions"
      activePath="/money/transactions"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        <header>
          <Link
            href="/money/accounts"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to accounts
          </Link>

          <p className="mt-3 text-sm font-medium text-link">Money</p>

          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Record transaction
          </h1>

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Record actual income or spending against one of your financial
            accounts. Saving changes the account through the ledger rather than
            editing its balance directly.
          </p>
        </header>

        {transactionSetup === null ? (
          <Panel
            title="Transaction entry temporarily unavailable"
            description="The required account or category information could not be loaded safely."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              No financial data has been changed. Retry before entering another
              financial transaction.
            </p>

            <Link
              href="/money/transactions"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Retry transaction setup
            </Link>
          </Panel>
        ) : transactionSetup.accounts.items.length === 0 ? (
          <Panel
            title="Add an account first"
            description="Actual income and expenses must identify the financial account where money was received or spent."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Opening an account establishes the place where the
              transaction&apos;s cash effect belongs.
            </p>

            <Link
              href="/money/accounts"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              Add financial account
            </Link>
          </Panel>
        ) : (
          <TransactionCreateForm
            currency={workspace.currency}
            accounts={transactionSetup.accounts.items}
            categories={transactionSetup.categories.items}
          />
        )}
      </div>
    </AppShell>
  );
}
