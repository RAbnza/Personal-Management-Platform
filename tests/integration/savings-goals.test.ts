import { Client } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { randomUUID } from "node:crypto";
import { afterAll, describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import {
  getAuthPool,
  getDomainPool,
  closeRuntimeDatabasePools,
} from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { listCategories } from "@/modules/core/services/list-categories";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import { recordExpense } from "@/modules/finance/services/record-expense";
import { recordTransfer } from "@/modules/finance/services/record-transfer";
import { recordIncome } from "@/modules/finance/services/record-income";
import {
  reverseFinancialAction,
  getFinancialActionDetail,
  correctFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import { recordSavingsGoalCommand } from "@/modules/planning/services/savings-goals";
import {
  getSavingsGoal,
  listSavingsGoals,
} from "@/modules/planning/services/read-savings-goals";
import { readSavingsEvidence } from "@/modules/planning/repositories/savings-goal-repository";
import {
  SavingsGoalConflictError,
  SavingsGoalUnavailableError,
} from "@/modules/planning/domain/savings-goal";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import { enforceDeferredFinancialConstraints } from "@/modules/finance/repositories/financial-write-repository";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { readDeletionScope } from "@/modules/core/repositories/lifecycle-repository";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import { getFinancialReport } from "@/modules/reporting/services/get-reports";
import { getDashboard } from "@/modules/dashboard/services/get-dashboard";
import { readSavingsGoals } from "@/modules/planning/repositories/savings-goal-repository";
type Owner = { userId: string; workspaceId: string };
const label = "V2-D savings fixture";
async function fixture(run: (o: Owner, other: Owner) => Promise<void>) {
  const owners: Owner[] = [];
  try {
    for (let n = 0; n < 2; n++) {
      const userId = randomUUID();
      await getAuthPool().query(
        'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
        [userId, label, `${userId}@example.test`],
      );
      const w = await provisionPersonalWorkspace({
        userId,
        displayName: label,
      });
      owners.push({ userId, workspaceId: w.workspaceId });
    }
    await run(owners[0]!, owners[1]!);
  } finally {
    for (const o of owners)
      if (
        (
          await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
            o.userId,
          ])
        ).rowCount
      )
        await removeNamedFinancialFixture(o, label);
  }
}
const goalBody = (o: Owner, name = "Emergency") => ({
  ...o,
  operation: "save" as const,
  clientCommandId: randomUUID(),
  goalId: null,
  expectedVersion: null,
  reason: null,
  fields: {
    name,
    targetMinor: "8000",
    targetDate: "2026-12-31",
    notes: "Private goal evidence",
  },
});
const cash = (o: Owner, name = "Cash", amount = "10000", date = "2026-09-30") =>
  openFinancialAccount({
    ...o,
    clientCommandId: randomUUID(),
    name,
    accountType: "checking",
    openingCutoffDate: date,
    openingBalanceMinor: amount,
  });
async function reserve(
  o: Owner,
  goalId: string,
  accountId: string,
  amount: string,
) {
  const d = await getSavingsGoal({ ...o, goalId });
  return recordSavingsGoalCommand({
    ...o,
    operation: "reserve",
    clientCommandId: randomUUID(),
    goalId,
    expectedVersion: d.goal.version,
    expectedFinancialRevision: d.financialRevision,
    financialAccountId: accountId,
    reservedMinor: amount,
    reason: "Explicit allocation review",
  });
}
async function lifecycle(
  o: Owner,
  goalId: string,
  operation: "complete" | "archive" | "reopen",
) {
  const d = await getSavingsGoal({ ...o, goalId });
  return recordSavingsGoalCommand({
    ...o,
    operation,
    clientCommandId: randomUUID(),
    goalId,
    expectedVersion: d.goal.version,
    reason: "Reviewed management milestone",
  });
}
async function counts(o: Owner) {
  return withDomainTransaction(
    o,
    async (t) =>
      (
        await t.db.execute<{
          actions: string;
          journals: string;
          postings: string;
          revision: string;
        }>(
          sql`SELECT (SELECT count(*)::text FROM finance.financial_action WHERE workspace_id=${o.workspaceId}::uuid) actions,(SELECT count(*)::text FROM finance.journal WHERE workspace_id=${o.workspaceId}::uuid) journals,(SELECT count(*)::text FROM finance.posting WHERE workspace_id=${o.workspaceId}::uuid) postings,(SELECT financial_revision::text FROM core.workspace WHERE id=${o.workspaceId}::uuid) revision`,
        )
      ).rows[0]!,
  );
}
afterAll(closeRuntimeDatabasePools);
describe("V2-D owned cash reservations", () => {
  it("rejects reservation writes from an older transaction snapshot even without a competing metadata revision", () =>
    fixture(async (o) => {
      const a = await cash(o),
        g = await recordSavingsGoalCommand(goalBody(o)),
        c = await getDomainPool().connect();
      try {
        await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await c.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
          [o.userId, o.workspaceId],
        );
        await c.query(
          "SELECT financial_revision FROM core.workspace WHERE id=$1",
          [o.workspaceId],
        );
        const receipt = randomUUID();
        await c.query(
          "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,'planning.goal.reserve',$4)",
          [receipt, o.workspaceId, randomUUID(), Buffer.alloc(32, 9)],
        );
        await expect(
          c.query(
            "INSERT INTO planning.goal_reservation(workspace_id,goal_id,financial_account_id,reserved_minor,command_receipt_id,recorded_by_user_id) VALUES($1,$2,$3,1,$4,$5)",
            [o.workspaceId, g.goalId, a.accountId, receipt, o.userId],
          ),
        ).rejects.toMatchObject({ code: "40001" });
      } finally {
        await c.query("ROLLBACK");
        c.release();
      }
      expect(
        (await getSavingsGoal({ ...o, goalId: g.goalId })).goal.reservedMinor,
      ).toBe("0");
    }));
  it("keeps current reservations separate from financial Reports and Dashboard metrics and preserves excess target history", () =>
    fixture(async (o) => {
      const a = await cash(o),
        query = {
          period: "custom" as const,
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        },
        before = await getFinancialReport({ ...o, query }),
        dashboard = await getDashboard({ ...o, query }),
        g = await recordSavingsGoalCommand(goalBody(o));
      await reserve(o, g.goalId, a.accountId, "6000");
      const d = await getSavingsGoal({ ...o, goalId: g.goalId });
      await recordSavingsGoalCommand({
        ...goalBody(o),
        goalId: g.goalId,
        expectedVersion: d.goal.version,
        reason: "Explicit revised target",
        fields: {
          name: "Revised goal",
          targetMinor: "5000",
          targetDate: null,
          notes: "Preserve reserved evidence",
        },
      });
      const after = await getFinancialReport({ ...o, query }),
        home = await getDashboard({ ...o, query });
      expect(after.metrics).toEqual(before.metrics);
      expect(home.finance.liquidMinor).toBe(dashboard.finance.liquidMinor);
      expect(home.finance.trackedNetMinor).toBe(
        dashboard.finance.trackedNetMinor,
      );
      expect(after.savingsGoals.items[0]).toMatchObject({
        id: g.goalId,
        target_minor: "5000",
        reservedMinor: "6000",
        excessReservedMinor: "1000",
        remainingTargetMinor: "0",
        fundingHealth: "funded",
      });
      expect(home.finance.savingsGoals.items[0]).toEqual(
        after.savingsGoals.items[0],
      );
      expect(
        (await getSavingsGoal({ ...o, goalId: g.goalId })).history.items,
      ).toHaveLength(4);
    }));
  it("uses one repeatable snapshot, pages immutable history, and never leaks foreign cursors", () =>
    fixture(async (o, other) => {
      const a = await cash(o),
        goals = [];
      for (let n = 0; n < 4; n++)
        goals.push(await recordSavingsGoalCommand(goalBody(o, "Paged " + n)));
      await reserve(o, goals[0]!.goalId, a.accountId, "5000");
      const first = await listSavingsGoals({ ...o, pageSize: 2 }),
        second = await listSavingsGoals({
          ...o,
          pageSize: 2,
          cursor: first.nextCursor!,
        });
      expect(
        new Set([...first.items, ...second.items].map((g) => g.id)).size,
      ).toBe(4);
      const foreign = await recordSavingsGoalCommand(goalBody(other));
      for (let n = 0; n < 26; n++) {
        const d = await getSavingsGoal({ ...o, goalId: goals[0]!.goalId });
        await reserve(o, d.goal.id, a.accountId, n % 2 ? "5000" : "4000");
      }
      const d = await getSavingsGoal({ ...o, goalId: goals[0]!.goalId }),
        older = await getSavingsGoal({
          ...o,
          goalId: d.goal.id,
          historyCursor: d.history.nextCursor!,
        });
      expect(d.history.items).toHaveLength(50);
      expect(older.history.items).toHaveLength(5);
      const otherHistory = (
        await getSavingsGoal({ ...other, goalId: foreign.goalId })
      ).history.items[0]!.id;
      expect(
        (
          await getSavingsGoal({
            ...o,
            goalId: d.goal.id,
            historyCursor: otherHistory,
          })
        ).history.items,
      ).toEqual([]);
      const income = (await listCategories({ ...o, kind: "income" })).items[0]!;
      await withDomainTransaction(
        o,
        async (t) => {
          const before = await readSavingsGoals(t, o.workspaceId);
          await recordIncome({
            ...o,
            clientCommandId: randomUUID(),
            receivingAccountId: a.accountId,
            effectiveDate: "2026-10-02",
            amountMinor: "1000",
            incomeClass: "earned",
            categoryId: income.categoryId,
            description: "Committed between snapshot reads",
          });
          expect((await readSavingsGoals(t, o.workspaceId)).summary).toEqual(
            before.summary,
          );
        },
        { readOnlySnapshot: true },
      );
      expect((await listSavingsGoals(o)).summary.capacityMinor).toBe("11000");
    }));
  it("audits goal management/replay, exact targets, completion, releases, archival and reopening without money", () =>
    fixture(async (o) => {
      const account = await cash(o),
        before = await counts(o),
        b = goalBody(o),
        created = await recordSavingsGoalCommand({
          ...b,
          fields: { ...b.fields, targetMinor: "9223372036854775807" },
        });
      expect(
        await recordSavingsGoalCommand({
          ...b,
          fields: { ...b.fields, targetMinor: "9223372036854775807" },
        }),
      ).toEqual(created);
      await reserve(o, created.goalId, account.accountId, "6000");
      await lifecycle(o, created.goalId, "complete");
      await expect(
        reserve(o, created.goalId, account.accountId, "7000"),
      ).rejects.toBeInstanceOf(SavingsGoalConflictError);
      await expect(lifecycle(o, created.goalId, "archive")).rejects.toThrow(
        "Release",
      );
      await reserve(o, created.goalId, account.accountId, "0");
      await lifecycle(o, created.goalId, "archive");
      expect((await listSavingsGoals(o)).items).toHaveLength(0);
      await lifecycle(o, created.goalId, "reopen");
      const d = await getSavingsGoal({ ...o, goalId: created.goalId });
      expect(d.goal.target_minor).toBe("9223372036854775807");
      expect(d.goal.reservedMinor).toBe("0");
      expect(d.history.items).toHaveLength(8);
      expect(d.reservations.items[0]!.reserved_minor).toBe("0");
      const after = await counts(o);
      expect({ ...after, revision: before.revision }).toEqual(before);
    }));
  it("prevents the same cash across goals and atomically reallocates across owned accounts/goals", () =>
    fixture(async (o) => {
      const a = await cash(o),
        b = await cash(o, "Destination", "4000"),
        g1 = await recordSavingsGoalCommand(goalBody(o)),
        g2 = await recordSavingsGoalCommand(goalBody(o, "Travel"));
      await reserve(o, g1.goalId, a.accountId, "8000");
      await expect(
        reserve(o, g2.goalId, a.accountId, "3000"),
      ).rejects.toBeInstanceOf(SavingsGoalConflictError);
      let d = await getSavingsGoal({ ...o, goalId: g1.goalId }),
        target = await getSavingsGoal({ ...o, goalId: g2.goalId });
      const move = {
        ...o,
        operation: "reallocate" as const,
        clientCommandId: randomUUID(),
        goalId: g1.goalId,
        expectedVersion: d.goal.version,
        expectedFinancialRevision: d.financialRevision,
        sourceAccountId: a.accountId,
        targetAccountId: b.accountId,
        targetGoalId: g2.goalId,
        expectedTargetVersion: target.goal.version,
        amountMinor: "3000",
        reason: "Reassign supported reservation",
      };
      const result = await recordSavingsGoalCommand(move);
      expect(await recordSavingsGoalCommand(move)).toEqual(result);
      expect(result.goals).toHaveLength(2);
      expect(
        (await getSavingsGoal({ ...o, goalId: g1.goalId })).goal.reservedMinor,
      ).toBe("5000");
      expect(
        (await getSavingsGoal({ ...o, goalId: g2.goalId })).goal.reservedMinor,
      ).toBe("3000");
      expect((await listSavingsGoals(o)).summary).toMatchObject({
        capacityMinor: "14000",
        reservedMinor: "8000",
        availableMinor: "6000",
      });
      d = await getSavingsGoal({ ...o, goalId: g1.goalId });
      target = await getSavingsGoal({ ...o, goalId: g2.goalId });
      const c = await counts(o);
      await expect(
        recordSavingsGoalCommand({
          ...move,
          clientCommandId: randomUUID(),
          expectedVersion: d.goal.version,
          expectedTargetVersion: target.goal.version,
          expectedFinancialRevision: d.financialRevision,
          amountMinor: "2000",
        }),
      ).rejects.toThrow();
      expect(await counts(o)).toEqual(c);
    }));
  it("derives shared shortfall bounds after real spending, permits release and preserves corrected/reversed money history", () =>
    fixture(async (o) => {
      const a = await cash(o),
        g1 = await recordSavingsGoalCommand(goalBody(o)),
        g2 = await recordSavingsGoalCommand(goalBody(o, "Other")),
        category = (await listCategories({ ...o, kind: "expense" })).items[0]!;
      await reserve(o, g1.goalId, a.accountId, "6000");
      await reserve(o, g2.goalId, a.accountId, "4000");
      const expense = await recordExpense({
        ...o,
        clientCommandId: randomUUID(),
        fundingAccountId: a.accountId,
        effectiveDate: "2026-10-02",
        purchaseMinor: "5000",
        splits: [{ categoryId: category.categoryId, amountMinor: "5000" }],
        description: "Real spending remains permitted",
      });
      let d = await getSavingsGoal({ ...o, goalId: g1.goalId });
      expect(d.goal).toMatchObject({
        reservedMinor: "6000",
        minimumMinor: "1000",
        maximumMinor: "5000",
        atRisk: true,
        fundingHealth: "partial",
      });
      expect(d.summary.shortfallMinor).toBe("5000");
      expect(d.reservations.items[0]!.reserved_minor).toBe("6000");
      await expect(
        reserve(o, g1.goalId, a.accountId, "6500"),
      ).rejects.toThrow();
      await reserve(o, g1.goalId, a.accountId, "5500");
      const action = await getFinancialActionDetail({
        ...o,
        actionId: expense.actionId,
      });
      await correctFinancialAction({
        ...o,
        actionId: expense.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: action.current.actionRevisionId,
        expectedFinancialRevision: action.current.financialRevision,
        reason: "Correct actual spend",
        replacement: {
          actionKind: "expense",
          fundingAccountId: a.accountId,
          effectiveDate: "2026-10-02",
          purchaseMinor: "7000",
          splits: [{ categoryId: category.categoryId, amountMinor: "7000" }],
          description: "Actual correction",
          acknowledgeNegativeBalance: true,
        },
      });
      d = await getSavingsGoal({ ...o, goalId: g1.goalId });
      expect(d.goal.reservedMinor).toBe("5500");
      expect(d.summary.shortfallMinor).toBe("6500");
      const corrected = await getFinancialActionDetail({
        ...o,
        actionId: expense.actionId,
      });
      await reverseFinancialAction({
        ...o,
        actionId: expense.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: corrected.current.actionRevisionId,
        expectedFinancialRevision: corrected.current.financialRevision,
        reason: "Reverse mistaken spend",
        acknowledgeNegativeBalance: true,
      });
      d = await getSavingsGoal({ ...o, goalId: g1.goalId });
      expect(d.summary.shortfallMinor).toBe("0");
      expect(d.goal).toMatchObject({
        reservedMinor: "5500",
        minimumMinor: "5500",
        maximumMinor: "5500",
        atRisk: false,
      });
      expect(d.history.items).toHaveLength(5);
      await recordExpense({
        ...o,
        clientCommandId: randomUUID(),
        fundingAccountId: a.accountId,
        effectiveDate: "2026-10-04",
        purchaseMinor: "11000",
        splits: [{ categoryId: category.categoryId, amountMinor: "11000" }],
        description: "Acknowledged real overdraft remains permitted",
        acknowledgeNegativeBalance: true,
      });
      const negative = await getSavingsGoal({ ...o, goalId: g1.goalId });
      expect(negative.goal).toMatchObject({
        reservedMinor: "5500",
        minimumMinor: "0",
        maximumMinor: "0",
        fundingHealth: "unfunded",
      });
      expect(negative.summary).toMatchObject({
        capacityMinor: "0",
        negativeCashMinor: "-1000",
        reservedMinor: "9500",
      });
      expect(negative.history.items).toHaveLength(5);
    }));
  it("does not count future funds, permits actual transfers, and keeps archived reservations explicit", () =>
    fixture(async (o) => {
      const a = await cash(o),
        b = await cash(o, "Wallet", "0"),
        future = await cash(o, "Future opening", "10000", "2199-01-01"),
        g = await recordSavingsGoalCommand(goalBody(o));
      await reserve(o, g.goalId, a.accountId, "8000");
      await expect(
        reserve(o, g.goalId, future.accountId, "1"),
      ).rejects.toThrow();
      const category = (await listCategories({ ...o, kind: "income" }))
        .items[0]!;
      await recordIncome({
        ...o,
        clientCommandId: randomUUID(),
        receivingAccountId: b.accountId,
        effectiveDate: "2199-01-02",
        amountMinor: "10000",
        incomeClass: "earned",
        categoryId: category.categoryId,
        description: "Future recorded income",
      });
      expect((await listSavingsGoals(o)).summary.capacityMinor).toBe("10000");
      await recordTransfer({
        ...o,
        clientCommandId: randomUUID(),
        sourceAccountId: a.accountId,
        destinationAccountId: b.accountId,
        effectiveDate: "2026-10-03",
        destinationPrincipalMinor: "4000",
        description: "Actual transfer",
        fees: [],
      });
      let d = await getSavingsGoal({ ...o, goalId: g.goalId });
      expect(d.summary.capacityMinor).toBe("10000");
      expect(d.summary.shortfallMinor).toBe("2000");
      expect(d.goal.reservedMinor).toBe("8000");
      await withDomainTransaction(o, (t) =>
        t.db.execute(
          sql`UPDATE finance.financial_account SET archived_at=clock_timestamp() WHERE workspace_id=${o.workspaceId}::uuid AND id=${a.accountId}::uuid`,
        ),
      );
      d = await getSavingsGoal({ ...o, goalId: g.goalId });
      expect(d.goal).toMatchObject({
        minimumMinor: "0",
        maximumMinor: "0",
        fundingHealth: "unfunded",
        reservedMinor: "8000",
      });
      await expect(reserve(o, g.goalId, a.accountId, "8001")).rejects.toThrow();
      await reserve(o, g.goalId, a.accountId, "0");
    }));
  it("serializes competing cash, duplicate retries and stale goal/financial reviews", () =>
    fixture(async (o) => {
      const a = await cash(o),
        g1 = await recordSavingsGoalCommand(goalBody(o)),
        g2 = await recordSavingsGoalCommand(goalBody(o, "Concurrent")),
        d = await getSavingsGoal({ ...o, goalId: g1.goalId });
      const make = (id: string) => ({
        ...o,
        operation: "reserve" as const,
        clientCommandId: randomUUID(),
        goalId: id,
        expectedVersion: 1,
        expectedFinancialRevision: d.financialRevision,
        financialAccountId: a.accountId,
        reservedMinor: "8000",
        reason: "Concurrent explicit reserve",
      });
      const results = await Promise.allSettled([
        recordSavingsGoalCommand(make(g1.goalId)),
        recordSavingsGoalCommand(make(g2.goalId)),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await listSavingsGoals(o)).summary.reservedMinor).toBe("8000");
      const winner = results.find((r) => r.status === "fulfilled");
      if (winner?.status !== "fulfilled") throw Error("Expected winner");
      const current = await getSavingsGoal({
        ...o,
        goalId: winner.value.goalId,
      });
      const release = {
        ...make(current.goal.id),
        clientCommandId: randomUUID(),
        expectedVersion: current.goal.version,
        expectedFinancialRevision: current.financialRevision,
        reservedMinor: "0",
      };
      const replies = await Promise.all([
        recordSavingsGoalCommand(release),
        recordSavingsGoalCommand(release),
      ]);
      expect(replies[0]).toEqual(replies[1]);
      await expect(
        recordSavingsGoalCommand({
          ...release,
          clientCommandId: randomUUID(),
          reservedMinor: "1",
        }),
      ).rejects.toBeInstanceOf(SavingsGoalConflictError);
      await expect(
        recordSavingsGoalCommand({ ...release, reservedMinor: "1" }),
      ).rejects.toThrow();
    }));
  it("independently accepts valid SQL and rejects unfinished, missing-audit, forged, excessive and graph-mismatched evidence atomically", () =>
    fixture(async (o) => {
      const a = await cash(o),
        g = await recordSavingsGoalCommand(goalBody(o));
      async function raw(
        mode:
          | "valid"
          | "unfinished"
          | "audit"
          | "result"
          | "capacity"
          | "graph"
          | "null_reason"
          | "actor"
          | "negative"
          | "reallocate"
          | "extra_audit",
        targetGoalId = g.goalId,
        desired = "5000",
      ) {
        return withDomainTransaction(o, async (t) => {
          const claim = await claimFinancialCommandReceipt(t, {
            workspaceId: o.workspaceId,
            clientCommandId: randomUUID(),
            commandType:
              mode === "reallocate"
                ? "planning.goal.reallocate"
                : "planning.goal.reserve",
            payloadHash: Buffer.alloc(32, 4),
          });
          if (claim.kind !== "claimed") throw Error("New receipt required");
          const prior = await readSavingsEvidence(
              t,
              o.workspaceId,
              "savings_goal",
              targetGoalId,
            ),
            rid = randomUUID();
          await t.db.execute(
            sql`INSERT INTO planning.goal_reservation(id,workspace_id,goal_id,financial_account_id,reserved_minor,command_receipt_id,recorded_by_user_id) VALUES(${rid}::uuid,${o.workspaceId}::uuid,${targetGoalId}::uuid,${a.accountId}::uuid,${mode === "capacity" ? "10001" : mode === "negative" ? "-1" : desired}::bigint,${claim.receiptId}::uuid,${mode === "actor" ? randomUUID() : o.userId}::uuid)`,
          );
          await t.db.execute(
            sql`UPDATE planning.savings_goal SET version=version+1,command_receipt_id=${claim.receiptId}::uuid,recorded_by_user_id=${o.userId}::uuid,request_id=NULL WHERE workspace_id=${o.workspaceId}::uuid AND id=${targetGoalId}::uuid`,
          );
          const after = await readSavingsEvidence(
              t,
              o.workspaceId,
              "savings_goal",
              targetGoalId,
            ),
            r = await readSavingsEvidence(
              t,
              o.workspaceId,
              "goal_reservation",
              rid,
            );
          if (mode !== "audit")
            for (const [kind, before, afterBody] of [
              ["savings_goal", prior, after],
              ["goal_reservation", null, r],
            ] as const) {
              await createPrivateRevision(t, {
                id: randomUUID(),
                workspaceId: o.workspaceId,
                commandReceiptId: claim.receiptId,
                subjectKind: kind,
                subjectId: afterBody.id,
                subjectVersion: afterBody.version,
                operation: before ? "replace" : "create",
                beforeJson: before,
                afterJson: afterBody,
                reason: "Independent SQL allocation",
                effectiveDate: (
                  await t.db.execute<{ today: string }>(
                    sql`SELECT (transaction_timestamp() AT TIME ZONE timezone)::date::text today FROM core.workspace WHERE id=${o.workspaceId}::uuid`,
                  )
                ).rows[0]!.today,
                recordedByUserId: o.userId,
                actorKind: "user",
                requestId: null,
              });
            }
          if (mode === "extra_audit")
            await createPrivateRevision(t, {
              id: randomUUID(),
              workspaceId: o.workspaceId,
              commandReceiptId: claim.receiptId,
              subjectKind: "savings_goal",
              subjectId: randomUUID(),
              subjectVersion: 1,
              operation: "create",
              beforeJson: null,
              afterJson: after,
              reason: "Forged extra history",
              effectiveDate: (
                await t.db.execute<{ today: string }>(
                  sql`SELECT (transaction_timestamp() AT TIME ZONE timezone)::date::text today FROM core.workspace WHERE id=${o.workspaceId}::uuid`,
                )
              ).rows[0]!.today,
              recordedByUserId: o.userId,
              actorKind: "user",
              requestId: null,
            });
          if (mode !== "unfinished") {
            const result = (
              await t.db.execute<{ result: Record<string, unknown> }>(
                sql`SELECT planning.goal_command_result(${o.workspaceId}::uuid,${claim.receiptId}::uuid,${targetGoalId}::uuid,'Independent SQL allocation') result`,
              )
            ).rows[0]!.result;
            if (mode === "result")
              result.financialRevision = Number(result.financialRevision);
            if (mode === "graph") result.reservations = [];
            if (mode === "null_reason") result.reason = null;
            await completeFinancialCommandReceipt(t, {
              workspaceId: o.workspaceId,
              receiptId: claim.receiptId,
              result,
            });
          }
          await enforceDeferredFinancialConstraints(t);
        });
      }
      const before = await counts(o);
      for (const mode of [
        "unfinished",
        "audit",
        "result",
        "capacity",
        "graph",
        "null_reason",
        "actor",
        "negative",
        "reallocate",
        "extra_audit",
      ] as const) {
        await expect(raw(mode)).rejects.toThrow();
        expect(await counts(o)).toEqual(before);
        expect(
          (await getSavingsGoal({ ...o, goalId: g.goalId })).goal.version,
        ).toBe(1);
      }
      await raw("valid");
      const rawA = await recordSavingsGoalCommand(
          goalBody(o, "Raw concurrent A"),
        ),
        rawB = await recordSavingsGoalCommand(goalBody(o, "Raw concurrent B"));
      const concurrent = await Promise.allSettled([
        raw("valid", rawA.goalId, "4000"),
        raw("valid", rawB.goalId, "4000"),
      ]);
      expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(
        1,
      );
      expect((await listSavingsGoals(o)).summary.reservedMinor).toBe("9000");
      expect(
        (await getSavingsGoal({ ...o, goalId: g.goalId })).goal.reservedMinor,
      ).toBe("5000");
    }));
  it("enforces forced RLS, restricted roles, foreign account/goal isolation and stale repeatable-read writers", () =>
    fixture(async (o, other) => {
      const a = await cash(o),
        foreign = await cash(other),
        g = await recordSavingsGoalCommand(goalBody(o));
      expect((await listSavingsGoals(other)).items).toEqual([]);
      await expect(
        getSavingsGoal({ ...other, goalId: g.goalId }),
      ).rejects.toBeInstanceOf(SavingsGoalUnavailableError);
      await expect(
        reserve(o, g.goalId, foreign.accountId, "1"),
      ).rejects.toBeInstanceOf(SavingsGoalUnavailableError);
      const flags = await withDomainTransaction(
        o,
        async (t) =>
          (
            await t.db.execute(
              sql`SELECT c.relrowsecurity,c.relforcerowsecurity,has_table_privilege('auth_adapter',c.oid,'SELECT') auth,has_table_privilege('queue_broker',c.oid,'SELECT') queue,has_table_privilege('worker_domain',c.oid,'SELECT') worker,has_table_privilege('app_domain',c.oid,'DELETE') deletion FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='planning' AND c.relname IN('savings_goal','goal_reservation')`,
            )
          ).rows,
      );
      expect(flags).toHaveLength(2);
      for (const f of flags)
        expect(f).toMatchObject({
          relrowsecurity: true,
          relforcerowsecurity: true,
          auth: false,
          queue: false,
          worker: false,
          deletion: false,
        });
      const c = await getDomainPool().connect();
      try {
        await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await c.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
          [o.userId, o.workspaceId],
        );
        await c.query(
          "SELECT financial_revision FROM core.workspace WHERE id=$1",
          [o.workspaceId],
        );
        await reserve(o, g.goalId, a.accountId, "1");
        await expect(
          c.query(
            "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,'planning.goal.reserve',$4)",
            [randomUUID(), o.workspaceId, randomUUID(), Buffer.alloc(32, 8)],
          ),
        ).rejects.toMatchObject({ code: "40001" });
      } finally {
        await c.query("ROLLBACK");
        c.release();
      }
    }));
  it("includes both tables and immutable audit history in approved scoped deletion, preserving another owner", () =>
    fixture(async (o, other) => {
      const a = await cash(o),
        g = await recordSavingsGoalCommand(goalBody(o)),
        b = await cash(other),
        retained = await recordSavingsGoalCommand(goalBody(other));
      await reserve(o, g.goalId, a.accountId, "3000");
      await reserve(other, retained.goalId, b.accountId, "1000");
      const scope = await withDomainTransaction(o, (t) =>
        readDeletionScope(t, o),
      );
      expect(
        scope!.records.some(
          (i) =>
            i.area === "planning" &&
            i.kind === "savings_goal" &&
            i.count === "1",
        ),
      ).toBe(true);
      expect(
        scope!.records.some(
          (i) =>
            i.area === "planning" &&
            i.kind === "goal_reservation" &&
            i.count === "1",
        ),
      ).toBe(true);
      await purgeFixture(o);
      expect(
        (
          await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
            o.userId,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (await getSavingsGoal({ ...other, goalId: retained.goalId })).goal
          .reservedMinor,
      ).toBe("1000");
    }));
});

async function purgeFixture(o: Owner) {
  const c = await getDomainPool().connect();
  let request;
  try {
    request = await runScopedTransactionOnClient(c, o, () =>
      makeDeletionPending(c, o),
    );
  } finally {
    c.release();
  }
  const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!),
    operatorUrl = new URL(process.env.DATABASE_URL!);
  adminUrl.pathname = "/personal_management_test";
  expect(operatorUrl.pathname).toBe("/personal_management_test");
  operatorUrl.username = "lifecycle_operator";
  operatorUrl.password = parseEnv(
    readFileSync(".env.bootstrap", "utf8"),
  ).LIFECYCLE_OPERATOR_PASSWORD!;
  const admin = new Client({ connectionString: adminUrl.toString() }),
    operator = new Client({ connectionString: operatorUrl.toString() });
  await admin.connect();
  await operator.connect();
  try {
    expect(
      (
        await admin.query(
          'SELECT 1 FROM auth."user" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE u.id=$1 AND u.name=$2 AND u.email=$3 AND w.id=$4',
          [o.userId, label, o.userId + "@example.test", o.workspaceId],
        )
      ).rowCount,
    ).toBe(1);
    await admin.query("BEGIN");
    await admin.query("SET LOCAL session_replication_role='replica'");
    await admin.query(
      "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_workspace_id=$2",
      [request.requestId, o.workspaceId],
    );
    await admin.query("COMMIT");
    let complete = false;
    for (let n = 0; n < 50; n++) {
      if (
        (await purgeDeletionStep(operator, request.requestId, 1000)).state ===
        "completed"
      ) {
        complete = true;
        break;
      }
    }
    expect(complete).toBe(true);
  } finally {
    await admin.end();
    await operator.end();
  }
}
