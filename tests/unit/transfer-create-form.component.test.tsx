import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TransferCreateForm } from "@/components/money/transfer-create-form";
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

    name: "GCash",

    accountType: "e_wallet",

    institutionName: "GCash",

    currency: "PHP",

    openingCutoffDate: parseCalendarDate("2026-10-01"),

    notes: null,

    archived: false,

    currentBalanceMinor: "1000000",

    version: 1,
  },

  {
    accountId: "22222222-2222-4222-8222-222222222222",

    name: "MariBank",

    accountType: "savings",

    institutionName: "MariBank",

    currency: "PHP",

    openingCutoffDate: parseCalendarDate("2026-10-01"),

    notes: null,

    archived: false,

    currentBalanceMinor: "200000",

    version: 1,
  },

  {
    accountId: "33333333-3333-4333-8333-333333333333",

    name: "Fee Wallet",

    accountType: "cash",

    institutionName: null,

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
    categoryId: "44444444-4444-4444-8444-444444444444",

    kind: "expense",

    code: "transaction_fees",

    name: "Transaction Fees",

    archivedAt: null,

    archived: false,

    sortOrder: 0,

    version: 1,
  },

  {
    categoryId: "55555555-5555-4555-8555-555555555555",

    kind: "expense",

    code: "other",

    name: "Other",

    archivedAt: null,

    archived: false,

    sortOrder: 1,

    version: 1,
  },
];

function createSuccessResponse() {
  return new Response(
    JSON.stringify({
      actionKind: "transfer",

      actionId: "66666666-6666-4666-8666-666666666666",

      actionRevisionId: "77777777-7777-4777-8777-777777777777",

      financialRevision: "4",
    }),
    {
      status: 201,

      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

beforeEach(() => {
  routerMocks.push.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TransferCreateForm", () => {
  it("records an exact fee-free completed transfer", async () => {
    fetchMock.mockResolvedValueOnce(createSuccessResponse());

    render(
      <TransferCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Transfer date"), "2026-10-07");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount destination receives (PHP)",
      }),
      "5000.00",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Move money to savings",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save completed transfer",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({
      clientCommandId: expect.any(String),
      acknowledgeNegativeBalance: false,

      actionKind: "transfer",

      sourceAccountId: accounts[0]!.accountId,

      destinationAccountId: accounts[1]!.accountId,

      effectiveDate: "2026-10-07",

      destinationPrincipalMinor: "500000",

      fees: [],

      description: "Move money to savings",

      reference: null,

      notes: null,
    });

    expect(routerMocks.push).toHaveBeenCalledWith("/money/accounts");
  });

  it("records a source-paid transfer fee separately from principal", async () => {
    fetchMock.mockResolvedValueOnce(createSuccessResponse());

    render(
      <TransferCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Transfer date"), "2026-10-07");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount destination receives (PHP)",
      }),
      "5000.00",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add fee",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Fee amount 1 (PHP)",
      }),
      "15.00",
    );

    const preview = screen.getByRole("region", {
      name: "Completed transfer preview",
    });

    expect(
      within(preview).getByText(/Decreases by PHP 5,015\.00/i),
    ).toBeInTheDocument();

    expect(
      within(preview).getByText(/Increases by PHP 5,000\.00/i),
    ).toBeInTheDocument();

    expect(
      within(preview).getAllByText("PHP 15.00").length,
    ).toBeGreaterThanOrEqual(1);

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "GCash to MariBank",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save completed transfer",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    expect(body).toEqual({
      clientCommandId: expect.any(String),
      acknowledgeNegativeBalance: false,

      actionKind: "transfer",

      sourceAccountId: accounts[0]!.accountId,

      destinationAccountId: accounts[1]!.accountId,

      effectiveDate: "2026-10-07",

      destinationPrincipalMinor: "500000",

      fees: [
        {
          label: "Transfer fee",

          amountMinor: "1500",

          effectiveDate: "2026-10-07",

          bearingAccountId: accounts[0]!.accountId,

          treatment: "source_additional",

          categoryId: categories[0]!.categoryId,
        },
      ],

      description: "GCash to MariBank",

      reference: null,

      notes: null,
    });
  });

  it("records a separately paid fee from another account and date", async () => {
    fetchMock.mockResolvedValueOnce(createSuccessResponse());

    render(
      <TransferCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Transfer date"), "2026-10-07");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount destination receives (PHP)",
      }),
      "1000.00",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add fee",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Fee amount 1 (PHP)",
      }),
      "7.00",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Fee treatment 1",
      }),
      "separate",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Fee-paying account 1",
      }),
      accounts[2]!.accountId,
    );

    await user.type(screen.getByLabelText("Fee date 1"), "2026-10-08");

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Transfer with separate fee",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save completed transfer",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    expect(body.fees).toEqual([
      {
        label: "Transfer fee",

        amountMinor: "700",

        effectiveDate: "2026-10-08",

        bearingAccountId: accounts[2]!.accountId,

        treatment: "separate",

        categoryId: categories[0]!.categoryId,
      },
    ]);
  });

  it("rejects using the same account as source and destination", async () => {
    render(
      <TransferCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Destination account",
      }),
      accounts[0]!.accountId,
    );

    await user.type(screen.getByLabelText("Transfer date"), "2026-10-07");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount destination receives (PHP)",
      }),
      "100.00",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Invalid transfer",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save completed transfer",
      }),
    );

    expect(
      await screen.findByText(
        /source and destination accounts must be different/i,
      ),
    ).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries an unconfirmed transfer with the identical command", async () => {
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
      .mockResolvedValueOnce(createSuccessResponse());

    render(
      <TransferCreateForm
        currency="PHP"
        accounts={accounts}
        categories={categories}
      />,
    );

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Transfer date"), "2026-10-07");

    await user.type(
      screen.getByRole("textbox", {
        name: "Amount destination receives (PHP)",
      }),
      "250.00",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Description",
      }),
      "Retry transfer",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save completed transfer",
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
});
