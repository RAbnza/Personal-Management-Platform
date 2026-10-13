import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client, type PoolClient } from "pg";
import { afterAll, describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import {
  getAuthPool,
  getDomainPool,
  closeRuntimeDatabasePools,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { recordRecurringCommand } from "@/modules/planning/services/recurring";
import {
  readPlanningOccurrence,
  readPlanningVersions,
} from "@/modules/planning/repositories/recurring-repository";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import { recordIncome } from "@/modules/finance/services/record-income";
import { createCreditCard } from "@/modules/finance/services/credit-cards";
import { recordCardPurchase } from "@/modules/finance/services/record-expense";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import {
  lockActiveFinancialWorkspace,
  advanceWorkspaceFinancialRevision,
  enforceDeferredFinancialConstraints,
} from "@/modules/finance/repositories/financial-write-repository";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import { PlanningConflictError } from "@/modules/planning/domain/recurrence";
import { generateRecurrenceDates } from "@/modules/planning/domain/recurrence";
import { planningToday } from "@/modules/planning/domain/recurrence";
import {
  getRecurringObligation,
  getRecurringOccurrence,
  listRecurringObligations,
} from "@/modules/planning/services/read-recurring";
import {
  getReminder,
  mutateReminder,
  getReminderAttention,
} from "@/modules/time/services/reminders";
import { listAgendaItems } from "@/modules/time/services/list-agenda-items";
import {
  getFinancialActionDetail,
  reverseFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import { getFinancialReport } from "@/modules/reporting/services/get-reports";
import { updateModulePreferenceInTransaction } from "@/modules/core/services/update-module-preference";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import { readDeletionScope } from "@/modules/core/repositories/lifecycle-repository";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
type Owner = { userId: string; workspaceId: string };
const label = "V2-B recurring fixture";
async function fixture(run: (o: Owner, other: Owner) => Promise<void>) {
  const owners: Owner[] = [];
  try {
    for (let n = 0; n < 2; n += 1) {
      const userId = randomUUID();
      await getAuthPool().query(
        'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
        [userId, label, `${userId}@example.test`],
      );
      const { workspaceId } = await provisionPersonalWorkspace({
        userId,
        displayName: label,
      });
      owners.push({ userId, workspaceId });
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
function body(o: Owner) {
  return {
    ...o,
    clientCommandId: randomUUID(),
    operation: "definition" as const,
    obligationId: null,
    expectedVersion: null,
    name: "Salary plan",
    kind: "income" as const,
    reason: null,
    rule: {
      effectiveFrom: "2026-10-01",
      frequency: "monthly" as const,
      intervalCount: 1,
      weekdays: null,
      dayOfMonth: 15,
      shortMonthPolicy: "last_valid_day" as const,
      endsOn: null,
      occurrenceLimit: null,
      expectedMinor: "10000",
      currency: "PHP" as const,
      categoryId: null,
      defaultAccountId: null,
      timezone: "Asia/Manila",
    },
    window: { from: "2026-10-01", through: "2026-12-31" },
  };
}
async function counts(o: Owner) {
  return withDomainTransaction(
    o,
    async (t) =>
      (
        await t.db.execute<{ actions: string; postings: string }>(
          sql`SELECT (SELECT count(*)::text FROM finance.financial_action WHERE workspace_id=${o.workspaceId}::uuid) actions,(SELECT count(*)::text FROM finance.posting WHERE workspace_id=${o.workspaceId}::uuid) postings`,
        )
      ).rows[0]!,
  );
}
async function scoped<T>(o: Owner, run: (c: PoolClient) => Promise<T>) {
  const c = await getDomainPool().connect();
  try {
    return await runScopedTransactionOnClient(c, o, () => run(c));
  } finally {
    c.release();
  }
}
async function actualIncome(o: Owner, amount = "10000") {
  const cash = await openFinancialAccount({
    ...o,
    clientCommandId: randomUUID(),
    name: "Bank",
    accountType: "savings",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "0",
  });
  return recordIncome({
    ...o,
    clientCommandId: randomUUID(),
    receivingAccountId: cash.accountId,
    effectiveDate: "2026-10-15",
    amountMinor: amount,
    incomeClass: "earned",
    description: "Confirmed salary",
  });
}
afterAll(closeRuntimeDatabasePools);
describe("V2-B recurring planning", () => {
  it.each(["weekly", "monthly"])(
    "rejects missing %s schedule fields in independent runtime SQL without nullable CHECK bypass",
    async (frequency) =>
      fixture(async (o) => {
        await expect(
          withDomainTransaction(o, async (t) => {
            await lockActiveFinancialWorkspace(t, o.workspaceId);
            const receipt = await claimFinancialCommandReceipt(t, {
              workspaceId: o.workspaceId,
              clientCommandId: randomUUID(),
              commandType: "planning.definition",
              payloadHash: hashFinancialCommandPayload({
                nullGrammarProof: frequency,
              }),
            });
            if (receipt.kind !== "claimed")
              throw Error("Fresh receipt required");
            const obligationId = randomUUID();
            await t.db.execute(
              sql`INSERT INTO planning.recurring_obligation(id,workspace_id,name,kind,command_receipt_id,recorded_by_user_id) VALUES(${obligationId}::uuid,${o.workspaceId}::uuid,'Nullable grammar proof','bill',${receipt.receiptId}::uuid,${o.userId}::uuid)`,
            );
            await t.db.execute(
              sql`INSERT INTO planning.recurrence_version(workspace_id,obligation_id,version_no,effective_from,frequency,interval_count,expected_minor,currency,timezone,command_receipt_id,recorded_by_user_id) VALUES(${o.workspaceId}::uuid,${obligationId}::uuid,1,'2026-10-01',${frequency},1,10000,'PHP','Asia/Manila',${receipt.receiptId}::uuid,${o.userId}::uuid)`,
            );
          }),
        ).rejects.toMatchObject({
          cause: { code: "23514", constraint: "ck_recurrence_grammar" },
        });
        expect((await listRecurringObligations(o)).items).toEqual([]);
      }),
  );
  it("keeps civil due dates unchanged and derives Agenda timing in the definition's timezone", async () =>
    fixture(async (o) => {
      const workspaceDate = planningToday("Asia/Manila"),
        zone =
          planningToday("Etc/GMT+12") !== workspaceDate
            ? "Etc/GMT+12"
            : "Pacific/Kiritimati",
        localDate = planningToday(zone),
        b = body(o);
      const p = await recordRecurringCommand({
        ...b,
        rule: {
          ...b.rule,
          effectiveFrom: workspaceDate,
          frequency: "daily",
          dayOfMonth: null,
          shortMonthPolicy: null,
          timezone: zone,
          occurrenceLimit: 1,
        },
        window: { from: workspaceDate, through: workspaceDate },
      });
      const read = await listAgendaItems({
          ...o,
          startDate: workspaceDate,
          endDate: workspaceDate,
        }),
        item = read.items.find((x) => x.sourceId === p.occurrenceIds![0]);
      expect(item!.agendaDate).toBe(workspaceDate);
      expect(item!.temporal).toMatchObject({
        kind: "date",
        eventDate: workspaceDate,
        timezone: zone,
      });
      expect(item!.timingState).toBe(
        localDate < workspaceDate ? "upcoming" : "overdue",
      );
      expect(
        (
          await getReminder(o, {
            sourceKind: "expected_occurrence",
            sourceId: p.occurrenceIds![0]!,
          })
        ).timezone,
      ).toBe(zone);
    }));
  it("matches the independent SQL recurrence ordinal to the calendar engine for weekly, leap and skipped-month rules", async () =>
    fixture(async (o) => {
      const b = body(o);
      const cases = [
        {
          rule: {
            ...b.rule,
            effectiveFrom: "2024-01-31",
            dayOfMonth: 31,
            occurrenceLimit: 5,
          },
          window: { from: "2024-01-01", through: "2024-06-30" },
        },
        {
          rule: {
            ...b.rule,
            effectiveFrom: "2024-01-31",
            dayOfMonth: 31,
            shortMonthPolicy: "skip" as const,
            occurrenceLimit: 3,
          },
          window: { from: "2024-01-01", through: "2024-06-30" },
        },
        {
          rule: {
            ...b.rule,
            effectiveFrom: "2026-10-14",
            frequency: "weekly" as const,
            intervalCount: 2,
            weekdays: [5, 1, 3],
            dayOfMonth: null,
            shortMonthPolicy: null,
            occurrenceLimit: 5,
          },
          window: { from: "2026-10-01", through: "2026-11-30" },
        },
      ];
      for (const c of cases) {
        const p = await recordRecurringCommand({
            ...b,
            ...c,
            clientCommandId: randomUUID(),
          }),
          read = await getRecurringObligation({
            ...o,
            obligationId: p.obligationId,
          });
        expect(read.occurrences.items.map((x) => x.logicalDate)).toEqual(
          generateRecurrenceDates(c.rule, c.window),
        );
      }
    }));
  it("accepts card-funded bills as existing purchases once and rejects wrong financial meaning or excess links", async () =>
    fixture(async (o, other) => {
      const b = body(o),
        p = await recordRecurringCommand({ ...b, kind: "bill" }),
        card = await createCreditCard({
          ...o,
          clientCommandId: randomUUID(),
          name: "Recurring Visa",
          issuerName: "Provider",
        });
      const purchase = await recordCardPurchase({
        ...o,
        clientCommandId: randomUUID(),
        cardId: card.cardId,
        effectiveDate: "2026-10-15",
        postingDate: "2026-10-16",
        purchaseMinor: "12000",
        splits: [{ categoryId: null, amountMinor: "12000" }],
        description: "Actual recurring bill",
      });
      const before = await counts(o),
        link = {
          ...o,
          operation: "link" as const,
          clientCommandId: randomUUID(),
          occurrenceId: p.occurrenceIds![0]!,
          expectedVersion: 1,
          actionId: purchase.actionId,
          actionRevisionId: purchase.actionRevisionId,
          linkedMinor: "10000",
        };
      const replay = await Promise.all([
        recordRecurringCommand(link),
        recordRecurringCommand(link),
      ]);
      expect(replay[0]).toEqual(replay[1]);
      expect(await counts(o)).toEqual(before);
      const report = await getFinancialReport({
        ...o,
        query: {
          period: "custom",
          startDate: "2026-10-01",
          endDate: "2026-12-31",
        },
      });
      expect(report.metrics.gross).toBe("12000");
      await expect(
        recordRecurringCommand({
          ...link,
          clientCommandId: randomUUID(),
          occurrenceId: p.occurrenceIds![1]!,
          linkedMinor: "3000",
        }),
      ).rejects.toBeInstanceOf(PlanningConflictError);
      const wrong = await actualIncome(o);
      await expect(
        recordRecurringCommand({
          ...link,
          clientCommandId: randomUUID(),
          occurrenceId: p.occurrenceIds![1]!,
          actionId: wrong.actionId,
          actionRevisionId: wrong.actionRevisionId,
        }),
      ).rejects.toBeInstanceOf(PlanningConflictError);
      const foreign = await actualIncome(other);
      await expect(
        recordRecurringCommand({
          ...link,
          clientCommandId: randomUUID(),
          occurrenceId: p.occurrenceIds![1]!,
          actionId: foreign.actionId,
          actionRevisionId: foreign.actionRevisionId,
        }),
      ).rejects.toThrow("unavailable");
    }));
  it("independently rejects unsupported SQL capacity and missing audit finalization atomically", async () =>
    fixture(async (o) => {
      const b = body(o),
        p = await recordRecurringCommand({
          ...b,
          rule: { ...b.rule, expectedMinor: "20000" },
        }),
        actual = await actualIncome(o),
        before = await counts(o);
      async function unsupported(amount: string) {
        return withDomainTransaction(o, async (t) => {
          await lockActiveFinancialWorkspace(t, o.workspaceId);
          const receipt = await claimFinancialCommandReceipt(t, {
            workspaceId: o.workspaceId,
            clientCommandId: randomUUID(),
            commandType: "planning.link",
            payloadHash: hashFinancialCommandPayload({
              unsupportedSqlProof: amount,
            }),
          });
          if (receipt.kind !== "claimed") throw Error("Fresh receipt required");
          const id = randomUUID(),
            occurrenceId = p.occurrenceIds![0]!;
          await t.db.execute(
            sql`INSERT INTO planning.occurrence_actual_link(id,workspace_id,occurrence_id,action_id,action_revision_id,linked_minor,command_receipt_id,recorded_by_user_id) VALUES(${id}::uuid,${o.workspaceId}::uuid,${occurrenceId}::uuid,${actual.actionId}::uuid,${actual.actionRevisionId}::uuid,${amount}::bigint,${receipt.receiptId}::uuid,${o.userId}::uuid)`,
          );
          await t.db.execute(
            sql`UPDATE planning.expected_occurrence SET state='linked',version=2,command_receipt_id=${receipt.receiptId}::uuid WHERE workspace_id=${o.workspaceId}::uuid AND id=${occurrenceId}::uuid`,
          );
          await completeFinancialCommandReceipt(t, {
            workspaceId: o.workspaceId,
            receiptId: receipt.receiptId,
            result: {
              obligationId: p.obligationId,
              occurrenceId,
              linkId: id,
              version: 2,
              reason: null,
              financialRevision: await advanceWorkspaceFinancialRevision(
                t,
                o.workspaceId,
              ),
            },
          });
          await enforceDeferredFinancialConstraints(t);
        });
      }
      await expect(unsupported("11000")).rejects.toThrow();
      await expect(unsupported("5000")).rejects.toThrow();
      expect(
        (
          await getRecurringOccurrence({
            ...o,
            occurrenceId: p.occurrenceIds![0]!,
          })
        ).links,
      ).toEqual([]);
      expect(await counts(o)).toEqual(before);
    }));
  it("creates exact deterministic rules/occurrences with replay and no financial postings", async () =>
    fixture(async (o) => {
      const before = await counts(o),
        b = body(o),
        r = await recordRecurringCommand(b);
      expect(await recordRecurringCommand(b)).toEqual(r);
      expect(r.occurrenceIds).toHaveLength(3);
      expect(await counts(o)).toEqual(before);
      const generated = await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "generate",
        obligationId: r.obligationId,
        expectedVersion: r.version,
        window: b.window,
      });
      expect(generated.occurrenceIds).toEqual(r.occurrenceIds);
      await withDomainTransaction(o, async (t) => {
        const versions = await readPlanningVersions(
          t,
          o.workspaceId,
          r.obligationId,
        );
        expect(versions).toHaveLength(1);
        expect(
          (await readPlanningOccurrence(t, o.workspaceId, r.occurrenceIds![0]!))
            .due_date,
        ).toBe("2026-10-15");
      });
    }));
  it("links partial exact actual evidence, reverses without reposting, and completes only with support", async () =>
    fixture(async (o) => {
      const r = await recordRecurringCommand(body(o)),
        occurrenceId = r.occurrenceIds![0]!;
      const cash = await openFinancialAccount({
        ...o,
        clientCommandId: randomUUID(),
        name: "Bank",
        accountType: "savings",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "0",
      });
      const actual = await recordIncome({
        ...o,
        clientCommandId: randomUUID(),
        receivingAccountId: cash.accountId,
        effectiveDate: "2026-10-15",
        amountMinor: "10000",
        incomeClass: "earned",
        description: "Actual salary",
      });
      const before = await counts(o);
      const linked = await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "link",
        occurrenceId,
        expectedVersion: 1,
        actionId: actual.actionId,
        actionRevisionId: actual.actionRevisionId,
        linkedMinor: "4000",
      });
      await withDomainTransaction(o, async (t) =>
        expect(
          (await readPlanningOccurrence(t, o.workspaceId, occurrenceId)).state,
        ).toBe("linked"),
      );
      await expect(
        recordRecurringCommand({
          ...o,
          clientCommandId: randomUUID(),
          operation: "link",
          occurrenceId,
          expectedVersion: 2,
          actionId: actual.actionId,
          actionRevisionId: actual.actionRevisionId,
          linkedMinor: "6000",
        }),
      ).rejects.toBeInstanceOf(PlanningConflictError);
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "unlink",
        linkId: linked.linkId!,
        expectedOccurrenceVersion: 2,
        reason: "Replace the partial confirmation",
      });
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "link",
        occurrenceId,
        expectedVersion: 3,
        actionId: actual.actionId,
        actionRevisionId: actual.actionRevisionId,
        linkedMinor: "10000",
      });
      await withDomainTransaction(o, async (t) =>
        expect(
          (await readPlanningOccurrence(t, o.workspaceId, occurrenceId)).state,
        ).toBe("completed"),
      );
      expect(await counts(o)).toEqual(before);
    }));
  it("preserves overrides, skipped/linked history and immutable versions across future supersession", async () =>
    fixture(async (o) => {
      const b = body(o),
        p = await recordRecurringCommand(b),
        ids = p.occurrenceIds!;
      await recordRecurringCommand({
        ...o,
        operation: "occurrence",
        clientCommandId: randomUUID(),
        occurrenceId: ids[0]!,
        expectedVersion: 1,
        change: "override",
        dueDate: "2026-10-20",
        expectedMinor: "12000",
        reason: "One payroll adjustment",
      });
      await recordRecurringCommand({
        ...o,
        operation: "occurrence",
        clientCommandId: randomUUID(),
        occurrenceId: ids[1]!,
        expectedVersion: 1,
        change: "skip",
        dueDate: null,
        expectedMinor: null,
        reason: "No November payment expected",
      });
      const revised = await recordRecurringCommand({
        ...b,
        clientCommandId: randomUUID(),
        obligationId: p.obligationId,
        expectedVersion: 1,
        reason: "Future payroll arrangement",
        rule: {
          ...b.rule,
          effectiveFrom: "2026-11-01",
          dayOfMonth: 20,
          expectedMinor: "20000",
        },
      });
      const read = await getRecurringObligation({
        ...o,
        obligationId: p.obligationId,
      });
      expect(read.versions).toHaveLength(2);
      expect(read.versions[0]!.rule.expectedMinor).toBe("10000");
      expect(read.occurrences.items.find((x) => x.id === ids[0])).toMatchObject(
        { state: "planned", expectedMinor: "12000", dueDate: "2026-10-20" },
      );
      expect(read.occurrences.items.find((x) => x.id === ids[1])!.state).toBe(
        "skipped",
      );
      expect(read.occurrences.items.find((x) => x.id === ids[2])!.state).toBe(
        "cancelled",
      );
      expect(revised.occurrenceIds).toHaveLength(3);
      await expect(
        recordRecurringCommand({
          ...b,
          clientCommandId: randomUUID(),
          obligationId: p.obligationId,
          expectedVersion: 1,
          reason: "Stale boundary",
        }),
      ).rejects.toBeInstanceOf(PlanningConflictError);
      await expect(
        scoped(o, (c) =>
          c.query(
            "UPDATE planning.recurrence_version SET expected_minor=1 WHERE workspace_id=$1 AND id=$2",
            [o.workspaceId, p.recurrenceVersionId],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    }));
  it("retains earlier due overrides and partial future commitments when archived", async () =>
    fixture(async (o) => {
      const b = body(o),
        p = await recordRecurringCommand(b),
        ids = p.occurrenceIds!,
        actual = await actualIncome(o);
      await recordRecurringCommand({
        ...o,
        operation: "occurrence",
        clientCommandId: randomUUID(),
        occurrenceId: ids[0]!,
        expectedVersion: 1,
        change: "override",
        dueDate: "2026-09-30",
        expectedMinor: "10000",
        reason: "Confirmed earlier due date",
      });
      await recordRecurringCommand({
        ...o,
        operation: "link",
        clientCommandId: randomUUID(),
        occurrenceId: ids[1]!,
        expectedVersion: 1,
        actionId: actual.actionId,
        actionRevisionId: actual.actionRevisionId,
        linkedMinor: "3000",
      });
      await recordRecurringCommand({
        ...o,
        operation: "archive",
        clientCommandId: randomUUID(),
        obligationId: p.obligationId,
        expectedVersion: 1,
        reason: "Stop future recurrence",
      });
      const read = await getRecurringObligation({
        ...o,
        obligationId: p.obligationId,
      });
      expect(read.occurrences.items.map((x) => x.state)).toEqual([
        "planned",
        "linked",
        "cancelled",
      ]);
      await expect(
        recordRecurringCommand({
          ...o,
          operation: "generate",
          clientCommandId: randomUUID(),
          obligationId: p.obligationId,
          expectedVersion: 2,
          window: b.window,
        }),
      ).rejects.toBeInstanceOf(PlanningConflictError);
      expect(
        (await getRecurringOccurrence({ ...o, occurrenceId: ids[1]! }))
          .remainingMinor,
      ).toBe("7000");
    }));
  it("serializes overlapping generation, duplicate replay, competing capacity and stale occurrence versions", async () =>
    fixture(async (o) => {
      const b = body(o),
        p = await recordRecurringCommand(b),
        before = await counts(o);
      const gen = {
        ...o,
        operation: "generate" as const,
        clientCommandId: randomUUID(),
        obligationId: p.obligationId,
        expectedVersion: 1,
        window: { from: "2026-12-01", through: "2027-02-28" },
      };
      const replay = await Promise.all([
        recordRecurringCommand(gen),
        recordRecurringCommand(gen),
      ]);
      expect(replay[0]).toEqual(replay[1]);
      const read = await getRecurringObligation({
        ...o,
        obligationId: p.obligationId,
      });
      expect(read.occurrences.items).toHaveLength(5);
      expect(await counts(o)).toEqual(before);
      const actual = await actualIncome(o, "10000");
      const outcomes = await Promise.allSettled(
        p.occurrenceIds!.slice(0, 2).map((occurrenceId) =>
          recordRecurringCommand({
            ...o,
            operation: "link",
            clientCommandId: randomUUID(),
            occurrenceId,
            expectedVersion: 1,
            actionId: actual.actionId,
            actionRevisionId: actual.actionRevisionId,
            linkedMinor: "7000",
          }),
        ),
      );
      expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
      const changes = await Promise.allSettled(
        [1, 2].map((n) =>
          recordRecurringCommand({
            ...o,
            operation: "occurrence",
            clientCommandId: randomUUID(),
            occurrenceId: p.occurrenceIds![2]!,
            expectedVersion: 1,
            change: "override",
            dueDate: "2026-12-16",
            expectedMinor: "10000",
            reason: `Concurrent change ${n}`,
          }),
        ),
      );
      expect(changes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      await expect(
        recordRecurringCommand({ ...gen, window: b.window }),
      ).rejects.toThrow("command ID");
    }));
  it("blocks actual corrections while linked, preserves exact reversal history and allows explicit relinking after correction", async () =>
    fixture(async (o) => {
      const p = await recordRecurringCommand(body(o)),
        actual = await actualIncome(o),
        occurrenceId = p.occurrenceIds![0]!;
      const link = await recordRecurringCommand({
        ...o,
        operation: "link",
        clientCommandId: randomUUID(),
        occurrenceId,
        expectedVersion: 1,
        actionId: actual.actionId,
        actionRevisionId: actual.actionRevisionId,
        linkedMinor: "10000",
      });
      let detail = await getFinancialActionDetail({
        ...o,
        actionId: actual.actionId,
      });
      expect(detail.recurringLinks).toMatchObject([
        { occurrenceId, linkedMinor: "10000", state: "completed" },
      ]);
      await expect(
        reverseFinancialAction({
          ...o,
          actionId: actual.actionId,
          clientCommandId: randomUUID(),
          expectedActionRevisionId: detail.current.actionRevisionId,
          expectedFinancialRevision: detail.current.financialRevision,
          reason: "Incorrect salary",
        }),
      ).rejects.toThrow("recurring occurrence links");
      await expect(
        scoped(o, (c) =>
          c.query(
            "UPDATE finance.financial_action SET current_revision_id=$3 WHERE workspace_id=$1 AND id=$2",
            [o.workspaceId, actual.actionId, randomUUID()],
          ),
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await recordRecurringCommand({
        ...o,
        operation: "unlink",
        clientCommandId: randomUUID(),
        linkId: link.linkId!,
        expectedOccurrenceVersion: 2,
        reason: "Resolve correction dependency",
      });
      detail = await getFinancialActionDetail({
        ...o,
        actionId: actual.actionId,
      });
      await reverseFinancialAction({
        ...o,
        actionId: actual.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: detail.current.actionRevisionId,
        expectedFinancialRevision: detail.current.financialRevision,
        reason: "Incorrect salary reversed",
      });
      await expect(
        recordRecurringCommand({
          ...o,
          operation: "link",
          clientCommandId: randomUUID(),
          occurrenceId,
          expectedVersion: 3,
          actionId: actual.actionId,
          actionRevisionId: actual.actionRevisionId,
          linkedMinor: "10000",
        }),
      ).rejects.toThrow("changed or is no longer eligible");
      const fresh = await actualIncome(o);
      await recordRecurringCommand({
        ...o,
        operation: "link",
        clientCommandId: randomUUID(),
        occurrenceId,
        expectedVersion: 3,
        actionId: fresh.actionId,
        actionRevisionId: fresh.actionRevisionId,
        linkedMinor: "10000",
      });
      const read = await getRecurringOccurrence({ ...o, occurrenceId });
      expect(read.links).toHaveLength(3);
      expect(read.links.filter((x) => x.effective)).toHaveLength(1);
      expect(read.occurrence.state).toBe("completed");
      await expect(
        recordRecurringCommand({
          ...o,
          operation: "unlink",
          clientCommandId: randomUUID(),
          linkId: link.linkId!,
          expectedOccurrenceVersion: 4,
          reason: "Duplicate reversal",
        }),
      ).rejects.toThrow("already been reversed");
    }));
  it("projects typed planned Agenda/reminders, invalidates stale previews and reactivates a completed source with a new generation", async () =>
    fixture(async (o, other) => {
      const p = await recordRecurringCommand({
          ...body(o),
          rule: { ...body(o).rule, timezone: "America/New_York" },
        }),
        occurrenceId = p.occurrenceIds![0]!,
        target = {
          sourceKind: "expected_occurrence" as const,
          sourceId: occurrenceId,
        };
      const initial = await getReminder(o, target);
      expect(initial).toMatchObject({
        eligible: true,
        timezone: "America/New_York",
        remainingMinor: "10000",
      });
      const agenda = await listAgendaItems({
        ...o,
        startDate: "2026-10-01",
        endDate: "2026-12-31",
      });
      expect(
        agenda.items.filter((x) => x.sourceKind === "expected_occurrence"),
      ).toHaveLength(3);
      expect(agenda.sourceRoutes[`expected_occurrence:${occurrenceId}`]).toBe(
        `/money/recurring/occurrences/${occurrenceId}`,
      );
      await mutateReminder(o, {
        target,
        clientCommandId: randomUUID(),
        expectedSnapshot: initial.snapshot,
        action: { kind: "dismiss", ruleKey: initial.rules[0]!.key },
      });
      const dismissed = await getReminder(o, target),
        actual = await actualIncome(o);
      const link = await recordRecurringCommand({
        ...o,
        operation: "link",
        clientCommandId: randomUUID(),
        occurrenceId,
        expectedVersion: 1,
        actionId: actual.actionId,
        actionRevisionId: actual.actionRevisionId,
        linkedMinor: "10000",
      });
      expect((await getReminder(o, target)).eligible).toBe(false);
      await recordRecurringCommand({
        ...o,
        operation: "unlink",
        clientCommandId: randomUUID(),
        linkId: link.linkId!,
        expectedOccurrenceVersion: 2,
        reason: "Payment needs review",
      });
      const reopened = await getReminder(o, target);
      expect(reopened.eligible).toBe(true);
      expect(reopened.sourceGeneration).toBeGreaterThan(
        dismissed.sourceGeneration!,
      );
      expect(reopened.rules[0]!.state).toBe("active");
      await expect(
        mutateReminder(o, {
          target,
          clientCommandId: randomUUID(),
          expectedSnapshot: dismissed.snapshot,
          action: { kind: "dismiss", ruleKey: initial.rules[0]!.key },
        }),
      ).rejects.toThrow("changed");
      await withDomainTransaction(o, (t) =>
        updateModulePreferenceInTransaction(t, {
          ...o,
          clientCommandId: randomUUID(),
          moduleKey: "money",
          expectedVersion: 0,
          enabled: true,
          agendaVisible: false,
          remindersEnabled: false,
        }),
      );
      expect(
        (
          await listAgendaItems({
            ...o,
            startDate: "2026-10-01",
            endDate: "2026-12-31",
          })
        ).items,
      ).toEqual([]);
      expect((await getReminderAttention(o)).total).toBe(0);
      await expect(getReminder(other, target)).rejects.toThrow("unavailable");
    }));
  it("enforces private reads, forced RLS, restricted roles and concrete source ownership", async () =>
    fixture(async (o, other) => {
      const p = await recordRecurringCommand(body(o));
      expect((await listRecurringObligations(other)).items).toEqual([]);
      await expect(
        getRecurringObligation({ ...other, obligationId: p.obligationId }),
      ).rejects.toThrow("unavailable");
      await expect(
        getRecurringOccurrence({
          ...other,
          occurrenceId: p.occurrenceIds![0]!,
        }),
      ).rejects.toThrow("unavailable");
      expect(
        (
          await scoped(other, (c) =>
            c.query(
              "SELECT * FROM planning.occurrence_due_v WHERE obligation_id=$1",
              [p.obligationId],
            ),
          )
        ).rowCount,
      ).toBe(0);
      const flags = await scoped(o, (c) =>
        c.query(
          "SELECT c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='planning' AND c.relkind='r'",
        ),
      );
      expect(flags.rows).toHaveLength(7);
      expect(
        flags.rows.every((x) => x.relrowsecurity && x.relforcerowsecurity),
      ).toBe(true);
      const roles = await scoped(o, (c) =>
        c.query(
          "SELECT has_table_privilege('auth_adapter','planning.expected_occurrence','SELECT') a,has_table_privilege('queue_broker','planning.expected_occurrence','SELECT') q,has_table_privilege('worker_domain','planning.expected_occurrence','SELECT') w,has_table_privilege('app_domain','planning.recurrence_version','UPDATE') u",
        ),
      );
      expect(roles.rows[0]).toEqual({ a: false, q: false, w: false, u: false });
      await expect(
        scoped(other, (c) =>
          c.query(
            "INSERT INTO time.source_reminder_setting(workspace_id,expected_occurrence_id,mode) VALUES($1,$2,'off')",
            [other.workspaceId, p.occurrenceIds![0]],
          ),
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        scoped(o, (c) =>
          c.query(
            "INSERT INTO planning.recurring_obligation(workspace_id,name,kind,command_receipt_id,recorded_by_user_id) VALUES($1,'Forged','income',$2,$3)",
            [o.workspaceId, randomUUID(), o.userId],
          ),
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }));
  it("keeps actual reports unchanged by large plans, pagination, overrides, skips and archive", async () =>
    fixture(async (o) => {
      const query = {
          period: "custom" as const,
          startDate: "2026-10-01",
          endDate: "2026-12-31",
        },
        before = await getFinancialReport({ ...o, query }),
        b = body(o);
      const p = await recordRecurringCommand({
        ...b,
        kind: "subscription",
        rule: {
          ...b.rule,
          frequency: "daily",
          dayOfMonth: null,
          shortMonthPolicy: null,
          expectedMinor: "100000000000",
          occurrenceLimit: 12,
        },
      });
      const first = await getRecurringObligation({
          ...o,
          obligationId: p.obligationId,
          pageSize: 5,
        }),
        next = await getRecurringObligation({
          ...o,
          obligationId: p.obligationId,
          pageSize: 5,
          cursor: first.occurrences.nextCursor!,
        });
      expect(first.occurrences.items).toHaveLength(5);
      expect(next.occurrences.items).toHaveLength(5);
      expect(
        new Set(
          [...first.occurrences.items, ...next.occurrences.items].map(
            (x) => x.id,
          ),
        ).size,
      ).toBe(10);
      await recordRecurringCommand({
        ...o,
        operation: "occurrence",
        clientCommandId: randomUUID(),
        occurrenceId: p.occurrenceIds![0]!,
        expectedVersion: 1,
        change: "skip",
        dueDate: null,
        expectedMinor: null,
        reason: "Skip without spending",
      });
      await recordRecurringCommand({
        ...o,
        operation: "archive",
        clientCommandId: randomUUID(),
        obligationId: p.obligationId,
        expectedVersion: 1,
        reason: "Stop the forecast",
      });
      const after = await getFinancialReport({ ...o, query });
      expect(after.metrics).toEqual(before.metrics);
      expect(await counts(o)).toEqual({ actions: "0", postings: "0" });
    }));
  it("includes planning in deletion review and approved complete owner purge while preserving another owner", async () =>
    fixture(async (o, other) => {
      const p = await recordRecurringCommand(body(o)),
        otherPlan = await recordRecurringCommand(body(other));
      const scope = await withDomainTransaction(o, (t) =>
        readDeletionScope(t, o),
      );
      expect(
        scope!.records.some(
          (x) =>
            x.area === "planning" &&
            x.kind === "expected_occurrence" &&
            x.count === "3",
        ),
      ).toBe(true);
      const target = {
          sourceKind: "expected_occurrence" as const,
          sourceId: p.occurrenceIds![0]!,
        },
        reminder = await getReminder(o, target);
      await mutateReminder(o, {
        target,
        clientCommandId: randomUUID(),
        expectedSnapshot: reminder.snapshot,
        action: { kind: "dismiss", ruleKey: reminder.rules[0]!.key },
      });
      const deletion = await scoped(o, (c) => makeDeletionPending(c, o));
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
        await admin.query("BEGIN");
        await admin.query("SET LOCAL session_replication_role='replica'");
        await admin.query(
          "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1",
          [deletion.requestId],
        );
        await admin.query("COMMIT");
        let completed = false;
        for (let n = 0; n < 50; n += 1)
          if (
            (await purgeDeletionStep(operator, deletion.requestId, 1000))
              .state === "completed"
          ) {
            completed = true;
            break;
          }
        expect(completed).toBe(true);
        expect(
          (
            await admin.query(
              "SELECT id FROM planning.expected_occurrence WHERE workspace_id=$1",
              [o.workspaceId],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (
            await getRecurringObligation({
              ...other,
              obligationId: otherPlan.obligationId,
            })
          ).occurrences.items,
        ).toHaveLength(3);
      } finally {
        await admin.end();
        await operator.end();
      }
    }));
});
