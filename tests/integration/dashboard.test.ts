import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { ScopedTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools } from "@/platform/db/pools";
import { getDashboardInTransaction } from "@/modules/dashboard/services/get-dashboard";
import { getSpendingDetailInTransaction } from "@/modules/reporting/services/get-spending-detail";
import { recordExpenseInTransaction } from "@/modules/finance/services/record-expense";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
import { recordTransferInTransaction } from "@/modules/finance/services/record-transfer";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import { recordDebtPaymentInTransaction } from "@/modules/finance/services/record-debt-payment";
import { getDebtDetailInTransaction } from "@/modules/finance/services/read-debts";
import {
  correctFinancialActionInTransaction,
  getFinancialActionDetailInTransaction,
} from "@/modules/finance/services/correct-financial-action";
import { recordRefundInTransaction } from "@/modules/finance/services/record-refund";
import { reconcileAccountInTransaction } from "@/modules/finance/services/reconcile-account";
import { readAccountBalanceAt } from "@/modules/finance/repositories/reconciliation-repository";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { createPersonalEventInTransaction } from "@/modules/time/services/create-personal-event";
import { addCalendarDays } from "@/modules/reporting/domain/period";
import { importExistingDebtInTransaction } from "@/modules/finance/services/import-existing-debt";
import { TZDate } from "@date-fns/tz";
import { withFixture, scoped } from "./helpers/debt-payment-fixture";
const tx = (c: PoolClient) =>
  ({ db: drizzle({ client: c }) }) as ScopedTransaction;
const period = {
  period: "custom" as const,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
};
afterAll(closeRuntimeDatabasePools);
describe("connected Dashboard authoritative snapshot", () => {
  it("matches the blueprint cash-flow fixture without counting principal as spending", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const cash = await openFinancialAccountInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        name: "Blueprint cash",
        accountType: "checking",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "2450000",
      });
      const loan = await importExistingDebtInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        name: "Blueprint recognized principal",
        lenderName: "Provider",
        debtType: "personal_loan",
        startDate: "2026-01-01",
        openingCutoffDate: "2026-09-30",
        openingLiabilityMinor: "450000",
        openingComponents: [{ kind: "principal", amountMinor: "450000" }],
        installments: [
          {
            dueDate: "2026-10-08",
            contractualMinor: "500000",
            knownPrincipalMinor: "450000",
            knownInterestMinor: "50000",
            knownFeeMinor: "0",
            breakdownComplete: true,
          },
        ],
        scheduleReason: "Provider supplied principal and future interest",
      });
      await recordIncomeInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        receivingAccountId: cash.accountId,
        effectiveDate: "2026-10-01",
        amountMinor: "3000000",
        incomeClass: "earned",
        description: "Salary",
      });
      await recordExpenseInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        fundingAccountId: cash.accountId,
        effectiveDate: "2026-10-02",
        purchaseMinor: "1240000",
        splits: [{ amountMinor: "1240000" }],
        description: "Cash purchases",
      });
      const detail = await getDebtDetailInTransaction(tx(c), {
        ...actor,
        debtId: loan.debtId,
      });
      await recordDebtPaymentInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        debtId: loan.debtId,
        payingAccountId: cash.accountId,
        paymentDate: "2026-10-08",
        scheduleVersionId: loan.scheduleVersionId,
        expectedFinancialRevision: detail.financialRevision,
        actualPaidMinor: "518500",
        contractualMinor: "500000",
        externalFeeMinor: "18500",
        allocationCertainty: "known_components",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "principal",
            amountMinor: "450000",
            label: "Principal repayment",
          },
          {
            disposition: "new_interest",
            amountMinor: "50000",
            label: "Newly recognized interest",
          },
        ],
        dueAllocations: [
          {
            installmentId: detail.installments[0]!.installmentId,
            amountMinor: "500000",
          },
        ],
        unappliedContractualMinor: "0",
        dueAllocationConfirmed: true,
        confirmationSource: "provider",
        confirmationNote: "Principal and interest confirmed",
        description: "Blueprint payment",
      });
      const d = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      expect(d.finance.liquidMinor).toBe("3691500");
      expect(d.finance.spending).toMatchObject({
        grossMinor: "1308500",
        netMinor: "1308500",
        offsetsMinor: "0",
      });
      expect(BigInt(d.finance.liquidMinor) - 2450000n).toBe(1241500n);
      expect(
        d.finance.debts.find((x) => x.debtId === loan.debtId),
      ).toMatchObject({ liabilityMinor: "0", scheduledMinor: "0" });
    }));
  it("keeps principal and internal transfers out of spending; includes negative and archived cash", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const other = await openFinancialAccountInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        name: "Archived savings",
        accountType: "savings",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "5000",
      });
      await recordIncomeInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-02",
        amountMinor: "10000",
        incomeClass: "earned",
        description: "Income",
      });
      await recordExpenseInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-03",
        purchaseMinor: "500",
        splits: [{ amountMinor: "200" }, { amountMinor: "300" }],
        description: "Purchase and fee",
      });
      await recordTransferInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        sourceAccountId: f.accountId,
        destinationAccountId: other.accountId,
        effectiveDate: "2026-10-04",
        destinationPrincipalMinor: "2000",
        fees: [
          {
            amountMinor: "10",
            label: "Transfer fee",
            treatment: "source_additional",
            bearingAccountId: f.accountId,
          },
        ],
        description: "Internal transfer",
      });
      const debt = await getDebtDetailInTransaction(tx(c), {
        ...actor,
        debtId: f.debtId,
      });
      await recordDebtPaymentInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        debtId: f.debtId,
        payingAccountId: f.accountId,
        paymentDate: "2026-10-08",
        scheduleVersionId: debt.debt.scheduleVersionId!,
        expectedFinancialRevision: debt.financialRevision,
        actualPaidMinor: "410",
        contractualMinor: "400",
        externalFeeMinor: "10",
        allocationCertainty: "confirmed_total",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "unclassified",
            amountMinor: "400",
            label: "Confirmed liability",
          },
        ],
        dueAllocations: [
          { installmentId: f.installmentId, amountMinor: "400" },
        ],
        unappliedContractualMinor: "0",
        dueAllocationConfirmed: true,
        confirmationSource: "provider",
        confirmationNote: "Explicit due confirmation",
        description: "Debt payment",
      });
      await c.query(
        "UPDATE finance.financial_account SET archived_at=clock_timestamp(),version=version+1 WHERE workspace_id=$1 AND id=$2",
        [f.workspaceId, other.accountId],
      );
      const d = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      expect(d.finance).toMatchObject({
        liquidMinor: "14080",
        liabilitiesMinor: "600",
        trackedNetMinor: "13480",
        scheduledMinor: "600",
        clearingMinor: "0",
        spending: { grossMinor: "520", offsetsMinor: "0", netMinor: "520" },
      });
      expect(d.finance.accounts.some((a) => a.archived)).toBe(true);
      const drill = await getSpendingDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query: { startDate: period.startDate, endDate: period.endDate },
      });
      expect(drill.summary).toEqual(d.finance.spending);
      expect(
        drill.items.reduce((total, p) => total + BigInt(p.amountMinor), 0n),
      ).toBe(520n);
      expect(d.coverage.incompleteLiabilities).toBe(true);
    }));
  it("uses signed correction evidence and actual-period refunds without duplicate activity", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const purchase = await recordExpenseInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-02",
        purchaseMinor: "1000",
        splits: [{ amountMinor: "1000" }],
        description: "Original purchase",
        acknowledgeNegativeBalance: true,
      });
      const corrected = await correctFinancialActionInTransaction(tx(c), {
        ...actor,
        actionId: purchase.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: purchase.actionRevisionId,
        expectedFinancialRevision: purchase.financialRevision,
        reason: "Correct receipt",
        replacement: {
          actionKind: "expense",
          fundingAccountId: f.accountId,
          effectiveDate: "2026-10-03",
          purchaseMinor: "800",
          splits: [{ amountMinor: "300" }, { amountMinor: "500" }],
          description: "Corrected purchase",
          acknowledgeNegativeBalance: true,
        },
      });
      const evidence = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: corrected.actionId,
      });
      const source = evidence.refundSources[0]!;
      await recordRefundInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        purchaseActionId: purchase.actionId,
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-09",
        allocations: [
          {
            originalPurchasePostingId: source.postingId,
            allocationKind: "purchase",
            amountMinor: "100",
          },
        ],
        description: "Actual later refund",
        acknowledgeNegativeBalance: true,
      });
      const d = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      expect(d.finance.spending).toMatchObject({
        grossMinor: "800",
        offsetsMinor: "100",
        netMinor: "700",
      });
      expect(d.finance.liquidMinor).toBe("-700");
      expect(
        d.activity.filter((a) => a.key === purchase.actionId),
      ).toHaveLength(1);
      expect(
        d.activity.find((a) => a.key === purchase.actionId)?.detail,
      ).toContain("revision 2");
      const originalDate = await getSpendingDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query: { startDate: "2026-10-02", endDate: "2026-10-02" },
      });
      expect(originalDate.summary.netMinor).toBe("0");
      const refundDay = await getSpendingDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query: { startDate: "2026-10-09", endDate: "2026-10-09" },
      });
      expect(refundDay.summary).toMatchObject({
        grossMinor: "0",
        offsetsMinor: "100",
        netMinor: "-100",
      });
    }));
  it("shows clearing and missing due schedules as unknown, never cash", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId },
        debt = await getDebtDetailInTransaction(tx(c), {
          userId: f.userId,
          workspaceId: f.workspaceId,
          debtId: f.debtId,
        });
      await recordDebtPaymentInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        debtId: f.debtId,
        payingAccountId: f.accountId,
        paymentDate: "2026-10-08",
        scheduleVersionId: debt.debt.scheduleVersionId!,
        expectedFinancialRevision: debt.financialRevision,
        actualPaidMinor: "100",
        contractualMinor: "100",
        externalFeeMinor: "0",
        allocationCertainty: "unresolved",
        components: [
          { disposition: "clearing", amountMinor: "100", label: "Unresolved" },
        ],
        dueAllocations: [],
        unappliedContractualMinor: "100",
        dueAllocationConfirmed: true,
        confirmationSource: "user",
        confirmationNote: "No supplied dues",
        description: "Unresolved payment",
        acknowledgeNegativeBalance: true,
      });
      const d = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      expect(d.finance).toMatchObject({
        liquidMinor: "-100",
        clearingMinor: "100",
        liabilitiesMinor: "1000",
        trackedNetMinor: "-1100",
        spending: { netMinor: "0" },
      });
      expect(d.coverage.unknownSchedules).toBe(1);
      expect(d.attention.some((a) => a.key.startsWith("clearing:"))).toBe(true);
    }, true));
  it("invalidates a verified comparison after a backdated financial write", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const account = await readAccountBalanceAt(tx(c), {
        workspaceId: f.workspaceId,
        financialAccountId: f.accountId,
        cutoffDate: "2026-10-07",
      });
      await reconcileAccountInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        financialAccountId: f.accountId,
        cutoffDate: "2026-10-07",
        observedMinor: "0",
        expectedFinancialRevision: account.financialRevision,
        expectedAccountVersion: account.version,
      });
      const before = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      expect(
        before.attention.some((a) => a.key.startsWith("reconciliation:")),
      ).toBe(false);
      await recordIncomeInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-03",
        amountMinor: "100",
        incomeClass: "earned",
        description: "Backdated income",
      });
      const after = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      expect(
        after.attention.find((a) => a.key.startsWith("reconciliation:"))?.title,
      ).toContain("needs review");
    }));
  it("counts events separately from active applications and projects mixed source links", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId },
        base = await getDashboardInTransaction(tx(c), {
          ...actor,
          query: period,
        });
      const app = await createJobApplicationInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        companyName: "Dashboard company",
        roleTitle: "Engineer",
        appliedDate: base.today,
        initialStage: "applied",
        initialStageEffectiveDate: base.today,
      });
      for (const kind of [
        "interview",
        "interview",
        "assessment",
        "follow_up",
      ] as const)
        await createApplicationEventInTransaction(tx(c), {
          ...actor,
          clientCommandId: randomUUID(),
          applicationId: app.applicationId,
          eventKind: kind,
          title: `Dashboard ${kind}`,
          temporalKind: "date",
          eventDate: addCalendarDays(base.today, 1),
          expectedApplicationVersion: 1,
          setAsNextAction: false,
        });
      await createPersonalEventInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        title: "Mixed personal event",
        temporalKind: "date",
        eventDate: base.today,
      });
      const d = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: { ...period, source: "career" },
      });
      expect(d.career).toMatchObject({
        activeCount: 1,
        interviews: 2,
        assessments: 1,
        followUps: 1,
      });
      expect(d.agenda.items.every((i) => i.displayModule === "career")).toBe(
        true,
      );
      expect(
        Object.values(d.agenda.sourceRoutes).every(
          (h) => h === `/career/applications/${app.applicationId}`,
        ),
      ).toBe(true);
      const all = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      expect(all.agenda.items.some((i) => i.displayModule === "time")).toBe(
        true,
      );
      expect(all.activity.some((a) => a.title === "Mixed personal event")).toBe(
        true,
      );
    }));
  it("does not expose a foreign workspace even when its identifier is known", () =>
    withFixture(async (c, f) => {
      await scoped(c, { userId: randomUUID(), workspaceId: f.workspaceId });
      await expect(
        getDashboardInTransaction(tx(c), {
          userId: randomUUID(),
          workspaceId: f.workspaceId,
          query: period,
        }),
      ).rejects.toThrow("Workspace unavailable");
      await scoped(c, f);
      await expect(
        getDashboardInTransaction(tx(c), {
          userId: f.userId,
          workspaceId: randomUUID(),
          query: period,
        }),
      ).rejects.toThrow("Workspace unavailable");
    }));
  it("paginates posting contributions without overlap while retaining the full-period summary", () =>
    withFixture(async (c, f) => {
      await recordExpenseInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        purchaseMinor: "101",
        splits: Array.from({ length: 101 }, () => ({ amountMinor: "1" })),
        description: "Many splits",
        acknowledgeNegativeBalance: true,
      });
      const query = { startDate: "2026-10-08", endDate: "2026-10-08" };
      const first = await getSpendingDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query,
      });
      expect(first.items).toHaveLength(100);
      expect(first.summary.netMinor).toBe("101");
      expect(first.nextCursor).not.toBeNull();
      const second = await getSpendingDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query: { ...query, after: first.nextCursor! },
      });
      expect(second.items).toHaveLength(1);
      expect(second.summary).toEqual(first.summary);
      expect(
        first.items.some((p) => p.postingId === second.items[0]!.postingId),
      ).toBe(false);
      expect(second.nextCursor).toBeNull();
    }));
  it("uses workspace-local half-open UTC boundaries for timed Career events", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      await c.query(
        "UPDATE core.workspace SET timezone='America/New_York',version=version+1 WHERE id=$1",
        [f.workspaceId],
      );
      const base = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      const local = (d: string) =>
        new TZDate(
          Number(d.slice(0, 4)),
          Number(d.slice(5, 7)) - 1,
          Number(d.slice(8, 10)),
          "America/New_York",
        );
      const start = local(base.today).getTime(),
        end = local(addCalendarDays(base.horizon, 1)).getTime();
      const app = await createJobApplicationInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        companyName: "Timezone boundary",
        roleTitle: "Engineer",
        initialStage: "saved",
        initialStageEffectiveDate: base.today,
      });
      for (const instant of [start - 1, start, end - 1, end])
        await createApplicationEventInTransaction(tx(c), {
          ...actor,
          clientCommandId: randomUUID(),
          applicationId: app.applicationId,
          eventKind: "interview",
          title: `Boundary ${instant}`,
          temporalKind: "timed",
          startsAt: new Date(instant).toISOString(),
          timezone: "America/New_York",
          expectedApplicationVersion: 1,
          setAsNextAction: false,
        });
      const d = await getDashboardInTransaction(tx(c), {
        ...actor,
        query: period,
      });
      expect(d.career.interviews).toBe(2);
      expect(d.career.activeCount).toBe(0);
      expect(d.career.savedCount).toBe(1);
    }));
});
