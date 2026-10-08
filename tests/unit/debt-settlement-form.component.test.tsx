import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebtSettlementForm } from "@/components/money/debt-settlement-form";
import { DebtSettlementHistory } from "@/components/money/debt-settlement-history";
import { debtSettlementReadSchema } from "@/modules/finance/domain/debt-settlement";
import {
  settlementSetup,
  settlementPreview,
  settlementResult,
} from "./helpers/debt-settlement";
import { paymentIds } from "./helpers/debt-payment";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const set = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const renderForm = () =>
  render(<DebtSettlementForm setup={settlementSetup()} today="2026-10-08" />);
async function review() {
  set("Actual cash paid", "1000.00");
  set("Provider-confirmed payoff (excluding external fee)", "1000.00");
  fireEvent.click(
    screen.getByRole("button", { name: "Propose oldest due first" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Add confirmed adjustment" }),
  );
  set("Adjustment kind", "avoided_future_charge");
  set("Adjustment amount", "100.00");
  set("Provider-confirmed explanation", "Future interest avoided");
  set("Confirmation evidence", "Provider confirmed payoff");
  set("Provider reference", "CONFIRMED");
  set("Settlement reason", "Confirmed early payoff");
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: /I confirm the contractual allocations/,
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Validate and review settlement" }),
  );
  await screen.findByRole("heading", { name: "Review verified settlement" });
}
const validPreview = () =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(settlementPreview()), { status: 200 }),
  );
describe("settlement UI", () => {
  it("keeps the reviewed debt and allocation snapshot when props refresh during an uncertain save", async () => {
    validPreview();
    fetchMock.mockRejectedValueOnce(new Error("Network"));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(settlementResult), { status: 201 }),
    );
    const view = renderForm();
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and save settlement" }),
    );
    await screen.findByRole("alert");
    const changed = settlementSetup();
    changed.detail.financialRevision = "9";
    changed.detail.debt.version = 2;
    changed.detail.installments[0]!.installmentId = paymentIds.command;
    changed.detail.installments[0]!.dueDate = "2027-01-01";
    changed.accounts.items = changed.accounts.items.map((a) => ({
      ...a,
      name: "Changed account",
    }));
    view.rerender(<DebtSettlementForm setup={changed} today="2026-10-09" />);
    expect(screen.getByText(/original contractual/)).toHaveTextContent(
      "2026-10-20",
    );
    expect(screen.queryByText(/Changed account/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry identical settlement" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Settlement saved"),
    );
    expect(fetchMock.mock.calls[2]![1].body).toBe(
      fetchMock.mock.calls[1]![1].body,
    );
  });
  it("validates server-side before final confirmation and exposes exact accounting, allocation and cancellation preview", async () => {
    validPreview();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(settlementResult), { status: 201 }),
    );
    renderForm();
    await review();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/settlement\/preview$/);
    expect(screen.getByText("Actual cash deduction")).toBeInTheDocument();
    expect(
      screen.getByText("Avoided future charges (no expense reversal)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/original contractual PHP 1,100.00/),
    ).toHaveTextContent("cancelled remainder PHP 100.00");
    expect(screen.getByText(/Tracked paying account/)).toHaveTextContent(
      "PHP 5,000.00",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and save settlement" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Settlement saved"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1].body).toBe(
      fetchMock.mock.calls[0]![1].body,
    );
    const sent = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(sent.actualCashPaidMinor).toBe("100000");
    expect(sent.dueAllocations[0].amountMinor).toBe("100000");
    expect(sent.adjustments[0].kind).toBe("avoided_future_charge");
    expect(sent.expectedDebtVersion).toBe(1);
  });
  it("revokes contractual confirmation after an amount change", () => {
    renderForm();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I confirm the contractual allocations/,
      }),
    );
    set("External settlement fee", "10.00");
    expect(
      screen.getByRole("checkbox", {
        name: /I confirm the contractual allocations/,
      }),
    ).not.toBeChecked();
  });
  it("does not silently confirm oldest-due-first proposal", () => {
    renderForm();
    set("Provider-confirmed payoff (excluding external fee)", "1000");
    fireEvent.click(
      screen.getByRole("button", { name: "Propose oldest due first" }),
    );
    expect(
      screen.getByRole("checkbox", {
        name: /I confirm the contractual allocations/,
      }),
    ).not.toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects missing details before server preview", async () => {
    renderForm();
    fireEvent.click(
      screen.getByRole("button", { name: "Validate and review settlement" }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["network", "malformed", "unauthenticated", "unavailable"])(
    "retains exact uncertain %s save for safe retry and prevents navigation loss",
    async (kind) => {
      validPreview();
      if (kind === "network")
        fetchMock.mockRejectedValueOnce(new Error("Network"));
      else
        fetchMock.mockResolvedValueOnce(
          new Response(
            kind === "malformed"
              ? "{}"
              : JSON.stringify({ message: "Unavailable" }),
            {
              status:
                kind === "malformed"
                  ? 201
                  : kind === "unauthenticated"
                    ? 401
                    : 503,
            },
          ),
        );
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(settlementResult), { status: 201 }),
      );
      renderForm();
      await review();
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm and save settlement" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "outcome is unconfirmed",
      );
      expect(
        screen.queryByRole("button", { name: "Edit settlement" }),
      ).not.toBeInTheDocument();
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      fireEvent.click(
        screen.getByRole("button", { name: "Retry identical settlement" }),
      );
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Settlement saved",
        ),
      );
      expect(fetchMock.mock.calls[2]![1].body).toBe(
        fetchMock.mock.calls[1]![1].body,
      );
    },
  );
  it("rejects stale server preview and requires fresh information", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "SETTLEMENT_PREVIEW_STALE",
          message: "Refresh this debt",
        }),
        { status: 409 },
      ),
    );
    renderForm();
    await review();
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh this debt");
    expect(
      screen.queryByRole("button", { name: "Confirm and save settlement" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Reload current settlement information",
      }),
    ).toBeInTheDocument();
  });
  it("exposes server residual rejection before a save", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Residual liability remains" }), {
        status: 422,
      }),
    );
    renderForm();
    set("Actual cash paid", "1000");
    set("Provider-confirmed payoff (excluding external fee)", "1000");
    fireEvent.click(
      screen.getByRole("button", { name: "Propose oldest due first" }),
    );
    set("Confirmation evidence", "Confirmed");
    set("Settlement reason", "Payoff");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I confirm the contractual allocations/,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Validate and review settlement" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Residual liability remains",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("shows retained settlement evidence and avoided charges without claiming an expense reversal", () => {
    const s = debtSettlementReadSchema.parse({
      settlementId: paymentIds.command,
      actionId: paymentIds.command,
      actionRevisionId: paymentIds.revision,
      paymentId: paymentIds.payment,
      priorScheduleVersionId: paymentIds.schedule,
      closingScheduleVersionId: paymentIds.revision,
      settlementDate: "2026-10-08",
      settlementKind: "early",
      confirmedPayoffMinor: "100000",
      actualCashPaidMinor: "101000",
      resolvedUnappliedMinor: "0",
      unappliedResolutionNote: null,
      providerReference: "CONFIRMED",
      reason: "Payoff",
      confirmationSource: "provider",
      confirmationNote: "Provider receipt",
      components: [
        {
          kind: "avoided_future_charge",
          amountMinor: "10000",
          liabilityComponent: null,
          recognizedSourcePostingId: null,
          effectPostingId: null,
          unknownOpening: false,
          roundingTreatment: null,
          explanation: "Future interest avoided",
        },
      ],
    });
    render(<DebtSettlementHistory settlement={s} currency="PHP" />);
    expect(
      screen.getByText(/Metadata only; no expense reversal/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Provider receipt/)).toBeInTheDocument();
    expect(screen.getByText("PHP 10.00")).toBeInTheDocument();
  });
});
