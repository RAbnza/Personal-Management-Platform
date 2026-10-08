import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  dashboardQuerySchema,
  resolveReportPeriod,
  spendingHref,
} from "@/modules/reporting/domain/period";
describe("shared Dashboard reporting periods", () => {
  it.each([
    ["week", "2026-10-08", 1, "2026-10-05", "2026-10-12"],
    ["week", "2026-10-08", 0, "2026-10-04", "2026-10-11"],
    ["month", "2024-02-29", 1, "2024-02-01", "2024-03-01"],
    ["quarter", "2026-12-31", 1, "2026-10-01", "2027-01-01"],
    ["year", "2024-07-10", 1, "2024-01-01", "2025-01-01"],
  ] as const)("resolves %s at %s", (period, today, week, start, end) => {
    expect(resolveReportPeriod({ period }, today, week)).toMatchObject({
      startDate: start,
      endDateExclusive: end,
    });
  });
  it("keeps inclusive custom dates and exact links", () => {
    const p = resolveReportPeriod(
      { period: "custom", startDate: "2026-10-02", endDate: "2026-10-08" },
      "2026-10-08",
      1,
    );
    expect(p.endDateExclusive).toBe("2026-10-09");
    expect(spendingHref(p)).toBe(
      "/dashboard/spending?startDate=2026-10-02&endDate=2026-10-08",
    );
  });
  it.each([
    { period: "custom", startDate: "2026-10-09", endDate: "2026-10-08" },
    { period: "custom", startDate: "2025-01-01", endDate: "2026-10-08" },
    { period: "custom" },
    { period: "month", startDate: "2026-10-01" },
  ] as const)("rejects invalid or ambiguous ranges %o", (query) => {
    expect(() => resolveReportPeriod(query, "2026-10-08", 1)).toThrow();
  });
  it("rejects nonexistent dates, unsupported scopes and injected ownership", () => {
    for (const input of [
      { period: "custom", startDate: "2026-02-30" },
      { workspaceId: "foreign" },
      { source: "reports" },
    ])
      expect(dashboardQuerySchema.safeParse(input).success).toBe(false);
  });
  it("handles calendar year boundaries without browser timezone arithmetic", () => {
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("0001-01-01", 1)).toBe("0001-01-02");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
