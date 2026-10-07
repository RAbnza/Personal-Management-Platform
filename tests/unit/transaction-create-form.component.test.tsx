import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TransactionCreateForm } from "@/components/money/transaction-create-form";
import type { CategoryListItem } from "@/modules/core/services/list-categories";
import type { FinancialAccountListItem } from "@/modules/finance/services/list-financial-accounts";
import { parseCalendarDate } from "@/shared/calendar-date";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerMocks.push,
  }),
}));

const fetchMock = vi.fn();

const accounts: FinancialAccountListItem[] = [
  {
    accountId: "11111111-1111-4111-8111-111111111111",

    name: "Cash Wallet",

    accountType: "cash",

    institutionName: null,

    currency: "PHP",

    openingCutoffDate: parseCalendarDate("2026-10-01"),

    notes: null,

    archived: false,

    currentBalanceMinor: "100000",

    version: 1,
  },

  {
    accountId: "22222222-2222-4222-8222-222222222222",

    name: "GCash",

    accountType: "e_wallet",

    institutionName: "GCash",

    currency: "PHP",

    openingCutoffDate: parseCalendarDate("2026-10-01"),

    notes: null,

    archived: false,

    currentBalanceMinor: "50000",

    version: 1,
  },
];

const categories: CategoryListItem[] = [
  {
    categoryId: "33333333-3333-4333-8333-333333333333",

    kind: "income",

    code: "salary",

    name: "Salary",

    archivedAt: null,

    archived: false,

    sortOrder: 0,

    version: 1,
  },

  {
    categoryId: "44444444-4444-4444-8444-444444444444",

    kind: "expense",

    code: "food",

    name: "Food",

    archivedAt: null,

    archived: false,

    sortOrder: 0,

    version: 1,
  },
];

beforeEach(() => {
  routerMocks.push.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TransactionCreateForm", () => {
  it("records exact income into the selected receiving account", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          actionKind: "income",

          actionId: "55555555-5555-4555-8555-555555555555",

          actionRevisionId: "66666666-6666-4666-8666-666666666666",

          financialRevision: "2",
        }),
        {
          status: 201,

          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.click(
      screen.getByRole("radio", {
        name: /Income/i,
      }),
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Receiving account",
      }),
      accounts[1]!.accountId,
    );

    await user.type(screen.getByLabelText("Transaction date"), "2026-10-07");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount (PHP)",
      }),
      "500.50",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Category",
      }),
      categories[0]!.categoryId,
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Sender / source",
      }),
      "Employer",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "October salary",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save transaction",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/api/v1/financial-actions");

    expect(JSON.parse(request.body as string)).toEqual({
      clientCommandId: expect.any(String),

      actionKind: "income",

      receivingAccountId: accounts[1]!.accountId,

      effectiveDate: "2026-10-07",

      amountMinor: "50050",

      incomeClass: "earned",

      categoryId: categories[0]!.categoryId,

      senderName: "Employer",

      sourceLabel: null,

      description: "October salary",

      reference: null,

      notes: null,
    });

    expect(routerMocks.push).toHaveBeenCalledWith("/money/accounts");
  });

  it("records an expense as one exact category split", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          actionKind: "expense",

          actionId: "55555555-5555-4555-8555-555555555555",

          actionRevisionId: "66666666-6666-4666-8666-666666666666",

          financialRevision: "2",
        }),
        {
          status: 201,

          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Transaction date"), "2026-10-07");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount (PHP)",
      }),
      "125.75",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Category",
      }),
      categories[1]!.categoryId,
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Merchant",
      }),
      "Grocery Store",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Groceries",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save transaction",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({
      clientCommandId: expect.any(String),

      actionKind: "expense",

      fundingAccountId: accounts[0]!.accountId,

      effectiveDate: "2026-10-07",

      purchaseMinor: "12575",

      splits: [
        {
          amountMinor: "12575",

          categoryId: categories[1]!.categoryId,

          memo: null,
        },
      ],

      merchantName: "Grocery Store",

      description: "Groceries",

      reference: null,

      notes: null,
    });
  });

  it("retries an unconfirmed save with the identical financial command", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "TEMPORARY_UNAVAILABLE",
            retryable: true,
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            actionKind: "expense",

            actionId: "55555555-5555-4555-8555-555555555555",

            actionRevisionId: "66666666-6666-4666-8666-666666666666",

            financialRevision: "2",
          }),
          {
            status: 201,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Transaction date"), "2026-10-07");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount (PHP)",
      }),
      "50.00",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Transport",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save transaction",
      }),
    );

    expect(
      await screen.findByText("Save outcome unconfirmed"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Retry same save",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
    );

    expect(secondBody).toEqual(firstBody);

    expect(secondBody.clientCommandId).toBe(firstBody.clientCommandId);
  });

  it("rejects activity on or before the selected account opening cutoff", async () => {
    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Transaction date"), "2026-10-01");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount (PHP)",
      }),
      "10.00",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Invalid cutoff transaction",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save transaction",
      }),
    );

    expect(
      await screen.findByText(
        /must be after this account's opening balance date/i,
      ),
    ).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns but does not prohibit an expense greater than the loaded account balance", async () => {
    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount (PHP)",
      }),
      "1500.00",
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /greater than the currently loaded balance/i,
    );
  });
});
