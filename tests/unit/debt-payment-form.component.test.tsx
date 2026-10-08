import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { DebtPaymentForm } from "@/components/money/debt-payment-form";
import {
  paymentAccount,
  paymentDetail,
  paymentResult,
} from "./helpers/debt-payment";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const set = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function fill() {
  set("Payment date", "2026-10-08");
  set("Actual total cash paid (PHP)", "1110.00");
  set("Contractual portion (PHP)", "1100.00");
  set("External payment fee (PHP)", "10.00");
  set("Accounting certainty", "known_components");
  set("Accounting meaning 1", "liability_reduction");
  set("Recognized liability component 1", "principal");
  set("Component amount 1 (PHP)", "1000.00");
  fireEvent.click(
    screen.getByRole("button", { name: "Add accounting component" }),
  );
  set("Accounting meaning 2", "new_interest");
  set("Component amount 2 (PHP)", "100.00");
  fireEvent.click(
    screen.getByRole("button", { name: "Propose oldest due first" }),
  );
  await waitFor(() =>
    expect(
      screen.getByLabelText("Allocate to installment 1 (PHP)"),
    ).toHaveValue("1100.00"),
  );
}
async function confirmDue() {
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /I confirm the installment allocations/,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review payment" }));
  return screen.findByLabelText("Payment review");
}
describe("debt payment form", () => {
  it("requires explicit allocation confirmation and reviews exact cash, expense and liability before one submit", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ actionKind: "debt_payment", ...paymentResult }),
        { status: 201 },
      ),
    );
    render(
      <DebtPaymentForm
        detail={paymentDetail()}
        accounts={[paymentAccount]}
        categories={[]}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Review payment" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Confirm the contractual allocations",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const review = await confirmDue();
    expect(review).toHaveTextContent("PHP 1,110.00");
    expect(review).toHaveTextContent("PHP 110.00");
    expect(review).toHaveTextContent("PHP 1,000.00");
    expect(review).toHaveTextContent("remaining PHP 0.00");
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      actualPaidMinor: "111000",
      contractualMinor: "110000",
      externalFeeMinor: "1000",
      dueAllocationConfirmed: true,
      unappliedContractualMinor: "0",
    });
  });
  it("revokes due confirmation when the proposed allocation changes", async () => {
    render(
      <DebtPaymentForm
        detail={paymentDetail()}
        accounts={[paymentAccount]}
        categories={[]}
      />,
    );
    await fill();
    const checkbox = screen.getByRole("checkbox", {
      name: /I confirm the installment allocations/,
    });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    set("Allocate to installment 1 (PHP)", "1000.00");
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });
  it("leaves a no-date payment unapplied and shows unresolved clearing without an inferred principal split", async () => {
    const detail = paymentDetail();
    detail.installments = [];
    detail.debt.remainingScheduledMinor = null;
    render(
      <DebtPaymentForm
        detail={detail}
        accounts={[paymentAccount]}
        categories={[]}
      />,
    );
    set("Payment date", "2026-10-08");
    set("Actual total cash paid (PHP)", "400");
    set("Contractual portion (PHP)", "400");
    set("Component amount 1 (PHP)", "400");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Leave contractual amount unapplied",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("Explicit unapplied contractual amount (PHP)"),
      ).toHaveValue("400.00"),
    );
    const review = await confirmDue();
    expect(review).toHaveTextContent(
      "Accounting classification remains unresolved",
    );
    expect(
      within(review).getByText("Confirmed due satisfaction").nextElementSibling,
    ).toHaveTextContent("PHP 0.00");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("retains the exact command through response loss and authenticated safe retry", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("Lost response"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ actionKind: "debt_payment", ...paymentResult }),
          { status: 201 },
        ),
      );
    render(
      <DebtPaymentForm
        detail={paymentDetail()}
        accounts={[paymentAccount]}
        categories={[]}
      />,
    );
    await fill();
    await confirmDue();
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Save outcome unconfirmed",
    );
    expect(
      screen.queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
    const original = fetchMock.mock.calls[0]![1].body;
    fireEvent.click(
      screen.getByRole("button", { name: "Check / retry same save" }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(fetchMock.mock.calls[1]![1].body).toBe(original);
  });
  it.each([401, 403, 500])(
    "preserves uncertain outcome after HTTP %s",
    async (status) => {
      fetchMock.mockResolvedValue(new Response("{}", { status }));
      render(
        <DebtPaymentForm
          detail={paymentDetail()}
          accounts={[paymentAccount]}
          categories={[]}
        />,
      );
      await fill();
      await confirmDue();
      fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Save outcome unconfirmed",
      );
      expect(router.push).not.toHaveBeenCalled();
    },
  );
  it("keeps input and refreshes stale reviewed data before another confirmation", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "PAYMENT_PREVIEW_STALE",
          message: "Financial information changed. Review again.",
        }),
        { status: 409 },
      ),
    );
    render(
      <DebtPaymentForm
        detail={paymentDetail()}
        accounts={[paymentAccount]}
        categories={[]}
      />,
    );
    await fill();
    await confirmDue();
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.getByLabelText("Actual total cash paid (PHP)")).toHaveValue(
      "1110.00",
    );
    expect(
      screen.getByRole("checkbox", {
        name: /I confirm the installment allocations/,
      }),
    ).not.toBeChecked();
  });
  it("shows a negative-account warning and retains acknowledgement in reviewed intent", async () => {
    render(
      <DebtPaymentForm
        detail={paymentDetail()}
        accounts={[{ ...paymentAccount, currentBalanceMinor: "10000" }]}
        categories={[]}
      />,
    );
    await fill();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I acknowledge that this payment/ }),
    );
    await confirmDue();
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      JSON.parse(fetchMock.mock.calls[0]![1].body).acknowledgeNegativeBalance,
    ).toBe(true);
  });
});
