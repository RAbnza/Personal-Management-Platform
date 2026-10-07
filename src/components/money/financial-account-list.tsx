import Link from "next/link";
import {
  ArrowRightLeft,
  Banknote,
  Building2,
  History,
  Landmark,
  Plus,
  Smartphone,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { Panel } from "@/components/ui/panel";
import type {
  FinancialAccountListItem,
  ListFinancialAccountsResult,
} from "@/modules/finance/services/list-financial-accounts";
import { formatMoneyMinorUnits } from "@/shared/money-display";

const accountTypeContent: Record<
  FinancialAccountListItem["accountType"],
  {
    label: string;
    icon: LucideIcon;
  }
> = {
  cash: {
    label: "Cash",
    icon: Banknote,
  },

  e_wallet: {
    label: "E-wallet",
    icon: Smartphone,
  },

  checking: {
    label: "Checking / bank",
    icon: Landmark,
  },

  savings: {
    label: "Savings",
    icon: Building2,
  },
};

export interface FinancialAccountListProps {
  accounts: ListFinancialAccountsResult;
}

export function FinancialAccountList({ accounts }: FinancialAccountListProps) {
  if (accounts.items.length === 0) {
    return (
      <Panel
        title="Your accounts"
        description="Accounts represent places where your actual money is held."
      >
        <div className="flex gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
            <WalletCards
              aria-hidden="true"
              className="size-6"
              strokeWidth={1.8}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">
              No financial accounts yet
            </p>

            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Add the place where you currently hold money, such as cash, an
              e-wallet, a bank account, or savings account. Its opening balance
              establishes the starting point for future financial activity.
            </p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Your accounts"
      description="Balances are derived from finalized ledger activity rather than a manually edited balance field."
      action={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            {accounts.items.length}{" "}
            {accounts.items.length === 1 ? "account" : "accounts"}
          </span>

          {accounts.items.length >= 2 ? (
            <Link
              href="/money/transfers"
              className={[
                "inline-flex min-h-11 items-center justify-center gap-2",
                "rounded-button border border-input bg-secondary px-3 py-2",
                "text-sm font-semibold text-secondary-foreground",
                "transition-colors duration-(--motion-duration-fast) ease-state",
                "hover:bg-accent hover:text-accent-foreground",
                "motion-reduce:transition-none",
              ].join(" ")}
            >
              <ArrowRightLeft
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Transfer money
            </Link>
          ) : null}

          <Link
            href="/money/transactions"
            className={[
              "inline-flex min-h-11 items-center justify-center gap-2",
              "rounded-button border border-input bg-secondary px-3 py-2",
              "text-sm font-semibold text-secondary-foreground",
              "transition-colors duration-(--motion-duration-fast) ease-state",
              "hover:bg-accent hover:text-accent-foreground",
              "motion-reduce:transition-none",
            ].join(" ")}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.9} />
            Record transaction
          </Link>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {accounts.items.map((account) => {
          const type = accountTypeContent[account.accountType];

          const Icon = type.icon;

          return (
            <article
              key={account.accountId}
              className="rounded-control border border-border bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    strokeWidth={1.8}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {account.name}
                      </h3>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {type.label}
                        {account.institutionName
                          ? ` · ${account.institutionName}`
                          : ""}
                      </p>
                    </div>

                    {account.archived ? (
                      <span className="text-xs font-medium text-muted-foreground">
                        Archived
                      </span>
                    ) : null}
                  </div>

                  <p className="numeric-value mt-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
                    {formatMoneyMinorUnits(
                      account.currency,
                      account.currentBalanceMinor,
                    )}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Opening balance date:{" "}
                    <span className="font-medium text-foreground">
                      {account.openingCutoffDate}
                    </span>
                  </p>

                  {account.notes ? (
                    <p className="mt-3 border-t border-border pt-3 text-sm leading-5 text-muted-foreground">
                      {account.notes}
                    </p>
                  ) : null}

                  <div className="mt-4 border-t border-border pt-3">
                    <Link
                      href={`/money/accounts/${account.accountId}/history`}
                      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
                    >
                      <History
                        aria-hidden="true"
                        className="size-4"
                        strokeWidth={1.9}
                      />
                      View history
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
