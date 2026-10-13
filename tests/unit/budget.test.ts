import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  budgetFieldsSchema,
  budgetCommandSchema,
  compareBudget,
  budgetEndDate,
} from "@/modules/planning/domain/budget";
const fields = {
  categoryId: randomUUID(),
  startDate: "2024-02-01",
  endDateExclusive: "2024-03-01",
  limitMinor: "0",
  basis: "net" as const,
  notes: null,
};
describe("budget definitions and exact comparisons", () => {
  it("accepts zero and complete bigint limits with canonical exact minor units", () => {
    expect(budgetFieldsSchema.parse(fields).limitMinor).toBe("0");
    expect(
      budgetFieldsSchema.parse({ ...fields, limitMinor: "9223372036854775807" })
        .limitMinor,
    ).toBe("9223372036854775807");
    for (const limitMinor of ["-1", "1.1", "1e3", "01", "9223372036854775808"])
      expect(
        budgetFieldsSchema.safeParse({ ...fields, limitMinor }).success,
      ).toBe(false);
  });
  it("uses exclusive boundaries, leap dates and the supported report horizon", () => {
    expect(budgetEndDate("2024-03-01")).toBe("2024-02-29");
    for (const dates of [
      { startDate: "2023-02-29", endDateExclusive: "2023-03-01" },
      { startDate: "2024-02-01", endDateExclusive: "2024-02-01" },
      { startDate: "2024-01-01", endDateExclusive: "2025-01-02" },
    ])
      expect(
        budgetFieldsSchema.safeParse({ ...fields, ...dates }).success,
      ).toBe(false);
    expect(
      budgetFieldsSchema.safeParse({
        ...fields,
        startDate: "2199-12-31",
        endDateExclusive: "2200-01-01",
      }).success,
    ).toBe(true);
  });
  it("defaults net spending and rejects forged or incomplete change commands", () => {
    expect(
      budgetFieldsSchema.parse({ ...fields, basis: undefined }).basis,
    ).toBe("net");
    const b = {
      operation: "save",
      clientCommandId: randomUUID(),
      budgetId: null,
      expectedVersion: null,
      reason: null,
      fields,
    };
    expect(budgetCommandSchema.safeParse(b).success).toBe(true);
    for (const patch of [
      { actorId: randomUUID() },
      { budgetId: randomUUID() },
      { reason: "" },
      { fields: { ...fields, rollover: true } },
    ])
      expect(budgetCommandSchema.safeParse({ ...b, ...patch }).success).toBe(
        false,
      );
  });
  it("distinguishes gross, actual-period offsets, negative net and zero denominators", () => {
    expect(compareBudget("10000", "12000", "3000", "net")).toMatchObject({
      spendingMinor: "9000",
      remainingMinor: "1000",
      overspentMinor: "0",
      progressBasisPoints: "9000",
    });
    expect(compareBudget("10000", "12000", "3000", "gross")).toMatchObject({
      spendingMinor: "12000",
      overspentMinor: "2000",
    });
    expect(compareBudget("0", "0", "3000", "net")).toMatchObject({
      spendingMinor: "-3000",
      remainingMinor: "3000",
      progressBasisPoints: null,
      status: "within_limit",
    });
    expect(compareBudget("0", "1", "0", "gross")).toMatchObject({
      overspentMinor: "1",
      progressBasisPoints: null,
      status: "overspent",
    });
    expect(
      compareBudget("9007199254740993", "9007199254740994", "0", "net")
        .overspentMinor,
    ).toBe("1");
  });
});
