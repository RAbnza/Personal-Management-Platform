import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionCreateForm } from "@/components/money/transaction-create-form";
const mocks = vi.hoisted(() => ({ push: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
const card = {
  cardId: "11111111-1111-4111-8111-111111111111",
  name: "BPI Visa",
  issuerName: "BPI",
  currency: "PHP",
  creditLimitMinor: null,
  limitVerifiedDate: null,
  notes: null,
  archived: false,
  version: 1,
  postedOutstandingMinor: "0",
  cardCreditMinor: "0",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());
async function fill() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Transaction date"), "2026-10-10");
  await user.type(screen.getByLabelText("Amount (PHP)"), "3000.01");
  await user.type(screen.getByLabelText("Description"), "Groceries");
  return user;
}
describe("card funding in ordinary Add Expense", () => {
  it("requires explicit provider posting information, allows card-only workspaces, and sends exact amounts through one command", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          actionKind: "card_purchase",
          actionId: "22222222-2222-4222-8222-222222222222",
          actionRevisionId: "33333333-3333-4333-8333-333333333333",
          financialRevision: "2",
        }),
        { status: 201 },
      ),
    );
    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={[]}
        categories={[]}
        cards={[card]}
      />,
    );
    const u = await fill();
    const save = screen.getByRole("button", {
      name: "Save transaction",
    });
    await u.click(save);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Enter the provider-confirmed posting date/),
    ).toBeVisible();
    await u.type(screen.getByLabelText("Provider posting date"), "2026-11-02");
    await u.click(save);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mocks.fetch.mock.calls[0]![1]!.body)).toMatchObject({
      actionKind: "card_purchase",
      cardId: card.cardId,
      postingDate: "2026-11-02",
      purchaseMinor: "300001",
      splits: [{ amountMinor: "300001", categoryId: null, memo: null }],
      acknowledgeNegativeBalance: false,
    });
    expect(JSON.parse(mocks.fetch.mock.calls[0]![1]!.body)).not.toHaveProperty(
      "fundingAccountId",
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/money/actions"),
    );
  });
  it("keeps an uncertain card save immutable and retries its exact command", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            actionKind: "card_purchase",
            actionId: "22222222-2222-4222-8222-222222222222",
            actionRevisionId: "33333333-3333-4333-8333-333333333333",
            financialRevision: "2",
          }),
          { status: 201 },
        ),
      );
    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={[]}
        categories={[]}
        cards={[card]}
      />,
    );
    const u = await fill();
    await u.type(screen.getByLabelText("Provider posting date"), "2026-11-02");
    await u.click(screen.getByRole("button", { name: "Save transaction" }));
    await screen.findByText(/couldn't confirm whether/);
    expect(screen.getByLabelText("Paid with")).toBeDisabled();
    await u.click(screen.getByRole("button", { name: /Retry/ }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(mocks.fetch.mock.calls[1]![1]!.body).toBe(
      mocks.fetch.mock.calls[0]![1]!.body,
    );
  });
  it("excludes cards from income receiving accounts", async () => {
    render(
      <TransactionCreateForm
        currency="PHP"
        accounts={[]}
        categories={[]}
        cards={[card]}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("radio", { name: /Income/ }));
    expect(
      screen.queryByRole("option", { name: /BPI Visa/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Provider posting date"),
    ).not.toBeInTheDocument();
  });
});
