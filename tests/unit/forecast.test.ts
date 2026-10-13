import { describe, it, expect } from "vitest";
import {
  calculateForecast,
  forecastRange,
  forecastScenarioSchema,
  type ForecastSource,
} from "@/modules/planning/domain/forecast";
const card = "11111111-1111-4111-8111-111111111111",
  statement = "22222222-2222-4222-8222-222222222222";
const source = (patch: Partial<ForecastSource> = {}): ForecastSource => ({
  key: "recurring:test:2026-10-15",
  kind: "recurring_income",
  title: "Expected",
  date: "2026-10-15",
  amountMinor: "100",
  href: "/money/recurring/test",
  provenance: "rule:1",
  blocker: null,
  timezone: "Asia/Manila",
  ...patch,
});
const calc = (
  sources: ForecastSource[],
  q: Parameters<typeof forecastScenarioSchema.parse>[0] = {},
  opening = "1000",
) =>
  calculateForecast({
    today: "2026-10-14",
    timezone: "Asia/Manila",
    openingMinor: opening,
    sources,
    scenario: forecastScenarioSchema.parse(q),
  });
describe("exact on-demand forecasts", () => {
  it("does not add unlinked expectations to compatible recorded future cash without explicit independence", () => {
    const rows = [
      source({
        key: "recorded:cash",
        kind: "recorded_cash",
        amountMinor: "1000",
        unmatchedMinor: "1000",
      }),
      source({ amountMinor: "3000" }),
    ];
    const p = calc(rows);
    expect(p.totals.closingProjectedMinor).toBe("2000");
    expect(
      p.sources.find((s) => s.kind === "recurring_income")?.excludedReason,
    ).toContain("overlap");
    expect(
      calc(rows, { confirmIndependentRecurring: true }).totals
        .closingProjectedMinor,
    ).toBe("5000");
    expect(
      calc([{ ...rows[0]!, unmatchedMinor: "0" }, rows[1]!]).totals
        .closingProjectedMinor,
    ).toBe("5000");
    const outflow = calc([
      source({
        key: "recorded:payment",
        kind: "recorded_cash",
        amountMinor: "-500",
        unmatchedMinor: "500",
      }),
      source({ kind: "recurring_outflow", amountMinor: "-300" }),
    ]);
    expect(outflow.totals.closingProjectedMinor).toBe("500");
    expect(
      outflow.sources.find((s) => s.kind === "recurring_outflow")
        ?.excludedReason,
    ).toContain("overlap");
  });
  it("separates exact actual, expected and assumptions, retaining negative cash", () => {
    const p = calc(
      [
        source({ amountMinor: "9223372036854775807" }),
        source({
          key: "recorded:a",
          kind: "recorded_cash",
          amountMinor: "-300",
        }),
        source({
          key: "recurring:bill",
          kind: "recurring_outflow",
          date: "2026-10-16",
          amountMinor: "-9223372036854775807",
        }),
      ],
      {
        endDate: "2026-10-16",
        adjustments: [
          {
            label: "Emergency",
            date: "2026-10-16",
            direction: "outflow",
            amountMinor: "2000",
          },
        ],
      },
    );
    expect(p.totals).toMatchObject({
      openingActualMinor: "1000",
      expectedInflowsMinor: "9223372036854775807",
      expectedOutflowsMinor: "9223372036854775807",
      recordedFutureNetMinor: "-300",
      assumptionNetMinor: "-2000",
      closingProjectedMinor: "-1300",
      minimumProjectedMinor: "-1300",
    });
    expect(p.daily.at(-1)?.closingMinor).toBe("-1300");
  });
  it("rolls earlier forecast movements into a projected window bridge", () => {
    const p = calc(
      [
        source(),
        source({
          key: "recurring:later",
          date: "2026-10-20",
          amountMinor: "-50",
          kind: "recurring_outflow",
        }),
      ],
      { startDate: "2026-10-20", endDate: "2026-10-20" },
    );
    expect(p.totals.windowOpeningProjectedMinor).toBe("1100");
    expect(p.totals.openingActualMinor).toBe("1000");
    expect(p.totals.closingProjectedMinor).toBe("1050");
    expect(p.daily[0]?.bridge).toBe(true);
  });
  it("validates bounded future inclusive dates including leap years", () => {
    expect(
      forecastRange("2024-02-28", { endDate: "2024-02-29" }).startDate,
    ).toBe("2024-02-29");
    expect(() =>
      forecastRange("2026-10-14", { startDate: "2026-10-14" }),
    ).toThrow();
    expect(() =>
      forecastRange("2026-10-14", { endDate: "2028-01-01" }),
    ).toThrow();
    expect(() =>
      forecastRange("2026-10-14", { endDate: "2027-02-29" }),
    ).toThrow();
    expect(() => forecastRange("2199-12-31", {})).toThrow();
  });
  it("keeps unknown, overdue, unassigned and foreign-calendar evidence explicit", () => {
    const p = calc([
      source({ amountMinor: null }),
      source({ key: "recurring:late", date: "2026-10-13" }),
      source({ key: "recurring:account", unassigned: true }),
      source({ key: "recurring:zone", timezone: "America/New_York" }),
    ]);
    expect(p.sources.every((s) => !s.included)).toBe(true);
    expect(p.totals.closingProjectedMinor).toBe("1000");
    expect(p.sources.map((s) => s.excludedReason).join(" ")).toContain(
      "unknown",
    );
    expect(
      calc([source({ unassigned: true, timezone: "UTC" })], {
        includeUnassignedRecurring: true,
        useSourceCalendarDates: true,
      }).totals.closingProjectedMinor,
    ).toBe("1100");
  });
  it("requires exclusive card choices and independent recurring outflows", () => {
    const rows = [
      source({
        key: `statement:${statement}`,
        kind: "statement",
        cardId: card,
        statementId: statement,
        amountMinor: "-500",
      }),
      source({
        key: "installment:test",
        kind: "installment",
        cardId: card,
        amountMinor: "-200",
      }),
      source({
        key: "recurring:bill",
        kind: "recurring_outflow",
        amountMinor: "-100",
      }),
    ];
    expect(calc(rows).totals.closingProjectedMinor).toBe("900");
    const q = {
      cards: [{ cardId: card, basis: "statement", statementId: statement }],
    };
    expect(calc(rows, q).totals.closingProjectedMinor).toBe("500");
    expect(
      calc(rows, { ...q, confirmIndependentRecurring: true }).totals
        .closingProjectedMinor,
    ).toBe("400");
    expect(
      calc(rows, { cards: [{ cardId: card, basis: "installments" }] }).totals
        .closingProjectedMinor,
    ).toBe("800");
    expect(
      forecastScenarioSchema.safeParse({
        cards: [...q.cards, { cardId: card, basis: "installments" }],
      }).success,
    ).toBe(false);
  });
  it("blocks unsupported credits/allocations even after card selection", () => {
    const p = calc(
      [
        source({
          kind: "statement",
          key: `statement:${statement}`,
          cardId: card,
          statementId: statement,
          amountMinor: "-200",
          blocker: "Unapplied credit",
        }),
      ],
      { cards: [{ cardId: card, basis: "statement", statementId: statement }] },
    );
    expect(p.sources[0]?.excludedReason).toBe("Unapplied credit");
    expect(p.totals.closingProjectedMinor).toBe("1000");
  });
  it("rejects forged sources, duplicate evidence and out-of-horizon assumptions", () => {
    expect(() => calc([source(), source()])).toThrow();
    expect(() =>
      calc([source()], { exclusions: ["recurring:foreign"] }),
    ).toThrow();
    expect(() =>
      calc([], {
        cards: [{ cardId: card, basis: "statement", statementId: statement }],
      }),
    ).toThrow();
    expect(
      forecastScenarioSchema.safeParse({ exclusions: ["recorded:a"] }).success,
    ).toBe(false);
    expect(() =>
      calc([], {
        adjustments: [
          {
            label: "Past",
            date: "2026-10-14",
            direction: "inflow",
            amountMinor: "1",
          },
        ],
      }),
    ).toThrow();
  });
});
