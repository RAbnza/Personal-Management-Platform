import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { SpendingCharts } from "@/components/dashboard/spending-charts";
import { dashboardFixture } from "./helpers/dashboard";

describe("Home reporting charts", () => {
  it("retains exact signed amounts and category/period scope in accessible drilldowns", async () => {
    const d = dashboardFixture();
    d.finance.breakdowns = {
      trend: [
        {
          date: "2026-10-03",
          incomeMinor: "9007199254740993",
          netMinor: "-12575",
          cashOutMinor: "0",
        },
      ],
      categories: [
        {
          categoryId: null,
          category: "Uncategorized",
          grossMinor: "0",
          offsetsMinor: "12575",
          netMinor: "-12575",
        },
      ],
      cash: [],
    };
    render(
      <SpendingCharts
        finance={d.finance}
        currency={d.currency}
        period={d.period}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("Exact chart data"));
    expect(screen.getByRole("table")).toHaveTextContent(
      "PHP 90,071,992,547,409.93",
    );
    expect(screen.getByRole("table")).toHaveTextContent("-PHP 125.75");
    expect(screen.getByRole("link", { name: /Uncategorized/ })).toHaveAttribute(
      "href",
      "/reports/financial/detail?period=custom&startDate=2026-10-01&endDate=2026-10-08&metric=net&categoryId=uncategorized",
    );
    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByRole("button", { name: "Income" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Spending" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
