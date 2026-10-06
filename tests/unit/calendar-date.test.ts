import { describe, expect, it } from "vitest";

import {
  compareCalendarDates,
  isCalendarDate,
  parseCalendarDate,
} from "@/shared/calendar-date";

describe("shared calendar-date primitives", () => {
  it("accepts valid YYYY-MM-DD calendar dates", () => {
    expect(parseCalendarDate("2026-10-06")).toBe("2026-10-06");

    expect(parseCalendarDate("2024-02-29")).toBe("2024-02-29");

    expect(isCalendarDate("2026-12-31")).toBe(true);
  });

  it("rejects invalid or non-date-only values", () => {
    for (const value of [
      "",
      "2026-1-01",
      "2026-01-1",
      "0000-01-01",
      "2026-00-01",
      "2026-13-01",
      "2026-02-29",
      "2026-04-31",
      "2026-01-00",
      "2026-01-32",
      "2026-10-06T00:00:00Z",
      " 2026-10-06",
      "2026-10-06 ",
    ]) {
      expect(isCalendarDate(value)).toBe(false);
      expect(() => parseCalendarDate(value)).toThrow();
    }
  });

  it("compares date-only values without converting them to instants", () => {
    const earlier = parseCalendarDate("2026-10-05");
    const same = parseCalendarDate("2026-10-05");
    const later = parseCalendarDate("2026-10-06");

    expect(compareCalendarDates(earlier, later)).toBe(-1);
    expect(compareCalendarDates(later, earlier)).toBe(1);
    expect(compareCalendarDates(earlier, same)).toBe(0);
  });
});
