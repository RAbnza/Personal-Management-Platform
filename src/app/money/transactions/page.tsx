import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { z } from "zod";
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
import { listCreditCards } from "@/modules/finance/services/read-credit-cards";
import { getRecurringOccurrence } from "@/modules/planning/services/read-recurring";
import { PlanningUnavailableError } from "@/modules/planning/domain/recurrence";
import { sharingEnabled } from "@/modules/sharing/domain/sharing";
import { listGroups } from "@/modules/sharing/services/read-groups";
import { getPrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";

export default async function MoneyTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ recurringOccurrenceId?: string; kind?: string }>;
}) {
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
  const { recurringOccurrenceId, kind } = await searchParams;
  let planningSuggestion;
  if (recurringOccurrenceId) {
    if (!z.uuid().safeParse(recurringOccurrenceId).success) notFound();
    try {
      const occurrence = await getRecurringOccurrence({
        userId: user.id,
        workspaceId: workspace.id,
        occurrenceId: recurringOccurrenceId,
      });
      if (
        !["planned", "linked"].includes(occurrence.occurrence.state) ||
        BigInt(occurrence.remainingMinor) <= 0n
      )
        notFound();
      planningSuggestion = {
        occurrenceId: recurringOccurrenceId,
        occurrenceVersion: occurrence.occurrence.version,
        kind: occurrence.root.kind,
        remainingMinor: occurrence.remainingMinor,
        name: occurrence.root.name,
        accountId: occurrence.rule.defaultAccountId,
        categoryId: occurrence.rule.categoryId,
      };
    } catch (error) {
      if (error instanceof PlanningUnavailableError) notFound();
      throw error;
    }
  }

  const moneyEnabled =
    modules.find((module) => module.moduleKey === "money")?.enabled === true;

  if (!moneyEnabled) {
    return (
      <AppShell
        pageTitle="Transactions"
        activePath="/money/transactions"
        modules={modules}
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
  let cards: Awaited<ReturnType<typeof listCreditCards>> | null = null;

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
    cards = await listCreditCards({
      userId: user.id,
      workspaceId: workspace.id,
      pageSize: 100,
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
    accounts !== null && categories !== null && cards !== null
      ? {
          accounts,
          categories,
          cards,
        }
      : null;

  const sharing =
    sharingEnabled() && !planningSuggestion
      ? {
          groups: await listGroups({
            userId: user.id,
            workspaceId: workspace.id,
          }),
          setup: await getPrivateSharingSetup({
            userId: user.id,
            workspaceId: workspace.id,
          }),
        }
      : undefined;
  return (
    <AppShell
      pageTitle="Transactions"
      activePath="/money/transactions"
      modules={modules}
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        <div>
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

          <ScreenHeader scope="Money" title="Record transaction" />

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Record actual income or a purchase paid from an account or credit
            card.
          </p>
        </div>

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
        ) : transactionSetup.accounts.items.length === 0 &&
          transactionSetup.cards.items.length === 0 ? (
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
            <Link
              href="/money/cards"
              className="ml-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline"
            >
              Add credit card
            </Link>
          </Panel>
        ) : (
          <TransactionCreateForm
            {...(sharing ? { sharing } : {})}
            key={
              planningSuggestion
                ? `${planningSuggestion.occurrenceId}:${planningSuggestion.occurrenceVersion}`
                : "ordinary-transaction"
            }
            initialKind={kind === "income" ? "income" : "expense"}
            currency={workspace.currency}
            accounts={transactionSetup.accounts.items}
            categories={transactionSetup.categories.items}
            cards={transactionSetup.cards.items}
            {...(planningSuggestion ? { planningSuggestion } : {})}
          />
        )}
      </div>
    </AppShell>
  );
}
