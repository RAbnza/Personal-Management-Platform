import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BorrowingCreateForm } from "@/components/money/borrowing-create-form";
import type { CategoryListItem } from "@/modules/core/services/list-categories";
import type { FinancialAccountListItem } from "@/modules/finance/services/list-financial-accounts";
import { parseCalendarDate } from "@/shared/calendar-date";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerMocks.push,
    refresh: routerMocks.refresh,
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

    currentBalanceMinor: "500000",

    version: 1,
  },

  {
    accountId: "22222222-2222-4222-8222-222222222222",

    name: "Savings",

    accountType: "savings",

    institutionName: "Example Bank",

    currency: "PHP",

    openingCutoffDate: parseCalendarDate("2026-10-01"),

    notes: null,

    archived: false,

    currentBalanceMinor: "250000",

    version: 1,
  },
];

const categories: CategoryListItem[] = [
  {
    categoryId: "33333333-3333-4333-8333-333333333333",

    kind: "expense",

    code: "transaction_fees",

    name: "Transaction Fees",

    archivedAt: null,

    archived: false,

    sortOrder: 0,

    version: 1,
  },

  {
    categoryId: "44444444-4444-4444-8444-444444444444",

    kind: "expense",

    code: "other",

    name: "Other",

    archivedAt: null,

    archived: false,

    sortOrder: 1,

    version: 1,
  },
];

const successResult = {
  actionKind: "borrowing",

  debtId: "55555555-5555-4555-8555-555555555555",

  actionId: "66666666-6666-4666-8666-666666666666",

  actionRevisionId: "77777777-7777-4777-8777-777777777777",

  scheduleVersionId: "88888888-8888-4888-8888-888888888888",

  financialRevision: "8",
};

function createSuccessResponse(): Response {
  return new Response(JSON.stringify(successResult), {
    status: 201,

    headers: {
      "Content-Type": "application/json",
    },
  });
}

function renderForm() {
  render(
    <BorrowingCreateForm
      currency="PHP"
      accounts={accounts}
      categories={categories}
    />,
  );
}

async function fillBaseBorrowing(input?: {
  principal?: string;
  actualReceived?: string;
}) {
  const user = userEvent.setup();

  await user.type(
    screen.getByRole("textbox", {
      name: "Debt name",
    }),
    "Personal loan",
  );

  await user.type(
    screen.getByRole("textbox", {
      name: "Lender / provider",
    }),
    "Example Lender",
  );

  fireEvent.change(screen.getByLabelText("Borrowing date"), {
    target: {
      value: "2026-10-08",
    },
  });

  await user.type(
    screen.getByRole("textbox", {
      name: "Contractual principal (PHP)",
    }),
    input?.principal ?? "10000.00",
  );

  await user.type(
    screen.getByRole("textbox", {
      name: "Cash actually received (PHP)",
    }),
    input?.actualReceived ?? "10000.00",
  );

  await user.type(
    screen.getByRole("textbox", {
      name: "Description",
    }),
    "Personal loan proceeds received",
  );

  return user;
}

beforeEach(() => {
  routerMocks.push.mockReset();

  routerMocks.refresh.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BorrowingCreateForm", () => {
  it("requires review and previews the canonical withheld-fee borrowing exactly", async () => {
    renderForm();

    const user = await fillBaseBorrowing({
      principal: "10000.00",
      actualReceived: "9800.00",
    });

    await user.click(
      screen.getByRole("button", {
        name: "Add fee",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Fee amount 1 (PHP)",
      }),
      "200.00",
    );

    expect(
      screen.getByRole("combobox", {
        name: "Fee treatment 1",
      }),
    ).toHaveValue("withheld");

    expect(
      screen.getByRole("combobox", {
        name: "Fee category 1",
      }),
    ).toHaveValue(categories[0]!.categoryId);

    await user.click(
      screen.getByRole("button", {
        name: "Review borrowing",
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();

    const preview = screen.getByRole("region", {
      name: "Borrowing preview",
    });

    expect(preview).toHaveFocus();

    expect(
      within(preview).getAllByText("PHP 10,000.00").length,
    ).toBeGreaterThanOrEqual(1);

    expect(within(preview).getByText("PHP 9,800.00")).toBeInTheDocument();

    expect(
      within(preview).getAllByText("PHP 200.00").length,
    ).toBeGreaterThanOrEqual(2);

    expect(
      within(preview).getAllByText("PHP 0.00").length,
    ).toBeGreaterThanOrEqual(1);

    expect(preview).toHaveTextContent("Withheld from loan proceeds");

    expect(preview).toHaveTextContent(/no provider due dates supplied/i);
  });

  it("previews a capitalized fee as additional liability without reducing cash proceeds", async () => {
    renderForm();

    const user = await fillBaseBorrowing();

    await user.click(
      screen.getByRole("button", {
        name: "Add fee",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Fee amount 1 (PHP)",
      }),
      "200.00",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Fee treatment 1",
      }),
      "capitalized",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Review borrowing",
      }),
    );

    const preview = screen.getByRole("region", {
      name: "Borrowing preview",
    });

    expect(
      within(preview).getAllByText("PHP 10,000.00").length,
    ).toBeGreaterThanOrEqual(2);

    expect(
      within(preview).getAllByText("PHP 200.00").length,
    ).toBeGreaterThanOrEqual(2);

    expect(within(preview).getByText("PHP 10,200.00")).toBeInTheDocument();

    expect(preview).toHaveTextContent("Added to the debt balance");

    expect(
      within(preview).getAllByText("PHP 0.00").length,
    ).toBeGreaterThanOrEqual(1);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts exact minor units only after confirmation and never sends ownership scope", async () => {
    fetchMock.mockResolvedValueOnce(createSuccessResponse());

    renderForm();

    const user = await fillBaseBorrowing({
      principal: "10000.00",
      actualReceived: "9800.00",
    });

    await user.click(
      screen.getByRole("button", {
        name: "Add fee",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Fee amount 1 (PHP)",
      }),
      "200.00",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Review borrowing",
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "Confirm borrowing",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const requestInit = fetchMock.mock.calls[0]![1] as RequestInit;

    const payload = JSON.parse(requestInit.body as string);

    expect(payload).toEqual({
      actionKind: "borrowing",

      clientCommandId: expect.any(String),

      name: "Personal loan",

      lenderName: "Example Lender",

      productName: null,

      debtType: "personal_loan",

      borrowingDate: "2026-10-08",

      receivingAccountId: accounts[0]!.accountId,

      principalMinor: "1000000",

      actualReceivedMinor: "980000",

      fees: [
        {
          label: "Processing fee",

          amountMinor: "20000",

          treatment: "withheld",

          categoryId: categories[0]!.categoryId,
        },
      ],

      installments: [],

      scheduleReason: "Provider has not supplied installment dates yet.",

      description: "Personal loan proceeds received",

      reference: null,

      notes: null,
    });

    expect(payload).not.toHaveProperty("userId");

    expect(payload).not.toHaveProperty("workspaceId");

    expect(payload).not.toHaveProperty("requestId");

    await waitFor(() => {
      expect(routerMocks.push).toHaveBeenCalledWith(
        `/money/debts/${successResult.debtId}`,
      );
    });

    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("posts a capitalized fee without subtracting it from actual proceeds", async () => {
    fetchMock.mockResolvedValueOnce(createSuccessResponse());

    renderForm();

    const user = await fillBaseBorrowing();

    await user.click(
      screen.getByRole("button", {
        name: "Add fee",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Fee amount 1 (PHP)",
      }),
      "200.00",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Fee treatment 1",
      }),
      "capitalized",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Review borrowing",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Confirm borrowing",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const payload = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    expect(payload).toMatchObject({
      principalMinor: "1000000",

      actualReceivedMinor: "1000000",

      fees: [
        {
          label: "Processing fee",

          amountMinor: "20000",

          treatment: "capitalized",

          categoryId: categories[0]!.categoryId,
        },
      ],
    });
  });

  it("preserves the exact command after an uncertain save and retries it safely", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "TEMPORARY_UNAVAILABLE",

            message: "Outcome unresolved.",

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

    renderForm();

    const user = await fillBaseBorrowing();

    await user.click(
      screen.getByRole("button", {
        name: "Review borrowing",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Confirm borrowing",
      }),
    );

    expect(
      await screen.findByText("Save outcome unconfirmed"),
    ).toBeInTheDocument();

    expect(routerMocks.push).not.toHaveBeenCalled();

    expect(
      screen.getByRole("textbox", {
        name: "Debt name",
      }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: "Retry same save",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const firstBody = (fetchMock.mock.calls[0]![1] as RequestInit)
      .body as string;

    const secondBody = (fetchMock.mock.calls[1]![1] as RequestInit)
      .body as string;

    expect(secondBody).toBe(firstBody);

    const firstPayload = JSON.parse(firstBody);

    const secondPayload = JSON.parse(secondBody);

    expect(secondPayload.clientCommandId).toBe(firstPayload.clientCommandId);

    await waitFor(() => {
      expect(routerMocks.push).toHaveBeenCalledWith(
        `/money/debts/${successResult.debtId}`,
      );
    });
  });

  it("treats a malformed success response as unconfirmed rather than inventing success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("{}", {
        status: 201,

        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    renderForm();

    const user = await fillBaseBorrowing();

    await user.click(
      screen.getByRole("button", {
        name: "Review borrowing",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Confirm borrowing",
      }),
    );

    expect(
      await screen.findByText("Save outcome unconfirmed"),
    ).toBeInTheDocument();

    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it("does not call the API when withheld fees and actual proceeds are inconsistent", async () => {
    renderForm();

    const user = await fillBaseBorrowing({
      principal: "10000.00",

      actualReceived: "9900.00",
    });

    await user.click(
      screen.getByRole("button", {
        name: "Add fee",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Fee amount 1 (PHP)",
      }),
      "200.00",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Review borrowing",
      }),
    );

    const matchingErrors = await screen.findAllByText(
      /actual cash received must equal principal minus withheld fees/i,
    );

    expect(matchingErrors.length).toBeGreaterThanOrEqual(1);

    expect(
      screen.queryByRole("region", {
        name: "Borrowing preview",
      }),
    ).not.toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serializes a provider-supplied installment without inventing historical satisfaction", async () => {
    fetchMock.mockResolvedValueOnce(createSuccessResponse());

    renderForm();

    const user = await fillBaseBorrowing();

    await user.click(
      screen.getByRole("button", {
        name: "Add installment",
      }),
    );

    fireEvent.change(screen.getByLabelText("Due date 1"), {
      target: {
        value: "2026-11-08",
      },
    });

    await user.type(
      screen.getByRole("textbox", {
        name: "Contractual amount 1 (PHP)",
      }),
      "10500.00",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Known principal 1 (PHP)",
      }),
      "10000.00",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Known interest 1 (PHP)",
      }),
      "500.00",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Known fees 1 (PHP)",
      }),
      "0.00",
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /provider supplied a complete principal/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Review borrowing",
      }),
    );

    const preview = screen.getByRole("region", {
      name: "Borrowing preview",
    });

    expect(preview).toHaveTextContent(
      "1 provider-supplied installment will be saved.",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Confirm borrowing",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const payload = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    expect(payload.installments).toEqual([
      {
        dueDate: "2026-11-08",

        contractualMinor: "1050000",

        knownPrincipalMinor: "1000000",

        knownInterestMinor: "50000",

        knownFeeMinor: "0",

        breakdownComplete: true,

        notes: null,
      },
    ]);

    expect(payload.installments[0]).not.toHaveProperty("openingSatisfiedMinor");
  });
});
