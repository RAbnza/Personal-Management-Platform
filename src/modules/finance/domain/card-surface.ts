/** Current verified limit estimates use exact ratios, never liquid cash or
 * averaged percentages. Credits do not increase estimated provider capacity. */
export function cardLimitEstimate(
  input: {
    creditLimitMinor: string | null;
    limitVerifiedDate: string | null;
    archived: boolean;
    postedOutstandingMinor: string;
  },
  today: string,
) {
  const verified =
    !input.archived &&
    input.creditLimitMinor !== null &&
    input.limitVerifiedDate !== null &&
    input.limitVerifiedDate <= today;
  const limit = verified ? BigInt(input.creditLimitMinor!) : null;
  const used = BigInt(input.postedOutstandingMinor);
  return {
    limitStatus: input.archived
      ? "archived"
      : !verified
        ? "unverified or missing"
        : limit === 0n
          ? "zero limit"
          : "verified",
    availableCreditEstimateMinor:
      limit === null ? null : (limit > used ? limit - used : 0n).toString(),
    eligibleUsedMinor: limit !== null && limit > 0n ? used.toString() : "0",
    eligibleLimitMinor: limit !== null && limit > 0n ? limit.toString() : "0",
    utilizationPercent:
      limit !== null && limit > 0n
        ? exactUtilization(used.toString(), limit.toString())
        : null,
  };
}
export function exactUtilization(used: string, limit: string) {
  const u = BigInt(used),
    l = BigInt(limit);
  if (u < 0n || l <= 0n) return null;
  // Round to the nearest hundredth of one percent without Number conversion.
  const hundredths = (u * 10000n + l / 2n) / l;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}
export function aggregateCardLimits(
  cards: ReturnType<typeof cardLimitEstimate>[],
) {
  const sum = (key: "eligibleUsedMinor" | "eligibleLimitMinor") =>
    cards.reduce((n, c) => n + BigInt(c[key]), 0n).toString();
  const usedMinor = sum("eligibleUsedMinor"),
    limitMinor = sum("eligibleLimitMinor");
  return {
    usedMinor,
    limitMinor,
    utilizationPercent: exactUtilization(usedMinor, limitMinor),
    eligibleCount: cards.filter((c) => BigInt(c.eligibleLimitMinor) > 0n)
      .length,
    excludedCount: cards.filter((c) => BigInt(c.eligibleLimitMinor) === 0n)
      .length,
  };
}
