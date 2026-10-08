import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { readFinancialAccountList } from "@/modules/finance/repositories/financial-account-read-repository";
import { listAgendaItemsInTransaction } from "@/modules/time/services/list-agenda-items";
import { parseCalendarDate } from "@/shared/calendar-date";
import {
  addCalendarDays,
  dashboardQuerySchema,
  FINANCIAL_DEFINITION_VERSION,
  resolveReportPeriod,
  type DashboardQuery,
} from "@/modules/reporting/domain/period";
import { readSpendingSummary } from "@/modules/reporting/repositories/financial-report-repository";
import {
  readCareerSnapshot,
  readDashboardDebts,
  readRecentActivity,
  readReconciliationAttention,
} from "../repositories/dashboard-repository";
import { readReportContext } from "@/modules/reporting/repositories/report-context-repository";

export type AttentionItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
};
export async function getDashboardInTransaction(
  t: ScopedTransaction,
  input: { userId: string; workspaceId: string; query?: DashboardQuery },
) {
  const query = dashboardQuerySchema.parse(input.query ?? {});
  const context = await readReportContext(t, input.workspaceId);
  const period = resolveReportPeriod(query, context.today, context.weekStart);
  const horizon = addCalendarDays(context.today, 14);
  // All reads share the caller's snapshot. Repositories receive trusted RLS scope.
  const accounts = (
    await readFinancialAccountList(t, {
      workspaceId: input.workspaceId,
      includeArchived: true,
    })
  ).filter((row) => row.account_id !== null);
  const debts = await readDashboardDebts(t, input.workspaceId, horizon);
  const spending = await readSpendingSummary(t, input.workspaceId, period);
  const reconciliations = await readReconciliationAttention(
    t,
    input.workspaceId,
  );
  const career = await readCareerSnapshot(
    t,
    input.workspaceId,
    context.today,
    horizon,
  );
  const agenda = await listAgendaItemsInTransaction(t, {
    userId: input.userId,
    workspaceId: input.workspaceId,
    startDate: parseCalendarDate(context.today),
    endDate: parseCalendarDate(horizon),
    modules:
      query.source === "all" ? ["money", "career", "time"] : [query.source],
    pageSize: 8,
  });
  const overdue = await listAgendaItemsInTransaction(t, {
    userId: input.userId,
    workspaceId: input.workspaceId,
    startDate: parseCalendarDate("0001-01-01"),
    endDate: parseCalendarDate(addCalendarDays(context.today, -1)),
    pageSize: 6,
    modules: ["career", "time"],
  });
  const activity = await readRecentActivity(t, input.workspaceId);
  const sum = (values: string[]) =>
    values.reduce((total, v) => total + BigInt(v), 0n).toString();
  const liquidMinor = sum(accounts.map((a) => a.current_balance_minor));
  const liabilitiesMinor = sum(
    debts
      .filter((d) => BigInt(d.liabilityMinor) > 0n)
      .map((d) => d.liabilityMinor),
  );
  const liabilityCreditMinor = (-BigInt(
    sum(
      debts
        .filter((d) => BigInt(d.liabilityMinor) < 0n)
        .map((d) => d.liabilityMinor),
    ),
  )).toString();
  const clearingMinor = sum(debts.map((d) => d.clearingMinor));
  const scheduledMinor = sum(debts.map((d) => d.scheduledMinor ?? "0"));
  const upcomingMinor = sum(debts.map((d) => d.upcomingMinor));
  const attention: AttentionItem[] = [];
  for (const d of debts) {
    const href = `/money/debts/${d.debtId}`;
    if (BigInt(d.overdueMinor) > 0n)
      attention.push({
        key: `overdue:${d.debtId}`,
        title: `Overdue: ${d.name}`,
        detail: `Oldest unpaid due: ${d.dueDate}. Review actual current contractual allocations.`,
        href,
      });
    if (d.clearingMinor !== "0")
      attention.push({
        key: `clearing:${d.debtId}`,
        title: `Resolve payment clearing: ${d.name}`,
        detail:
          "Cash has moved; liability classification remains unresolved. Clearing is excluded from liquid funds and tracked net position.",
        href,
      });
    if (
      (d.breakdownStatus !== "known" && d.liabilityMinor !== "0") ||
      d.unclassifiedLiabilityMinor !== "0"
    )
      attention.push({
        key: `breakdown:${d.debtId}`,
        title: `Incomplete liability breakdown: ${d.name}`,
        detail:
          "Recognized total is tracked; principal and cost coverage is partially known or unknown.",
        href,
      });
    if (d.unappliedMinor !== "0")
      attention.push({
        key: `unapplied:${d.debtId}`,
        title: `Unapplied contractual payment: ${d.name}`,
        detail:
          "Review the explicit unapplied pool and provider allocation. It is separate from accounting classification.",
        href,
      });
    if (d.scheduledMinor === null && d.lifecycle === "active")
      attention.push({
        key: `schedule:${d.debtId}`,
        title: `No supplied due schedule: ${d.name}`,
        detail:
          "Recognized liability is included. Future contractual dues remain unknown.",
        href,
      });
  }
  for (const a of accounts)
    if (BigInt(a.current_balance_minor) < 0n)
      attention.push({
        key: `negative:${a.account_id}`,
        title: `Negative tracked balance: ${a.name}`,
        detail: "Review the account's posted history and provider balance.",
        href: `/money/accounts/${a.account_id}/history`,
      });
  for (const r of reconciliations)
    attention.push({
      key: `reconciliation:${r.accountId}`,
      title: `${r.status === "needs_review" ? "Reconciliation needs review" : "Reconciliation difference"}: ${r.name}`,
      detail: `Comparison at ${r.cutoffDate}. Review source history before making any explicit adjustment.`,
      href: `/money/accounts/${r.accountId}/reconcile`,
    });
  for (const item of overdue.items.filter((i) => i.displayModule !== "money"))
    attention.push({
      key: `agenda:${item.sourceId}`,
      title: `Overdue: ${item.title}`,
      detail: `Scheduled ${item.agendaDate}; update the source if completed or cancelled.`,
      href: overdue.sourceRoutes[`${item.sourceKind}:${item.sourceId}`]!,
    });
  for (const item of career.events)
    attention.push({
      key: `next:${item.eventId}`,
      title: item.title,
      detail: `${item.date} · ${item.kind.replaceAll("_", " ")}`,
      href: `/career/applications/${item.applicationId}`,
    });
  return {
    ...context,
    definitionVersion: FINANCIAL_DEFINITION_VERSION,
    period,
    filters: { source: query.source },
    horizon,
    finance: {
      liquidMinor,
      liabilitiesMinor,
      liabilityCreditMinor,
      clearingMinor,
      scheduledMinor,
      upcomingMinor,
      trackedNetMinor: (
        BigInt(liquidMinor) +
        BigInt(liabilityCreditMinor) -
        BigInt(liabilitiesMinor)
      ).toString(),
      spending,
      accounts,
      debts,
    },
    coverage: {
      scope:
        "Tracked cash accounts and recognized debt liabilities only. Other assets, receivables, available credit and uncertain clearing are excluded; unrecorded finances remain unknown.",
      noAccounts: accounts.length === 0,
      noDebts: debts.length === 0,
      unknownSchedules: debts.filter(
        (d) => d.scheduledMinor === null && d.lifecycle === "active",
      ).length,
      periodBeforeCutoff:
        accounts.some(
          (a) =>
            a.opening_cutoff_date !== null &&
            period.startDate <= a.opening_cutoff_date,
        ) ||
        debts.some(
          (d) => d.cutoffDate !== null && period.startDate <= d.cutoffDate,
        ),
      incompleteLiabilities: debts.some(
        (d) =>
          d.clearingMinor !== "0" ||
          (d.breakdownStatus !== "known" && d.liabilityMinor !== "0") ||
          d.unclassifiedLiabilityMinor !== "0",
      ),
    },
    career: {
      ...career,
      activeCount: career.applications.filter((a) => a.active).length,
      savedCount: career.applications.filter((a) => !a.active).length,
      interviews: career.events.filter((e) => e.kind === "interview").length,
      assessments: career.events.filter((e) => e.kind === "assessment").length,
      followUps: career.events.filter((e) => e.kind === "follow_up").length,
    },
    attention,
    agenda,
    overdueHasMore: overdue.nextCursor !== null,
    activity,
  };
}
export type DashboardResult = Awaited<
  ReturnType<typeof getDashboardInTransaction>
>;
export function getDashboard(input: {
  userId: string;
  workspaceId: string;
  query?: DashboardQuery;
}) {
  z.object({ userId: z.uuid(), workspaceId: z.uuid() }).parse(input);
  return withDomainTransaction(
    { userId: input.userId, workspaceId: input.workspaceId },
    (t) => getDashboardInTransaction(t, input),
    { readOnlySnapshot: true },
  );
}
