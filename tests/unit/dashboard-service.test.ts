import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  context: vi.fn(),
  accounts: vi.fn(),
  debts: vi.fn(),
  spending: vi.fn(),
  reconciliation: vi.fn(),
  career: vi.fn(),
  agenda: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@/platform/db", () => ({ withDomainTransaction: mocks.transaction }));
vi.mock("@/modules/reporting/repositories/report-context-repository", () => ({
  readReportContext: mocks.context,
}));
vi.mock("@/modules/reporting/repositories/financial-report-repository", () => ({
  readSpendingSummary: mocks.spending,
}));
vi.mock(
  "@/modules/finance/repositories/financial-account-read-repository",
  () => ({ readFinancialAccountList: mocks.accounts }),
);
vi.mock("@/modules/time/services/list-agenda-items", () => ({
  listAgendaItemsInTransaction: mocks.agenda,
}));
vi.mock("@/modules/dashboard/repositories/dashboard-repository", () => ({
  readDashboardDebts: mocks.debts,
  readReconciliationAttention: mocks.reconciliation,
  readCareerSnapshot: mocks.career,
  readRecentActivity: mocks.activity,
}));
import { getDashboard } from "@/modules/dashboard/services/get-dashboard";
import { dashboardFixture } from "./helpers/dashboard";
import { paymentIds } from "./helpers/debt-payment";
const actor = { userId: paymentIds.user, workspaceId: paymentIds.workspace };
const snapshot = { db: {} };
beforeEach(() => {
  vi.clearAllMocks();
  const d = dashboardFixture();
  mocks.transaction.mockImplementation(async (_actor, operation) =>
    operation(snapshot),
  );
  mocks.context.mockResolvedValue({
    timezone: d.timezone,
    currency: d.currency,
    today: d.today,
    weekStart: 1,
    financialRevision: d.financialRevision,
    generatedAt: d.generatedAt,
  });
  mocks.accounts.mockResolvedValue([]);
  mocks.debts.mockResolvedValue([]);
  mocks.spending.mockResolvedValue(d.finance.spending);
  mocks.reconciliation.mockResolvedValue([]);
  mocks.career.mockResolvedValue({ applications: [], events: [] });
  mocks.agenda.mockResolvedValue(d.agenda);
  mocks.activity.mockResolvedValue([]);
});
describe("Dashboard service contract", () => {
  it("uses one read-only snapshot and includes archived accounts regardless of navigation preferences", async () => {
    const result = await getDashboard({ ...actor, query: { period: "week" } });
    expect(mocks.transaction).toHaveBeenCalledWith(
      actor,
      expect.any(Function),
      { readOnlySnapshot: true },
    );
    expect(mocks.accounts).toHaveBeenCalledWith(snapshot, {
      workspaceId: actor.workspaceId,
      includeArchived: true,
    });
    for (const read of [
      mocks.context,
      mocks.accounts,
      mocks.debts,
      mocks.spending,
      mocks.reconciliation,
      mocks.career,
      mocks.agenda,
      mocks.activity,
    ])
      expect(read.mock.calls.every((call) => call[0] === snapshot)).toBe(true);
    expect(result.financialRevision).toBe("12");
    expect(result.period.startDate).toBe("2026-10-05");
  });
  it("keeps exact integer sums above Number's safe range and negative balances", async () => {
    mocks.accounts.mockResolvedValue([
      {
        account_id: paymentIds.account,
        name: "Large balance",
        current_balance_minor: "9007199254740993",
        opening_cutoff_date: "2026-09-30",
      },
      {
        account_id: paymentIds.revision,
        name: "Negative",
        current_balance_minor: "-2",
        opening_cutoff_date: "2026-09-30",
      },
    ]);
    expect((await getDashboard(actor)).finance.liquidMinor).toBe(
      "9007199254740991",
    );
  });
  it("separates liability credit states from outstanding liabilities and excludes clearing", async () => {
    mocks.debts.mockResolvedValue([
      {
        debtId: paymentIds.debt,
        name: "Credit",
        liabilityMinor: "-100",
        clearingMinor: "300",
        unclassifiedLiabilityMinor: "0",
        unappliedMinor: "0",
        breakdownStatus: "known",
        cutoffDate: null,
        scheduledMinor: null,
        upcomingMinor: "0",
        overdueMinor: "0",
        dueDate: null,
      },
    ]);
    const result = await getDashboard(actor);
    expect(result.finance).toMatchObject({
      liabilitiesMinor: "0",
      liabilityCreditMinor: "100",
      clearingMinor: "300",
      trackedNetMinor: "100",
    });
    expect(result.coverage.incompleteLiabilities).toBe(true);
  });
});
