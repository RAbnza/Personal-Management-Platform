// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
import { PeriodFilterBar } from "@/components/reporting/period-filter-bar";
import { CsvExportControl } from "@/components/reporting/csv-export-control";
import { CareerObservationForm } from "@/components/career/career-observation-form";
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("accessible report controls and precise retry behavior", () => {
  it("uses one period filter contract and preserves Career observation cutoff", () => {
    render(
      <PeriodFilterBar
        path="/reports/career"
        period="month"
        anchorDate="2026-10-01"
        startDate="2026-10-01"
        endDate="2026-10-31"
        asOfDate="2026-10-08"
      />,
    );
    fireEvent.change(screen.getByLabelText("Reporting period"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-10-08" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Report period filters" }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/reports/career?period=custom&startDate=2026-10-01&endDate=2026-10-08&asOfDate=2026-10-08",
    );
  });
  it("selects historical calendar periods without independent client date arithmetic", () => {
    render(
      <PeriodFilterBar
        path="/reports/financial"
        period="quarter"
        anchorDate="2026-09-10"
      />,
    );
    fireEvent.submit(screen.getByRole("form"));
    expect(mocks.push).toHaveBeenCalledWith(
      "/reports/financial?period=quarter&anchorDate=2026-09-10",
    );
  });
  it("shows exact export scope, disables duplicate generation while pending and surfaces preparation failure", async () => {
    let reject: (e: Error) => void = () => {};
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((_resolve, r) => {
          reject = r;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <CsvExportControl dates="period=custom&startDate=2026-10-01&endDate=2026-10-08" />,
    );
    expect(screen.getByText(/not a complete workspace backup/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("CSV contents"), {
      target: { value: "debt-payments" },
    });
    expect(
      screen.getByText(/accounting components, direct contractual allocations/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(screen.getByLabelText("CSV contents")).toHaveProperty(
      "disabled",
      true,
    );
    reject(new Error("Connection interrupted"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Connection interrupted",
      ),
    );
    expect(screen.getByRole("status").textContent).not.toContain(
      "download started",
    );
    expect(fetcher.mock.calls[0]![0]).toContain(
      "/debt-payments.csv?period=custom",
    );
  });
  it("rejects an unexpected non-CSV success response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("private", { headers: { "Content-Type": "text/html" } }),
        ),
    );
    render(<CsvExportControl dates="period=week" />);
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "CSV response unavailable",
      ),
    );
  });
  it("retains the identical observation command after uncertain save and refreshes after replay", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("Lost response"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ eventId: "event", version: 1 }), {
          status: 201,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(
      <CareerObservationForm applicationId="app" applicationVersion={3} />,
    );
    fireEvent.change(screen.getByLabelText("Actual observation date"), {
      target: { value: "2026-10-08" },
    });
    fireEvent.change(screen.getByLabelText("Observation title"), {
      target: { value: "Provider reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save observation" }));
    await screen.findByRole("button", { name: "Retry same observation" });
    expect(screen.getByRole("alert").textContent).toContain("unconfirmed");
    expect(
      screen.getByLabelText("Observation title").closest("fieldset"),
    ).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry same observation" }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
      expectedApplicationVersion: 3,
      kind: "response",
      date: "2026-10-08",
    });
  });
});
