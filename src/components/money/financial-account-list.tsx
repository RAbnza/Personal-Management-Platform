import { HorizontalCollection } from "@/components/patterns/horizontal-collection";
import styles from "./money-workspace.module.css";
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
      descriptionAsHelp
      description="Balances come from recorded transactions. Use Check balance to compare against a statement; adjustments retain their history."
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
      <HorizontalCollection label="financial accounts">
        {accounts.items.map((account) => {
          const type = accountTypeContent[account.accountType];

          const Icon = type.icon;

          return (
            <article
              key={account.accountId}
              className={styles.accountCard}
              data-account-type={account.accountType}
            >
              <div className={styles.accountIdentity}>
                <span className={styles.accountIcon}>
                  <Icon aria-hidden="true" size={21} />
                </span>
                <div className="min-w-0">
                  <h3 title={account.name}>{account.name}</h3>
                  <p className={styles.accountType}>
                    {type.label}
                    {account.institutionName
                      ? ` \u00b7 ${account.institutionName}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className={styles.accountBody}>
                <p className={styles.accountBalance}>
                  {formatMoneyMinorUnits(
                    account.currency,
                    account.currentBalanceMinor,
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Tracked after {account.openingCutoffDate}
                </p>
                {account.archived && (
                  <p className="text-xs font-semibold text-muted-foreground">
                    Archived account
                  </p>
                )}
                {account.notes && (
                  <details className={styles.accountNotes}>
                    <summary>Account notes</summary>
                    <p>{account.notes}</p>
                  </details>
                )}
              </div>
              <footer className={styles.cardActions}>
                <Link
                  href={`/money/accounts/${account.accountId}/history`}
                  className="action-link"
                >
                  <History aria-hidden="true" size={16} />
                  View history
                </Link>
                <Link
                  href={`/money/accounts/${account.accountId}/reconcile`}
                  className="action-link"
                >
                  Check balance
                </Link>
              </footer>
            </article>
          );
        })}
      </HorizontalCollection>
    </Panel>
  );
}
