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

  {
    categoryId: "77777777-7777-4777-8777-777777777777",

    kind: "expense",

    code: "household",

    name: "Household",

    archivedAt: null,

    archived: false,

    sortOrder: 1,

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

async function reviewAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  const calls = fetchMock.mock.calls.length;
  await user.click(screen.getByRole("button", { name: "Continue to review" }));
  const confirm = screen.queryByRole("button", {
    name: "Confirm and save transaction",
  });
  expect(fetchMock.mock.calls.length).toBe(calls);
  if (confirm) await user.click(confirm);
}
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

    await reviewAndConfirm(user);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/api/v1/financial-actions");

    expect(JSON.parse(request.body as string)).toEqual({
      clientCommandId: expect.any(String),
      acknowledgeNegativeBalance: false,

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

  it("records a one-category expense without requiring the amount twice", async () => {
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

    expect(
      screen.getByRole("textbox", {
        name: "Category amount (PHP)",
      }),
    ).toHaveValue("125.75");

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

    await reviewAndConfirm(user);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({
      clientCommandId: expect.any(String),
      acknowledgeNegativeBalance: false,

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

  it("records multiple exact category portions without creating another purchase amount", async () => {
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
      "1000.00",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add category split",
      }),
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Category 1",
      }),
      categories[1]!.categoryId,
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Category 2",
      }),
      categories[2]!.categoryId,
    );

    const firstPortion = screen.getByRole("textbox", {
      name: "Portion 1 amount (PHP)",
    });

    const secondPortion = screen.getByRole("textbox", {
      name: "Portion 2 amount (PHP)",
    });

    await user.clear(firstPortion);

    await user.type(firstPortion, "700.00");

    await user.type(secondPortion, "300.00");

    expect(screen.getByRole("status")).toHaveTextContent(
      /category portions match the purchase amount exactly/i,
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Merchant",
      }),
      "Integration Store",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Split household purchase",
    );

    await reviewAndConfirm(user);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({
      clientCommandId: expect.any(String),
      acknowledgeNegativeBalance: false,

      actionKind: "expense",

      fundingAccountId: accounts[0]!.accountId,

      effectiveDate: "2026-10-07",

      purchaseMinor: "100000",

      splits: [
        {
          amountMinor: "70000",

          categoryId: categories[1]!.categoryId,

          memo: null,
        },

        {
          amountMinor: "30000",

          categoryId: categories[2]!.categoryId,

          memo: null,
        },
      ],

      merchantName: "Integration Store",

      description: "Split household purchase",

      reference: null,

      notes: null,
    });
  });

  it("rejects category portions that do not equal the expense amount", async () => {
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
      "1000.00",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add category split",
      }),
    );

    const firstPortion = screen.getByRole("textbox", {
      name: "Portion 1 amount (PHP)",
    });

    const secondPortion = screen.getByRole("textbox", {
      name: "Portion 2 amount (PHP)",
    });

    await user.clear(firstPortion);

    await user.type(firstPortion, "700.00");

    await user.type(secondPortion, "200.00");

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Invalid split total",
    );

    await reviewAndConfirm(user);

    expect(
      await screen.findByText(
        "Expense category portions must sum exactly to the transaction amount.",
      ),
    ).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
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

    await reviewAndConfirm(user);

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

    await reviewAndConfirm(user);

    expect(
      await screen.findByText(
        /must be after this account's opening balance date/i,
      ),
    ).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires explicit negative-balance acknowledgement and clears it after editing", async () => {
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

    expect(
      screen
        .getAllByRole("status")
        .some((element) =>
          element.textContent?.includes(
            "greater than the currently loaded balance",
          ),
        ),
    ).toBe(true);
    await user.type(screen.getByLabelText("Transaction date"), "2026-10-07");
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Original draft",
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );
    const acknowledgement = screen.getByRole("checkbox", {
      name: /explicitly acknowledge/i,
    });
    const save = screen.getByRole("button", {
      name: "Confirm and save transaction",
    });
    expect(save).toBeDisabled();
    await user.click(acknowledgement);
    expect(acknowledgement).toBeChecked();
    expect(save).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " changed intent",
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );
    expect(
      screen.getByRole("checkbox", { name: /explicitly acknowledge/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Confirm and save transaction" }),
    ).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("distinct expense task views", () => {
  it("retains the complete in-memory draft through review and Edit without dispatching a command", async () => {
    const user = userEvent.setup();
    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );
    await user.type(screen.getByLabelText("Transaction date"), "2026-10-07");
    await user.type(
      screen.getByRole("textbox", { name: "Amount (PHP)" }),
      "125.75",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Groceries",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Reference" }),
      "Receipt 42",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Notes" }),
      "Optional draft notes",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Category" }),
      categories[1]!.categoryId,
    );
    await user.click(
      screen.getByRole("button", { name: "Continue to review" }),
    );
    expect(
      screen.getByRole("heading", { name: "Review expense" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Notes" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Receipt 42")).toBeVisible();
    expect(screen.getByText("Optional draft notes")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Optional draft notes",
    );
    expect(screen.getByRole("textbox", { name: "Reference" })).toHaveValue(
      "Receipt 42",
    );
    expect(screen.getByRole("textbox", { name: "Amount (PHP)" })).toHaveValue(
      "125.75",
    );
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(
      categories[1]!.categoryId,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("retains the acknowledged reviewed command and checkbox after response loss", async () => {
  fetchMock.mockRejectedValue(new Error("Response lost"));
  const user = userEvent.setup();
  render(
    <TransactionCreateForm
      currency="PHP"
      accounts={accounts}
      categories={categories}
    />,
  );
  await user.type(screen.getByLabelText("Transaction date"), "2026-10-07");
  await user.type(
    screen.getByRole("textbox", { name: "Amount (PHP)" }),
    "1500.00",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Description" }),
    "Genuine negative cash expense",
  );
  await user.click(screen.getByRole("button", { name: "Continue to review" }));
  await user.click(
    screen.getByRole("checkbox", { name: /explicitly acknowledge/i }),
  );
  await user.click(
    screen.getByRole("button", { name: "Confirm and save transaction" }),
  );
  expect(await screen.findByText("Save outcome unconfirmed")).toBeVisible();
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
    acknowledgeNegativeBalance: true,
    purchaseMinor: "150000",
  });
  expect(
    screen.getByRole("checkbox", { name: /explicitly acknowledge/i }),
  ).toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: /explicitly acknowledge/i }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Edit details" }),
  ).not.toBeInTheDocument();
});
