import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { fromDrizzle } from "pg-boss";
import type { Pool } from "pg";
import { z } from "zod";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import type { ScopedTransaction, ScopedDatabaseContext } from "@/platform/db";
import {
  createRuntimeBossWithDatabase,
  NOTIFICATION_EMAIL_QUEUE,
} from "@/platform/jobs/boss";
import { readReminderViewsInTransaction } from "@/modules/time/services/reminders";
import { sourceColumns } from "@/modules/time/repositories/reminder-repository";
import type {
  ReminderSource,
  ReminderView,
} from "@/modules/time/domain/reminder";
import { readNotificationPreferences } from "@/modules/time/services/notification-preferences";
import {
  notificationMessage,
  type NotificationPreferences,
} from "@/modules/time/domain/notification";
import { EmailProviderError, sendEmailWithReceipt } from "./sender";

const jobSchema = z
  .object({ schemaVersion: z.literal(1), deliveryId: z.uuid() })
  .strict();
export function notificationsAllowed() {
  return (
    process.env.NOTIFICATIONS_ENABLED === "true" &&
    (process.env.EMAIL_PROVIDER === "mailpit" ||
      (process.env.EMAIL_PROVIDER === "resend" &&
        process.env.NOTIFICATIONS_EXTERNAL_ENABLED === "true" &&
        !!process.env.NOTIFICATION_WEBHOOK_SECRET))
  );
}
async function scopeTransaction<T>(
  pool: Pool,
  actor: ScopedDatabaseContext,
  fn: (tx: ScopedTransaction) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    return await runScopedTransactionOnClient(client, actor, fn);
  } finally {
    client.release();
  }
}
async function serialize(tx: ScopedTransaction, actor: ScopedDatabaseContext) {
  await tx.db.execute(sql`SELECT ops.lock_notification_scope()`);
  await tx.db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${actor.workspaceId}||':notifications',0))`,
  );
}
export async function notificationScheduledAt(
  tx: ScopedTransaction,
  instant: string,
  p: NotificationPreferences,
) {
  if (p.quietStart === null) return instant;
  return (
    await tx.db.execute<{ at: string }>(
      sql`WITH local AS (SELECT ${instant}::timestamptz at,COALESCE(${p.timezone},timezone) zone FROM core.workspace),civil AS (SELECT *,at AT TIME ZONE zone t FROM local) SELECT (CASE WHEN ${p.quietStart}::text IS NULL THEN at WHEN ${p.quietStart}::time<${p.quietEnd}::time AND t::time>=${p.quietStart}::time AND t::time<${p.quietEnd}::time THEN (t::date+${p.quietEnd}::time) AT TIME ZONE zone WHEN ${p.quietStart}::time>${p.quietEnd}::time AND t::time>=${p.quietStart}::time THEN ((t::date+1)+${p.quietEnd}::time) AT TIME ZONE zone WHEN ${p.quietStart}::time>${p.quietEnd}::time AND t::time<${p.quietEnd}::time THEN (t::date+${p.quietEnd}::time) AT TIME ZONE zone ELSE at END)::text at FROM civil`,
    )
  ).rows[0]!.at;
}
async function enqueue(tx: ScopedTransaction, id: string, at: string) {
  const database = fromDrizzle(tx.db, sql);
  const job = await createRuntimeBossWithDatabase(database).send(
    NOTIFICATION_EMAIL_QUEUE,
    { schemaVersion: 1, deliveryId: id },
    { db: database, startAfter: new Date(at) },
  );
  if (!job) throw new Error("notification_queue_unavailable");
}
function valid(view: ReminderView) {
  return view.eligible && view.moduleRemindersEnabled && view.mode !== "off";
}
/** Persisted opt-in + source rows are recoverable polling intent. There is no
 * post-commit source enqueue. Jobs and delivery evidence commit together. */
export async function scanNotificationScope(
  pool: Pool,
  actor: ScopedDatabaseContext,
) {
  return scopeTransaction(pool, actor, (tx) =>
    scanNotificationScopeInTransaction(tx, actor),
  );
}
export async function scanNotificationScopeInTransaction(
  tx: ScopedTransaction,
  actor: ScopedDatabaseContext,
) {
  await serialize(tx, actor);
  const p = await readNotificationPreferences(tx);
  if (!p.enabled) return { sources: 0, scheduled: 0 };
  const sources = (
    await tx.db.execute<{
      source_kind: ReminderSource["sourceKind"];
      source_id: string;
    }>(
      sql`SELECT source_kind,source_id FROM time.agenda_v ORDER BY source_kind,source_id LIMIT 10001`,
    )
  ).rows;
  if (sources.length > 10000) throw new Error("notification_source_limit");
  const current = new Set<string>();
  let scheduled = 0;
  for (let start = 0; start < sources.length; start += 100) {
    const targets = sources
      .slice(start, start + 100)
      .map((r) => ({ sourceKind: r.source_kind, sourceId: r.source_id }));
    let views = await readReminderViewsInTransaction(
      tx,
      actor.workspaceId,
      targets,
    );
    // Materialize the established virtual defaults only for opted-in sources.
    for (const v of views)
      if (valid(v) && v.rules.some((r) => r.id === null)) {
        const m =
          (v.target as ReminderSource).sourceKind === "personal_event"
            ? "time"
            : (v.target as ReminderSource).sourceKind === "application_event"
              ? "career"
              : "money";
        await tx.db.execute(
          sql`INSERT INTO time.reminder_rule(workspace_id,module_key,offset_days,local_time) VALUES(${actor.workspaceId}::uuid,${m},0,'09:00') ON CONFLICT DO NOTHING`,
        );
      }
    views = await readReminderViewsInTransaction(
      tx,
      actor.workspaceId,
      targets,
    );
    const retirementKey = (
      v: (typeof views)[number],
      r: (typeof v.rules)[number],
    ) =>
      JSON.stringify([
        (v.target as ReminderSource).sourceKind,
        (v.target as ReminderSource).sourceId,
        v.sourceGeneration,
        r.generation,
        r.offsetDays,
        r.localTime,
      ]);
    const candidates = views.filter(valid).flatMap((v) =>
      v.rules
        .filter((r) => r.id && ["active", "snoozed"].includes(r.state))
        .map((r) => ({
          key: retirementKey(v, r),
          kind: (v.target as ReminderSource).sourceKind,
          source_id: (v.target as ReminderSource).sourceId,
          source_generation: v.sourceGeneration,
          rule_generation: r.generation,
          offset_days: r.offsetDays,
          local_time: r.localTime,
        })),
    );
    const retired = new Set(
      (
        await tx.db.execute<{ key: string }>(
          sql`SELECT key FROM jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb) AS c(key text,kind text,source_id uuid,source_generation integer,rule_generation integer,offset_days integer,local_time text) WHERE ops.notification_generation_retired(c.kind,c.source_id,c.source_generation,c.rule_generation,c.offset_days,c.local_time)`,
        )
      ).rows.map((r) => r.key),
    );
    const occurrenceIds = views.flatMap((v) =>
      v.rules.flatMap((r) => (r.occurrenceId ? [r.occurrenceId] : [])),
    );
    const existingDeliveries = new Map(
      occurrenceIds.length
        ? (
            await tx.db.execute<{
              id: string;
              reminder_occurrence_id: string;
              status: string;
              scheduled_at: string;
            }>(
              sql`SELECT id,reminder_occurrence_id,status,scheduled_at::text FROM time.notification_delivery WHERE reminder_occurrence_id=ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(occurrenceIds)}::jsonb))::uuid[])`,
            )
          ).rows.map((d) => [d.reminder_occurrence_id, d] as const)
        : [],
    );
    for (const v of views) {
      if (!valid(v)) continue;
      const c = sourceColumns(v.target as ReminderSource);
      for (const r of v.rules) {
        if (!r.id || !["active", "snoozed"].includes(r.state)) continue;
        if (retired.has(retirementKey(v, r))) continue;
        const existing = r.occurrenceId
          ? existingDeliveries.get(r.occurrenceId)
          : undefined;
        if (existing) {
          current.add(existing.reminder_occurrence_id);
          if (existing.status === "scheduled") {
            const at = await notificationScheduledAt(
              tx,
              r.snoozedUntil ?? r.scheduledFor,
              p,
            );
            if (
              new Date(existing.scheduled_at).getTime() !==
              new Date(at).getTime()
            ) {
              const changed = (
                await tx.db.execute<{ id: string }>(
                  sql`UPDATE time.notification_delivery SET scheduled_at=${at}::timestamptz WHERE id=${existing.id}::uuid AND status='scheduled' AND scheduled_at<>${at}::timestamptz RETURNING id`,
                )
              ).rows[0];
              if (changed) {
                await enqueue(tx, changed.id, at);
                scheduled++;
              }
            }
          }
          continue;
        }
        const occurrence = (
          await tx.db.execute<{ id: string }>(
            sql`INSERT INTO time.reminder_occurrence(workspace_id,rule_id,personal_event_id,application_event_id,debt_obligation_id,card_statement_id,card_installment_id,expected_occurrence_id,occurrence_key,source_generation,rule_generation,scheduled_for) VALUES(${actor.workspaceId}::uuid,${r.id}::uuid,${c.personal}::uuid,${c.career}::uuid,${c.debt}::uuid,${c.statement}::uuid,${c.installment}::uuid,${c.recurring}::uuid,${v.occurrenceKey},${v.sourceGeneration},${r.generation},${r.scheduledFor}::timestamptz) ON CONFLICT ON CONSTRAINT uq_reminder_occurrence_logical DO NOTHING RETURNING id`,
          )
        ).rows[0];
        const occurrenceId = r.occurrenceId ?? occurrence?.id;
        if (!occurrenceId) throw new Error("notification_occurrence_missing");
        current.add(occurrenceId);
        const base = r.snoozedUntil ?? r.scheduledFor;
        const at = await notificationScheduledAt(tx, base, p);
        const status =
          new Date(r.scheduledFor) < new Date(p.enabledAt!)
            ? "suppressed"
            : "scheduled";
        const inserted = (
          await tx.db.execute<{ id: string }>(
            sql`INSERT INTO time.notification_delivery(workspace_id,reminder_occurrence_id,logical_key,status,scheduled_at,last_error_code) VALUES(${actor.workspaceId}::uuid,${occurrenceId}::uuid,${"email/" + occurrenceId},${status},${at}::timestamptz,${status === "suppressed" ? "predates_opt_in" : null}) ON CONFLICT(workspace_id,reminder_occurrence_id) DO NOTHING RETURNING id`,
          )
        ).rows[0];
        if (inserted && status === "scheduled") {
          await enqueue(tx, inserted.id, at);
          scheduled++;
        }
        if (!inserted) {
          const changed = (
            await tx.db.execute<{ id: string }>(
              sql`UPDATE time.notification_delivery SET scheduled_at=${at}::timestamptz WHERE reminder_occurrence_id=${occurrenceId}::uuid AND status='scheduled' AND scheduled_at<>${at}::timestamptz RETURNING id`,
            )
          ).rows[0];
          if (changed) {
            await enqueue(tx, changed.id, at);
            scheduled++;
          }
        }
      }
    }
  }
  const ids = [...current];
  const currentIds = sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
  await tx.db.execute(
    sql`UPDATE time.notification_delivery SET status='cancelled',last_error_code='source_or_rule_inactive' WHERE status IN('scheduled','failed') AND provider_message_id IS NULL AND NOT(reminder_occurrence_id=ANY(${currentIds}))`,
  );
  await tx.db.execute(
    sql`UPDATE time.notification_delivery SET status='uncertain',last_error_code='attempt_interrupted' WHERE status='attempted' AND updated_at<clock_timestamp()-interval '2 minutes'`,
  );
  return { sources: sources.length, scheduled };
}
type DeliveryRow = {
  provider_message_id: string | null;
  id: string;
  reminder_occurrence_id: string;
  status: string;
  scheduled_at: string;
  logical_key: string;
  source: ReminderSource;
  attempts: number;
};
export async function processNotificationEmail(
  pool: Pool,
  lookup: Pick<Pool, "query">,
  raw: unknown,
  send: typeof sendEmailWithReceipt = sendEmailWithReceipt,
) {
  const { deliveryId } = jobSchema.parse(raw);
  if (!notificationsAllowed()) return;
  const actor = (
    await lookup.query<ScopedDatabaseContext>(
      'SELECT user_id AS "userId",workspace_id AS "workspaceId" FROM ops.notification_scope($1)',
      [deliveryId],
    )
  ).rows[0];
  if (!actor) return;
  const claim = await scopeTransaction(pool, actor, async (tx) => {
    await serialize(tx, actor);
    const row = (
      await tx.db.execute<DeliveryRow>(
        sql`SELECT d.*,jsonb_build_object('sourceKind',CASE WHEN o.personal_event_id IS NOT NULL THEN 'personal_event' WHEN o.application_event_id IS NOT NULL THEN 'application_event' WHEN o.debt_obligation_id IS NOT NULL THEN 'debt_installment' WHEN o.card_statement_id IS NOT NULL THEN 'card_statement' WHEN o.card_installment_id IS NOT NULL THEN 'card_installment' ELSE 'expected_occurrence' END,'sourceId',COALESCE(o.personal_event_id,o.application_event_id,o.debt_obligation_id,o.card_statement_id,o.card_installment_id,o.expected_occurrence_id)) source,(SELECT count(*)::int FROM time.notification_attempt a WHERE a.delivery_id=d.id) attempts FROM time.notification_delivery d JOIN time.reminder_occurrence o ON o.workspace_id=d.workspace_id AND o.id=d.reminder_occurrence_id WHERE d.id=${deliveryId}::uuid FOR UPDATE OF d`,
      )
    ).rows[0];
    if (
      !row ||
      !["scheduled", "failed"].includes(row.status) ||
      row.attempts >= 3 ||
      row.provider_message_id !== null
    )
      return null;
    const p = await readNotificationPreferences(tx);
    const v = (
      await readReminderViewsInTransaction(tx, actor.workspaceId, [row.source])
    )[0];
    const r = v?.rules.find(
      (r) => r.occurrenceId === row.reminder_occurrence_id,
    );
    const cancel = async (code: string) => {
      await tx.db.execute(
        sql`UPDATE time.notification_delivery SET status='cancelled',last_error_code=${code} WHERE id=${deliveryId}::uuid`,
      );
      return null;
    };
    if (
      !p.enabled ||
      !v ||
      !valid(v) ||
      !r ||
      !["active", "snoozed"].includes(r.state)
    )
      return cancel("consent_or_source_inactive");
    const now = (
      await tx.db.execute<{ now: string }>(
        sql`SELECT clock_timestamp()::text now`,
      )
    ).rows[0]!.now;
    const base = r.snoozedUntil ?? r.scheduledFor;
    // Current quiet hours also apply when a worker catches up after downtime.
    const at = await notificationScheduledAt(
      tx,
      new Date(base) > new Date(now) ? base : now,
      p,
    );
    if (new Date(at) > new Date(now)) {
      await tx.db.execute(
        sql`UPDATE time.notification_delivery SET scheduled_at=${at}::timestamptz,status='scheduled' WHERE id=${deliveryId}::uuid`,
      );
      await enqueue(tx, deliveryId, at);
      return null;
    }
    const to = (
      await tx.db.execute<{ email: string | null }>(
        sql`SELECT ops.notification_recipient() email`,
      )
    ).rows[0]?.email;
    if (!to) return cancel("identity_inactive");
    const attempt = (
      await tx.db.execute<{ id: string }>(
        sql`INSERT INTO time.notification_attempt(workspace_id,delivery_id,attempt_no,recipient_fingerprint) VALUES(${actor.workspaceId}::uuid,${deliveryId}::uuid,${row.attempts + 1},${createHash("sha256").update(to).digest("hex")}) RETURNING id`,
      )
    ).rows[0]!;
    await tx.db.execute(
      sql`UPDATE time.notification_delivery SET status='attempted',last_error_code=NULL WHERE id=${deliveryId}::uuid`,
    );
    return {
      to,
      source: row.source,
      occurrenceId: row.reminder_occurrence_id,
      attemptId: attempt.id,
      key: row.logical_key,
      attemptNo: row.attempts + 1,
      message: notificationMessage(
        process.env.BETTER_AUTH_URL!,
        v.dueDate,
        p.includeDueDate,
      ),
    };
  });
  if (!claim) return;
  const stillEligible = await scopeTransaction(pool, actor, async (tx) => {
    const p = await readNotificationPreferences(tx);
    const v = (
      await readReminderViewsInTransaction(tx, actor.workspaceId, [
        claim.source,
      ])
    )[0];
    const r = v?.rules.find((r) => r.occurrenceId === claim.occurrenceId);
    const to = (
      await tx.db.execute<{ email: string | null }>(
        sql`SELECT ops.notification_recipient() email`,
      )
    ).rows[0]?.email;
    const now = (
      await tx.db.execute<{ now: string }>(
        sql`SELECT clock_timestamp()::text now`,
      )
    ).rows[0]!.now;
    const quietAt = await notificationScheduledAt(tx, now, p);
    if (
      p.enabled &&
      v &&
      valid(v) &&
      r &&
      ["active", "snoozed"].includes(r.state) &&
      to === claim.to &&
      new Date(r.snoozedUntil ?? r.scheduledFor) <= new Date(now) &&
      new Date(quietAt) <= new Date(now)
    )
      return notificationMessage(
        process.env.BETTER_AUTH_URL!,
        v.dueDate,
        p.includeDueDate,
      );
    await tx.db.execute(
      sql`UPDATE time.notification_attempt SET outcome='rejected',finished_at=clock_timestamp() WHERE id=${claim.attemptId}::uuid AND outcome='attempted'`,
    );
    if (
      p.enabled &&
      v &&
      valid(v) &&
      r &&
      ["active", "snoozed"].includes(r.state) &&
      to === claim.to &&
      new Date(quietAt) > new Date(now)
    ) {
      await tx.db.execute(
        sql`UPDATE time.notification_delivery SET status='scheduled',scheduled_at=${quietAt}::timestamptz,last_error_code='quiet_hours_changed' WHERE id=${deliveryId}::uuid AND status='attempted'`,
      );
      await enqueue(tx, deliveryId, quietAt);
      return null;
    }
    await tx.db.execute(
      sql`UPDATE time.notification_delivery SET status='cancelled',last_error_code='pre_send_revalidation' WHERE id=${deliveryId}::uuid AND status='attempted'`,
    );
    return null;
  });
  if (!stillEligible || !notificationsAllowed()) return;
  let outcome: "accepted" | "rejected" | "uncertain" = "uncertain",
    providerId: string | null = null;
  try {
    const receipt = await send(
      { to: claim.to, notificationId: deliveryId, ...stillEligible },
      `notification/${claim.key}`,
    );
    providerId = receipt.providerMessageId;
    outcome = providerId ? "accepted" : "uncertain";
  } catch (error) {
    outcome =
      error instanceof EmailProviderError && error.outcome === "rejected"
        ? "rejected"
        : "uncertain";
  }
  await scopeTransaction(pool, actor, async (tx) => {
    // Do not resurrect evidence removed or made inaccessible by deletion.
    const found = (
      await tx.db.execute<{ id: string }>(
        sql`SELECT id FROM time.notification_delivery WHERE id=${deliveryId}::uuid AND status='attempted' FOR UPDATE`,
      )
    ).rows[0];
    if (!found) return;
    await tx.db.execute(
      sql`UPDATE time.notification_attempt SET outcome=${outcome},finished_at=clock_timestamp() WHERE id=${claim.attemptId}::uuid AND outcome='attempted'`,
    );
    await tx.db.execute(
      sql`UPDATE time.notification_delivery SET status=${outcome === "rejected" ? "failed" : outcome},provider_message_id=${providerId},accepted_at=CASE WHEN ${outcome}='accepted' THEN clock_timestamp() ELSE NULL END,last_error_code=${outcome === "accepted" ? null : "provider_" + outcome} WHERE id=${deliveryId}::uuid`,
    );
    if (outcome === "rejected" && claim.attemptNo < 3)
      await enqueue(tx, deliveryId, new Date(Date.now() + 30000).toISOString());
  });
}
