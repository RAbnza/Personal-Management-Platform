import { describe, expect, it } from "vitest";

import {
  MAX_FINANCIAL_COMPONENT_MINOR,
  addMoney,
  allocateMoneyEvenly,
  assertFinancialComponentMinor,
  assertPositiveFinancialAmountMinor,
  createMoney,
  moneyFromJson,
  moneyToJson,
  parseMinorUnits,
  parsePhpAmountToMinorUnits,
  subtractMoney,
} from "@/shared/money";

describe("shared Money primitives", () => {
  it("parses PHP decimal form amounts exactly into centavos", () => {
    expect(parsePhpAmountToMinorUnits("0")).toBe(0n);
    expect(parsePhpAmountToMinorUnits("0.01")).toBe(1n);
    expect(parsePhpAmountToMinorUnits("1")).toBe(100n);
    expect(parsePhpAmountToMinorUnits("1.2")).toBe(120n);
    expect(parsePhpAmountToMinorUnits("5000.50")).toBe(500_050n);
  });

  it("rejects malformed PHP amount strings", () => {
    for (const value of [
      "",
      " 1",
      "1 ",
      "+1",
      "-1",
      ".50",
      "1.",
      "01",
      "1.001",
      "1,000",
      "1e3",
      "NaN",
      "Infinity",
    ]) {
      expect(() => parsePhpAmountToMinorUnits(value)).toThrow();
    }
  });

  it("parses exact signed minor-unit strings without Number", () => {
    expect(parseMinorUnits("0")).toBe(0n);
    expect(parseMinorUnits("501500")).toBe(501_500n);
    expect(parseMinorUnits("-1500")).toBe(-1_500n);

    for (const value of ["", "01", "-01", "+1", "1.0", "1e3", " 1", "1 "]) {
      expect(() => parseMinorUnits(value)).toThrow();
    }
  });

  it("serializes money minor units as JSON-safe decimal strings", () => {
    const money = createMoney("PHP", 501_500n);

    expect(moneyToJson(money)).toEqual({
      currency: "PHP",
      amountMinor: "501500",
    });

    expect(
      moneyFromJson({
        currency: "PHP",
        amountMinor: "-1500",
      }),
    ).toEqual({
      currency: "PHP",
      amountMinor: -1_500n,
    });
  });

  it("performs exact arithmetic only between matching currencies", () => {
    const first = createMoney("PHP", 100_00n);
    const second = createMoney("PHP", 25_50n);

    expect(addMoney(first, second)).toEqual({
      currency: "PHP",
      amountMinor: 125_50n,
    });

    expect(subtractMoney(first, second)).toEqual({
      currency: "PHP",
      amountMinor: 74_50n,
    });

    expect(() =>
      addMoney(createMoney("PHP", 100n), createMoney("USD", 100n)),
    ).toThrow(/currencies must match/i);
  });

  it("enforces persisted financial component bounds", () => {
    expect(assertFinancialComponentMinor(MAX_FINANCIAL_COMPONENT_MINOR)).toBe(
      MAX_FINANCIAL_COMPONENT_MINOR,
    );

    expect(assertFinancialComponentMinor(-MAX_FINANCIAL_COMPONENT_MINOR)).toBe(
      -MAX_FINANCIAL_COMPONENT_MINOR,
    );

    expect(() => assertFinancialComponentMinor(0n)).toThrow();

    expect(() =>
      assertFinancialComponentMinor(MAX_FINANCIAL_COMPONENT_MINOR + 1n),
    ).toThrow();

    expect(() => assertPositiveFinancialAmountMinor(0n)).toThrow();

    expect(assertPositiveFinancialAmountMinor(1n)).toBe(1n);
  });

  it("allocates every minor unit deterministically", () => {
    const allocations = allocateMoneyEvenly(createMoney("PHP", 10_000n), 3);

    expect(allocations.map((allocation) => allocation.amountMinor)).toEqual([
      3_334n,
      3_333n,
      3_333n,
    ]);

    expect(
      allocations.reduce(
        (total, allocation) => total + allocation.amountMinor,
        0n,
      ),
    ).toBe(10_000n);

    const negativeAllocations = allocateMoneyEvenly(
      createMoney("PHP", -10_000n),
      3,
    );

    expect(
      negativeAllocations.map((allocation) => allocation.amountMinor),
    ).toEqual([-3_334n, -3_333n, -3_333n]);

    expect(() => allocateMoneyEvenly(createMoney("PHP", 100n), 0)).toThrow();
  });
});
