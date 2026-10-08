import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { AccountHistoryList } from "@/components/money/account-history-list";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import {
  FinancialAccountNotFoundError,
  getAccountHistory,
  InvalidAccountHistoryCursorError,
  type AccountHistoryResult,
} from "@/modules/finance/services/get-account-history";

type MoneyAccountHistoryPageProps = {
  params: Promise<{
    accountId: string;
  }>;

  searchParams: Promise<{
    cursor?: string | string[] | undefined;
  }>;
};

export default async function MoneyAccountHistoryPage({
  params,
  searchParams,
}: MoneyAccountHistoryPageProps) {
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
          Return to accounts
        </Link>
      </AuthCard>
    );
  }

  const { user, workspace, preference, modules } = bootstrap;

  const moneyEnabled =
    modules.find((module) => module.moduleKey === "money")?.enabled === true;

  const { accountId } = await params;

  const resolvedSearchParams = await searchParams;

  const cursorValue = resolvedSearchParams.cursor;

  const cursor =
    typeof cursorValue === "string"
      ? cursorValue
      : Array.isArray(cursorValue)
        ? cursorValue[0]
        : undefined;

  let history: AccountHistoryResult | null = null;

  let invalidCursor = false;

  try {
    history = await getAccountHistory({
      userId: user.id,

      workspaceId: workspace.id,

      accountId,

      pageSize: 25,

      cursor,
    });
  } catch (error) {
    if (error instanceof InvalidAccountHistoryCursorError) {
      invalidCursor = true;
    } else if (!(error instanceof FinancialAccountNotFoundError)) {
      console.error("Account history could not be loaded.");
    }
  }

  return (
    <AppShell
      pageTitle="Account history"
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
            href={moneyEnabled ? "/money/accounts" : "/"}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            {moneyEnabled ? "Back to accounts" : "Back to Dashboard"}
          </Link>

          <p className="mt-3 text-sm font-medium text-link">Money</p>

          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Account history
          </h1>

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Review the finalized ledger activity that changed this account.
            Effective dates describe when financial activity occurred; recorded
            times show when it was saved.
          </p>
          {!moneyEnabled && (
            <p className="mt-3 text-sm text-muted-foreground">
              Money module hidden. This owned source history remains available
              from Dashboard.
            </p>
          )}
        </header>

        {history ? (
          <AccountHistoryList
            history={history}
            timezone={workspace.timezone}
            paginatedView={cursor !== undefined}
          />
        ) : invalidCursor ? (
          <Panel
            title="History page is unavailable"
            description="The history continuation link is invalid or no longer usable."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Your financial data has not been changed. Return to the latest
              account activity and continue from there.
            </p>

            <Link
              href={`/money/accounts/${accountId}/history`}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Return to latest activity
            </Link>
          </Panel>
        ) : (
          <Panel
            title="Account history unavailable"
            description="The requested account could not be read safely in this workspace."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              The account may no longer be available, or the history service may
              be temporarily unavailable. No financial data has been changed.
            </p>

            <Link
              href="/money/accounts"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              <ArrowLeft
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Return to accounts
            </Link>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
