import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ScopedTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";
import {
  settleDebtBodySchema,
  SettlementPreviewStaleError,
  type SettlementBody,
} from "@/modules/finance/domain/debt-settlement";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import {
  getSettlementSetupInTransaction,
  previewDebtSettlementInTransaction,
  settleDebtInTransaction,
} from "@/modules/finance/services/settle-debt";
import * as writes from "@/modules/finance/repositories/financial-write-repository";
import { getDebtDetailInTransaction } from "@/modules/finance/services/read-debts";
import {
  withFixture,
  fixture,
  payment,
  schedule,
  finalizeSchedule,
  type DebtFixture,
} from "./helpers/debt-payment-fixture";
import { importExistingDebtInTransaction } from "@/modules/finance/services/import-existing-debt";
import { reviseDebtScheduleInTransaction } from "@/modules/finance/services/revise-debt-schedule";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  removeProvisionedTestUser,
  type ProvisionedTestUser,
} from "./helpers/provisioned-test-user";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { FinancialAccountReferenceUnavailableError } from "@/modules/finance/domain/financial-reference";
import { scoped, action, post, finish } from "./helpers/debt-payment-fixture";
import * as settlementRepo from "@/modules/finance/repositories/debt-settlement-repository";
import { getFinancialReportInTransaction } from "@/modules/reporting/services/get-reports";
import {
  getReminderInTransaction,
  mutateReminderInTransaction,
} from "@/modules/time/services/reminders";
const report = (c: PoolClient, f: DebtFixture) =>
  getFinancialReportInTransaction(tx(c), {
    workspaceId: f.workspaceId,
    query: { period: "custom", startDate: "2026-10-01", endDate: "2026-10-31" },
  });
const foreignRoots: ProvisionedTestUser[] = [];
afterAll(async () => {
  for (const root of foreignRoots)
    await removeProvisionedTestUser(root, "d10-settlement-isolation-cleanup");
  await closeRuntimeDatabasePools();
});
const tx = (c: PoolClient) =>
  ({ db: drizzle({ client: c }) }) as ScopedTransaction;
const scope = (f: DebtFixture) => ({
  userId: f.userId,
  workspaceId: f.workspaceId,
  debtId: f.debtId,
});
async function command(c: PoolClient, f: DebtFixture): Promise<SettlementBody> {
  const s = await getSettlementSetupInTransaction(tx(c), scope(f));
  const payoff = s.detail.debt.recognizedLiabilityMinor;
  let available = BigInt(payoff);
  const due = s.detail.installments.flatMap((i) => {
    const amount =
      available < BigInt(i.remainingMinor)
        ? available
        : BigInt(i.remainingMinor);
    available -= amount;
    return amount > 0n
      ? [{ installmentId: i.installmentId, amountMinor: amount.toString() }]
      : [];
  });
  return settleDebtBodySchema.parse({
    clientCommandId: randomUUID(),
    debtId: f.debtId,
    expectedDebtVersion: s.detail.debt.version,
    expectedScheduleVersionId: s.detail.debt.scheduleVersionId,
    expectedFinancialRevision: s.detail.financialRevision,
    settlementDate: "2026-10-08",
    settlementKind: "early",
    payingAccountId: BigInt(payoff) > 0n ? f.accountId : null,
    actualCashPaidMinor: payoff,
    confirmedPayoffMinor: payoff,
    externalFeeMinor: "0",
    externalFeeLabel: "External settlement fee",
    externalFeeCategoryId: null,
    liabilityPayments: Object.entries(
      s.detail.debt.recognizedLiabilityComponents,
    ).flatMap(([kind, amountMinor]) =>
      BigInt(amountMinor) > 0n ? [{ kind, amountMinor }] : [],
    ),
    adjustments: [],
    dueAllocations: due,
    unappliedContractualMinor: available.toString(),
    poolMappings: s.pools.flatMap((p) =>
      p.currentTargets.map((target) => ({
        paymentRevisionId: p.paymentRevisionId,
        sourceAllocationId: p.sourceAllocationId,
        targetObligationId: target.obligationId,
        amountMinor: target.amountMinor,
      })),
    ),
    unappliedResolutionNote:
      "Provider accepts all contractual pools as final payoff",
    allocationConfirmed: true,
    confirmationSource: "provider",
    confirmationNote: "Provider payoff confirmed",
    acknowledgeNegativeBalance: true,
    providerReference: "PAYOFF",
    reason: "Provider-confirmed early settlement",
  });
}
const save = (c: PoolClient, f: DebtFixture, b: SettlementBody) =>
  settleDebtInTransaction(tx(c), { ...scope(f), ...b });
const detail = (c: PoolClient, f: DebtFixture) =>
  getDebtDetailInTransaction(tx(c), scope(f));
async function amounts(c: PoolClient, f: DebtFixture) {
  const r = await c.query(
    `SELECT COALESCE(sum(amount_minor) FILTER(WHERE ledger_account_id=$2),0)::text cash,COALESCE(sum(amount_minor) FILTER(WHERE ledger_account_id=$3),0)::text liability,COALESCE(sum(amount_minor) FILTER(WHERE expense_class='gross'),0)::text spending,COALESCE(sum(amount_minor) FILTER(WHERE expense_class='waiver_offset'),0)::text offsets FROM finance.posting WHERE workspace_id=$1`,
    [f.workspaceId, f.cashId, f.liabilityId],
  );
  return r.rows[0];
}
async function prepare(
  c: PoolClient,
  f: DebtFixture,
  principal = "600000",
  contractual = "640000",
) {
  const r = await importExistingDebtInTransaction(tx(c), {
    userId: f.userId,
    workspaceId: f.workspaceId,
    clientCommandId: randomUUID(),
    name: "Settlement test",
    lenderName: "Provider",
    debtType: "personal_loan",
    startDate: "2026-01-01",
    openingCutoffDate: "2026-09-30",
    openingLiabilityMinor: principal,
    openingComponents: [{ kind: "principal", amountMinor: principal }],
    installments: [{ dueDate: "2026-10-20", contractualMinor: contractual }],
    scheduleReason: "Provider terms",
  });
  const d = await getDebtDetailInTransaction(tx(c), {
    userId: f.userId,
    workspaceId: f.workspaceId,
    debtId: r.debtId,
  });
  const row = (
    await c.query(
      `SELECT liability_ledger_account_id FROM finance.debt WHERE id=$1`,
      [r.debtId],
    )
  ).rows[0];
  return {
    ...f,
    debtId: r.debtId,
    liabilityId: row.liability_ledger_account_id,
    scheduleId: r.scheduleVersionId,
    installmentId: d.installments[0]!.installmentId,
    obligationId: d.installments[0]!.obligationId,
  };
}
async function charge(
  c: PoolClient,
  f: DebtFixture,
  amountMinor = "40000",
  kind: "interest" | "fee" | "penalty" = "interest",
) {
  const s = await getSettlementSetupInTransaction(tx(c), scope(f));
  const r = await reviseDebtScheduleInTransaction(tx(c), {
    userId: f.userId,
    workspaceId: f.workspaceId,
    debtId: f.debtId,
    clientCommandId: randomUUID(),
    expectedDebtVersion: s.detail.debt.version,
    expectedScheduleVersionId: s.detail.debt.scheduleVersionId!,
    expectedFinancialRevision: s.detail.financialRevision,
    effectiveDate: "2026-10-08",
    revisionKind: "renegotiation",
    reason: "Provider confirms recognized charge",
    frequency: s.frequency,
    entries: s.detail.installments.map((i) => ({
      entryKey: i.obligationId,
      obligationId: i.obligationId,
      dueDate: i.dueDate,
      contractualMinor: i.contractualMinor,
      knownPrincipalMinor: i.knownPrincipalMinor,
      knownInterestMinor: i.knownInterestMinor,
      knownFeeMinor: i.knownFeeMinor,
      breakdownComplete: i.breakdownComplete,
      disposition: i.disposition,
      cancellationReason: i.cancellationReason,
      notes: i.notes,
    })),
    mappings: s.pools.flatMap((p) =>
      p.currentTargets.map((target) => ({
        paymentRevisionId: p.paymentRevisionId,
        sourceAllocationId: p.sourceAllocationId,
        targetEntryKey: target.obligationId,
        amountMinor: target.amountMinor,
      })),
    ),
    allocationMappingConfirmed: true,
    recognizedCharge: {
      kind,
      amountMinor,
      categoryId: null,
      explanation: "Provider-confirmed recognized charge",
      providerConfirmed: true,
    },
  });
  return (
    await c.query(
      `SELECT p.id FROM finance.posting p JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id WHERE ar.action_id=$1 AND p.expense_class='gross'`,
      [r.chargeActionId],
    )
  ).rows[0].id as string;
}
describe("D10 explicit settlement", () => {
  it("settles a full payoff with exactly one cash action, no principal expense and no future Agenda", () =>
    withFixture(async (c, f) => {
      const before = await amounts(c, f);
      const target = {
        sourceKind: "debt_installment" as const,
        sourceId: f.obligationId,
      };
      const reminder = await getReminderInTransaction(
        tx(c),
        f.workspaceId,
        target,
      );
      await mutateReminderInTransaction(
        tx(c),
        { userId: f.userId, workspaceId: f.workspaceId },
        {
          target,
          expectedSnapshot: reminder.snapshot,
          clientCommandId: randomUUID(),
          action: { kind: "dismiss", ruleKey: "0:09:00" },
        },
      );
      const b = await command(c, f);
      const p = await previewDebtSettlementInTransaction(tx(c), {
        ...scope(f),
        ...b,
      });
      expect(p.residualMinor).toBe("0");
      const r = await save(c, f, b);
      expect(r.lifecycle).toBe("settled_early");
      const after = await amounts(c, f);
      expect(BigInt(before.cash) - BigInt(after.cash)).toBe(1000n);
      expect(after.liability).toBe("0");
      expect(after.spending).toBe("0");
      const d = await detail(c, f);
      expect(d.debt.recognizedLiabilityMinor).toBe("0");
      expect(d.installments[0]).toMatchObject({
        openingSatisfiedMinor: "0",
        paymentSatisfiedMinor: "1000",
        remainingMinor: "0",
        obligationId: f.obligationId,
      });
      expect(d.payments).toHaveLength(1);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      const closedReminder = await getReminderInTransaction(
        tx(c),
        f.workspaceId,
        target,
      );
      expect(closedReminder.eligible).toBe(false);
      expect(closedReminder.history[0]?.state).toBe("cancelled");
      expect(
        (
          await c.query(
            `SELECT * FROM time.agenda_v WHERE source_kind='debt_installment'`,
          )
        ).rows,
      ).toHaveLength(0);
    }));
  it("preserves partial historical payment and original immutable schedule", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const original = (
        await c.query(
          `SELECT row_to_json(i) data FROM finance.scheduled_installment i WHERE id=$1`,
          [f.installmentId],
        )
      ).rows;
      await save(c, f, await command(c, f));
      expect((await detail(c, f)).installments[0]?.paymentSatisfiedMinor).toBe(
        "1000",
      );
      expect((await detail(c, f)).payments).toHaveLength(2);
      expect(
        (
          await c.query(
            `SELECT row_to_json(i) data FROM finance.scheduled_installment i WHERE id=$1`,
            [f.installmentId],
          )
        ).rows,
      ).toEqual(original);
      expect(
        (
          await c.query(
            `SELECT count(*)::int n FROM finance.debt_schedule_version WHERE debt_id=$1`,
            [f.debtId],
          )
        ).rows[0].n,
      ).toBe(2);
    }));
  it("recognizes newly confirmed interest once and excludes external fee from due satisfaction", () =>
    withFixture(async (c, f) => {
      const s = await schedule(c, f, {
        previousId: f.scheduleId,
        version: 2,
        total: "1100",
      });
      await finalizeSchedule(c, f, s.scheduleId);
      const b = await command(c, f);
      b.actualCashPaidMinor = "1110";
      b.confirmedPayoffMinor = "1100";
      b.externalFeeMinor = "10";
      b.liabilityPayments.push({ kind: "interest", amountMinor: "100" });
      b.adjustments.push({
        kind: "recognized_charge",
        liabilityComponent: "interest",
        amountMinor: "100",
        recognizedSourcePostingId: null,
        unknownOpening: false,
        categoryId: null,
        explanation: "Provider confirms final interest",
        providerConfirmed: true,
        roundingTreatment: null,
      });
      b.dueAllocations = [
        { installmentId: s.installmentId, amountMinor: "1100" },
      ];
      b.unappliedContractualMinor = "0";
      const before = await amounts(c, f);
      await save(c, f, b);
      const after = await amounts(c, f);
      expect(BigInt(before.cash) - BigInt(after.cash)).toBe(1110n);
      expect(after.spending).toBe("110");
      expect((await report(c, f)).metrics).toMatchObject({
        interest: "100",
        fees: "10",
        debt_charges: "110",
        net: "110",
        cash_out: "1110",
        debt_payments: "1110",
        waivers: "0",
      });
      expect((await detail(c, f)).installments[0]?.paymentSatisfiedMinor).toBe(
        "1100",
      );
    }));
  it("records avoided future charge as metadata, preserves partial satisfaction on cancelled remainder", () =>
    withFixture(async (c, f) => {
      const s = await schedule(c, f, {
        previousId: f.scheduleId,
        version: 2,
        total: "1400",
      });
      await finalizeSchedule(c, f, s.scheduleId);
      const b = await command(c, f);
      b.adjustments.push({
        kind: "avoided_future_charge",
        liabilityComponent: null,
        amountMinor: "400",
        recognizedSourcePostingId: null,
        unknownOpening: false,
        categoryId: null,
        explanation: "Future interest avoided by payoff",
        providerConfirmed: true,
        roundingTreatment: null,
      });
      const r = await save(c, f, b);
      expect((await amounts(c, f)).offsets).toBe("0");
      expect((await report(c, f)).metrics).toMatchObject({
        gross: "0",
        offsets: "0",
        net: "0",
        waivers: "0",
        cash_out: "1000",
        closing_liability: "0",
      });
      expect((await detail(c, f)).installments[0]).toMatchObject({
        contractualMinor: "1400",
        paymentSatisfiedMinor: "1000",
        openingSatisfiedMinor: "0",
        remainingMinor: "0",
        disposition: "cancelled",
      });
      expect(
        (
          await c.query(
            `SELECT effect_posting_id FROM finance.settlement_component WHERE settlement_id=$1`,
            [r.settlementId],
          )
        ).rows[0].effect_posting_id,
      ).toBeNull();
    }));
  it("supports no supplied due dates through explicit final-payoff disposition", () =>
    withFixture(async (c, f) => {
      const other = await fixture(
        c,
        { userId: f.userId, workspaceId: f.workspaceId },
        true,
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const b = await command(c, other);
      const r = await save(c, other, b);
      const d = await detail(c, other);
      expect(d.installments).toHaveLength(0);
      expect(d.debt.unappliedContractualMinor).toBe("0");
      expect(d.payments[0]?.unappliedContractualMinor).toBe("1000");
      expect(
        (
          await c.query(
            `SELECT resolved_unapplied_minor::text amount FROM finance.debt_settlement WHERE id=$1`,
            [r.settlementId],
          )
        ).rows[0].amount,
      ).toBe("1000");
    }));
  it("discloses imported unknown waiver through adjustment equity, never an expense reversal", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      b.actualCashPaidMinor = "600";
      b.confirmedPayoffMinor = "600";
      b.liabilityPayments = [{ kind: "unclassified", amountMinor: "600" }];
      b.dueAllocations = [
        { installmentId: f.installmentId, amountMinor: "600" },
      ];
      b.adjustments = [
        {
          kind: "recognized_waiver",
          liabilityComponent: "unclassified",
          amountMinor: "400",
          recognizedSourcePostingId: null,
          unknownOpening: true,
          categoryId: null,
          explanation: "Confirmed waiver of imported unclassified opening debt",
          providerConfirmed: true,
          roundingTreatment: null,
        },
      ];
      await save(c, f, b);
      expect((await amounts(c, f)).offsets).toBe("0");
      expect((await amounts(c, f)).liability).toBe("0");
    }));
  it("supports zero-cash waiver with no payment and no cash deduction", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      b.actualCashPaidMinor = "0";
      b.confirmedPayoffMinor = "0";
      b.payingAccountId = null;
      b.liabilityPayments = [];
      b.dueAllocations = [];
      b.adjustments = [
        {
          kind: "recognized_waiver",
          liabilityComponent: "unclassified",
          amountMinor: "1000",
          recognizedSourcePostingId: null,
          unknownOpening: true,
          categoryId: null,
          explanation: "Provider waives imported liability",
          providerConfirmed: true,
          roundingTreatment: null,
        },
      ];
      const before = await amounts(c, f);
      const r = await save(c, f, b);
      expect(r.paymentId).toBeNull();
      expect((await amounts(c, f)).cash).toBe(before.cash);
      expect((await detail(c, f)).payments).toHaveLength(0);
    }));
  it("rejects unresolved clearing", () =>
    withFixture(async (c, f) => {
      await payment(c, f, {
        components: [
          { disposition: "clearing", amount: "400", ledgerId: f.clearingId },
        ],
        certainty: "unresolved",
      });
      const b = await command(c, f);
      await expect(save(c, f, b)).rejects.toThrow("clearing");
    }));
  it("rejects residual liability and unjustified rounding", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      b.confirmedPayoffMinor = "999";
      b.actualCashPaidMinor = "999";
      b.liabilityPayments[0]!.amountMinor = "999";
      b.dueAllocations[0]!.amountMinor = "999";
      await expect(save(c, f, b)).rejects.toThrow("zero residual");
      expect(
        settleDebtBodySchema.safeParse({
          ...b,
          adjustments: [{ kind: "rounding_correction", amountMinor: "1" }],
        }).success,
      ).toBe(false);
    }));
  it("replays before stale state and rejects changed payload", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      const before = await amounts(c, f);
      const r = await save(c, f, b);
      expect(await save(c, f, b)).toEqual(r);
      expect(BigInt(before.cash) - BigInt((await amounts(c, f)).cash)).toBe(
        1000n,
      );
      await expect(
        save(c, f, { ...b, reason: "Changed reason" }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
    }));
  it("rejects stale debt version and financial snapshot", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      await expect(
        save(c, f, { ...b, expectedDebtVersion: b.expectedDebtVersion + 1 }),
      ).rejects.toBeInstanceOf(SettlementPreviewStaleError);
      await expect(
        save(c, f, {
          ...b,
          clientCommandId: randomUUID(),
          expectedFinancialRevision: "99",
        }),
      ).rejects.toBeInstanceOf(SettlementPreviewStaleError);
    }));
  it("rolls back late failure including cash, receipt, schedule and closure; retries safely", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      const before = await amounts(c, f);
      await c.query("SAVEPOINT settlement_failure");
      const mock = vi
        .spyOn(writes, "enforceDeferredFinancialConstraints")
        .mockRejectedValueOnce(new Error("Late failure"));
      try {
        await expect(save(c, f, b)).rejects.toThrow("Late failure");
      } finally {
        mock.mockRestore();
        await c.query("ROLLBACK TO SAVEPOINT settlement_failure");
      }
      expect(await amounts(c, f)).toEqual(before);
      expect((await detail(c, f)).debt.lifecycle).toBe("active");
      expect(
        (await c.query(`SELECT * FROM finance.debt_settlement`)).rows,
      ).toHaveLength(0);
      await save(c, f, b);
      expect((await detail(c, f)).debt.lifecycle).toBe("settled_early");
    }));

  it("canonical 6,400 recognized, 6,000 paid and 400 recognized waiver posts the eligible offset once", () =>
    withFixture(async (c, f) => {
      const loan = await prepare(c, f);
      const source = await charge(c, loan);
      const b = await command(c, loan);
      b.confirmedPayoffMinor = "600000";
      b.actualCashPaidMinor = "600000";
      b.liabilityPayments = [{ kind: "principal", amountMinor: "600000" }];
      b.dueAllocations[0]!.amountMinor = "600000";
      b.adjustments = [
        {
          kind: "recognized_waiver",
          liabilityComponent: "interest",
          amountMinor: "40000",
          recognizedSourcePostingId: source,
          roundingTreatment: null,
          unknownOpening: false,
          categoryId: null,
          explanation: "Provider waives recognized interest",
          providerConfirmed: true,
        },
      ];
      const before = await amounts(c, loan);
      const r = await save(c, loan, b);
      const after = await amounts(c, loan);
      expect(BigInt(before.cash) - BigInt(after.cash)).toBe(600000n);
      expect(after.liability).toBe("0");
      expect(after.spending).toBe("40000");
      expect(after.offsets).toBe("-40000");
      const canonical = await report(c, loan);
      expect(canonical.metrics).toMatchObject({
        gross: "40000",
        offsets: "40000",
        net: "0",
        interest: "40000",
        waivers: "40000",
        cash_out: "600000",
        principal: "600000",
      });
      expect(canonical.identities).toEqual({
        cashMatches: true,
        liabilityMatches: true,
      });
      expect((await detail(c, loan)).debt.recognizedLiabilityMinor).toBe("0");
      expect(await save(c, loan, b)).toEqual(r);
      expect((await amounts(c, loan)).offsets).toBe("-40000");
    }));
  it("canonical scheduled 6,400 but only 6,000 recognized records avoided 400 without expense reversal", () =>
    withFixture(async (c, f) => {
      const loan = await prepare(c, f);
      const b = await command(c, loan);
      b.adjustments = [
        {
          kind: "avoided_future_charge",
          liabilityComponent: null,
          amountMinor: "40000",
          recognizedSourcePostingId: null,
          roundingTreatment: null,
          unknownOpening: false,
          categoryId: null,
          explanation: "Unrecognized future charge avoided",
          providerConfirmed: true,
        },
      ];
      await save(c, loan, b);
      const a = await amounts(c, loan);
      expect(a.spending).toBe("0");
      expect(a.offsets).toBe("0");
      expect(a.liability).toBe("0");
    }));
  it("does not expense already recognized interest again; external fee stays separate", () =>
    withFixture(async (c, f) => {
      const loan = await prepare(c, f, "100000", "110000");
      await charge(c, loan, "10000");
      const b = await command(c, loan);
      b.externalFeeMinor = "1000";
      b.actualCashPaidMinor = "111000";
      const before = await amounts(c, loan);
      await save(c, loan, b);
      const after = await amounts(c, loan);
      expect(BigInt(before.cash) - BigInt(after.cash)).toBe(111000n);
      expect(after.spending).toBe("11000");
      expect(
        (await detail(c, loan)).installments[0]?.paymentSatisfiedMinor,
      ).toBe("110000");
    }));
  it.each(["fee", "penalty"] as const)(
    "recognizes a new settlement %s once",
    (kind) =>
      withFixture(async (c, f) => {
        const b = await command(c, f);
        b.confirmedPayoffMinor = "1100";
        b.actualCashPaidMinor = "1100";
        b.liabilityPayments.push({ kind, amountMinor: "100" });
        b.adjustments = [
          {
            kind: "recognized_charge",
            liabilityComponent: kind,
            amountMinor: "100",
            recognizedSourcePostingId: null,
            roundingTreatment: null,
            unknownOpening: false,
            categoryId: null,
            explanation: "Provider confirms final charge",
            providerConfirmed: true,
          },
        ];
        b.unappliedContractualMinor = "100";
        await save(c, f, b);
        expect((await amounts(c, f)).spending).toBe("100");
        if (kind === "fee")
          expect(
            (await c.query(`SELECT treatment FROM finance.fee_component`))
              .rows[0].treatment,
          ).toBe("capitalized");
      }),
  );
  it("records an explicit provider-confirmed rounding waiver without a residual plug", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      b.actualCashPaidMinor = "999";
      b.confirmedPayoffMinor = "999";
      b.liabilityPayments[0]!.amountMinor = "999";
      b.dueAllocations[0]!.amountMinor = "999";
      b.adjustments = [
        {
          kind: "rounding_correction",
          roundingTreatment: "recognized_waiver",
          liabilityComponent: "unclassified",
          amountMinor: "1",
          recognizedSourcePostingId: null,
          unknownOpening: true,
          categoryId: null,
          explanation:
            "Provider explicitly waives one minor unit of imported debt",
          providerConfirmed: true,
        },
      ];
      await save(c, f, b);
      expect((await amounts(c, f)).liability).toBe("0");
      expect((await amounts(c, f)).offsets).toBe("0");
    }));
  it("closes a fully paid debt normally without another cash payment or zero-value journal", () =>
    withFixture(async (c, f) => {
      await payment(c, f, { contractual: "1000" });
      const b = await command(c, f);
      b.settlementKind = "normal";
      const before = await amounts(c, f);
      const r = await save(c, f, b);
      expect(r.lifecycle).toBe("settled");
      expect(r.paymentId).toBeNull();
      expect(await amounts(c, f)).toEqual(before);
      expect(
        (
          await c.query(
            `SELECT * FROM finance.journal WHERE action_revision_id=$1`,
            [r.actionRevisionId],
          )
        ).rows,
      ).toHaveLength(0);
      expect((await detail(c, f)).installments[0]?.disposition).toBe(
        "scheduled",
      );
    }));
  it("maps historical unapplied payment and final payoff without supplied dates", () =>
    withFixture(async (c, f) => {
      const other = await fixture(
        c,
        { userId: f.userId, workspaceId: f.workspaceId },
        true,
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      await payment(c, other, { due: "0", unapplied: "400" });
      const b = await command(c, other);
      expect(b.poolMappings[0]?.sourceAllocationId).toBeNull();
      await save(c, other, b);
      const d = await detail(c, other);
      expect(d.debt.unappliedContractualMinor).toBe("0");
      expect(d.payments).toHaveLength(2);
      expect(
        (
          await c.query(
            `SELECT resolved_unapplied_minor::text amount FROM finance.debt_settlement WHERE debt_id=$1`,
            [other.debtId],
          )
        ).rows[0].amount,
      ).toBe("1000");
    }));
  it("rejects missing pool mapping and missing final-payoff explanation", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const b = await command(c, f);
      await expect(save(c, f, { ...b, poolMappings: [] })).rejects.toThrow(
        "every original",
      );
      const empty = await fixture(
        c,
        { userId: f.userId, workspaceId: f.workspaceId },
        true,
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      await expect(
        save(c, empty, {
          ...(await command(c, empty)),
          unappliedResolutionNote: null,
        }),
      ).rejects.toThrow("Explicitly confirm");
    }));
  it("preserves opening satisfaction separately in the closing version", () =>
    withFixture(async (c, f) => {
      const other = await fixture(
        c,
        { userId: f.userId, workspaceId: f.workspaceId },
        false,
        "100",
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      await save(c, other, await command(c, other));
      expect((await detail(c, other)).installments[0]).toMatchObject({
        openingSatisfiedMinor: "100",
        paymentSatisfiedMinor: "900",
        remainingMinor: "0",
      });
    }));
  it("rejects real foreign-owner debt, account, waiver source and mapping references", () =>
    withFixture(async (c, f) => {
      const userId = randomUUID();
      await getAuthPool().query(
        `INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,'Foreign settlement owner',$2,true)`,
        [userId, `d10-${userId}@example.test`],
      );
      const root = await provisionPersonalWorkspace({
        userId,
        displayName: "Foreign settlement owner",
      });
      const identity = { userId, workspaceId: root.workspaceId };
      foreignRoots.push(identity);
      await scoped(c, identity);
      const other = await fixture(c, identity);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const source = await charge(c, other, "100");
      const current = await detail(c, other);
      await payment(c, {
        ...other,
        scheduleId: current.debt.scheduleVersionId!,
        installmentId: current.installments[0]!.installmentId,
      });
      const foreignCommand = await command(c, other);
      await scoped(c, { userId: f.userId, workspaceId: f.workspaceId });
      const b = await command(c, f);
      await expect(
        save(c, f, { ...foreignCommand, clientCommandId: randomUUID() }),
      ).rejects.toBeInstanceOf(DebtUnavailableError);
      await expect(
        save(c, f, {
          ...b,
          clientCommandId: randomUUID(),
          payingAccountId: other.accountId,
        }),
      ).rejects.toBeInstanceOf(FinancialAccountReferenceUnavailableError);
      await expect(
        save(c, f, {
          ...b,
          clientCommandId: randomUUID(),
          poolMappings: foreignCommand.poolMappings,
        }),
      ).rejects.toThrow("source pool");
      const waiver = {
        ...b,
        clientCommandId: randomUUID(),
        actualCashPaidMinor: "900",
        confirmedPayoffMinor: "900",
        liabilityPayments: [
          { kind: "unclassified" as const, amountMinor: "900" },
        ],
        dueAllocations: [
          { installmentId: f.installmentId, amountMinor: "900" },
        ],
        adjustments: [
          {
            kind: "recognized_waiver" as const,
            liabilityComponent: "unclassified" as const,
            amountMinor: "100",
            recognizedSourcePostingId: source,
            unknownOpening: false,
            roundingTreatment: null,
            categoryId: null,
            explanation: "Foreign charge",
            providerConfirmed: true as const,
          },
        ],
      };
      await expect(save(c, f, waiver)).rejects.toThrow(
        "unavailable or ineligible",
      );
      expect(
        await settlementRepo.readDebtSettlement(tx(c), {
          workspaceId: f.workspaceId,
          debtId: other.debtId,
        }),
      ).toBeNull();
    }));
  it("database rejects settlement action with no typed settlement evidence", () =>
    withFixture(async (c, f) => {
      const a = await action(c, f, "debt_settlement");
      await post(c, f, a, {
        ledgerId: f.liabilityId,
        amount: "1000",
        component: "unclassified",
        line: 1,
      });
      await post(c, f, a, {
        ledgerId: f.cashId,
        amount: "-1000",
        flow: "debt_payment",
        line: 2,
      });
      await finish(c, f, a);
      await expect(
        c.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({ code: "23514" });
    }));
  it("database rolls back duplicated cash and unexplained debit even if journal balances", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      await c.query("SAVEPOINT corrupt_settlement");
      const original = settlementRepo.insertSettlement;
      const mock = vi
        .spyOn(settlementRepo, "insertSettlement")
        .mockImplementationOnce(async (t, input) => {
          const ids = await original(t, input);
          const ar = {
            actionId: ids.actionId,
            revisionId: ids.actionRevisionId,
            journalId: ids.journalId!,
            receiptId: input.receiptId,
            revisionNo: 1,
          };
          await post(c, f, ar, {
            ledgerId: f.cashId,
            amount: "-1",
            flow: "debt_payment",
            line: 99,
          });
          await post(c, f, ar, {
            ledgerId: f.expenseId,
            amount: "1",
            expense: "gross",
            line: 100,
          });
          return ids;
        });
      try {
        await expect(save(c, f, b)).rejects.toMatchObject({
          cause: expect.objectContaining({ code: "23514" }),
        });
      } finally {
        mock.mockRestore();
        await c.query("ROLLBACK TO SAVEPOINT corrupt_settlement");
      }
      expect((await detail(c, f)).debt.lifecycle).toBe("active");
      expect(
        (await c.query(`SELECT * FROM finance.debt_settlement`)).rows,
      ).toHaveLength(0);
    }));
  it("immutable settlement evidence cannot be amended or deleted by the runtime role", () =>
    withFixture(async (c, f) => {
      const r = await save(c, f, await command(c, f));
      for (const sql of [
        `UPDATE finance.debt_settlement SET reason='Changed' WHERE id='${r.settlementId}'`,
        `DELETE FROM finance.debt_settlement WHERE id='${r.settlementId}'`,
      ]) {
        await c.query("SAVEPOINT immutable_settlement");
        await expect(c.query(sql)).rejects.toMatchObject({ code: "42501" });
        await c.query("ROLLBACK TO SAVEPOINT immutable_settlement");
      }
      expect(
        await settlementRepo.readDebtSettlement(tx(c), {
          workspaceId: f.workspaceId,
          debtId: f.debtId,
        }),
      ).not.toBeNull();
    }));
  it("records provider-confirmed avoided metadata without inventing supplied dates", () =>
    withFixture(async (c, f) => {
      const loan = await fixture(
        c,
        { userId: f.userId, workspaceId: f.workspaceId },
        true,
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const b = await command(c, loan);
      b.adjustments = [
        {
          kind: "avoided_future_charge",
          liabilityComponent: null,
          amountMinor: "400",
          recognizedSourcePostingId: null,
          unknownOpening: false,
          roundingTreatment: null,
          categoryId: null,
          explanation:
            "Provider confirms avoided future charge; dates were never supplied",
          providerConfirmed: true,
        },
      ];
      const r = await save(c, loan, b);
      expect((await detail(c, loan)).installments).toHaveLength(0);
      expect(
        await settlementRepo.readDebtSettlement(tx(c), {
          workspaceId: loan.workspaceId,
          debtId: loan.debtId,
        }),
      ).toMatchObject({
        components: [
          {
            kind: "avoided_future_charge",
            effectPostingId: null,
            amountMinor: "400",
          },
        ],
      });
      expect(r.lifecycle).toBe("settled_early");
    }));

  it("database requires affirmative provider evidence in the immutable intent", () =>
    withFixture(async (c, f) => {
      const b = await command(c, f);
      b.actualCashPaidMinor = "600";
      b.confirmedPayoffMinor = "600";
      b.liabilityPayments = [{ kind: "unclassified", amountMinor: "600" }];
      b.dueAllocations = [
        { installmentId: f.installmentId, amountMinor: "600" },
      ];
      b.adjustments = [
        {
          kind: "recognized_waiver",
          liabilityComponent: "unclassified",
          amountMinor: "400",
          recognizedSourcePostingId: null,
          unknownOpening: true,
          roundingTreatment: null,
          categoryId: null,
          explanation: "Provider waives imported liability",
          providerConfirmed: true,
        },
      ];
      await c.query("SAVEPOINT unconfirmed_intent");
      const original = writes.createPrivateFinancialRevision;
      const mock = vi
        .spyOn(writes, "createPrivateFinancialRevision")
        .mockImplementationOnce((t, input) =>
          original(t, {
            ...input,
            afterJson: {
              ...input.afterJson,
              adjustments: [{ ...b.adjustments[0]!, providerConfirmed: false }],
            },
          }),
        );
      try {
        await expect(save(c, f, b)).rejects.toMatchObject({
          cause: expect.objectContaining({ code: "23514" }),
        });
      } finally {
        mock.mockRestore();
        await c.query("ROLLBACK TO SAVEPOINT unconfirmed_intent");
      }
      expect((await detail(c, f)).debt.lifecycle).toBe("active");
    }));
  it("database rejects a missing final-payoff note rather than accepting a NULL check", () =>
    withFixture(async (c, f) => {
      const loan = await fixture(
        c,
        { userId: f.userId, workspaceId: f.workspaceId },
        true,
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const b = await command(c, loan);
      await c.query("SAVEPOINT missing_resolution");
      const original = settlementRepo.insertSettlement;
      const mock = vi
        .spyOn(settlementRepo, "insertSettlement")
        .mockImplementationOnce((t, input) =>
          original(t, {
            ...input,
            body: { ...input.body, unappliedResolutionNote: null },
          }),
        );
      try {
        await expect(save(c, loan, b)).rejects.toMatchObject({
          cause: expect.objectContaining({ code: "23514" }),
        });
      } finally {
        mock.mockRestore();
        await c.query("ROLLBACK TO SAVEPOINT missing_resolution");
      }
      expect((await detail(c, loan)).debt.lifecycle).toBe("active");
    }));
});
