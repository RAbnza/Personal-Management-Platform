import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { ScopedTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools } from "@/platform/db/pools";
import {
  getFinancialReportInTransaction,
  getFinancialDetailInTransaction,
  getCareerReportInTransaction,
} from "@/modules/reporting/services/get-reports";
import { financialMetrics } from "@/modules/reporting/domain/reports";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import { recordExpenseInTransaction } from "@/modules/finance/services/record-expense";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
import { recordTransferInTransaction } from "@/modules/finance/services/record-transfer";
import { recordDebtPaymentInTransaction } from "@/modules/finance/services/record-debt-payment";
import { getDebtDetailInTransaction } from "@/modules/finance/services/read-debts";
import { importExistingDebtInTransaction } from "@/modules/finance/services/import-existing-debt";
import {
  correctFinancialActionInTransaction,
  getFinancialActionDetailInTransaction,
} from "@/modules/finance/services/correct-financial-action";
import { recordRefundInTransaction } from "@/modules/finance/services/record-refund";
import { adjustAccountBalanceInTransaction } from "@/modules/finance/services/reconcile-account";
import {
  prepareCsvSnapshotInTransaction,
  recordExportProvenanceInTransaction,
  serializeCsv,
} from "@/modules/reporting/services/export-csv";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { transitionJobApplicationStageInTransaction } from "@/modules/career/services/transition-job-application-stage";
import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { recordCareerObservationInTransaction } from "@/modules/career/services/record-career-observation";
import { resolvePaymentClearingInTransaction } from "@/modules/finance/services/resolve-payment-clearing";
import { mutateApplicationEventInTransaction } from "@/modules/career/services/mutate-application-event";
import { parse } from "csv-parse/sync";
import {
  withFixture,
  scoped,
  action,
  ledger,
  finish,
} from "./helpers/debt-payment-fixture";
const tx = (c: PoolClient) =>
  ({ db: drizzle({ client: c }) }) as ScopedTransaction;
const query = {
  period: "custom" as const,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
};
afterAll(closeRuntimeDatabasePools);
describe("V1 reports exact contributions", () => {
  it("reconciles every financial metric drilldown at the immutable posting grain", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const cash = await openFinancialAccountInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        name: "Report cash",
        accountType: "checking",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "2450000",
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
      const purchase = await recordExpenseInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        fundingAccountId: cash.accountId,
        effectiveDate: "2026-10-02",
        purchaseMinor: "1240000",
        splits: [{ amountMinor: "400000" }, { amountMinor: "840000" }],
        description: "Split cash spending",
      });
      for (let index = 0; index < 3; index++) {
        const tagId = randomUUID();
        await c.query(
          "INSERT INTO core.tag(id,workspace_id,name) VALUES($1,$2,$3)",
          [tagId, f.workspaceId, `Tag ${index}`],
        );
        await c.query(
          "INSERT INTO finance.action_tag(workspace_id,action_id,tag_id) VALUES($1,$2,$3)",
          [f.workspaceId, purchase.actionId, tagId],
        );
      }
      const loan = await importExistingDebtInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        name: "Blueprint principal",
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
        scheduleReason: "Confirmed principal and future interest",
      });
      const debt = await getDebtDetailInTransaction(tx(c), {
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
        expectedFinancialRevision: debt.financialRevision,
        actualPaidMinor: "518500",
        contractualMinor: "500000",
        externalFeeMinor: "18500",
        allocationCertainty: "known_components",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "principal",
            amountMinor: "450000",
            label: "Principal",
          },
          {
            disposition: "new_interest",
            amountMinor: "50000",
            label: "New interest",
          },
        ],
        dueAllocations: [
          {
            installmentId: debt.installments[0]!.installmentId,
            amountMinor: "500000",
          },
        ],
        unappliedContractualMinor: "0",
        dueAllocationConfirmed: true,
        confirmationSource: "provider",
        confirmationNote: "Confirmed oldest contractual due",
        description: "Blueprint repayment",
      });
      const r = await getFinancialReportInTransaction(tx(c), {
        ...actor,
        query,
      });
      expect(r.metrics.opening_cash).toBe("2450000");
      expect(r.metrics.closing_cash).toBe("3691500");
      expect(r.metrics.income).toBe("3000000");
      expect(r.metrics).toMatchObject({
        net: "1308500",
        gross: "1308500",
        offsets: "0",
        principal: "450000",
        interest: "50000",
        fees: "18500",
        cash_out: "1758500",
        net_cash_change: "1241500",
        debt_payments: "518500",
        debt_charges: "68500",
      });
      expect(
        r.schedule.find((s) => s.debtId === loan.debtId)?.remainingMinor,
      ).toBe("0");
      expect(
        r.liabilityRecords.find((d) => d.debtId === loan.debtId)?.closingMinor,
      ).toBe("0");
      expect(r.identities).toEqual({
        cashMatches: true,
        liabilityMatches: true,
      });
      for (const metric of Object.keys(
        financialMetrics,
      ) as (keyof typeof financialMetrics)[]) {
        const d = await getFinancialDetailInTransaction(tx(c), {
          ...actor,
          query: { ...query, metric },
        });
        expect(d.amountMinor, metric).toBe(r.metrics[metric]);
        expect(
          d.items
            .reduce((sum, p) => sum + BigInt(p.amountMinor), 0n)
            .toString(),
          metric,
        ).toBe(d.amountMinor);
      }
      const fees = await getFinancialDetailInTransaction(tx(c), {
        ...actor,
        query: { ...query, metric: "cash_out", flowKind: "fee" },
      });
      expect(fees.amountMinor).toBe("18500");
      const category = await getFinancialDetailInTransaction(tx(c), {
        ...actor,
        query: { ...query, metric: "net", categoryId: "uncategorized" },
      });
      expect(category.amountMinor).toBe("1308500");
      const csv = await prepareCsvSnapshotInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        kind: "transactions",
        query,
      });
      expect(
        csv.rows
          .filter((p) => p.expense_class === "gross" && p.charge_kind === "fee")
          .reduce((sum, p) => sum + BigInt(p.amount_minor as string), 0n)
          .toString(),
      ).toBe(r.metrics.fees);
    }));
  it.each([
    ["week", "2026-10-08", "2026-10-05", "2026-10-11"],
    ["month", "2026-09-12", "2026-09-01", "2026-09-30"],
    ["quarter", "2026-09-12", "2026-07-01", "2026-09-30"],
    ["year", "2024-02-29", "2024-01-01", "2024-12-31"],
  ] as const)(
    "uses the shared %s definition for summaries and exports",
    (_kind, anchorDate, start, end) =>
      withFixture(async (c, f) => {
        const report = await getFinancialReportInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          query: { period: _kind, anchorDate },
        });
        expect(report.period).toMatchObject({ startDate: start, endDate: end });
        const snapshot = await prepareCsvSnapshotInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          kind: "report",
          query: { period: _kind, anchorDate },
        });
        expect(snapshot.context.period).toEqual(report.period);
        expect(
          snapshot.rows.find((r) => r.metric === "net")?.amount_minor,
        ).toBe(report.metrics.net);
      }),
  );
  it("keeps backdated category corrections in the original year and a real refund in its later period", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const cash = await openFinancialAccountInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        name: "Correction cash",
        accountType: "checking",
        openingCutoffDate: "2025-12-01",
        openingBalanceMinor: "1000000",
      });
      const categories = [randomUUID(), randomUUID()];
      for (const [i, id] of categories.entries())
        await c.query(
          "INSERT INTO core.category(id,workspace_id,kind,name) VALUES($1,$2,'expense',$3)",
          [id, f.workspaceId, `Expense ${i}`],
        );
      const original = await recordExpenseInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        fundingAccountId: cash.accountId,
        effectiveDate: "2025-12-31",
        purchaseMinor: "10000",
        splits: [{ amountMinor: "10000", categoryId: categories[0] }],
        description: "Original year purchase",
      });
      const correction = await correctFinancialActionInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        actionId: original.actionId,
        expectedActionRevisionId: original.actionRevisionId,
        expectedFinancialRevision: original.financialRevision,
        reason: "Correct receipt and categories",
        replacement: {
          actionKind: "expense",
          fundingAccountId: cash.accountId,
          effectiveDate: "2025-12-31",
          purchaseMinor: "12000",
          splits: [
            { amountMinor: "4000", categoryId: categories[0] },
            { amountMinor: "8000", categoryId: categories[1] },
          ],
          description: "Corrected purchase",
        },
      });
      const source = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: correction.actionId,
      });
      await recordRefundInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        purchaseActionId: original.actionId,
        receivingAccountId: cash.accountId,
        effectiveDate: "2026-01-05",
        allocations: [
          {
            originalPurchasePostingId: source.refundSources[0]!.postingId,
            allocationKind: "purchase",
            amountMinor: "1000",
          },
        ],
        description: "Actual later refund",
      });
      const dec = await getFinancialReportInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          query: { period: "month", anchorDate: "2025-12-15" },
        }),
        jan = await getFinancialReportInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          query: { period: "month", anchorDate: "2026-01-15" },
        });
      expect(dec.metrics).toMatchObject({
        gross: "12000",
        net: "12000",
        fees: "0",
        cash_out: "12000",
        income: "0",
      });
      expect(jan.metrics).toMatchObject({
        gross: "0",
        offsets: "1000",
        net: "-1000",
        cash_refunds: "1000",
        income: "0",
        cash_in: "1000",
      });
      const split = await getFinancialDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query: {
          period: "month",
          anchorDate: "2025-12-15",
          metric: "net",
          categoryId: categories[1],
        },
      });
      expect(split.amountMinor).toBe("8000");
      expect(split.items.every((r) => r.categoryId === categories[1])).toBe(
        true,
      );
      expect(dec.identities.cashMatches && jan.identities.cashMatches).toBe(
        true,
      );
    }));
  it("consolidates internal principal while retaining transfer fee and explicit adjustment equity", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const cash = await openFinancialAccountInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        name: "Transfer source",
        accountType: "checking",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "10000",
      });
      const destination = await openFinancialAccountInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        name: "Destination",
        accountType: "savings",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "0",
      });
      const transfer = await recordTransferInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        sourceAccountId: cash.accountId,
        destinationAccountId: destination.accountId,
        effectiveDate: "2026-10-01",
        destinationPrincipalMinor: "5000",
        fees: [
          {
            amountMinor: "15",
            treatment: "source_additional",
            label: "Transfer fee",
          },
        ],
        description: "Own transfer",
      });
      const correction = await correctFinancialActionInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        actionId: transfer.actionId,
        expectedActionRevisionId: transfer.actionRevisionId,
        expectedFinancialRevision: transfer.financialRevision,
        reason: "Correct provider fee",
        replacement: {
          actionKind: "transfer",
          sourceAccountId: cash.accountId,
          destinationAccountId: destination.accountId,
          effectiveDate: "2026-10-01",
          destinationPrincipalMinor: "5000",
          fees: [
            {
              amountMinor: "20",
              treatment: "source_additional",
              label: "Corrected transfer fee",
            },
          ],
          description: "Own transfer",
        },
      });
      await adjustAccountBalanceInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        financialAccountId: cash.accountId,
        expectedFinancialRevision: correction.financialRevision,
        expectedAccountVersion: 1,
        effectiveDate: "2026-10-02",
        signedAdjustmentMinor: "1000",
        reason: "Explicit unexplained provider difference",
      });
      const r = await getFinancialReportInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query,
      });
      expect(r.metrics).toMatchObject({
        transfers: "5000",
        internal_cash_net: "0",
        cash_out: "20",
        net: "20",
        fees: "20",
        adjustments: "1000",
        closing_cash: "10980",
        income: "0",
      });
      expect(r.identities.cashMatches).toBe(true);
    }));
  it("preserves large exact values across balances, contributions and CSV", () =>
    withFixture(async (c, f) => {
      // Exercise the maximum valid component; CSV unit cases cover aggregate values above JS precision.
      const a = await action(c, f, "income"),
        income = await ledger(c, f.workspaceId, "income");
      await c.query(
        "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,income_class,cash_flow_kind,cash_flow_direction) VALUES($1,$2,$3,$4,$5,'PHP',1,100000000000,'none','income','in'),($1,$2,$3,$4,$6,'PHP',2,-100000000000,'earned','none','none')",
        [
          f.workspaceId,
          a.actionId,
          a.revisionId,
          a.journalId,
          f.cashId,
          income,
        ],
      );
      await c.query(
        "INSERT INTO finance.receipt_detail(workspace_id,action_id,action_revision_id,receiving_account_id,actual_received_minor) VALUES($1,$2,$3,$4,100000000000)",
        [f.workspaceId, a.actionId, a.revisionId, f.accountId],
      );
      await finish(c, f, a);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const r = await getFinancialReportInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query,
      });
      expect(r.metrics.closing_cash).toBe("100000000000");
      expect(r.metrics.income).toBe("100000000000");
      expect(r.metrics.baseline).toBe("0");
      const snapshot = await prepareCsvSnapshotInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        kind: "transactions",
        query,
      });
      const rows = parse(await serializeCsv(snapshot.rows), {
        bom: true,
        columns: true,
      }) as Record<string, string>[];
      expect(rows.some((row) => row.amount_minor === "100000000000")).toBe(
        true,
      );
      expect(rows.some((row) => row.amount_minor === "-100000000000")).toBe(
        true,
      );
    }));
  it("empty submitted cohorts return not-applicable conversion", () =>
    withFixture(async (c, f) => {
      const r = await getCareerReportInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query,
      });
      expect(r.summary.submitted).toBe(0);
      expect(r.summary.responseRate).toBeNull();
    }));
  it("uses submission cohorts, explicit responses and corrected repeated stage visits independently of event counts", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const app = await createJobApplicationInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        companyName: "Cohort company",
        roleTitle: "Engineer",
        sourceName: "Referral",
        initialStage: "applied",
        initialStageEffectiveDate: "2026-10-01",
        appliedDate: "2026-10-01",
      });
      await createJobApplicationInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        companyName: "Saved only",
        roleTitle: "Designer",
        initialStage: "saved",
        initialStageEffectiveDate: "2026-10-01",
      });
      const old = await createJobApplicationInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        companyName: "Prior cohort",
        roleTitle: "Engineer",
        initialStage: "applied",
        initialStageEffectiveDate: "2026-09-01",
        appliedDate: "2026-09-01",
      });
      let version: number = app.version;
      for (const [stage, effectiveDate] of [
        ["interview", "2026-10-02"],
        ["screening", "2026-10-03"],
        ["interview", "2026-10-04"],
        ["offer", "2026-10-07"],
      ] as const) {
        version = (
          await transitionJobApplicationStageInTransaction(tx(c), {
            ...actor,
            applicationId: app.applicationId,
            clientCommandId: randomUUID(),
            expectedVersion: version,
            stage,
            effectiveDate,
          })
        ).version;
      }
      const observation = {
        ...actor,
        applicationId: app.applicationId,
        body: {
          clientCommandId: randomUUID(),
          kind: "response" as const,
          date: "2026-10-06",
          title: "Provider response",
          expectedApplicationVersion: version,
        },
      };
      const result = await recordCareerObservationInTransaction(
        tx(c),
        observation,
      );
      expect(
        await recordCareerObservationInTransaction(tx(c), observation),
      ).toEqual(result);
      await c.query("SAVEPOINT conflict");
      await expect(
        recordCareerObservationInTransaction(tx(c), {
          ...observation,
          body: { ...observation.body, title: "Changed response" },
        }),
      ).rejects.toThrow();
      await c.query("ROLLBACK TO SAVEPOINT conflict");
      for (const applicationId of [app.applicationId, old.applicationId])
        await createApplicationEventInTransaction(tx(c), {
          ...actor,
          applicationId,
          clientCommandId: randomUUID(),
          eventKind: "interview",
          title: "Boundary interview",
          temporalKind: "timed",
          startsAt: "2026-09-30T16:00:00Z",
          timezone: "Asia/Manila",
        });
      const before = await getCareerReportInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          query: { ...query, asOfDate: "2026-10-05" },
        }),
        after = await getCareerReportInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          query: { ...query, asOfDate: "2026-10-08" },
        });
      expect(before.summary).toMatchObject({
        submitted: 1,
        responded: 0,
        interviewed: 1,
        offered: 0,
        interviewEvents: 2,
        responseRate: { numerator: 0, denominator: 1 },
      });
      expect(after.summary).toMatchObject({
        submitted: 1,
        responded: 1,
        offered: 1,
        responseRate: { numerator: 1, denominator: 1 },
      });
      expect(
        after.events.filter((e) => e.kind === "interview").map((e) => e.date),
      ).toEqual(["2026-10-01", "2026-10-01"]);
      expect(after.events.filter((e) => e.inCohort)).toHaveLength(2);
      expect(
        after.stages
          .filter((s) => s.stage === "interview")
          .map((s) => s.elapsedDays),
      ).toEqual([1, 3]);
      expect(after.stages.at(-1)).toMatchObject({
        stage: "offer",
        open: true,
        elapsedDays: 1,
      });
      const snapshot = await prepareCsvSnapshotInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        kind: "applications",
        query: { ...query, asOfDate: "2026-10-08" },
      });
      expect(
        snapshot.rows.filter((r) => r.record_type === "stage_observation"),
      ).toHaveLength(5);
      expect(
        snapshot.rows.some((r) =>
          String(r.event_snapshot_json).includes(result.eventId),
        ),
      ).toBe(true);
      expect(
        snapshot.rows.every((r) => r.application_id === app.applicationId),
      ).toBe(true);
      const counts = await c.query(
        "SELECT count(*)::int AS events FROM career.application_event WHERE id=$1",
        [result.eventId],
      );
      expect(counts.rows[0]).toEqual({ events: 1 });
    }));
  it("exports separate accounting and due evidence, keeps provenance nonfinancial, and rolls back failed preparation", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const snapshot = await prepareCsvSnapshotInTransaction(tx(c), {
        ...actor,
        kind: "debt-schedules",
        query,
      });
      expect(snapshot.rows[0]).toMatchObject({
        contractual_minor: "1000",
        current_remaining_minor: "1000",
      });
      const before = await c.query(
        "SELECT financial_revision::text FROM core.workspace WHERE id=$1",
        [f.workspaceId],
      );
      const exportRunId = randomUUID();
      await c.query("SAVEPOINT provenance");
      await recordExportProvenanceInTransaction(tx(c), {
        ...actor,
        exportRunId,
        snapshot,
      });
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      expect(
        (
          await c.query(
            "SELECT state,row_count::text FROM ops.export_run WHERE id=$1",
            [exportRunId],
          )
        ).rows[0],
      ).toEqual({ state: "completed", row_count: "1" });
      expect(
        (
          await c.query(
            "SELECT financial_revision::text FROM core.workspace WHERE id=$1",
            [f.workspaceId],
          )
        ).rows,
      ).toEqual(before.rows);
      await scoped(c, { userId: randomUUID(), workspaceId: randomUUID() });
      expect(
        (
          await c.query("SELECT id FROM ops.export_run WHERE id=$1", [
            exportRunId,
          ])
        ).rows,
      ).toEqual([]);
      expect((await c.query("SELECT id FROM finance.posting")).rows).toEqual(
        [],
      );
      await scoped(c, f);
      await c.query("ROLLBACK TO SAVEPOINT provenance");
      expect(
        (
          await c.query("SELECT id FROM ops.export_run WHERE id=$1", [
            exportRunId,
          ])
        ).rows,
      ).toEqual([]);
      await expect(
        getFinancialDetailInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          query: { ...query, metric: "closing_cash", ledgerId: randomUUID() },
        }),
      ).rejects.toThrow("Unavailable ledger");
      await expect(
        getFinancialDetailInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          query: { ...query, metric: "net", categoryId: randomUUID() },
        }),
      ).rejects.toThrow("Unavailable category");
      const empty = await prepareCsvSnapshotInTransaction(tx(c), {
        ...actor,
        kind: "debt-payments",
        query,
      });
      expect(empty.rows).toEqual([]);
    }));
  it("reports unresolved clearing and later corrected costs once with no second cash movement", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const revision = (
        await c.query(
          "SELECT financial_revision::text AS v FROM core.workspace WHERE id=$1",
          [f.workspaceId],
        )
      ).rows[0].v;
      const payment = await recordDebtPaymentInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        debtId: f.debtId,
        scheduleVersionId: f.scheduleId,
        expectedFinancialRevision: revision,
        payingAccountId: f.accountId,
        paymentDate: "2026-10-08",
        actualPaidMinor: "200",
        contractualMinor: "200",
        components: [
          {
            disposition: "clearing",
            amountMinor: "200",
            label: "Unknown accounting",
          },
        ],
        dueAllocations: [
          { installmentId: f.installmentId, amountMinor: "200" },
        ],
        unappliedContractualMinor: "0",
        allocationCertainty: "unresolved",
        confirmationSource: "user",
        dueAllocationConfirmed: true,
        acknowledgeNegativeBalance: true,
        description: "Pending debt payment",
      });
      const pending = await getFinancialReportInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query,
      });
      expect(pending.metrics).toMatchObject({
        clearing: "200",
        net: "0",
        cash_out: "200",
        closing_liability: "1000",
      });
      expect(pending.schedule[0]?.remainingMinor).toBe("800");
      const source = (
        await getFinancialActionDetailInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          actionId: payment.actionId,
        })
      ).clearingSources[0]!;
      const resolved = await resolvePaymentClearingInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        expectedFinancialRevision: payment.financialRevision,
        sourceComponentId: source.sourceComponentId,
        effectiveDate: "2026-10-09",
        providerConfirmed: true,
        reason: "Provider accounting confirmation",
        description: "Resolved clearing",
        components: [
          {
            disposition: "liability_reduction",
            amountMinor: "180",
            liabilityComponent: "unclassified",
            label: "Reduction",
          },
          { disposition: "new_interest", amountMinor: "20", label: "Interest" },
        ],
      });
      await correctFinancialActionInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        actionId: resolved.actionId,
        expectedActionRevisionId: resolved.actionRevisionId,
        expectedFinancialRevision: resolved.financialRevision,
        reason: "Correct provider component breakdown",
        replacement: {
          actionKind: "payment_reclassification",
          sourceComponentId: source.sourceComponentId,
          effectiveDate: "2026-10-09",
          providerConfirmed: true,
          description: "Corrected resolution",
          components: [
            {
              disposition: "liability_reduction",
              amountMinor: "190",
              liabilityComponent: "unclassified",
              label: "Reduction",
            },
            { disposition: "new_fee", amountMinor: "10", label: "Fee" },
          ],
        },
      });
      const r = await getFinancialReportInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query,
      });
      expect(r.metrics).toMatchObject({
        clearing: "0",
        net: "10",
        interest: "0",
        fees: "10",
        debt_charges: "10",
        cash_out: "200",
        closing_cash: "-200",
        principal: "0",
        closing_liability: "810",
      });
      expect(r.identities).toEqual({
        cashMatches: true,
        liabilityMatches: true,
      });
      const exported = await prepareCsvSnapshotInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        kind: "debt-payments",
        query,
      });
      expect(exported.rows).toHaveLength(1);
      expect(
        JSON.parse(String(exported.rows[0]!.accounting_components_json))[0],
      ).toMatchObject({ disposition: "clearing", amount_minor: "200" });
      expect(
        JSON.parse(String(exported.rows[0]!.direct_allocations_json))[0],
      ).toMatchObject({ amount_minor: "200" });
    }));
  it("retains cancelled events and superseded stage evidence without counting them as current cohort progress", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const app = await createJobApplicationInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        companyName: "Corrected cohort",
        roleTitle: "Engineer",
        initialStage: "applied",
        initialStageEffectiveDate: "2026-10-01",
        appliedDate: "2026-10-01",
      });
      const stage = await transitionJobApplicationStageInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        applicationId: app.applicationId,
        expectedVersion: app.version,
        stage: "interview",
        effectiveDate: "2026-10-03",
      });
      const id = randomUUID();
      await c.query(
        "INSERT INTO career.application_stage_history(id,workspace_id,application_id,sequence_no,stage,effective_date,effective_order,supersedes_history_id,reason,command_receipt_id,recorded_by_user_id,actor_kind) SELECT $1,workspace_id,application_id,3,'technical_assessment',effective_date,effective_order,id,'Correct original stage',command_receipt_id,recorded_by_user_id,'user' FROM career.application_stage_history WHERE id=$2",
        [id, stage.historyId],
      );
      await c.query(
        "UPDATE career.job_application SET current_history_id=$1,current_stage='technical_assessment' WHERE id=$2",
        [id, app.applicationId],
      );
      const e = await createApplicationEventInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        applicationId: app.applicationId,
        eventKind: "interview",
        title: "Cancelled interview evidence",
        temporalKind: "date",
        eventDate: "2026-10-08",
      });
      await mutateApplicationEventInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        applicationId: app.applicationId,
        eventId: e.eventId,
        expectedEventVersion: e.eventVersion,
        action: "cancel",
        reason: "Provider cancellation",
      });
      const r = await getCareerReportInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        query: { ...query, asOfDate: "2026-10-08" },
      });
      expect(r.summary).toMatchObject({
        submitted: 1,
        interviewed: 0,
        interviewEvents: 0,
        responded: 0,
      });
      expect(r.events[0]).toMatchObject({ status: "cancelled" });
      expect(r.stages.map((s) => s.stage)).toEqual([
        "applied",
        "technical_assessment",
      ]);
      const csv = await prepareCsvSnapshotInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        kind: "applications",
        query,
      });
      expect(
        csv.rows.some(
          (row) => row.source_id === stage.historyId && row.superseded === true,
        ),
      ).toBe(true);
      expect(
        csv.rows.filter((row) => row.record_type === "event_revision"),
      ).toHaveLength(2);
    }));
  it("rejects foreign, stale and future observations and rolls rejected commands back", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const app = await createJobApplicationInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        companyName: "Private response",
        roleTitle: "Engineer",
        initialStage: "saved",
        initialStageEffectiveDate: "2026-10-01",
      });
      for (const change of [
        { applicationId: randomUUID() },
        { expectedApplicationVersion: 999 },
        { date: "9999-01-01" },
      ]) {
        const command = randomUUID();
        await c.query("SAVEPOINT rejected");
        await expect(
          recordCareerObservationInTransaction(tx(c), {
            ...actor,
            applicationId:
              "applicationId" in change
                ? change.applicationId
                : app.applicationId,
            body: {
              clientCommandId: command,
              expectedApplicationVersion:
                "expectedApplicationVersion" in change
                  ? change.expectedApplicationVersion
                  : app.version,
              kind: "response",
              title: "Response",
              date: "date" in change ? change.date : "2026-10-01",
            },
          }),
        ).rejects.toThrow();
        await c.query("ROLLBACK TO SAVEPOINT rejected");
        expect(
          (
            await c.query(
              "SELECT id FROM core.command_receipt WHERE client_command_id=$1",
              [command],
            )
          ).rows,
        ).toEqual([]);
      }
      await scoped(c, { userId: randomUUID(), workspaceId: randomUUID() });
      await expect(
        getCareerReportInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          query,
        }),
      ).rejects.toThrow("Workspace unavailable");
      await expect(
        prepareCsvSnapshotInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          kind: "applications",
          query,
        }),
      ).rejects.toThrow("Workspace unavailable");
      await scoped(c, f);
    }));
});
