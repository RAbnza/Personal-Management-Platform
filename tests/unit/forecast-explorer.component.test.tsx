import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastExplorer } from "@/components/money/forecast-explorer";
import {
  calculateForecast,
  forecastScenarioSchema,
} from "@/modules/planning/domain/forecast";
import type { Forecast } from "@/modules/planning/services/get-forecast";
import { dashboardFixture } from "./helpers/dashboard";
function initial(): Forecast {
  const d = dashboardFixture();
  return {
    ...calculateForecast({
      today: "2026-10-14",
      timezone: d.timezone,
      openingMinor: "10000",
      sources: [],
      scenario: forecastScenarioSchema.parse({ endDate: "2026-10-16" }),
    }),
    today: "2026-10-14",
    timezone: d.timezone,
    currency: "PHP",
    weekStart: 1,
    generatedAt: d.generatedAt,
    financialRevision: "1",
    savings: d.finance.savingsGoals,
    closingLessReservationsMinor: "10000",
    cardOptions: [],
    coverage: {
      terminalOccurrencesExcluded: 0,
      excludedSourceCount: 0,
      unknownInstallmentDateCount: 0,
      reconciliationPlanCount: 0,
      unresolvedStatementCount: 0,
      notes: ["Missing evidence is not confirmed zero."],
    },
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("accessible transient forecast scenarios", () => {
  it("sends exact explicit assumptions, focuses results and preserves actual cash", async () => {
    const user = userEvent.setup(),
      d = initial(),
      next = {
        ...d,
        totals: {
          ...d.totals,
          assumptionNetMinor: "-12000",
          closingProjectedMinor: "-2000",
          minimumProjectedMinor: "-2000",
        },
        closingLessReservationsMinor: "-2000",
      },
      fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => next });
    vi.stubGlobal("fetch", fetch);
    render(<ForecastExplorer initial={d} />);
    await user.click(screen.getByText("Optional what-if adjustments"));
    await user.click(screen.getByRole("button", { name: "Add adjustment" }));
    await user.type(screen.getByLabelText("Adjustment 1 label"), "Cash stress");
    await user.type(
      screen.getByLabelText("Adjustment 1 amount (PHP)"),
      "120.00",
    );
    await user.click(
      screen.getByRole("button", { name: "Calculate forecast" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Projected cash breakdown" }),
      ).toHaveFocus(),
    );
    expect(
      JSON.parse(fetch.mock.calls[0]![1].body).adjustments[0],
    ).toMatchObject({
      amountMinor: "12000",
      direction: "outflow",
      label: "Cash stress",
    });
    expect(
      screen.getByText("Opening actual liquid cash").parentElement,
    ).toHaveTextContent("PHP 100.00");
    expect(
      screen.getByText("Projected closing cash").parentElement,
    ).toHaveTextContent("-PHP 20.00");
    expect(screen.getByText(/Projected cash shortfall/)).toBeVisible();
  });
  it("disables concurrent calculation and exposes safe authentication failure without replacing results", async () => {
    const user = userEvent.setup();
    let done!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            done = resolve;
          }),
      ),
    );
    render(<ForecastExplorer initial={initial()} />);
    await user.click(
      screen.getByRole("button", { name: "Calculate forecast" }),
    );
    expect(
      screen.getByRole("button", { name: "Calculating forecast..." }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Forecast start date")).toBeDisabled();
    done({ ok: false, status: 401, json: async () => ({}) });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("session expired"),
    );
    expect(
      screen.getByText("Projected closing cash").parentElement,
    ).toHaveTextContent("PHP 100.00");
  });
  it("aborts pending reads on unmount and labels unknown coverage and current reservations", async () => {
    const user = userEvent.setup(),
      fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetch);
    const v = render(<ForecastExplorer initial={initial()} />);
    expect(
      screen.getByText("Missing evidence is not confirmed zero."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Current savings reservations" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Calculate forecast" }),
    );
    const signal = fetch.mock.calls[0]![1]!.signal as AbortSignal;
    v.unmount();
    expect(signal.aborted).toBe(true);
  });
});
