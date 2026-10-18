// @vitest-environment jsdom
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { analyzeCareerEvidence } from "@/modules/reporting/domain/career-analytics";
import { resolveReportPeriod } from "@/modules/reporting/domain/period";
import type { CareerReport } from "@/modules/reporting/services/get-reports";
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
import { CareerReportView } from "@/components/reporting/career-report-view";
import { PeriodFilterBar } from "@/components/reporting/period-filter-bar";
import { CsvExportControl } from "@/components/reporting/csv-export-control";
const p = resolveReportPeriod(
  { period: "custom", startDate: "2024-02-01", endDate: "2024-02-29" },
  "2024-03-10",
  1,
);
function data(count = 0): CareerReport {
  const evidence = {
    applications: Array.from({ length: count }, (_, i) => ({
      applicationId: `app-${i}`,
      company: `Company ${i}`,
      role: "Engineer",
      source: null,
      stage: "applied",
      outcome: null,
      historyId: `h-${i}`,
      version: 1,
      archived: false,
      appliedDate: "2024-02-01",
    })),
    events: [],
    stages: [],
  };
  return {
    ...analyzeCareerEvidence(evidence, {
      period: p,
      asOfDate: "2024-03-10",
      today: "2024-03-10",
      weekStart: 1,
      cohortInterval: "month",
    }),
    period: p,
    asOfDate: "2024-03-10",
    today: "2024-03-10",
    weekStart: 1,
    timezone: "Asia/Manila",
    currency: "PHP",
    generatedAt: "2024-03-10T00:00:00Z",
    financialRevision: "1",
    definitionVersion: "v2-f-corrected-cohorts-1",
    filters: {
      scope: "all_owned_records",
      period: "custom",
      startDate: p.startDate,
      endDate: p.endDate,
    },
    availableSources: [null],
    cohortInterval: "month",
    comparison: null,
    coverage: {
      note: "Corrected history, effective cutoff, not historical database knowledge.",
      sourceRevision: "fingerprint",
      evidenceRows: count,
      comparisonNote: "Follow-up ages differ.",
    },
  };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("V2-F transparent accessible Career views", () => {
  it("keeps a requested source visible when that cohort has no matching evidence", () => {
    render(
      <PeriodFilterBar
        path="/reports/career"
        asOfDate="2024-03-10"
        career={{
          sources: [],
          interval: "month",
          sourceName: "Unavailable source",
        }}
      />,
    );
    expect(screen.getByLabelText("Application source")).toHaveProperty(
      "value",
      JSON.stringify("Unavailable source"),
    );
    expect(
      screen.getByRole("option", { name: /no matching cohort evidence/ }),
    ).toBeTruthy();
  });
  it("labels empty conversion/timing and paginates supporting evidence without changing totals", () => {
    const { rerender } = render(<CareerReportView data={data()} />);
    expect(
      screen.getAllByText(/Not applicable \(empty denominator\)/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/Missing responses are not rejections/),
    ).toBeTruthy();
    rerender(<CareerReportView data={data(61)} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Supporting attempts" }),
    );
    const section = document.getElementById("submitted-records")!;
    expect(within(section).getAllByRole("link")).toHaveLength(50);
    fireEvent.click(
      within(section).getByRole("button", {
        name: "Next submitted attempts page",
      }),
    );
    expect(within(section).getAllByRole("link")).toHaveLength(11);
    expect(within(section).getByRole("status").textContent).toContain(
      "61 total records",
    );
    fireEvent.click(screen.getByRole("button", { name: "Milestone reach" }));
    expect(
      screen.getByRole("link", { name: "Submitted attempts 61" }),
    ).toBeTruthy();
  });
  it("serializes exact source/calendar/comparison filters while retaining period and cutoff", async () => {
    render(
      <PeriodFilterBar
        path="/reports/career"
        period="custom"
        startDate="2024-02-01"
        endDate="2024-02-29"
        asOfDate="2024-03-10"
        career={{ sources: [null, "A&B"], interval: "month" }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Application source"), {
      target: { value: JSON.stringify("A&B") },
    });
    fireEvent.change(screen.getByLabelText("Cohort grouping"), {
      target: { value: "week" },
    });
    fireEvent.click(
      screen.getByLabelText("Compare preceding equal-length cohort"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply period" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    const url = new URL(mocks.push.mock.calls[0]![0], "https://example.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      period: "custom",
      startDate: "2024-02-01",
      endDate: "2024-02-29",
      asOfDate: "2024-03-10",
      cohortInterval: "week",
      sourceName: "A&B",
      compare: "previous",
    });
    fireEvent.change(screen.getByLabelText("Application source"), {
      target: { value: "null" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply period" }));
    const next = new URL(
      mocks.push.mock.calls.at(-1)![0],
      "https://example.test",
    );
    expect(next.searchParams.get("sourceMissing")).toBe("true");
    expect(next.searchParams.has("sourceName")).toBe(false);
  });
  it("carries Career filters only to Career-capable CSV exports", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Unavailable" }), {
        status: 400,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <CsvExportControl
        dates="period=month"
        careerDates="period=month&sourceName=Referral&cohortInterval=week"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await screen.findByRole("alert");
    expect(fetcher.mock.calls[0]![0]).toContain(
      "report.csv?period=month&sourceName=Referral",
    );
    fireEvent.change(screen.getByLabelText("CSV contents"), {
      target: { value: "transactions" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await screen.findByRole("alert");
    expect(fetcher.mock.calls[1]![0]).toBe(
      "/api/v1/exports/transactions.csv?period=month",
    );
  });
});
