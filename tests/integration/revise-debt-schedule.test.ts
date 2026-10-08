import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ScopedTransaction } from "@/platform/db";
import { parseCalendarDate } from "@/shared/calendar-date";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  removeProvisionedTestUser,
  type ProvisionedTestUser,
} from "./helpers/provisioned-test-user";
import { listDebtSchedulesInTransaction } from "@/modules/finance/services/read-debt-schedules";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import {
  reviseDebtScheduleBodySchema,
  SchedulePreviewStaleError,
  type RevisionBody,
  type ScheduleRevisionSetup,
} from "@/modules/finance/domain/debt-schedule-revision";
import {
  readScheduleContext,
  readSchedulePaymentPools,
} from "@/modules/finance/repositories/debt-schedule-repository";
import { reviseDebtScheduleInTransaction } from "@/modules/finance/services/revise-debt-schedule";
import {
  DebtUnavailableError,
  getDebtDetailInTransaction,
} from "@/modules/finance/services/read-debts";
import * as writes from "@/modules/finance/repositories/financial-write-repository";
import {
  withFixture,
  fixture,
  payment,
  schedule,
  finalizeSchedule,
  scoped,
  type DebtFixture,
} from "./helpers/debt-payment-fixture";
const foreignRoots: ProvisionedTestUser[] = [];
afterAll(async () => {
  for (const user of foreignRoots)
    await removeProvisionedTestUser(user, "d9-schedule-isolation-cleanup");
  await closeRuntimeDatabasePools();
});
const tx = (c: PoolClient) =>
  ({ db: drizzle({ client: c }) }) as ScopedTransaction;
const scope = (f: DebtFixture) => ({
  userId: f.userId,
  workspaceId: f.workspaceId,
  debtId: f.debtId,
});
async function setup(
  c: PoolClient,
  f: DebtFixture,
): Promise<ScheduleRevisionSetup> {
  const detail = await getDebtDetailInTransaction(tx(c), scope(f));
  const input = {
    workspaceId: f.workspaceId,
    debtId: f.debtId,
    scheduleVersionId: detail.debt.scheduleVersionId!,
  };
  const header = await readScheduleContext(tx(c), input);
  return {
    detail,
    frequency: header.frequency,
    pools: await readSchedulePaymentPools(tx(c), input),
  };
}
function command(s: ScheduleRevisionSetup): RevisionBody {
  const entries = s.detail.installments.map((i) => ({
    entryKey: randomUUID(),
    obligationId: i.obligationId,
    dueDate: "2026-11-20",
    contractualMinor: i.contractualMinor,
    knownPrincipalMinor: i.knownPrincipalMinor,
    knownInterestMinor: i.knownInterestMinor,
    knownFeeMinor: i.knownFeeMinor,
    breakdownComplete: i.breakdownComplete,
    disposition: i.disposition,
    cancellationReason: i.cancellationReason,
    notes: i.notes,
  }));
  return reviseDebtScheduleBodySchema.parse({
    clientCommandId: randomUUID(),
    debtId: s.detail.debt.debtId,
    expectedDebtVersion: s.detail.debt.version,
    expectedScheduleVersionId: s.detail.debt.scheduleVersionId,
    expectedFinancialRevision: s.detail.financialRevision,
    effectiveDate: "2026-10-08",
    revisionKind: "date_correction",
    reason: "Provider corrected the due date",
    frequency: s.frequency,
    entries,
    mappings: s.pools.flatMap((p) =>
      p.currentTargets.map((target) => ({
        paymentRevisionId: p.paymentRevisionId,
        sourceAllocationId: p.sourceAllocationId,
        targetEntryKey: target.obligationId
          ? entries.find((e) => e.obligationId === target.obligationId)!
              .entryKey
          : null,
        amountMinor: target.amountMinor,
      })),
    ),
    allocationMappingConfirmed: true,
  });
}
const save = (c: PoolClient, f: DebtFixture, body: RevisionBody) =>
  reviseDebtScheduleInTransaction(tx(c), { ...scope(f), ...body });
describe("D9 debt schedule revisions", () => {
  it("preserves opening cutoff evidence separately from subsequent payments", () =>
    withFixture(async (c, f) => {
      const historical = await fixture(
        c,
        { userId: f.userId, workspaceId: f.workspaceId },
        false,
        "100",
      );
      await payment(c, historical);
      await save(c, historical, command(await setup(c, historical)));
      expect((await setup(c, historical)).detail.installments[0]).toMatchObject(
        {
          openingSatisfiedMinor: "100",
          paymentSatisfiedMinor: "400",
          remainingMinor: "500",
        },
      );
    }));
  it("combines current direct and older mapped allocations exactly once", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      await save(c, f, command(await setup(c, f)));
      const current = await setup(c, f);
      await payment(
        c,
        {
          ...f,
          scheduleId: current.detail.debt.scheduleVersionId!,
          installmentId: current.detail.installments[0]!.installmentId,
        },
        { contractual: "200" },
      );
      expect(
        (await setup(c, f)).detail.installments[0]!.paymentSatisfiedMinor,
      ).toBe("600");
      await save(c, f, command(await setup(c, f)));
      const after = await setup(c, f);
      expect(after.pools).toHaveLength(2);
      expect(after.detail.installments[0]).toMatchObject({
        paymentSatisfiedMinor: "600",
        remainingMinor: "400",
      });
    }));
  it("rejects real foreign-owner debt, obligation, schedule and allocation sources", () =>
    withFixture(async (c, f) => {
      const userId = randomUUID();
      await getAuthPool().query(
        `INSERT INTO auth."user"(id,name,email,email_verified) VALUES ($1,'Foreign revision owner',$2,true)`,
        [userId, `d9-${userId}@example.test`],
      );
      const root = await provisionPersonalWorkspace({
        userId,
        displayName: "Foreign revision owner",
      });
      const foreign = { userId, workspaceId: root.workspaceId };
      foreignRoots.push(foreign);
      await scoped(c, foreign);
      const other = await fixture(c, foreign);
      await payment(c, other);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const foreignPool = (await setup(c, other)).pools[0]!;
      await scoped(c, f);
      const b = command(await setup(c, f));
      await expect(
        save(c, f, {
          ...b,
          clientCommandId: randomUUID(),
          debtId: other.debtId,
        }),
      ).rejects.toBeInstanceOf(DebtUnavailableError);
      await expect(
        save(c, f, {
          ...b,
          clientCommandId: randomUUID(),
          expectedScheduleVersionId: other.scheduleId,
        }),
      ).rejects.toBeInstanceOf(SchedulePreviewStaleError);
      await expect(
        save(c, f, {
          ...b,
          clientCommandId: randomUUID(),
          entries: [{ ...b.entries[0]!, obligationId: other.obligationId }],
        }),
      ).rejects.toThrow("obligation is unavailable");
      await expect(
        save(c, f, {
          ...b,
          clientCommandId: randomUUID(),
          mappings: [
            {
              paymentRevisionId: foreignPool.paymentRevisionId,
              sourceAllocationId: foreignPool.sourceAllocationId,
              targetEntryKey: b.entries[0]!.entryKey,
              amountMinor: "400",
            },
          ],
        }),
      ).rejects.toThrow("payment source is unavailable");
      await expect(
        listDebtSchedulesInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          debtId: other.debtId,
        }),
      ).rejects.toBeInstanceOf(DebtUnavailableError);
    }));
  it("pages immutable schedule history with owned cursors and original maps", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      for (let i = 0; i < 11; i++) await save(c, f, command(await setup(c, f)));
      const first = await listDebtSchedulesInTransaction(tx(c), scope(f));
      expect(first.items).toHaveLength(10);
      expect(first.items[0]).toMatchObject({ versionNo: 12, current: true });
      const next = await listDebtSchedulesInTransaction(tx(c), {
        ...scope(f),
        after: first.nextCursor!,
      });
      expect(next.items.map((i) => i.versionNo)).toEqual([2, 1]);
      expect(next.items[0]!.mappings[0]!.amountMinor).toBe("400");
      expect(next.items[1]!.entries[0]!.dueDate).toBe("2026-10-20");
      const foreignCursor = await listDebtSchedulesInTransaction(tx(c), {
        ...scope(f),
        after: randomUUID(),
      });
      expect(foreignCursor.items).toEqual([]);
    }));
  it("corrects dates atomically without postings and updates stable Agenda identity/generation", () =>
    withFixture(async (c, f) => {
      const before = await c.query(
        "SELECT count(*)::int AS n FROM finance.posting",
      );
      const s = await setup(c, f);
      const result = await save(c, f, command(s));
      const after = await setup(c, f);
      expect(after.detail.installments[0]).toMatchObject({
        obligationId: f.obligationId,
        dueDate: "2026-11-20",
        openingSatisfiedMinor: "0",
        remainingMinor: "1000",
      });
      expect(after.detail.debt.recognizedLiabilityMinor).toBe("1000");
      expect(result.debtVersion).toBe(s.detail.debt.version + 1);
      expect(
        (await c.query("SELECT count(*)::int AS n FROM finance.posting")).rows,
      ).toEqual(before.rows);
      const agenda = await c.query(
        "SELECT source_id,source_version,notification_generation,event_date::text FROM time.agenda_v WHERE source_id=$1",
        [f.obligationId],
      );
      expect(agenda.rows[0]).toMatchObject({
        source_id: f.obligationId,
        source_version: result.debtVersion,
        notification_generation: 2,
        event_date: "2026-11-20",
      });
      const audit = await c.query(
        "SELECT before_json,after_json FROM audit.private_revision WHERE subject_id=$1",
        [result.scheduleVersionId],
      );
      expect(audit.rows[0].before_json.entries[0].dueDate).toBe("2026-10-20");
      expect(audit.rows[0].after_json.preview.entries[0].dueDate).toBe(
        "2026-11-20",
      );
    }));
  it("carries partially paid obligations through multiple revisions without a second cash deduction", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const original = await c.query(
        "SELECT * FROM finance.payment_due_allocation",
      );
      const cash = await c.query(
        "SELECT sum(amount_minor)::text AS amount FROM finance.posting WHERE ledger_account_id=$1",
        [f.cashId],
      );
      await save(c, f, command(await setup(c, f)));
      await save(c, f, command(await setup(c, f)));
      const s = await setup(c, f);
      expect(s.detail.installments[0]).toMatchObject({
        paymentSatisfiedMinor: "400",
        openingSatisfiedMinor: "0",
        remainingMinor: "600",
      });
      expect(
        (await c.query("SELECT * FROM finance.payment_due_allocation")).rows,
      ).toEqual(original.rows);
      expect(
        (
          await c.query(
            "SELECT sum(amount_minor)::text AS amount FROM finance.posting WHERE ledger_account_id=$1",
            [f.cashId],
          )
        ).rows,
      ).toEqual(cash.rows);
      expect(s.pools).toHaveLength(1);
      expect(s.pools[0]!.currentTargets[0]!.amountMinor).toBe("400");
    }));
  it("fully paid obligations remain absent from Agenda", () =>
    withFixture(async (c, f) => {
      await payment(c, f, { contractual: "1000" });
      await save(c, f, command(await setup(c, f)));
      expect((await setup(c, f)).detail.installments[0]!.remainingMinor).toBe(
        "0",
      );
      expect(
        (
          await c.query(
            "SELECT source_id FROM time.agenda_v WHERE source_id=$1",
            [f.obligationId],
          )
        ).rowCount,
      ).toBe(0);
    }));
  it("renegotiates future amounts without recognizing scheduled future interest", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const b = command(await setup(c, f));
      b.revisionKind = "renegotiation";
      b.entries[0]!.contractualMinor = "1200";
      await save(c, f, b);
      const s = await setup(c, f);
      expect(s.detail.debt.recognizedLiabilityMinor).toBe("600");
      expect(s.detail.installments[0]!.remainingMinor).toBe("800");
    }));
  it("genuine replacement creates a new identity and preserves original allocations", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const b = command(await setup(c, f));
      b.revisionKind = "renegotiation";
      b.entries[0]!.obligationId = null;
      b.entries[0]!.replacesObligationId = f.obligationId;
      b.entries[0]!.contractualMinor = "1200";
      await save(c, f, b);
      const s = await setup(c, f);
      expect(s.detail.installments[0]!.obligationId).not.toBe(f.obligationId);
      expect(s.detail.installments[0]!.remainingMinor).toBe("800");
      expect(
        (
          await c.query(
            "SELECT installment_id FROM finance.payment_due_allocation",
          )
        ).rows[0].installment_id,
      ).toBe(f.installmentId);
    }));
  it("maps an unapplied payment into newly supplied dates", () =>
    withFixture(async (c, f) => {
      await payment(c, f, { unapplied: "400" });
      const b = command(await setup(c, f));
      b.revisionKind = "renegotiation";
      b.entries = [
        {
          entryKey: randomUUID(),
          obligationId: null,
          replacesObligationId: null,
          dueDate: parseCalendarDate("2026-12-01"),
          contractualMinor: "1000",
          knownPrincipalMinor: null,
          knownInterestMinor: null,
          knownFeeMinor: null,
          breakdownComplete: false,
          disposition: "scheduled",
          cancellationReason: null,
          notes: null,
        },
      ];
      b.mappings[0]!.targetEntryKey = b.entries[0]!.entryKey;
      await save(c, f, b);
      const s = await setup(c, f);
      expect(s.detail.installments[0]!.remainingMinor).toBe("600");
      expect(s.detail.debt.unappliedContractualMinor).toBe("0");
    }, true));
  it("allocation correction explicitly moves excess into the unapplied pool", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const b = command(await setup(c, f));
      b.revisionKind = "allocation_correction";
      b.entries[0]!.dueDate = parseCalendarDate("2026-10-20");
      b.mappings = [
        { ...b.mappings[0]!, amountMinor: "100" },
        { ...b.mappings[0]!, amountMinor: "300", targetEntryKey: null },
      ];
      await save(c, f, b);
      const s = await setup(c, f);
      expect(s.detail.installments[0]!.remainingMinor).toBe("900");
      expect(s.detail.debt.unappliedContractualMinor).toBe("300");
    }));
  it.each(["missing", "excess", "foreign-source", "duplicate-target"])(
    "rejects %s mapping",
    (mode) =>
      withFixture(async (c, f) => {
        await payment(c, f);
        const b = command(await setup(c, f));
        if (mode === "missing") b.mappings = [];
        if (mode === "excess") b.mappings[0]!.amountMinor = "401";
        if (mode === "foreign-source")
          b.mappings[0]!.paymentRevisionId = randomUUID();
        if (mode === "duplicate-target") b.mappings.push({ ...b.mappings[0]! });
        await expect(async () => save(c, f, b)).rejects.toThrow();
      }),
  );
  it("rejects date corrections that silently change allocation", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const b = command(await setup(c, f));
      b.mappings[0]!.targetEntryKey = null;
      await expect(save(c, f, b)).rejects.toThrow("preserve each payment");
    }));
  it("rejects stale debt version and stale payment snapshots", () =>
    withFixture(async (c, f) => {
      const b = command(await setup(c, f));
      await save(c, f, b);
      await expect(
        save(c, f, { ...b, clientCommandId: randomUUID() }),
      ).rejects.toBeInstanceOf(SchedulePreviewStaleError);
      const fresh = command(await setup(c, f));
      fresh.expectedFinancialRevision = "999";
      await expect(save(c, f, fresh)).rejects.toBeInstanceOf(
        SchedulePreviewStaleError,
      );
    }));
  it("same-command replay survives later revisions and changed-payload conflicts", () =>
    withFixture(async (c, f) => {
      const b = command(await setup(c, f));
      const result = await save(c, f, b);
      await save(c, f, command(await setup(c, f)));
      expect(await save(c, f, b)).toEqual(result);
      await expect(
        save(c, f, { ...b, reason: "Different intent" }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
    }));
  it("finalized previous headers, entries and mappings are immutable", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const first = await save(c, f, command(await setup(c, f)));
      await save(c, f, command(await setup(c, f)));
      for (const [table, column, id] of [
        ["debt_schedule_version", "id", f.scheduleId],
        ["scheduled_installment", "id", f.installmentId],
        [
          "schedule_allocation_map",
          "target_schedule_version_id",
          first.scheduleVersionId,
        ],
      ]) {
        await c.query("SAVEPOINT immutable");
        await expect(
          c.query(
            `UPDATE finance.${table} SET ${column}=${column} WHERE ${column}=$1`,
            [id],
          ),
        ).rejects.toThrow();
        await c.query("ROLLBACK TO SAVEPOINT immutable");
      }
    }));
  it("rejects same-owner foreign debt/obligation/payment references", () =>
    withFixture(async (c, f) => {
      const other = await fixture(c, {
        userId: f.userId,
        workspaceId: f.workspaceId,
      });
      await payment(c, other);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const b = command(await setup(c, f));
      b.entries[0]!.obligationId = other.obligationId;
      await expect(save(c, f, b)).rejects.toThrow("obligation is unavailable");
      await expect(
        save(c, f, {
          ...b,
          debtId: randomUUID(),
          clientCommandId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(DebtUnavailableError);
      const before = await c.query(
        "SELECT * FROM finance.debt_schedule_version",
      );
      await scoped(c, { userId: randomUUID(), workspaceId: randomUUID() });
      expect(
        (await c.query("SELECT * FROM finance.debt_schedule_version")).rows,
      ).toHaveLength(0);
      await scoped(c, f);
      expect(
        (await c.query("SELECT * FROM finance.debt_schedule_version")).rows,
      ).toEqual(before.rows);
    }));
  it.each(["interest", "fee", "penalty"] as const)(
    "recognizes confirmed %s exactly once as a separate noncash action",
    (kind) =>
      withFixture(async (c, f) => {
        const b = command(await setup(c, f));
        b.revisionKind = "renegotiation";
        b.entries[0]!.contractualMinor = "1100";
        b.recognizedCharge = {
          kind,
          amountMinor: "100",
          categoryId: null,
          explanation: "Provider charge now recognized",
          providerConfirmed: true,
        };
        const result = await save(c, f, b);
        expect(result.chargeActionId).not.toBeNull();
        expect(await save(c, f, b)).toEqual(result);
        const s = await setup(c, f);
        expect(s.detail.debt.recognizedLiabilityMinor).toBe("1100");
        expect(
          (
            await c.query(
              "SELECT sum(amount_minor)::text AS amount FROM finance.posting WHERE ledger_account_id=$1",
              [f.cashId],
            )
          ).rows[0].amount,
        ).toBeNull();
        expect(
          (
            await c.query(
              "SELECT sum(p.amount_minor)::text AS amount FROM finance.posting p JOIN finance.ledger_account l ON l.id=p.ledger_account_id WHERE l.kind='expense'",
            )
          ).rows[0].amount,
        ).toBe("100");
      }),
  );
  it("late failure rolls back the pointer, schedule, mappings, charge, audit and receipt", () =>
    withFixture(async (c, f) => {
      await payment(c, f);
      const b = command(await setup(c, f));
      b.revisionKind = "renegotiation";
      b.recognizedCharge = {
        kind: "interest",
        amountMinor: "100",
        categoryId: null,
        explanation: "Confirmed",
        providerConfirmed: true,
      };
      const before = await setup(c, f);
      await c.query("SAVEPOINT failure");
      const spy = vi
        .spyOn(writes, "enforceDeferredFinancialConstraints")
        .mockRejectedValueOnce(new Error("Injected final failure"));
      try {
        await expect(save(c, f, b)).rejects.toThrow("Injected");
      } finally {
        spy.mockRestore();
      }
      await c.query("ROLLBACK TO SAVEPOINT failure");
      expect(await setup(c, f)).toEqual(before);
      expect(
        (
          await c.query(
            "SELECT count(*)::int AS n FROM finance.action_revision WHERE action_kind='debt_charge'",
          )
        ).rows[0].n,
      ).toBe(0);
      await save(c, f, b);
    }));
  it("database rejects term changes disguised as date corrections", () =>
    withFixture(async (c, f) => {
      const s = await schedule(c, f, {
        previousId: f.scheduleId,
        version: 2,
        total: "1200",
        kind: "date_correction",
      });
      await finalizeSchedule(c, f, s.scheduleId);
      await expect(c.query("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toThrow(
        "preserve contractual terms",
      );
    }));
});
