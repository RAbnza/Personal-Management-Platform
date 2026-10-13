import { describe, it, expect } from "vitest";
import {
  generateRecurrenceDates,
  recurrenceRuleSchema,
  generationWindowSchema,
  planningCommandSchema,
  planningToday,
  type RecurrenceRule,
} from "@/modules/planning/domain/recurrence";
const base: RecurrenceRule = {
  effectiveFrom: "2024-01-31",
  frequency: "monthly",
  intervalCount: 1,
  weekdays: null,
  dayOfMonth: 31,
  shortMonthPolicy: "last_valid_day",
  endsOn: null,
  occurrenceLimit: null,
  expectedMinor: "90071992547",
  currency: "PHP",
  categoryId: null,
  defaultAccountId: null,
  timezone: "Asia/Manila",
};
const window = { from: "2024-01-01", through: "2024-06-30" };
describe("bounded recurrence grammar", () => {
  it("clamps short months explicitly, including leap day, without date drift", () => {
    expect(generateRecurrenceDates(base, window)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
      "2024-05-31",
      "2024-06-30",
    ]);
    expect(
      generateRecurrenceDates(
        { ...base, effectiveFrom: "2025-01-31" },
        { from: "2025-01-01", through: "2025-03-31" },
      ),
    ).toEqual(["2025-01-31", "2025-02-28", "2025-03-31"]);
  });
  it("skips short months without consuming the emitted occurrence count", () => {
    expect(
      generateRecurrenceDates(
        { ...base, shortMonthPolicy: "skip", occurrenceLimit: 3 },
        window,
      ),
    ).toEqual(["2024-01-31", "2024-03-31", "2024-05-31"]);
  });
  it("does not reset count when requesting an overlapping or later window", () => {
    const r = { ...base, occurrenceLimit: 3 };
    expect(
      generateRecurrenceDates(r, { from: "2024-03-01", through: "2024-06-30" }),
    ).toEqual(["2024-03-31"]);
    expect(
      generateRecurrenceDates(r, { from: "2024-04-01", through: "2024-06-30" }),
    ).toEqual([]);
  });
  it("uses daily calendar intervals across both DST transitions", () => {
    const r = {
      ...base,
      effectiveFrom: "2026-03-07",
      frequency: "daily" as const,
      dayOfMonth: null,
      shortMonthPolicy: null,
      timezone: "America/New_York",
    };
    expect(
      generateRecurrenceDates(r, { from: "2026-03-07", through: "2026-03-10" }),
    ).toEqual(["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
    expect(
      generateRecurrenceDates(
        { ...r, effectiveFrom: "2026-10-31" },
        { from: "2026-10-31", through: "2026-11-03" },
      ),
    ).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });
  it("anchors selected ISO weekdays to Monday and excludes dates before start", () => {
    expect(
      generateRecurrenceDates(
        {
          ...base,
          effectiveFrom: "2026-10-14",
          frequency: "weekly",
          intervalCount: 2,
          weekdays: [5, 1, 3],
          dayOfMonth: null,
          shortMonthPolicy: null,
          occurrenceLimit: 5,
        },
        { from: "2026-10-01", through: "2026-11-30" },
      ),
    ).toEqual([
      "2026-10-14",
      "2026-10-16",
      "2026-10-26",
      "2026-10-28",
      "2026-10-30",
    ]);
  });
  it("respects inclusive end dates and interval counts", () => {
    expect(
      generateRecurrenceDates(
        { ...base, intervalCount: 2, endsOn: "2024-05-31" },
        window,
      ),
    ).toEqual(["2024-01-31", "2024-03-31", "2024-05-31"]);
    expect(
      generateRecurrenceDates(
        { ...base, effectiveFrom: "2024-02-15", dayOfMonth: 1 },
        { from: "2024-02-01", through: "2024-03-31" },
      ),
    ).toEqual(["2024-03-01"]);
  });
  it("derives local today at Manila and DST zone boundaries", () => {
    const now = new Date("2026-10-12T16:30:00Z");
    expect(planningToday("Asia/Manila", now)).toBe("2026-10-13");
    expect(planningToday("America/New_York", now)).toBe("2026-10-12");
  });
  it("requires explicit monthly policy, unique weekdays and matching grammar", () => {
    for (const r of [
      { ...base, shortMonthPolicy: null },
      { ...base, weekdays: [1] },
      { ...base, dayOfMonth: 32 },
      {
        ...base,
        frequency: "weekly",
        dayOfMonth: null,
        shortMonthPolicy: null,
        weekdays: [1, 1],
      },
      { ...base, timezone: "Mars/Olympus" },
      { ...base, endsOn: "2024-01-01" },
      { ...base, expectedMinor: "0" },
      { ...base, expectedMinor: "100000000001" },
    ])
      expect(recurrenceRuleSchema.safeParse(r).success).toBe(false);
  });
  it("rejects unbounded/invalid horizons and preserves exact amount strings", () => {
    expect(
      generationWindowSchema.safeParse({
        from: "2024-01-01",
        through: "2025-01-01",
      }).success,
    ).toBe(false);
    expect(
      generationWindowSchema.safeParse({
        from: "2024-03-01",
        through: "2024-02-31",
      }).success,
    ).toBe(false);
    expect(recurrenceRuleSchema.parse(base).expectedMinor).toBe("90071992547");
    const r = {
      ...base,
      effectiveFrom: "2000-01-01",
      frequency: "daily" as const,
      dayOfMonth: null,
      shortMonthPolicy: null,
      occurrenceLimit: 3,
    };
    expect(
      generateRecurrenceDates(r, { from: "2026-01-01", through: "2026-12-31" }),
    ).toEqual([]);
  });
  it("rejects forged ownership and ambiguous override commands", () => {
    expect(
      planningCommandSchema.safeParse({
        operation: "occurrence",
        clientCommandId: "590581b9-3e7f-4fa5-87b7-f05375d2da92",
        occurrenceId: "590581b9-3e7f-4fa5-87b7-f05375d2da92",
        expectedVersion: 1,
        change: "skip",
        dueDate: "2026-10-12",
        expectedMinor: null,
        reason: "skip",
      }).success,
    ).toBe(false);
    expect(
      planningCommandSchema.safeParse({
        operation: "generate",
        clientCommandId: "590581b9-3e7f-4fa5-87b7-f05375d2da92",
        obligationId: "590581b9-3e7f-4fa5-87b7-f05375d2da92",
        expectedVersion: 1,
        window,
        userId: "590581b9-3e7f-4fa5-87b7-f05375d2da92",
      }).success,
    ).toBe(false);
  });
});
