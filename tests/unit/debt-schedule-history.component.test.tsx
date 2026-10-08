import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebtScheduleHistory } from "@/components/money/debt-schedule-history";
import type { ScheduleHistoryResult } from "@/modules/finance/domain/debt-schedule-history";
import { paymentDetail, paymentIds } from "./helpers/debt-payment";
const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const item = (id = paymentIds.schedule, version = 2) => ({
  scheduleVersionId: id,
  versionNo: version,
  previousVersionId: paymentIds.installment,
  effectiveDate: "2026-10-08",
  revisionKind: "date_correction" as const,
  reason: "Provider corrected date",
  frequency: "manual",
  finalizedAt: "2026-10-08T04:00:00.000Z",
  recordedByUserId: paymentIds.user,
  current: version === 2,
  chargeActionId: null,
  entries: paymentDetail().installments.map((i) => ({ ...i })),
  mappings: [
    {
      paymentRevisionId: paymentIds.revision,
      sourceAllocationId: paymentIds.payment,
      targetInstallmentId: paymentIds.installment,
      amountMinor: "40000",
    },
  ],
});
const initial = (): ScheduleHistoryResult => ({
  financialRevision: "4",
  items: [item()],
  nextCursor: paymentIds.schedule,
});
const view = () =>
  render(
    <DebtScheduleHistory
      debtId={paymentIds.debt}
      currency="PHP"
      timezone="Asia/Manila"
      initial={initial()}
    />,
  );
describe("immutable schedule history UI", () => {
  it("shows prior terms and maps without treating mappings as more payments", () => {
    view();
    expect(screen.getByText(/Version 2/)).toHaveTextContent("current");
    expect(screen.getByText(/Original due allocation/)).toHaveTextContent(
      "PHP 400.00",
    );
    expect(screen.getByText(/not additional payments/)).toBeInTheDocument();
  });
  it("deduplicates paginated versions and retains history when a request fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            financialRevision: "4",
            items: [item(), item(paymentIds.payment, 1)],
            nextCursor: paymentIds.payment,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "Load older schedules" }),
    );
    await screen.findByText(/Version 1/);
    expect(screen.getAllByText(/Version 2/)).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Load older schedules" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
  });
  it("rejects a mixed snapshot and provides a refresh instruction", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ financialRevision: "5", items: [], nextCursor: null }),
        { status: 200 },
      ),
    );
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "Load older schedules" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Refresh the debt"),
    );
    expect(screen.getByText(/Version 2/)).toBeInTheDocument();
  });
});
