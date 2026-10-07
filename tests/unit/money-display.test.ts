import { describe, expect, it } from "vitest";

import { formatMoneyMinorUnits } from "@/shared/money-display";

describe("formatMoneyMinorUnits", () => {
  it("formats exact positive minor units without Number conversion", () => {
    expect(formatMoneyMinorUnits("PHP", "125000")).toBe("PHP 1,250.00");
  });

  it("formats negative balances exactly", () => {
    expect(formatMoneyMinorUnits("PHP", "-12345")).toBe("-PHP 123.45");
  });

  it("preserves very large exact integer values", () => {
    expect(formatMoneyMinorUnits("PHP", "100000000000")).toBe(
      "PHP 1,000,000,000.00",
    );
  });
});
