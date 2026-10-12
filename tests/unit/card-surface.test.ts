import { describe, it, expect } from "vitest";
import {
  cardLimitEstimate,
  aggregateCardLimits,
  exactUtilization,
} from "@/modules/finance/domain/card-surface";
const today = "2026-10-12";
const estimate = (limit: string | null, used: string, patch = {}) =>
  cardLimitEstimate(
    {
      creditLimitMinor: limit,
      postedOutstandingMinor: used,
      limitVerifiedDate: today,
      archived: false,
      ...patch,
    },
    today,
  );
describe("verified card limit estimates", () => {
  it("weights aggregate utilization by exact eligible limits, excludes credits from use and does not average percentages", () => {
    const cards = [
      estimate("10000", "10000"),
      estimate("90000", "0"),
      estimate("5000", "0"),
      estimate(null, "7000"),
      estimate("0", "5000"),
      estimate("10000", "10000", { archived: true }),
    ];
    expect(aggregateCardLimits(cards)).toEqual({
      usedMinor: "10000",
      limitMinor: "105000",
      utilizationPercent: "9.52%",
      eligibleCount: 3,
      excludedCount: 3,
    });
    expect(cards[2]!.availableCreditEstimateMinor).toBe("5000");
  });
  it.each([null, "0"])(
    "handles missing and zero limit %s without division by zero",
    (limit) => {
      const c = estimate(limit, "20000");
      expect(c.utilizationPercent).toBeNull();
      expect(c.availableCreditEstimateMinor).toBe(limit === null ? null : "0");
      expect(aggregateCardLimits([c]).utilizationPercent).toBeNull();
    },
  );
  it("excludes unverified, future verified and archived limits without losing posted balances", () => {
    for (const patch of [
      { limitVerifiedDate: null },
      { limitVerifiedDate: "2026-10-13" },
      { archived: true },
    ])
      expect(estimate("30000", "10000", patch)).toMatchObject({
        availableCreditEstimateMinor: null,
        utilizationPercent: null,
        eligibleUsedMinor: "0",
        eligibleLimitMinor: "0",
      });
  });
  it("uses integer arithmetic beyond Number precision, permits over-limit use and rounds once", () => {
    expect(
      estimate("9007199254740993", "9007199254740992")
        .availableCreditEstimateMinor,
    ).toBe("1");
    expect(exactUtilization("1", "32")).toBe("3.13%");
    expect(estimate("100", "101")).toMatchObject({
      availableCreditEstimateMinor: "0",
      utilizationPercent: "101.00%",
    });
    expect(exactUtilization("0", "0")).toBeNull();
    expect(exactUtilization("-1", "100")).toBeNull();
  });
});
