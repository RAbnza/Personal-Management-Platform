import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { readReportContext } from "../repositories/report-context-repository";
import { isCalendarDate } from "@/shared/calendar-date";
import {
  FINANCIAL_DEFINITION_VERSION,
  resolveReportPeriod,
} from "../domain/period";
import {
  readSpendingContributions,
  readSpendingSummary,
  readFinancialCoverage,
} from "../repositories/financial-report-repository";
export const spendingDetailQuerySchema = z
  .object({
    startDate: z.string().refine(isCalendarDate),
    endDate: z.string().refine(isCalendarDate),
    after: z.uuid().optional(),
  })
  .strict();
export async function getSpendingDetailInTransaction(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    query: z.input<typeof spendingDetailQuerySchema>;
  },
) {
  const query = spendingDetailQuerySchema.parse(input.query),
    context = await readReportContext(t, input.workspaceId);
  const period = resolveReportPeriod(
    { period: "custom", startDate: query.startDate, endDate: query.endDate },
    context.today,
    context.weekStart,
  );
  const summary = await readSpendingSummary(t, input.workspaceId, period),
    page = await readSpendingContributions(t, {
      workspaceId: input.workspaceId,
      period,
      ...(query.after ? { after: query.after } : {}),
    });
  return {
    ...context,
    definitionVersion: FINANCIAL_DEFINITION_VERSION,
    period,
    filters: { classification: "recognized_spending" },
    coverage: await readFinancialCoverage(t, input.workspaceId, period),
    summary,
    ...page,
  };
}
export function getSpendingDetail(input: {
  userId: string;
  workspaceId: string;
  query: z.input<typeof spendingDetailQuerySchema>;
}) {
  return withDomainTransaction(
    { userId: input.userId, workspaceId: input.workspaceId },
    (t) => getSpendingDetailInTransaction(t, input),
    { readOnlySnapshot: true },
  );
}
