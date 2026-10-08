import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountReconciliationForm } from "@/components/money/account-reconciliation-form";
import { ReconciliationHistory } from "@/components/money/reconciliation-history";
import {
  adjustmentPreview,
  comparisonItem,
  comparisonPreview,
  reconciliationSetup,
} from "./helpers/reconciliation";
import { paymentIds } from "./helpers/debt-payment";
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const set = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const form = () =>
  render(
    <AccountReconciliationForm
      setup={reconciliationSetup()}
      today="2026-10-08"
    />,
  );
function previewResponse() {
  fetchMock.mockImplementationOnce(
    async (url: string, options: RequestInit) => {
      const b = JSON.parse(options.body as string);
      return new Response(
        JSON.stringify(
          url.includes("adjustments")
            ? adjustmentPreview(b)
            : comparisonPreview(b),
        ),
        { status: 200 },
      );
    },
  );
}
function saveResponse() {
  fetchMock.mockImplementationOnce(
    async (url: string, options: RequestInit) => {
      const b = JSON.parse(options.body as string);
      return new Response(
        JSON.stringify(
          url.includes("adjustments")
            ? {
                clientCommandId: b.clientCommandId,
                adjustmentId: paymentIds.debt,
                actionId: paymentIds.debt,
                actionRevisionId: paymentIds.debt,
                financialRevision: "5",
                reconciliationId: b.reconciliationId,
                preview: adjustmentPreview(b),
              }
            : {
                clientCommandId: b.clientCommandId,
                reconciliationId: paymentIds.debt,
                financialRevision: "4",
                preview: comparisonPreview(b),
              },
        ),
        { status: 201 },
      );
    },
  );
}
async function reviewComparison(amount = "201.00") {
  set("Observed/provider balance", amount);
  set("Statement/provider reference (optional)", "STATEMENT");
  fireEvent.click(screen.getByRole("button", { name: "Review comparison" }));
  await screen.findByRole("heading", { name: "Review comparison" });
}
async function reviewAdjustment(amount = "1.00") {
  fireEvent.click(
    screen.getByRole("button", { name: "Record explicit adjustment" }),
  );
  set("Signed adjustment amount", amount);
  set("Adjustment reason", "Statement difference");
  fireEvent.click(screen.getByRole("button", { name: "Review adjustment" }));
  await screen.findByRole("heading", {
    name: "Review explicit balance adjustment",
  });
}
describe("account reconciliation form", () => {
  it("shows exact comparison evidence, never auto-adjusts a difference", async () => {
    previewResponse();
    saveResponse();
    form();
    await reviewComparison();
    const review = screen.getByRole("region", {
      name: "Exact confirmation preview",
    });
    expect(within(review).getByText("PHP 201.00")).toBeInTheDocument();
    expect(within(review).getByText("PHP 200.00")).toBeInTheDocument();
    expect(within(review).getByText("PHP 1.00")).toBeInTheDocument();
    expect(review).toHaveTextContent("Saving does not adjust the balance");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm comparison" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "No balance adjustment was made",
      ),
    );
    expect(fetchMock.mock.calls[1]![0]).toContain("reconciliations");
    expect(fetchMock.mock.calls[1]![1].body).toBe(
      fetchMock.mock.calls[0]![1].body,
    );
  });
  it("shows matched comparison without creating a transaction", async () => {
    previewResponse();
    form();
    await reviewComparison("200.00");
    expect(
      screen.getByRole("region", { name: "Exact confirmation preview" }),
    ).toHaveTextContent(
      "Balances match. Saving this evidence creates no transaction.",
    );
  });
  it("shows cash/equity and no income/spending for an explicit adjustment", async () => {
    previewResponse();
    saveResponse();
    form();
    await reviewAdjustment();
    const review = screen.getByRole("region", {
      name: "Exact confirmation preview",
    });
    expect(review).toHaveTextContent("Adjustment equity posting-PHP 1.00");
    expect(review).toHaveTextContent("Income: PHP 0.00. Spending: PHP 0.00");
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm explicit adjustment" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Compare again to verify",
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Refresh comparison history" }),
    ).toBeInTheDocument();
  });
  it("retains exact command and reviewed account across uncertain save and refreshed props", async () => {
    previewResponse();
    fetchMock.mockRejectedValueOnce(new Error("Network"));
    saveResponse();
    const view = form();
    await reviewAdjustment();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm explicit adjustment" }),
    );
    await screen.findByRole("button", { name: "Retry identical command" });
    const changed = reconciliationSetup();
    changed.financialRevision = "5";
    changed.account.name = "Changed account";
    changed.account.currentBalanceMinor = "999999";
    view.rerender(
      <AccountReconciliationForm setup={changed} today="2026-10-09" />,
    );
    expect(screen.queryByText(/Changed account/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry identical command" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Adjustment recorded",
      ),
    );
    expect(fetchMock.mock.calls[2]![1].body).toBe(
      fetchMock.mock.calls[1]![1].body,
    );
  });
  it("treats malformed success and server failure as uncertain without enabling edits", async () => {
    previewResponse();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 201 }));
    form();
    await reviewComparison();
    fireEvent.click(screen.getByRole("button", { name: "Confirm comparison" }));
    await screen.findByRole("button", { name: "Retry identical command" });
    expect(
      screen.queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("unconfirmed");
  });
  it("handles stale preview without posting", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "RECONCILIATION_PREVIEW_STALE",
          message: "Sources changed",
        }),
        { status: 409 },
      ),
    );
    form();
    set("Observed/provider balance", "201");
    fireEvent.click(screen.getByRole("button", { name: "Review comparison" }));
    await screen.findByText("Sources changed");
    expect(
      screen.queryByRole("button", { name: "Confirm comparison" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("blocks a reviewed save after fresh props reveal changed sources", async () => {
    previewResponse();
    const view = form();
    await reviewComparison();
    const changed = reconciliationSetup();
    changed.financialRevision = "5";
    view.rerender(
      <AccountReconciliationForm setup={changed} today="2026-10-09" />,
    );
    expect(
      screen.getByRole("button", { name: "Confirm comparison" }),
    ).toBeDisabled();
  });
  it("requires adjustment reason and exact signed decimals", async () => {
    form();
    fireEvent.click(
      screen.getByRole("button", { name: "Record explicit adjustment" }),
    );
    set("Signed adjustment amount", "1.001");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Review adjustment" })
        .closest("form")!,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "nonzero signed amount",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("edits before save discard the reviewed command and obtain a new one", async () => {
    previewResponse();
    previewResponse();
    form();
    await reviewComparison();
    const first = JSON.parse(fetchMock.mock.calls[0]![1].body).clientCommandId;
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    await reviewComparison("202.00");
    expect(
      JSON.parse(fetchMock.mock.calls[1]![1].body).clientCommandId,
    ).not.toBe(first);
  });
  it("guards navigation and unload while the outcome is uncertain", async () => {
    previewResponse();
    fetchMock.mockRejectedValueOnce(new Error("Network"));
    form();
    await reviewComparison();
    fireEvent.click(screen.getByRole("button", { name: "Confirm comparison" }));
    await screen.findByRole("button", { name: "Retry identical command" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      fireEvent.click(
        screen.getByRole("link", { name: "Load current history" }),
      );
      expect(confirm).toHaveBeenCalled();
    } finally {
      confirm.mockRestore();
    }
  });
  it("shows errors during preview as unsaved and allows editing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Preview unavailable"));
    form();
    set("Observed/provider balance", "201");
    fireEvent.click(screen.getByRole("button", { name: "Review comparison" }));
    await screen.findByText("Preview unavailable");
    expect(screen.getByLabelText("Observed/provider balance")).toBeEnabled();
  });
  it("shows stale history honestly and provides investigation and explicit review links", () => {
    const s = reconciliationSetup(),
      r = comparisonItem();
    s.history = [
      {
        ...r,
        status: "needs_review",
        needsReview: true,
        currentCalculatedMinor: "19900",
        currentSourceJournalCount: "2",
      },
    ];
    render(<ReconciliationHistory setup={s} />);
    expect(screen.getByText(/Needs review/)).toBeInTheDocument();
    expect(screen.queryByText(/Matched/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Investigate account activity" }),
    ).toHaveAttribute("href", `/money/accounts/${paymentIds.account}/history`);
  });
  it("proposes a linked adjustment only when explicitly selected from history", () => {
    const s = reconciliationSetup();
    s.history = [comparisonItem()];
    render(<AccountReconciliationForm setup={s} today="2026-10-08" />);
    expect(screen.getByLabelText("Observed/provider balance")).toHaveValue("");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review explicit adjustment for 2026-10-08",
      }),
    );
    expect(screen.getByLabelText("Signed adjustment amount")).toHaveValue(
      "1.00",
    );
    expect(screen.getByLabelText("Link to comparison (optional)")).toHaveValue(
      paymentIds.debt,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("allows comparisons for archived accounts but hides ordinary adjustments", () => {
    const s = reconciliationSetup();
    s.account.archived = true;
    render(<AccountReconciliationForm setup={s} today="2026-10-08" />);
    expect(
      screen.queryByRole("button", { name: "Record explicit adjustment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review comparison" }),
    ).toBeInTheDocument();
  });
});
