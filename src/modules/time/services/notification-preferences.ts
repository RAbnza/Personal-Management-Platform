import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  withDomainTransaction,
  type ScopedTransaction,
  type ScopedDatabaseContext,
} from "@/platform/db";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  defaultNotificationPreferences,
  notificationCommandSchema,
  NotificationConflictError,
  NotificationIdentityError,
  type NotificationCommand,
  type NotificationPreferences,
} from "../domain/notification";

export async function readNotificationPreferences(tx: ScopedTransaction) {
  const r = (
    await tx.db.execute<{ preferences: NotificationPreferences }>(
      sql`SELECT jsonb_build_object('enabled',enabled,'enabledAt',enabled_at,'timezone',timezone,'quietStart',quiet_start,'quietEnd',quiet_end,'includeDueDate',include_due_date,'version',version) preferences FROM time.notification_preference`,
    )
  ).rows[0];
  return r?.preferences ?? { ...defaultNotificationPreferences };
}
export async function getNotificationSettings(actor: ScopedDatabaseContext) {
  return withDomainTransaction(
    actor,
    async (tx) => {
      const preferences = await readNotificationPreferences(tx);
      const rows = await tx.db.execute<{
        id: string;
        status: string;
        scheduled_at: string;
        accepted_at: string | null;
        delivered_at: string | null;
        last_error_code: string | null;
        total: string;
        source_kind: string;
        source_id: string;
      }>(
        sql`SELECT d.id,d.status,d.scheduled_at::text,d.accepted_at::text,d.delivered_at::text,d.last_error_code,count(*) OVER()::text total,CASE WHEN o.personal_event_id IS NOT NULL THEN 'personal_event' WHEN o.application_event_id IS NOT NULL THEN 'application_event' WHEN o.debt_obligation_id IS NOT NULL THEN 'debt_installment' WHEN o.card_statement_id IS NOT NULL THEN 'card_statement' WHEN o.card_installment_id IS NOT NULL THEN 'card_installment' WHEN o.tracker_entry_id IS NOT NULL THEN 'tracker_entry' ELSE 'expected_occurrence' END source_kind,COALESCE(o.personal_event_id,o.application_event_id,o.debt_obligation_id,o.card_statement_id,o.card_installment_id,o.expected_occurrence_id,o.tracker_entry_id)::text source_id FROM time.notification_delivery d JOIN time.reminder_occurrence o ON o.workspace_id=d.workspace_id AND o.id=d.reminder_occurrence_id ORDER BY d.created_at DESC,d.id DESC LIMIT 50`,
      );
      return {
        preferences,
        deliveries: rows.rows,
        total: Number(rows.rows[0]?.total ?? 0),
        deliveryEnabled: process.env.NOTIFICATIONS_ENABLED === "true",
        externalEnabled: process.env.NOTIFICATIONS_EXTERNAL_ENABLED === "true",
      };
    },
    { readOnlySnapshot: true },
  );
}
export async function saveNotificationPreferencesInTransaction(
  tx: ScopedTransaction,
  actor: ScopedDatabaseContext,
  raw: NotificationCommand,
) {
  const command = notificationCommandSchema.parse(raw);
  await lockActivePrivateWorkspace(tx, actor);
  await tx.db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${actor.workspaceId}||':notifications',0))`,
  );
  const receipt = await claimCommandReceipt(tx, {
    workspaceId: actor.workspaceId,
    clientCommandId: command.clientCommandId,
    commandType: "time.notification.preferences",
    payloadHash: hashCommandPayload(command),
  });
  if (receipt.kind === "replay") return receipt.result;
  const before = await readNotificationPreferences(tx);
  if (before.version !== command.expectedVersion)
    throw new NotificationConflictError();
  if (
    command.preferences.enabled &&
    !(
      await tx.db.execute<{ email: string | null }>(
        sql`SELECT ops.notification_recipient() email`,
      )
    ).rows[0]?.email
  )
    throw new NotificationIdentityError();
  const p = command.preferences;
  const saved = (
    await tx.db.execute<{ id: string; version: number }>(
      sql`INSERT INTO time.notification_preference(workspace_id,user_id,enabled,timezone,quiet_start,quiet_end,include_due_date,command_receipt_id) VALUES(${actor.workspaceId}::uuid,${actor.userId}::uuid,${p.enabled},${p.timezone},${p.quietStart},${p.quietEnd},${p.includeDueDate},${receipt.receiptId}::uuid) ON CONFLICT(workspace_id) DO UPDATE SET enabled=excluded.enabled,timezone=excluded.timezone,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,include_due_date=excluded.include_due_date,command_receipt_id=excluded.command_receipt_id,version=time.notification_preference.version+1 RETURNING id,version`,
    )
  ).rows[0]!;
  await createPrivateRevision(tx, {
    id: randomUUID(),
    workspaceId: actor.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "notification_preference",
    subjectId: saved.id,
    subjectVersion: saved.version,
    operation: "notification.preferences",
    beforeJson: before,
    afterJson: await readNotificationPreferences(tx),
    reason: null,
    effectiveDate: null,
    recordedByUserId: actor.userId,
    actorKind: "user",
    requestId: null,
  });
  const result = { saved: true, version: saved.version };
  await completeCommandReceipt(tx, {
    workspaceId: actor.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  return result;
}
export async function saveNotificationPreferences(
  actor: ScopedDatabaseContext,
  command: NotificationCommand,
) {
  return withDomainTransaction(actor, (tx) =>
    saveNotificationPreferencesInTransaction(tx, actor, command),
  );
}
