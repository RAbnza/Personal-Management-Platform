import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { DebtScheduleRevisionForm } from "@/components/money/debt-schedule-revision-form";
import { scheduleSetup, scheduleResult } from "./helpers/debt-schedule";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const set = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const renderForm = () =>
  render(
    <DebtScheduleRevisionForm setup={scheduleSetup()} today="2026-10-08" />,
  );
async function review() {
  set("Revision reason", "Provider date correction");
  set("Due date 1", "2026-11-20");
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I confirm every proposed/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Review schedule revision" }),
  );
  return screen.findByLabelText("Schedule revision review");
}
describe("schedule revision review UI", () => {
  it("requires explicit mappings, shows exact old/new dues and posts once after confirmation", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(scheduleResult), { status: 201 }),
    );
    renderForm();
    set("Revision reason", "Changed date");
    fireEvent.click(
      screen.getByRole("button", { name: "Review schedule revision" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Confirm the proposed payment mapping",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const preview = await review();
    expect(preview).toHaveTextContent("2026-10-20");
    expect(preview).toHaveTextContent("2026-11-20");
    expect(preview).toHaveTextContent("PHP 400.00");
    expect(preview).toHaveTextContent("PHP 700.00");
    expect(preview).toHaveTextContent("Actual cash movement: PHP 0.00");
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm schedule revision" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Schedule revision saved",
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.expectedDebtVersion).toBe(1);
    expect(body.mappings[0].amountMinor).toBe("40000");
    expect(body.entries[0].openingSatisfiedMinor).toBeUndefined();
  });
  it("revokes mapping confirmation after a change", async () => {
    renderForm();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I confirm every proposed/ }),
    );
    set("Mapped amount 1 (PHP)", "399.00");
    expect(
      screen.getByRole("checkbox", { name: /I confirm every proposed/ }),
    ).not.toBeChecked();
  });
  it("marks a removed mapping target explicitly without silently moving it to unapplied", async () => {
    renderForm();
    set("Revision kind", "renegotiation");
    const target = (
      screen.getByLabelText("Mapping target 1") as HTMLSelectElement
    ).value;
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove installment 1 from proposal",
      }),
    );
    expect(
      screen.getByRole("option", {
        name: /Previous target removed or cancelled/,
      }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Mapping target 1")).toHaveValue(target);
    set("Mapping target 1", "");
    expect(screen.getByLabelText("Mapping target 1")).toHaveValue("");
  });
  it("lost response locks the reviewed intent and retries the identical command", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("Lost response"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(scheduleResult), { status: 201 }),
      );
    renderForm();
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm schedule revision" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("unconfirmed");
    expect(screen.getByLabelText("Due date 1")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same revision" }),
    );
    await screen.findByRole("status");
    expect(fetchMock.mock.calls[0]![1].body).toBe(
      fetchMock.mock.calls[1]![1].body,
    );
  });
  it("malformed successful response retains safe retry", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));
    renderForm();
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm schedule revision" }),
    );
    expect(
      await screen.findByRole("button", { name: "Retry same revision" }),
    ).toBeEnabled();
  });
  it("keeps the exact review snapshot during an uncertain save even when server props refresh", async () => {
    fetchMock.mockRejectedValue(new Error("Lost response"));
    const view = renderForm();
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm schedule revision" }),
    );
    await screen.findByRole("button", { name: "Retry same revision" });
    const changed = scheduleSetup();
    changed.detail.debt.version = 3;
    changed.detail.financialRevision = "6";
    changed.detail.installments = [];
    changed.pools = [];
    view.rerender(
      <DebtScheduleRevisionForm setup={changed} today="2026-10-08" />,
    );
    expect(screen.getByLabelText("Schedule revision review")).toHaveTextContent(
      "2026-10-20",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same revision" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]![1].body).toBe(
      fetchMock.mock.calls[1]![1].body,
    );
  });
  it("stale previews block resubmission until a new snapshot loads", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "SCHEDULE_PREVIEW_STALE",
          message: "Debt changed",
        }),
        { status: 409 },
      ),
    );
    const view = renderForm();
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm schedule revision" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Review schedule revision" }),
    ).toBeDisabled();
    expect(router.refresh).toHaveBeenCalled();
    const fresh = scheduleSetup();
    fresh.detail.debt.version = 2;
    fresh.detail.financialRevision = "5";
    view.rerender(
      <DebtScheduleRevisionForm setup={fresh} today="2026-10-08" />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review schedule revision" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("checkbox", { name: /I confirm every proposed/ }),
    ).not.toBeChecked();
  });
  it("explicit provider charge preview distinguishes noncash recognition from scheduled terms", async () => {
    renderForm();
    set("Revision kind", "renegotiation");
    set("Revision reason", "Provider renegotiation");
    set("Contractual amount 1 (PHP)", "1200.00");
    set("Known interest 1 (PHP)", "200.00");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Recognize a new provider-confirmed charge",
      }),
    );
    set("Newly recognized charge (PHP)", "100.00");
    set("Provider charge explanation", "Confirmed new interest");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /The provider confirmed/ }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I confirm every proposed/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review schedule revision" }),
    );
    const p = await screen.findByLabelText("Schedule revision review");
    expect(within(p).getByText(/Newly recognized liability/)).toHaveTextContent(
      "PHP 100.00",
    );
    expect(p).toHaveTextContent("Actual cash movement: PHP 0.00");
  });
});
