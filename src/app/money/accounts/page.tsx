import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { AccountCreateForm } from "@/components/money/account-create-form";
import { FinancialAccountList } from "@/components/money/financial-account-list";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import {
  listFinancialAccounts,
  type ListFinancialAccountsResult,
} from "@/modules/finance/services/list-financial-accounts";

export default async function MoneyAccountsPage() {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());

  if (bootstrap.kind === "unauthorized") {
    redirect("/auth/sign-in");
  }

  if (bootstrap.kind === "unavailable") {
    return (
      <AuthCard
        eyebrow="Money"
        title="We couldn't prepare your workspace"
        description="Your private workspace couldn't be loaded safely. No financial information has been changed by this screen."
      >
        <Link
          href="/money/accounts"
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

  const moneyModule = modules.find((module) => module.moduleKey === "money");

  if (!moneyModule?.enabled) {
    return (
      <AppShell
        pageTitle="Money"
        activePath="/money/accounts"
        userName={user.name}
        userEmail={user.email}
        workspaceTheme={preference.theme}
        workspacePreferenceVersion={preference.version}
        gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
      >
        <div className="space-y-8">
          <header>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              <ArrowLeft
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Back to dashboard
            </Link>

            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
              Money
            </h1>
          </header>

          <Panel
            title="Money is currently disabled"
            description="Your financial records are not deleted when the module is disabled."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Enable Money from Getting Started before adding or working with
              financial accounts.
            </p>

            <Link
              href="/onboarding"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              Review Getting Started
            </Link>
          </Panel>
        </div>
      </AppShell>
    );
  }

  let accounts: ListFinancialAccountsResult | null = null;

  try {
    accounts = await listFinancialAccounts({
      userId: user.id,
      workspaceId: workspace.id,
      includeArchived: false,
    });
  } catch {
    console.error("Financial accounts could not be loaded.");
  }

  return (
    <AppShell
      pageTitle="Accounts"
      activePath="/money/accounts"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        <header>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to dashboard
          </Link>

          <p className="mt-3 text-sm font-medium text-link">Money</p>

          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Accounts
          </h1>

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Track the places where your actual money is held. Balances are
            calculated from the financial ledger rather than edited directly.
          </p>

          <p className="mt-3 text-sm text-muted-foreground">
            Workspace currency:{" "}
            <span className="font-medium text-foreground">
              {workspace.currency}
            </span>
          </p>
          <Link
            href="/money/debts"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
          >
            View debts and manual schedules
          </Link>
        </header>

        {accounts ? (
          <>
            <FinancialAccountList accounts={accounts} />

            <AccountCreateForm
              key={accounts.financialRevision}
              currency={workspace.currency}
            />
          </>
        ) : (
          <Panel
            title="Accounts temporarily unavailable"
            description="Your account list could not be read safely, so account creation is paused to avoid working from incomplete financial state."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              No financial data has been changed by this screen. Retry the
              account read before entering another financial account.
            </p>

            <Link
              href="/money/accounts"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Retry account list
            </Link>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
