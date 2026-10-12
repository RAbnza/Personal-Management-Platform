import type { CardSurface } from "@/modules/finance/repositories/card-surface-repository";
export const emptyCardSurface = (): CardSurface => ({
  basisDate: "2026-10-12",
  projectionStart: "2026-10-12",
  projectionEnd: "2026-10-26",
  cards: [],
  statements: [],
  installments: [],
  utilization: {
    usedMinor: "0",
    limitMinor: "0",
    utilizationPercent: null,
    eligibleCount: 0,
    excludedCount: 0,
  },
  totals: {
    postedOutstandingMinor: "0",
    cardCreditMinor: "0",
    latestStatementDueMinor: "0",
    projectedPrincipalMinor: "0",
    knownProjectedTotalMinor: "0",
    unknownProjectedTotalCount: 0,
    unknownInstallmentDateCount: 0,
    reconciliationPlanCount: 0,
  },
  warning: "Statements and projections can overlap.",
});
