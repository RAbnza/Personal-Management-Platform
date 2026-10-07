import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountCreateForm } from "@/components/money/account-create-form";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerMocks.refresh,
  }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  routerMocks.refresh.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillValidAccountForm() {
  const user = userEvent.setup();

  await user.type(
    screen.getByRole("textbox", {
      name: "Account name",
    }),
    "GCash",
  );

  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Account type",
    }),
    "e_wallet",
  );

  await user.type(
    screen.getByRole("textbox", {
      name: "Institution",
    }),
    "GCash",
  );

  await user.type(screen.getByLabelText("Opening balance date"), "2026-10-07");

  const openingBalance = screen.getByRole("textbox", {
    name: "Opening balance (PHP)",
  });

  await user.clear(openingBalance);

  await user.type(openingBalance, "1250.50");

  await user.type(
    screen.getByRole("textbox", {
      name: "Notes",
    }),
    "Daily wallet",
  );

  return user;
}

describe("AccountCreateForm", () => {
  it("creates an account using exact minor units and refreshes authoritative state", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accountId: "11111111-1111-4111-8111-111111111111",

          ledgerAccountId: "22222222-2222-4222-8222-222222222222",

          openingActionId: "33333333-3333-4333-8333-333333333333",

          financialRevision: "1",
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<AccountCreateForm currency="PHP" />);

    const user = await fillValidAccountForm();

    await user.click(
      screen.getByRole("button", {
        name: "Save account",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/api/v1/accounts");
    expect(request.method).toBe("POST");

    expect(JSON.parse(request.body as string)).toEqual({
      clientCommandId: expect.any(String),

      name: "GCash",

      accountType: "e_wallet",

      institutionName: "GCash",

      openingCutoffDate: "2026-10-07",

      openingBalanceMinor: "125050",

      notes: "Daily wallet",
    });

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("retries an unconfirmed financial save with the same command ID and payload", async () => {
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
            accountId: "11111111-1111-4111-8111-111111111111",

            ledgerAccountId: "22222222-2222-4222-8222-222222222222",

            openingActionId: null,

            financialRevision: "1",
          }),
          {
            status: 201,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    render(<AccountCreateForm currency="PHP" />);

    const user = await fillValidAccountForm();

    await user.click(
      screen.getByRole("button", {
        name: "Save account",
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
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body as string,
    );

    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body as string,
    );

    expect(secondBody.clientCommandId).toBe(firstBody.clientCommandId);

    expect(secondBody).toEqual(firstBody);

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("treats a validation rejection as a definite failed command", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "VALIDATION_FAILED",
          retryable: false,
        }),
        {
          status: 422,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<AccountCreateForm currency="PHP" />);

    const user = await fillValidAccountForm();

    await user.click(
      screen.getByRole("button", {
        name: "Save account",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The account could not be saved.",
    );

    expect(
      screen.queryByRole("button", {
        name: "Retry same save",
      }),
    ).not.toBeInTheDocument();

    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it("rejects amounts with more than two decimal places before calling the API", async () => {
    render(<AccountCreateForm currency="PHP" />);

    const user = userEvent.setup();

    await user.type(
      screen.getByRole("textbox", {
        name: "Account name",
      }),
      "Cash Wallet",
    );

    await user.type(
      screen.getByLabelText("Opening balance date"),
      "2026-10-07",
    );

    const openingBalance = screen.getByRole("textbox", {
      name: "Opening balance (PHP)",
    });

    await user.clear(openingBalance);

    await user.type(openingBalance, "10.123");

    await user.click(
      screen.getByRole("button", {
        name: "Save account",
      }),
    );

    expect(
      await screen.findByText(
        "Enter a non-negative amount with no more than two decimal places.",
      ),
    ).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
