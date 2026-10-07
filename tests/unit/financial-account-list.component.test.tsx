import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FinancialAccountList } from "@/components/money/financial-account-list";
import type { ListFinancialAccountsResult } from "@/modules/finance/services/list-financial-accounts";

describe("FinancialAccountList", () => {
  it("shows exact derived account balances and history navigation", () => {
    const accounts: ListFinancialAccountsResult = {
      financialRevision: "7",

      items: [
        {
          accountId: "11111111-1111-4111-8111-111111111111",

          name: "GCash",

          accountType: "e_wallet",

          institutionName: "GCash",

          currency: "PHP",

          openingCutoffDate: "2026-10-07" as never,

          notes: "Daily spending wallet",

          archived: false,

          currentBalanceMinor: "125000",

          version: 1,
        },
      ],
    };

    render(<FinancialAccountList accounts={accounts} />);

    expect(screen.getByText("GCash")).toBeInTheDocument();

    expect(screen.getByText("PHP 1,250.00")).toBeInTheDocument();

    expect(screen.getByText("E-wallet · GCash")).toBeInTheDocument();

    expect(screen.getByText("Daily spending wallet")).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "View history",
      }),
    ).toHaveAttribute(
      "href",
      "/money/accounts/11111111-1111-4111-8111-111111111111/history",
    );
  });

  it("shows a useful empty state", () => {
    render(
      <FinancialAccountList
        accounts={{
          financialRevision: "0",
          items: [],
        }}
      />,
    );

    expect(screen.getByText("No financial accounts yet")).toBeInTheDocument();

    expect(
      screen.getByText(/opening balance establishes the starting point/i),
    ).toBeInTheDocument();
  });
});
