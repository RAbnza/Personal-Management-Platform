import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountHistoryList } from "@/components/money/account-history-list";
import type { AccountHistoryResult } from "@/modules/finance/services/get-account-history";
import { parseCalendarDate } from "@/shared/calendar-date";

const history: AccountHistoryResult = {
  account: {
    accountId: "11111111-1111-4111-8111-111111111111",

    name: "BDO Savings",

    accountType: "savings",

    institutionName: "BDO",

    currency: "PHP",

    openingCutoffDate: parseCalendarDate("2026-07-01"),

    archived: false,

    currentBalanceMinor: "1170000",
  },

  financialRevision: "3",

  entries: [
    {
      journalId: "22222222-2222-4222-8222-222222222222",

      actionId: "33333333-3333-4333-8333-333333333333",

      actionRevisionId: "44444444-4444-4444-8444-444444444444",

      effectiveDate: parseCalendarDate("2026-07-03"),

      recordedAt: "2026-07-03T04:30:00.000Z",

      journalRole: "economic",

      changeKind: "create",

      actionKind: "expense",

      description: "Groceries",

      reference: "RECEIPT-123",

      signedAmountMinor: "-30000",

      balanceAfterMinor: "1170000",
    },

    {
      journalId: "55555555-5555-4555-8555-555555555555",

      actionId: "66666666-6666-4666-8666-666666666666",

      actionRevisionId: "77777777-7777-4777-8777-777777777777",

      effectiveDate: parseCalendarDate("2026-07-02"),

      recordedAt: "2026-07-02T02:00:00.000Z",

      journalRole: "economic",

      changeKind: "create",

      actionKind: "income",

      description: "Salary received",

      reference: null,

      signedAmountMinor: "1000000",

      balanceAfterMinor: "1200000",
    },

    {
      journalId: "88888888-8888-4888-8888-888888888888",

      actionId: "99999999-9999-4999-8999-999999999999",

      actionRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

      effectiveDate: parseCalendarDate("2026-07-01"),

      recordedAt: "2026-07-01T01:00:00.000Z",

      journalRole: "economic",

      changeKind: "create",

      actionKind: "opening_cash",

      description: "Opening balance",

      reference: null,

      signedAmountMinor: "200000",

      balanceAfterMinor: "200000",
    },
  ],

  nextCursor: "cursor-token",
};

describe("AccountHistoryList", () => {
  it("labels a debt payment as repayment activity rather than spending", () => {
    render(
      <AccountHistoryList
        history={{
          ...history,
          entries: [
            {
              ...history.entries[0]!,
              actionKind: "debt_payment",
              description: "Loan repayment",
              signedAmountMinor: "-111000",
            },
          ],
        }}
        timezone="Asia/Manila"
      />,
    );
    expect(screen.getByText("Debt payment")).toBeInTheDocument();
    expect(screen.queryByText("Spending")).not.toBeInTheDocument();
    expect(screen.getByText("PHP 1,110.00")).toBeInTheDocument();
  });
  it("shows ledger-derived account activity and running balances", () => {
    render(<AccountHistoryList history={history} timezone="Asia/Manila" />);

    /*
     * The latest entry's balance-after value matches the account's current
     * balance, so this exact amount is expected in both locations.
     */
    expect(screen.getAllByText("PHP 11,700.00")).toHaveLength(2);

    expect(screen.getByText("Groceries")).toBeInTheDocument();

    expect(screen.getByText("Spending")).toBeInTheDocument();

    expect(screen.getByText("Out")).toBeInTheDocument();

    expect(screen.getByText("PHP 300.00")).toBeInTheDocument();

    expect(screen.getByText("Salary received")).toBeInTheDocument();

    expect(screen.getByText("Money in")).toBeInTheDocument();

    expect(screen.getByText("PHP 10,000.00")).toBeInTheDocument();

    expect(screen.getByText("PHP 12,000.00")).toBeInTheDocument();

    expect(
      screen.getByText("Opening balance", {
        selector: "span",
      }),
    ).toBeInTheDocument();

    /*
     * For the initial opening-balance action, the amount entering the account
     * and the resulting balance are both PHP 2,000.00.
     */
    expect(screen.getAllByText("PHP 2,000.00")).toHaveLength(2);

    expect(screen.getByText("Reference:")).toBeInTheDocument();

    expect(screen.getByText("RECEIPT-123")).toBeInTheDocument();
  });

  it("links to older cursor-based history without inventing a total count", () => {
    render(<AccountHistoryList history={history} timezone="Asia/Manila" />);

    expect(
      screen.getByRole("link", {
        name: "Older activity",
      }),
    ).toHaveAttribute(
      "href",
      "/money/accounts/11111111-1111-4111-8111-111111111111/history?cursor=cursor-token",
    );

    expect(screen.queryByText(/total records/i)).not.toBeInTheDocument();
  });

  it("offers a route back to the latest page when viewing an older page", () => {
    render(
      <AccountHistoryList
        history={{
          ...history,
          nextCursor: null,
        }}
        timezone="Asia/Manila"
        paginatedView
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "Back to latest activity",
      }),
    ).toHaveAttribute(
      "href",
      "/money/accounts/11111111-1111-4111-8111-111111111111/history",
    );

    expect(screen.getByText("End of recorded activity")).toBeInTheDocument();
  });
});
