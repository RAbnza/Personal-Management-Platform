import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { readReportContext } from "@/modules/reporting/repositories/report-context-repository";
import { planningId } from "../domain/recurrence";
import {
  forecastScenarioSchema,
  forecastRange,
  calculateForecast,
} from "../domain/forecast";
import { readForecastEvidence } from "../repositories/forecast-repository";
export async function getForecastInTransaction(
  t: ScopedTransaction,
  workspaceId: string,
  raw: z.input<typeof forecastScenarioSchema> = {},
) {
  const scenario = forecastScenarioSchema.parse(raw),
    context = await readReportContext(t, workspaceId),
    range = forecastRange(context.today, {
      startDate: scenario.startDate,
      endDate: scenario.endDate,
    }),
    evidence = await readForecastEvidence(t, workspaceId, {
      ...range,
      today: context.today,
      currency: context.currency,
    });
  const result = calculateForecast({
    ...context,
    openingMinor: evidence.openingMinor,
    sources: evidence.sources,
    scenario,
  });
  return {
    ...context,
    ...result,
    savings: evidence.savings,
    closingLessReservationsMinor: (
      BigInt(result.totals.closingProjectedMinor) -
      BigInt(evidence.savings.summary.reservedMinor)
    ).toString(),
    cardOptions: evidence.cards.cards.map((c) => ({
      id: c.cardId,
      name: c.name,
      unpaidStatementCount:
        (c.latestStatement && BigInt(c.latestStatement.remainingDueMinor) > 0n
          ? 1
          : 0) + c.olderUnpaidStatementCount,
    })),
    coverage: {
      terminalOccurrencesExcluded: evidence.terminalCount,
      excludedSourceCount: result.sources.filter((s) => !s.included).length,
      unknownInstallmentDateCount:
        evidence.cards.totals.unknownInstallmentDateCount,
      reconciliationPlanCount: evidence.cards.totals.reconciliationPlanCount,
      unresolvedStatementCount: evidence.cards.statements.filter(
        (s) =>
          s.unresolvedEntryCount !== "0" ||
          s.unexplainedDifferenceMinor === null ||
          s.unexplainedDifferenceMinor !== "0" ||
          s.unlinkedRecognizedCount !== "0",
      ).length,
      notes: [
        "Known-source projection only; missing evidence is not confirmed zero.",
        "Expected sources are assumptions, not posted financial commands. Unlinked actuals are not matched by name/category/date.",
        "Multiple statements can carry the same debt. Choose at most one statement per card; installment schedules are an alternative, never an addition.",
        "Budget allowances, card limits/credits, loan schedules, benefits/receivables, unrecorded living costs and unknown future charges are not automatic cash sources.",
        "Reservation comparisons are current aggregate context; future account-level funding is not inferred.",
      ],
    },
  };
}
export async function getForecast(input: {
  userId: string;
  workspaceId: string;
  scenario?: z.input<typeof forecastScenarioSchema>;
}) {
  const i = z
    .object({
      userId: planningId,
      workspaceId: planningId,
      scenario: forecastScenarioSchema.optional(),
    })
    .strict()
    .parse(input);
  return withDomainTransaction(
    i,
    (t) => getForecastInTransaction(t, i.workspaceId, i.scenario),
    { readOnlySnapshot: true },
  );
}
export type Forecast = Awaited<ReturnType<typeof getForecast>>;
