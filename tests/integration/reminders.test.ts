import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { ScopedTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools } from "@/platform/db/pools";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
import {
  ReminderConflictError,
  ReminderUnavailableError,
  type ReminderCommand,
  type ReminderSource,
} from "@/modules/time/domain/reminder";
import {
  getReminderInTransaction,
  mutateReminderInTransaction,
} from "@/modules/time/services/reminders";
import { createPersonalEventInTransaction } from "@/modules/time/services/create-personal-event";
import { mutatePersonalEventInTransaction } from "@/modules/time/services/mutate-personal-event";
import { updateModulePreferenceInTransaction } from "@/modules/core/services/update-module-preference";
import { listAgendaItemsInTransaction } from "@/modules/time/services/list-agenda-items";
import { readReminderAttention } from "@/modules/time/repositories/reminder-repository";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { mutateApplicationEventInTransaction } from "@/modules/career/services/mutate-application-event";
import {
  finalizeSchedule,
  payment,
  schedule,
  withFixture,
  type DebtFixture,
} from "./helpers/debt-payment-fixture";
const transaction = (client: PoolClient) =>
  ({ db: drizzle({ client }) }) as ScopedTransaction;
const actor = (f: DebtFixture) => ({
  userId: f.userId,
  workspaceId: f.workspaceId,
});
const debtSource = (f: DebtFixture): ReminderSource => ({
  sourceKind: "debt_installment",
  sourceId: f.obligationId,
});
async function control(
  client: PoolClient,
  f: DebtFixture,
  target: ReminderSource,
  action: ReminderCommand["action"],
) {
  const tx = transaction(client);
  const view = await getReminderInTransaction(tx, f.workspaceId, target);
  const command = {
    target,
    action,
    expectedSnapshot: view.snapshot,
    clientCommandId: randomUUID(),
  };
  await mutateReminderInTransaction(
    tx,
    { userId: f.userId, workspaceId: f.workspaceId },
    command,
  );
  return command;
}
async function personal(client: PoolClient, f: DebtFixture) {
  return createPersonalEventInTransaction(transaction(client), {
    userId: f.userId,
    workspaceId: f.workspaceId,
    clientCommandId: randomUUID(),
    title: "Renew document",
    temporalKind: "date",
    eventDate: "2026-10-01",
  });
}
afterAll(closeRuntimeDatabasePools);
describe("V1 in-app reminders", () => {
  it("a corrected full payment makes the surviving obligation due under a fresh generation", async () =>
    withFixture(async (c, f) => {
      await control(c, f, debtSource(f), {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      const original = await payment(c, f, {
        contractual: "1000",
        due: "1000",
      });
      await c.query(
        "UPDATE finance.debt SET version=version+1 WHERE workspace_id=$1 AND id=$2",
        [f.workspaceId, f.debtId],
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      expect(
        (
          await getReminderInTransaction(
            transaction(c),
            f.workspaceId,
            debtSource(f),
          )
        ).eligible,
      ).toBe(false);
      await payment(c, f, {
        previous: original,
        contractual: "400",
        due: "400",
      });
      await c.query(
        "UPDATE finance.debt SET version=version+1 WHERE workspace_id=$1 AND id=$2",
        [f.workspaceId, f.debtId],
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      const reopened = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        debtSource(f),
      );
      expect(reopened.remainingMinor).toBe("600");
      expect(reopened.rules[0]?.state).toBe("active");
      expect(reopened.sourceGeneration).toBeGreaterThan(1);
      expect(reopened.history[0]?.state).toBe("cancelled");
    }));
  it("attention includes older overdue sources, aggregates by source and excludes dismissed/snoozed/off rules", async () =>
    withFixture(async (c, f) => {
      const e = await personal(c, f);
      const target: ReminderSource = {
        sourceKind: "personal_event",
        sourceId: e.eventId,
      };
      await control(c, f, target, {
        kind: "settings",
        mode: "override",
        rules: [
          { offsetDays: 7, localTime: "09:00" },
          { offsetDays: 1, localTime: "09:00" },
          { offsetDays: 0, localTime: "09:00" },
        ],
      });
      const attention = await readReminderAttention(
        transaction(c),
        f.workspaceId,
      );
      expect(attention.total).toBe(1);
      expect(attention.sources).toEqual([target]);
      for (const ruleKey of ["7:09:00", "1:09:00", "0:09:00"])
        await control(c, f, target, { kind: "dismiss", ruleKey });
      expect(
        (await readReminderAttention(transaction(c), f.workspaceId)).total,
      ).toBe(0);
      await control(c, f, target, { kind: "restore", ruleKey: "0:09:00" });
      expect(
        (await readReminderAttention(transaction(c), f.workspaceId)).total,
      ).toBe(1);
      await control(c, f, target, {
        kind: "snooze",
        ruleKey: "0:09:00",
        snoozedUntil: new Date(Date.now() + 86400000).toISOString(),
      });
      expect(
        (await readReminderAttention(transaction(c), f.workspaceId)).total,
      ).toBe(0);
      await control(c, f, target, { kind: "settings", mode: "off", rules: [] });
      expect(
        (await readReminderAttention(transaction(c), f.workspaceId)).total,
      ).toBe(0);
    }));
  it("rejects mismatched source/module rule references and immutable generation edits", async () =>
    withFixture(async (c, f) => {
      const e = await personal(c, f);
      await control(c, f, debtSource(f), {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      const rule = (
        await c.query(
          "SELECT id FROM time.reminder_rule WHERE module_key='money'",
        )
      ).rows[0].id;
      await c.query("SAVEPOINT relation");
      await c.query(
        "INSERT INTO time.reminder_occurrence(workspace_id,rule_id,personal_event_id,occurrence_key,source_generation,rule_generation,scheduled_for) VALUES($1,$2,$3,'single',1,1,clock_timestamp())",
        [f.workspaceId, rule, e.eventId],
      );
      await expect(
        c.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({ code: "23514" });
      await c.query("ROLLBACK TO SAVEPOINT relation");
      await c.query("SAVEPOINT immutable");
      await expect(
        c.query(
          "UPDATE time.reminder_occurrence SET source_generation=99 WHERE workspace_id=$1",
          [f.workspaceId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await c.query("ROLLBACK TO SAVEPOINT immutable");
    }));
  it("Career interviews, assessments and follow-ups reschedule/cancel/archive without duplicate appointments", async () =>
    withFixture(async (c, f) => {
      const tx = transaction(c);
      const application = await createJobApplicationInTransaction(tx, {
        ...actor(f),
        clientCommandId: randomUUID(),
        companyName: "Reminder company",
        roleTitle: "Engineer",
        appliedDate: "2026-10-01",
        initialStage: "applied",
        initialStageEffectiveDate: "2026-10-01",
      });
      for (const kind of ["interview", "assessment", "follow_up"] as const) {
        const event = await createApplicationEventInTransaction(tx, {
          ...actor(f),
          applicationId: application.applicationId,
          clientCommandId: randomUUID(),
          eventKind: kind,
          title: kind,
          temporalKind: "date",
          eventDate: "2026-10-10",
        });
        const target: ReminderSource = {
          sourceKind: "application_event",
          sourceId: event.eventId,
        };
        await control(c, f, target, { kind: "dismiss", ruleKey: "0:09:00" });
        await mutateApplicationEventInTransaction(tx, {
          ...actor(f),
          applicationId: application.applicationId,
          eventId: event.eventId,
          clientCommandId: randomUUID(),
          expectedEventVersion: 1,
          action: "reschedule",
          temporalKind: "date",
          eventDate: "2026-10-11",
        });
        await c.query("SET CONSTRAINTS ALL IMMEDIATE");
        await c.query("SET CONSTRAINTS ALL DEFERRED");
        const view = await getReminderInTransaction(tx, f.workspaceId, target);
        expect(view.sourceGeneration).toBe(2);
        expect(view.rules[0]?.state).toBe("active");
        expect(view.history[0]?.state).toBe("cancelled");
        await control(c, f, target, { kind: "dismiss", ruleKey: "0:09:00" });
        await mutateApplicationEventInTransaction(tx, {
          ...actor(f),
          applicationId: application.applicationId,
          eventId: event.eventId,
          clientCommandId: randomUUID(),
          expectedEventVersion: 2,
          action: "cancel",
        });
        await c.query("SET CONSTRAINTS ALL IMMEDIATE");
        await c.query("SET CONSTRAINTS ALL DEFERRED");
        expect(
          (await getReminderInTransaction(tx, f.workspaceId, target)).eligible,
        ).toBe(false);
      }
      const archived = await createApplicationEventInTransaction(tx, {
        ...actor(f),
        applicationId: application.applicationId,
        clientCommandId: randomUUID(),
        eventKind: "follow_up",
        title: "Archive follow-up",
        temporalKind: "date",
        eventDate: "2026-10-12",
      });
      const target: ReminderSource = {
        sourceKind: "application_event",
        sourceId: archived.eventId,
      };
      await control(c, f, target, { kind: "dismiss", ruleKey: "0:09:00" });
      await c.query(
        "UPDATE career.job_application SET archived_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",
        [f.workspaceId, application.applicationId],
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      expect(
        (await getReminderInTransaction(tx, f.workspaceId, target)).history[0]
          ?.state,
      ).toBe("cancelled");
      expect(
        (await c.query("SELECT count(*) FROM time.personal_event")).rows[0]
          .count,
      ).toBe("0");
    }));
  it("computes virtual defaults without GET writes and preserves stable source identity", async () =>
    withFixture(async (c, f) => {
      const view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        debtSource(f),
      );
      expect(view.occurrenceKey).toBe(`schedule:${f.scheduleId}`);
      expect(view.remainingMinor).toBe("1000");
      expect(view.configuration).toEqual([
        { offsetDays: 0, localTime: "09:00" },
      ]);
      expect(view.rules[0]?.scheduledFor).toBe("2026-10-20T01:00:00.000Z");
      await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        debtSource(f),
      );
      expect(
        (await c.query("SELECT count(*) FROM time.reminder_rule")).rows[0]
          .count,
      ).toBe("0");
      expect(
        (await c.query("SELECT count(*) FROM time.reminder_occurrence")).rows[0]
          .count,
      ).toBe("0");
    }));
  it("dismisses once, safely replays after source changes, and rejects changed payload", async () =>
    withFixture(async (c, f) => {
      const command = await control(c, f, debtSource(f), {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      await mutateReminderInTransaction(transaction(c), actor(f), command);
      expect(
        (await c.query("SELECT count(*) FROM time.reminder_occurrence")).rows[0]
          .count,
      ).toBe("1");
      expect(
        (
          await getReminderInTransaction(
            transaction(c),
            f.workspaceId,
            debtSource(f),
          )
        ).rules[0]?.state,
      ).toBe("dismissed");
      await c.query("SAVEPOINT conflict");
      await expect(
        mutateReminderInTransaction(transaction(c), actor(f), {
          ...command,
          action: { kind: "restore", ruleKey: "0:09:00" },
        }),
      ).rejects.toBeInstanceOf(CommandReceiptConflictError);
      await c.query("ROLLBACK TO SAVEPOINT conflict");
      expect(
        (
          await c.query("SELECT lifecycle FROM finance.debt WHERE id=$1", [
            f.debtId,
          ])
        ).rows[0].lifecycle,
      ).toBe("active");
      expect(
        (
          await c.query(
            "SELECT remaining_minor::text FROM finance.current_installment_due_v WHERE obligation_id=$1",
            [f.obligationId],
          )
        ).rows[0].remaining_minor,
      ).toBe("1000");
    }));
  it("snoozes and restores only reminder state", async () =>
    withFixture(async (c, f) => {
      const created = await personal(c, f);
      const target: ReminderSource = {
        sourceKind: "personal_event",
        sourceId: created.eventId,
      };
      const until = new Date(Date.now() + 2 * 86400000).toISOString();
      await control(c, f, target, {
        kind: "snooze",
        ruleKey: "0:09:00",
        snoozedUntil: until,
      });
      let view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        target,
      );
      expect(view.rules[0]?.due).toBe(false);
      expect(view.rules[0]?.snoozedUntil).toBe(until);
      await control(c, f, target, { kind: "restore", ruleKey: "0:09:00" });
      view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        target,
      );
      expect(view.rules[0]?.due).toBe(true);
      expect(
        (
          await c.query(
            "SELECT event_date::text,status FROM time.personal_event WHERE id=$1",
            [created.eventId],
          )
        ).rows[0],
      ).toEqual({ event_date: "2026-10-01", status: "scheduled" });
    }));
  it("rescheduling cancels the old generation; irrelevant notes preserve dismissal", async () =>
    withFixture(async (c, f) => {
      const e = await personal(c, f);
      const target: ReminderSource = {
        sourceKind: "personal_event",
        sourceId: e.eventId,
      };
      await control(c, f, target, { kind: "dismiss", ruleKey: "0:09:00" });
      const old = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        target,
      );
      const edit = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        eventId: e.eventId,
        action: "edit" as const,
        title: "Renew document",
        temporalKind: "date" as const,
        eventDate: "2026-10-01",
        description: "New note",
        expectedEventVersion: 1,
        clientCommandId: randomUUID(),
      };
      await mutatePersonalEventInTransaction(transaction(c), edit);
      let view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        target,
      );
      expect(view.sourceGeneration).toBe(1);
      expect(view.rules[0]?.state).toBe("dismissed");
      await c.query("SAVEPOINT stale");
      await expect(
        mutateReminderInTransaction(transaction(c), actor(f), {
          target,
          expectedSnapshot: old.snapshot,
          clientCommandId: randomUUID(),
          action: { kind: "dismiss", ruleKey: "0:09:00" },
        }),
      ).rejects.toBeInstanceOf(ReminderConflictError);
      await c.query("ROLLBACK TO SAVEPOINT stale");
      await mutatePersonalEventInTransaction(transaction(c), {
        ...edit,
        eventDate: "2026-10-02",
        expectedEventVersion: 2,
        clientCommandId: randomUUID(),
      });
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        target,
      );
      expect(view.sourceGeneration).toBe(2);
      expect(view.rules[0]?.state).toBe("active");
      expect(view.history.some((h) => h.state === "cancelled")).toBe(true);
    }));
  it("cancelled personal sources suppress reminders and retain history", async () =>
    withFixture(async (c, f) => {
      const e = await personal(c, f);
      const target: ReminderSource = {
        sourceKind: "personal_event",
        sourceId: e.eventId,
      };
      const command = await control(c, f, target, {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      await mutatePersonalEventInTransaction(transaction(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        eventId: e.eventId,
        action: "cancel",
        expectedEventVersion: 1,
        clientCommandId: randomUUID(),
      });
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      const view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        target,
      );
      expect(view.eligible).toBe(false);
      expect(view.rules).toEqual([]);
      expect(view.history[0]?.state).toBe("cancelled");
      await mutateReminderInTransaction(transaction(c), actor(f), command);
    }));
  it("partial payments update the residual; satisfied obligations cancel reminders", async () =>
    withFixture(async (c, f) => {
      await control(c, f, debtSource(f), {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      await payment(c, f, {
        actual: "400",
        contractual: "400",
        due: "400",
        components: [
          {
            disposition: "liability_reduction",
            amount: "400",
            ledgerId: f.liabilityId,
            liabilityComponent: "unclassified",
          },
        ],
      });
      await c.query(
        "UPDATE finance.debt SET version=version+1 WHERE workspace_id=$1 AND id=$2",
        [f.workspaceId, f.debtId],
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      let view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        debtSource(f),
      );
      expect(view.remainingMinor).toBe("600");
      expect(view.rules[0]?.state).toBe("dismissed");
      await payment(c, f, {
        actual: "600",
        contractual: "600",
        due: "600",
        components: [
          {
            disposition: "liability_reduction",
            amount: "600",
            ledgerId: f.liabilityId,
            liabilityComponent: "unclassified",
          },
        ],
      });
      await c.query(
        "UPDATE finance.debt SET version=version+1 WHERE workspace_id=$1 AND id=$2",
        [f.workspaceId, f.debtId],
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        debtSource(f),
      );
      expect(view.eligible).toBe(false);
      expect(view.history[0]?.state).toBe("cancelled");
    }));
  it("schedule revisions retain obligations and cancel previous schedule keys", async () =>
    withFixture(async (c, f) => {
      await control(c, f, debtSource(f), {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      const revised = await schedule(c, f, {
        previousId: f.scheduleId,
        version: 2,
      });
      await finalizeSchedule(c, f, revised.scheduleId);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      const view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        debtSource(f),
      );
      expect(view.target).toEqual(debtSource(f));
      expect(view.occurrenceKey).toBe(`schedule:${revised.scheduleId}`);
      expect(view.rules[0]?.state).toBe("active");
      expect(view.history[0]?.state).toBe("cancelled");
    }));
  it("hiding a module retains sources and dismissal; reminder disable is separate", async () =>
    withFixture(async (c, f) => {
      await control(c, f, debtSource(f), {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      await updateModulePreferenceInTransaction(transaction(c), {
        ...actor(f),
        moduleKey: "money",
        clientCommandId: randomUUID(),
        expectedVersion: 0,
        enabled: false,
        agendaVisible: true,
        remindersEnabled: true,
      });
      let view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        debtSource(f),
      );
      expect(view.moduleHidden).toBe(true);
      expect(view.rules[0]?.state).toBe("dismissed");
      const agenda = await listAgendaItemsInTransaction(transaction(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      });
      expect(agenda.items).toHaveLength(1);
      expect(agenda.items[0]?.reminder?.label).toBe("Reminder dismissed");
      await updateModulePreferenceInTransaction(transaction(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        moduleKey: "money",
        clientCommandId: randomUUID(),
        expectedVersion: 1,
        enabled: true,
        agendaVisible: false,
        remindersEnabled: false,
      });
      view = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        debtSource(f),
      );
      expect(view.moduleRemindersEnabled).toBe(false);
      expect(view.rules[0]?.state).toBe("dismissed");
      expect(
        (
          await listAgendaItemsInTransaction(transaction(c), {
            userId: f.userId,
            workspaceId: f.workspaceId,
            startDate: "2026-10-01",
            endDate: "2026-10-31",
          })
        ).items,
      ).toHaveLength(0);
    }));
  it("source override, inheritance, off and module defaults are explicit and duplicate-free", async () =>
    withFixture(async (c, f) => {
      await control(c, f, debtSource(f), {
        kind: "settings",
        mode: "override",
        rules: [
          { offsetDays: 7, localTime: "09:00" },
          { offsetDays: 1, localTime: "09:00" },
          { offsetDays: 0, localTime: "09:00" },
        ],
      });
      expect(
        (
          await getReminderInTransaction(
            transaction(c),
            f.workspaceId,
            debtSource(f),
          )
        ).rules,
      ).toHaveLength(3);
      await control(c, f, debtSource(f), {
        kind: "settings",
        mode: "off",
        rules: [],
      });
      expect(
        (
          await getReminderInTransaction(
            transaction(c),
            f.workspaceId,
            debtSource(f),
          )
        ).rules,
      ).toHaveLength(0);
      await control(c, f, debtSource(f), {
        kind: "settings",
        mode: "inherit",
        rules: [],
      });
      let defaults = await getReminderInTransaction(
        transaction(c),
        f.workspaceId,
        { moduleKey: "money" },
      );
      await mutateReminderInTransaction(transaction(c), actor(f), {
        target: { moduleKey: "money" },
        expectedSnapshot: defaults.snapshot,
        clientCommandId: randomUUID(),
        action: { kind: "settings", mode: "override", rules: [] },
      });
      expect(
        (
          await getReminderInTransaction(
            transaction(c),
            f.workspaceId,
            debtSource(f),
          )
        ).rules,
      ).toHaveLength(0);
      defaults = await getReminderInTransaction(transaction(c), f.workspaceId, {
        moduleKey: "money",
      });
      await mutateReminderInTransaction(transaction(c), actor(f), {
        target: { moduleKey: "money" },
        expectedSnapshot: defaults.snapshot,
        clientCommandId: randomUUID(),
        action: {
          kind: "settings",
          mode: "override",
          rules: [{ offsetDays: 1, localTime: "08:30" }],
        },
      });
      expect(
        (
          await getReminderInTransaction(
            transaction(c),
            f.workspaceId,
            debtSource(f),
          )
        ).rules.map((r) => r.key),
      ).toEqual(["1:08:30"]);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
    }));
  it("rollback removes occurrence, audit and command receipt together", async () =>
    withFixture(async (c, f) => {
      await c.query("SAVEPOINT reminder_rollback");
      const cmd = await control(c, f, debtSource(f), {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      await c.query("ROLLBACK TO SAVEPOINT reminder_rollback");
      expect(
        (await c.query("SELECT count(*) FROM time.reminder_occurrence")).rows[0]
          .count,
      ).toBe("0");
      expect(
        (
          await c.query(
            "SELECT count(*) FROM core.command_receipt WHERE client_command_id=$1",
            [cmd.clientCommandId],
          )
        ).rows[0].count,
      ).toBe("0");
      expect(
        (
          await c.query(
            "SELECT count(*) FROM audit.private_revision WHERE subject_kind='reminder_occurrence'",
          )
        ).rows[0].count,
      ).toBe("0");
    }));
  it("rejects foreign or missing source references", async () =>
    withFixture(async (c, f) => {
      await expect(
        getReminderInTransaction(transaction(c), f.workspaceId, {
          sourceKind: "personal_event",
          sourceId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(ReminderUnavailableError);
      await c.query("SAVEPOINT foreign_fk");
      await expect(
        c.query(
          "INSERT INTO time.reminder_rule(workspace_id,personal_event_id) VALUES($1,$2)",
          [f.workspaceId, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await c.query("ROLLBACK TO SAVEPOINT foreign_fk");
    }));
});
