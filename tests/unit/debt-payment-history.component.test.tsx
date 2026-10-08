import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebtPaymentHistory } from "@/components/money/debt-payment-history";
import type { DebtPaymentHistoryItem } from "@/modules/finance/domain/debt";
import { paymentIds } from "./helpers/debt-payment";
const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => vi.unstubAllGlobals());
const item = (id = paymentIds.revision): DebtPaymentHistoryItem => ({
  paymentId: paymentIds.payment,
  actionId: paymentIds.command,
  actionRevisionId: id,
  revisionNo: 1,
  changeKind: "create",
  current: true,
  paymentDate: "2026-10-08",
  recordedAt: "2026-10-08T05:00:00.000Z",
  payingAccountName: "Checking",
  actualPaidMinor: "111000",
  contractualMinor: "110000",
  externalFeeMinor: "1000",
  unappliedContractualMinor: "0",
  allocationCertainty: "known_components",
  description: "Provider payment",
  reference: "REFERENCE-1",
  confirmationSource: "provider",
  confirmationNote: "Provider receipt",
  negativeBalanceAcknowledged: false,
  components: [
    {
      disposition: "liability_reduction",
      amountMinor: "100000",
      liabilityComponent: "principal",
      label: "Principal",
    },
  ],
  dueAllocations: [
    {
      installmentId: paymentIds.installment,
      sequenceNo: 1,
      dueDate: "2026-10-20",
      amountMinor: "110000",
    },
  ],
});
const props = {
  debtId: paymentIds.debt,
  currency: "PHP",
  timezone: "Asia/Manila",
  financialRevision: "5",
  initialItems: [item()],
  initialCursor: paymentIds.revision,
};
describe("debt payment history", () => {
  it("shows cash and contractual fee separation with retained provider audit evidence", () => {
    render(<DebtPaymentHistory {...props} />);
    expect(screen.getByText("Payment and audit history")).toBeInTheDocument();
    expect(screen.getByText("PHP 1,110.00")).toBeInTheDocument();
    expect(
      screen.getByText("External fee, excluded from dues"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Provider receipt/)).toBeInTheDocument();
    expect(
      screen.getByText(/recorded/i, { selector: "p.text-xs" }),
    ).toHaveTextContent("1:00 PM");
  });
  it("keeps already loaded history on failure and retries the same cursor safely", async () => {
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            financialRevision: "5",
            items: [item(paymentIds.installment)],
            nextCursor: null,
          }),
          { status: 200 },
        ),
      );
    render(<DebtPaymentHistory {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Load older payment history" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be loaded consistently",
    );
    expect(screen.getByText("PHP 1,110.00")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Load older payment history" }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("PHP 1,110.00")).toHaveLength(2),
    );
    expect(fetchMock.mock.calls[1]![0]).toBe(fetchMock.mock.calls[0]![0]);
  });
  it("does not append data from a different financial snapshot", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          financialRevision: "6",
          items: [item(paymentIds.installment)],
          nextCursor: null,
        }),
        { status: 200 },
      ),
    );
    render(<DebtPaymentHistory {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Load older payment history" }),
    );
    await screen.findByRole("alert");
    expect(screen.getAllByText("PHP 1,110.00")).toHaveLength(1);
  });
  it("retains void evidence without representing it as another cash payment", () => {
    render(
      <DebtPaymentHistory
        {...props}
        initialItems={[
          { ...item(), changeKind: "void", actualPaidMinor: null },
        ]}
        initialCursor={null}
      />,
    );
    expect(
      screen.getByText(/prior economic payment was reversed/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Actual cash paid")).not.toBeInTheDocument();
  });
});
