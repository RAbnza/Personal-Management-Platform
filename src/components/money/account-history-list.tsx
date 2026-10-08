import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  CircleDollarSign,
  Landmark,
  ReceiptText,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { Panel } from "@/components/ui/panel";
import type {
  AccountHistoryEntry,
  AccountHistoryResult,
} from "@/modules/finance/services/get-account-history";
import { parseMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";

type ActionKindContent = {
  label: string;
  icon: LucideIcon;
};

const actionKindContent: Record<string, ActionKindContent> = {
  opening_cash: {
    label: "Opening balance",
    icon: WalletCards,
  },

  income: {
    label: "Money in",
    icon: ArrowDownLeft,
  },

  expense: {
    label: "Spending",
    icon: ArrowUpRight,
  },

  debt_payment: { label: "Debt payment", icon: ArrowUpRight },
  balance_adjustment: { label: "Balance adjustment", icon: Landmark },

  transfer: {
    label: "Transfer",
    icon: ArrowRightLeft,
  },

  standalone_fee: {
    label: "Fee",
    icon: ReceiptText,
  },
};

function resolveActionKindContent(
  entry: AccountHistoryEntry,
): ActionKindContent {
  return (
    actionKindContent[entry.actionKind] ?? {
      label: "Financial activity",
      icon: CircleDollarSign,
    }
  );
}

function formatRecordedAt(recordedAt: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(recordedAt));
}

function formatSignedEffect(
  currency: string,
  signedAmountMinor: string,
): {
  directionLabel: string;
  amountLabel: string;
} {
  const amount = parseMinorUnits(signedAmountMinor);

  if (amount > 0n) {
    return {
      directionLabel: "In",
      amountLabel: formatMoneyMinorUnits(currency, amount.toString()),
    };
  }

  if (amount < 0n) {
    return {
      directionLabel: "Out",
      amountLabel: formatMoneyMinorUnits(currency, (-amount).toString()),
    };
  }

  return {
    directionLabel: "No balance change",
    amountLabel: formatMoneyMinorUnits(currency, "0"),
  };
}

export interface AccountHistoryListProps {
  history: AccountHistoryResult;

  timezone: string;

  paginatedView?: boolean;
}

export function AccountHistoryList({
  history,
  timezone,
  paginatedView = false,
}: AccountHistoryListProps) {
  const { account, entries, nextCursor } = history;

  return (
    <div className="space-y-6">
      <Panel
        title={account.name}
        description="Current balance and account identity are derived from the same ledger-backed history projection."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-control border border-border bg-surface-subtle px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Current balance
            </p>

            <p className="numeric-value mt-1 text-xl font-semibold tracking-[-0.02em] text-foreground">
              {formatMoneyMinorUnits(
                account.currency,
                account.currentBalanceMinor,
              )}
            </p>
          </div>

          <div className="rounded-control border border-border bg-surface-subtle px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Account type
            </p>

            <p className="mt-1 text-sm font-semibold text-foreground">
              {account.accountType === "e_wallet"
                ? "E-wallet"
                : account.accountType === "checking"
                  ? "Checking / bank"
                  : account.accountType === "savings"
                    ? "Savings"
                    : account.accountType === "cash"
                      ? "Cash"
                      : "Financial account"}
            </p>
          </div>

          <div className="rounded-control border border-border bg-surface-subtle px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Opening balance date
            </p>

            <p className="mt-1 text-sm font-semibold text-foreground">
              <time dateTime={account.openingCutoffDate}>
                {account.openingCutoffDate}
              </time>
            </p>
          </div>

          <div className="rounded-control border border-border bg-surface-subtle px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Status</p>

            <p className="mt-1 text-sm font-semibold text-foreground">
              {account.archived ? "Archived" : "Active"}
            </p>
          </div>
        </div>

        {account.institutionName ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Landmark aria-hidden="true" className="size-4" strokeWidth={1.9} />

            <span>
              Institution:{" "}
              <span className="font-medium text-foreground">
                {account.institutionName}
              </span>
            </span>
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Account activity"
        description="History is ordered by financial effective date. Recorded time shows when the current financial action revision was saved."
      >
        {entries.length === 0 ? (
          <div className="flex gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
              <ReceiptText
                aria-hidden="true"
                className="size-5"
                strokeWidth={1.9}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">
                No recorded activity on this page
              </p>

              <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
                Financial activity will appear here when finalized ledger
                entries affect this account.
              </p>
            </div>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {entries.map((entry) => {
              const content = resolveActionKindContent(entry);

              const Icon = content.icon;

              const effect = formatSignedEffect(
                account.currency,
                entry.signedAmountMinor,
              );

              return (
                <li key={entry.journalId} className="py-4 first:pt-0 last:pb-0">
                  <article className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                        <Icon
                          aria-hidden="true"
                          className="size-5"
                          strokeWidth={1.9}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-semibold text-foreground">
                            {entry.description}
                          </p>

                          <span className="text-xs font-medium text-muted-foreground">
                            {content.label}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          Effective{" "}
                          <time
                            dateTime={entry.effectiveDate}
                            className="font-medium text-foreground"
                          >
                            {entry.effectiveDate}
                          </time>
                        </p>

                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Recorded{" "}
                          {formatRecordedAt(entry.recordedAt, timezone)} ·{" "}
                          {timezone}
                        </p>

                        {entry.reference ? (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            Reference:{" "}
                            <span className="font-medium text-foreground">
                              {entry.reference}
                            </span>
                          </p>
                        ) : null}

                        {entry.changeKind !== "create" ? (
                          <p className="mt-2 text-xs font-medium text-muted-foreground">
                            Revision type: {entry.changeKind}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="md:text-right">
                      <p className="text-xs font-medium text-muted-foreground">
                        {effect.directionLabel}
                      </p>

                      <p className="numeric-value mt-1 text-base font-semibold text-foreground">
                        {effect.amountLabel}
                      </p>

                      <p className="mt-2 text-xs text-muted-foreground">
                        Balance after
                      </p>

                      <p className="numeric-value mt-1 text-sm font-medium text-foreground">
                        {formatMoneyMinorUnits(
                          account.currency,
                          entry.balanceAfterMinor,
                        )}
                      </p>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <nav
        aria-label="Account history pagination"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        {paginatedView ? (
          <Link
            href={`/money/accounts/${account.accountId}/history`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to latest activity
          </Link>
        ) : (
          <span />
        )}

        {nextCursor ? (
          <Link
            href={{
              pathname: `/money/accounts/${account.accountId}/history`,
              query: {
                cursor: nextCursor,
              },
            }}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
          >
            Older activity
            <ArrowRight
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">
            End of recorded activity
          </span>
        )}
      </nav>
    </div>
  );
}
