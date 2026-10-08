import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  InvalidReminderActionError,
  ReminderConflictError,
  ReminderUnavailableError,
  reminderCommandSchema,
  reminderTargetSchema,
  type ReminderCommand,
  type ReminderSource,
  type ReminderTarget,
  type ReminderView,
} from "../domain/reminder";
import {
  lockReminderTarget,
  readModuleReminderRules,
  readReminderSources,
  readReminderAttention,
  sourceColumns,
  sourcePredicate,
  type ReminderReadRow,
  type StoredRule,
} from "../repositories/reminder-repository";

const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
  })
  .strict();
type Actor = z.infer<typeof actorSchema>;
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const iso = (v: string) => new Date(v).toISOString();
const virtualRule: StoredRule = {
  id: "virtual",
  offsetDays: 0,
  localTime: "09:00",
  enabled: true,
  generation: 1,
  version: 0,
  moduleKey: null,
};

function mapSource(row: ReminderReadRow): ReminderView {
  const target = {
    sourceKind: row.source_kind,
    sourceId: row.source_id,
  } as ReminderSource;
  const defaults = row.rules.filter((r) => r.moduleKey !== null);
  const overrides = row.rules.filter((r) => r.moduleKey === null);
  const selected =
    row.mode === "off"
      ? []
      : row.mode === "override"
        ? overrides
        : defaults.length
          ? defaults
          : [virtualRule];
  const rules = selected
    .filter((r) => r.enabled)
    .map((r) => {
      const o = row.occurrences.find(
        (o) =>
          o.ruleId === r.id &&
          o.occurrenceKey === row.occurrence_key &&
          o.sourceGeneration === row.source_generation &&
          o.ruleGeneration === r.generation,
      );
      const scheduled = row.schedules.find((s) => s.id === r.id)?.scheduledFor;
      if (row.eligible && !scheduled)
        throw new Error("Missing reminder scheduling evidence.");
      const state = o?.state ?? "active";
      return {
        id: r.id === "virtual" ? null : r.id,
        key: `${r.offsetDays}:${r.localTime}`,
        offsetDays: r.offsetDays,
        localTime: r.localTime,
        generation: r.generation,
        scheduledFor: scheduled ? iso(scheduled) : "",
        state: state as "active" | "dismissed" | "snoozed" | "cancelled",
        snoozedUntil: o?.snoozedUntil ? iso(o.snoozedUntil) : null,
        occurrenceId: o?.id ?? null,
        version: o?.version ?? 0,
        due:
          row.eligible &&
          row.reminders_enabled &&
          (state === "active" || state === "snoozed") &&
          new Date(o?.snoozedUntil ?? scheduled ?? row.now).getTime() <=
            new Date(row.now).getTime(),
      };
    });
  return {
    target,
    snapshot: digest({
      sourceVersion: row.source_version,
      key: row.occurrence_key,
      generation: row.source_generation,
      timezone: row.timezone,
      preference: row.preference_version,
      mode: row.mode,
      setting: row.setting_version,
      rules: row.rules,
      occurrences: row.occurrences,
    }),
    mode: row.mode,
    actions: row.actions,
    timezone: row.timezone,
    moduleRemindersEnabled: row.reminders_enabled,
    moduleHidden: !row.module_enabled,
    agendaVisible: row.agenda_visible,
    eligible: row.eligible,
    sourceVersion: row.source_version,
    occurrenceKey: row.occurrence_key,
    sourceGeneration: row.source_generation,
    title: row.title,
    sourceRoute: row.source_route,
    dueDate: row.due_date,
    remainingMinor: row.remaining_minor,
    configuration: selected
      .filter((r) => r.enabled)
      .map((r) => ({ offsetDays: r.offsetDays, localTime: r.localTime })),
    rules: row.eligible ? rules : [],
    history: row.occurrences.slice(0, 50).map((o) => ({
      ...o,
      scheduledFor: iso(o.scheduledFor),
      updatedAt: iso(o.updatedAt),
    })),
  };
}

export async function readReminderViewsInTransaction(
  tx: ScopedTransaction,
  workspaceId: string,
  sources: ReminderSource[],
): Promise<ReminderView[]> {
  return (await readReminderSources(tx, workspaceId, sources)).map(mapSource);
}
export async function getReminderInTransaction(
  tx: ScopedTransaction,
  workspaceId: string,
  target: ReminderTarget,
): Promise<ReminderView> {
  if ("sourceId" in target) {
    const row = (await readReminderSources(tx, workspaceId, [target]))[0];
    if (!row) throw new ReminderUnavailableError();
    return mapSource(row);
  }
  const { rules, context } = await readModuleReminderRules(
    tx,
    workspaceId,
    target.moduleKey,
  );
  if (!context) throw new ReminderUnavailableError();
  const selected = rules.length ? rules : [virtualRule];
  return {
    target,
    snapshot: digest({ rules, context }),
    mode: "override",
    timezone: context.timezone,
    moduleRemindersEnabled: context.reminders_enabled,
    moduleHidden: !context.enabled,
    agendaVisible: context.agenda_visible,
    eligible: true,
    sourceVersion: null,
    occurrenceKey: null,
    sourceGeneration: null,
    title: `${{ money: "Money", career: "Career", time: "Calendar" }[target.moduleKey]} reminder defaults`,
    sourceRoute: null,
    dueDate: null,
    remainingMinor: null,
    configuration: selected
      .filter((r) => r.enabled)
      .map((r) => ({ offsetDays: r.offsetDays, localTime: r.localTime })),
    rules: [],
    history: [],
  };
}
export async function getReminder(actor: Actor, target: ReminderTarget) {
  const a = actorSchema.parse(actor);
  const t = reminderTargetSchema.parse(target);
  return withDomainTransaction(
    a,
    (tx) => getReminderInTransaction(tx, a.workspaceId, t),
    { readOnlySnapshot: true },
  );
}
export async function getReminderAttention(actor: Actor) {
  const a = actorSchema.parse(actor);
  return withDomainTransaction(
    a,
    async (tx) => {
      const attention = await readReminderAttention(tx, a.workspaceId);
      return {
        total: attention.total,
        items: await readReminderViewsInTransaction(
          tx,
          a.workspaceId,
          attention.sources,
        ),
      };
    },
    { readOnlySnapshot: true },
  );
}

async function audit(
  tx: ScopedTransaction,
  actor: Actor,
  receiptId: string,
  subjectId: string,
  subjectKind: string,
  version: number,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  operation: string,
) {
  await createPrivateRevision(tx, {
    id: randomUUID(),
    workspaceId: actor.workspaceId,
    commandReceiptId: receiptId,
    subjectKind,
    subjectId,
    subjectVersion: version,
    operation,
    beforeJson: before,
    afterJson: after,
    reason: "Explicit in-app reminder control; source state is unchanged",
    effectiveDate: null,
    recordedByUserId: actor.userId,
    actorKind: "user",
    requestId: actor.requestId ?? null,
  });
}
async function saveRules(
  tx: ScopedTransaction,
  actor: Actor,
  receiptId: string,
  target: ReminderTarget,
  rules: { offsetDays: number; localTime: string }[],
) {
  const c =
    "sourceId" in target
      ? sourceColumns(target)
      : { personal: null, career: null, debt: null };
  const pred =
    "moduleKey" in target
      ? sql`module_key=${target.moduleKey}`
      : sourcePredicate(target);
  // Materialize the implicit due-day default before disabling it, so zero
  // enabled module rules cannot accidentally fall back to the virtual default.
  if ("moduleKey" in target) {
    const marker = await tx.db.execute<{ id: string }>(
      sql`INSERT INTO time.reminder_rule(workspace_id,module_key,offset_days,local_time,enabled) VALUES(${actor.workspaceId}::uuid,${target.moduleKey},0,'09:00',false) ON CONFLICT DO NOTHING RETURNING id`,
    );
    if (marker.rows[0])
      await audit(
        tx,
        actor,
        receiptId,
        marker.rows[0].id,
        "reminder_rule",
        1,
        null,
        { target, offsetDays: 0, localTime: "09:00", enabled: false },
        "create",
      );
  }
  const existing = await tx.db.execute<
    Record<string, unknown> & {
      id: string;
      version: number;
      enabled: boolean;
      offset_days: number;
      local_time: string;
    }
  >(
    sql`SELECT * FROM time.reminder_rule WHERE workspace_id=${actor.workspaceId}::uuid AND ${pred} FOR UPDATE`,
  );
  for (const r of existing.rows) {
    const enabled = rules.some(
      (x) =>
        x.offsetDays === r.offset_days && `${x.localTime}:00` === r.local_time,
    );
    if (enabled !== r.enabled) {
      const result = await tx.db.execute<{ version: number }>(
        sql`UPDATE time.reminder_rule SET enabled=${enabled} WHERE workspace_id=${actor.workspaceId}::uuid AND id=${r.id}::uuid RETURNING version`,
      );
      await audit(
        tx,
        actor,
        receiptId,
        r.id,
        "reminder_rule",
        result.rows[0]!.version,
        r,
        { ...r, enabled },
        "settings",
      );
    }
  }
  for (const r of rules) {
    if (
      existing.rows.some(
        (x) =>
          x.offset_days === r.offsetDays &&
          x.local_time === `${r.localTime}:00`,
      )
    )
      continue;
    const result = await tx.db.execute<{ id: string; version: number }>(
      sql`INSERT INTO time.reminder_rule(workspace_id,personal_event_id,application_event_id,debt_obligation_id,module_key,offset_days,local_time) VALUES(${actor.workspaceId}::uuid,${c.personal}::uuid,${c.career}::uuid,${c.debt}::uuid,${"moduleKey" in target ? target.moduleKey : null},${r.offsetDays},${r.localTime}::time) RETURNING id,version`,
    );
    const saved = result.rows[0]!;
    await audit(
      tx,
      actor,
      receiptId,
      saved.id,
      "reminder_rule",
      saved.version,
      null,
      { ...r, target, enabled: true },
      "create",
    );
  }
}

export async function mutateReminderInTransaction(
  tx: ScopedTransaction,
  actorInput: Actor,
  commandInput: ReminderCommand,
): Promise<{ saved: true }> {
  const actor = actorSchema.parse(actorInput);
  const command = reminderCommandSchema.parse(commandInput);
  await lockActivePrivateWorkspace(tx, actor);
  const receipt = await claimCommandReceipt(tx, {
    workspaceId: actor.workspaceId,
    clientCommandId: command.clientCommandId,
    commandType: "time.control_reminder",
    payloadHash: hashCommandPayload({
      target: command.target,
      expectedSnapshot: command.expectedSnapshot,
      action: command.action,
    }),
  });
  if (receipt.kind === "replay")
    return z.object({ saved: z.literal(true) }).parse(receipt.result);
  await lockReminderTarget(tx, actor.workspaceId, command.target);
  const before = await getReminderInTransaction(
    tx,
    actor.workspaceId,
    command.target,
  );
  if (before.snapshot !== command.expectedSnapshot)
    throw new ReminderConflictError();
  if (!before.eligible) throw new ReminderUnavailableError();
  const action = command.action;
  if (action.kind === "settings") {
    if ("sourceId" in command.target) {
      const c = sourceColumns(command.target);
      const prior = await tx.db.execute<Record<string, unknown>>(
        sql`SELECT * FROM time.source_reminder_setting WHERE workspace_id=${actor.workspaceId}::uuid AND ${sourcePredicate(command.target)}`,
      );
      const saved = await tx.db.execute<{ id: string; version: number }>(
        sql`INSERT INTO time.source_reminder_setting(workspace_id,personal_event_id,application_event_id,debt_obligation_id,mode) VALUES(${actor.workspaceId}::uuid,${c.personal}::uuid,${c.career}::uuid,${c.debt}::uuid,${action.mode}) ON CONFLICT ON CONSTRAINT uq_reminder_setting_source DO UPDATE SET mode=excluded.mode RETURNING id,version`,
      );
      await audit(
        tx,
        actor,
        receipt.receiptId,
        saved.rows[0]!.id,
        "source_reminder_setting",
        saved.rows[0]!.version,
        prior.rows[0] ?? null,
        { mode: action.mode, target: command.target },
        "settings",
      );
    }
    await saveRules(
      tx,
      actor,
      receipt.receiptId,
      command.target,
      action.mode === "override" ? action.rules : [],
    );
  } else {
    if (!("sourceId" in command.target))
      throw new InvalidReminderActionError(
        "An occurrence control requires a source.",
      );
    if (!before.moduleRemindersEnabled || before.mode === "off")
      throw new InvalidReminderActionError(
        "Enable this source's reminders before changing an occurrence.",
      );
    const rule = before.rules.find((r) => r.key === action.ruleKey);
    if (!rule || rule.state === "cancelled") throw new ReminderConflictError();
    let snoozedUntil: string | null = null;
    if (action.kind === "snooze") {
      snoozedUntil = iso(action.snoozedUntil);
      const clock = await tx.db.execute<{ now: string }>(
        sql`SELECT clock_timestamp()::text now`,
      );
      const distance =
        new Date(snoozedUntil).getTime() -
        new Date(clock.rows[0]!.now).getTime();
      if (distance <= 0 || distance > 365 * 86400000)
        throw new InvalidReminderActionError(
          "Choose a future snooze time within one year. The source deadline stays unchanged.",
        );
    }
    let ruleId = rule.id;
    if (!ruleId) {
      const moduleKey =
        command.target.sourceKind === "personal_event"
          ? "time"
          : command.target.sourceKind === "application_event"
            ? "career"
            : "money";
      const inserted = await tx.db.execute<{ id: string }>(
        sql`INSERT INTO time.reminder_rule(workspace_id,module_key,offset_days,local_time) VALUES(${actor.workspaceId}::uuid,${moduleKey},0,'09:00') ON CONFLICT DO NOTHING RETURNING id`,
      );
      ruleId =
        inserted.rows[0]?.id ??
        (
          await tx.db.execute<{ id: string }>(
            sql`SELECT id FROM time.reminder_rule WHERE workspace_id=${actor.workspaceId}::uuid AND module_key=${moduleKey} AND offset_days=0 AND local_time='09:00'`,
          )
        ).rows[0]!.id;
      if (inserted.rows[0])
        await audit(
          tx,
          actor,
          receipt.receiptId,
          ruleId,
          "reminder_rule",
          1,
          null,
          { moduleKey, offsetDays: 0, localTime: "09:00", enabled: true },
          "create",
        );
    }
    const c = sourceColumns(command.target);
    const state =
      action.kind === "dismiss"
        ? "dismissed"
        : action.kind === "snooze"
          ? "snoozed"
          : "active";
    const saved = await tx.db.execute<{
      id: string;
      version: number;
    }>(sql`INSERT INTO time.reminder_occurrence(workspace_id,rule_id,personal_event_id,application_event_id,debt_obligation_id,occurrence_key,source_generation,rule_generation,scheduled_for,state,snoozed_until,dismissed_at)
      VALUES(${actor.workspaceId}::uuid,${ruleId}::uuid,${c.personal}::uuid,${c.career}::uuid,${c.debt}::uuid,${before.occurrenceKey},${before.sourceGeneration},${rule.generation},${rule.scheduledFor}::timestamptz,${state},${snoozedUntil}::timestamptz,CASE WHEN ${state}='dismissed' THEN clock_timestamp() ELSE NULL END)
      ON CONFLICT ON CONSTRAINT uq_reminder_occurrence_logical DO UPDATE SET state=excluded.state,snoozed_until=excluded.snoozed_until,dismissed_at=excluded.dismissed_at RETURNING id,version`);
    await audit(
      tx,
      actor,
      receipt.receiptId,
      saved.rows[0]!.id,
      "reminder_occurrence",
      saved.rows[0]!.version,
      { state: rule.state, snoozedUntil: rule.snoozedUntil },
      {
        target: command.target,
        state,
        snoozedUntil,
        scheduledFor: rule.scheduledFor,
        occurrenceKey: before.occurrenceKey,
        sourceGeneration: before.sourceGeneration,
        ruleGeneration: rule.generation,
      },
      action.kind,
    );
  }
  // Run derived cancellations now, in addition to deferred source constraints,
  // so the next read cannot apply a dismissed state from an obsolete rule.
  await tx.db.execute(
    sql`SET CONSTRAINTS "time".reminder_rule_reminder_cancellation,"time".source_reminder_setting_reminder_cancellation IMMEDIATE`,
  );
  await tx.db.execute(
    sql`SET CONSTRAINTS "time".reminder_rule_reminder_cancellation,"time".source_reminder_setting_reminder_cancellation DEFERRED`,
  );
  await completeCommandReceipt(tx, {
    workspaceId: actor.workspaceId,
    receiptId: receipt.receiptId,
    result: { saved: true },
  });
  return { saved: true };
}
export async function mutateReminder(actor: Actor, command: ReminderCommand) {
  return withDomainTransaction(actor, (tx) =>
    mutateReminderInTransaction(tx, actor, command),
  );
}
