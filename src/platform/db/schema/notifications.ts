import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { timeSchema } from "./namespaces";
import { workspace, commandReceipt } from "./core";
import { user } from "./auth.generated";
import { reminderOccurrence } from "./reminders";

const stamp = (name: string) => timestamp(name, { withTimezone: true });
export const notificationPreference = timeSchema.table(
  "notification_preference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    enabled: boolean("enabled").notNull().default(false),
    enabledAt: stamp("enabled_at"),
    timezone: text("timezone"),
    quietStart: text("quiet_start"),
    quietEnd: text("quiet_end"),
    includeDueDate: boolean("include_due_date").notNull().default(false),
    version: integer("version").notNull().default(1),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    updatedAt: stamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("uq_notification_preference_workspace").on(t.workspaceId),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    check(
      "ck_notification_preference",
      sql`${t.version}>0 AND (${t.enabled}=(${t.enabledAt} IS NOT NULL)) AND ((${t.quietStart} IS NULL AND ${t.quietEnd} IS NULL) OR (${t.quietStart} IS NOT NULL AND ${t.quietEnd} IS NOT NULL AND ${t.quietStart} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.quietEnd} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.quietStart}<>${t.quietEnd}))`,
    ),
  ],
);

export const notificationDelivery = timeSchema.table(
  "notification_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    reminderOccurrenceId: uuid("reminder_occurrence_id").notNull(),
    logicalKey: text("logical_key").notNull(),
    status: text("status").notNull().default("scheduled"),
    scheduledAt: stamp("scheduled_at").notNull(),
    providerMessageId: text("provider_message_id").unique(),
    acceptedAt: stamp("accepted_at"),
    deliveredAt: stamp("delivered_at"),
    lastErrorCode: text("last_error_code"),
    createdAt: stamp("created_at").notNull().defaultNow(),
    updatedAt: stamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("uq_notification_delivery_scope").on(t.workspaceId, t.id),
    unique("uq_notification_delivery_key").on(t.workspaceId, t.logicalKey),
    unique("uq_notification_delivery_occurrence").on(
      t.workspaceId,
      t.reminderOccurrenceId,
    ),
    foreignKey({
      columns: [t.workspaceId, t.reminderOccurrenceId],
      foreignColumns: [reminderOccurrence.workspaceId, reminderOccurrence.id],
    }),
    index("ix_notification_delivery_due").on(t.status, t.scheduledAt, t.id),
    check(
      "ck_notification_delivery_status",
      sql`${t.status} IN ('scheduled','attempted','accepted','delivered','suppressed','cancelled','failed','bounced','uncertain') AND (${t.acceptedAt} IS NULL OR ${t.providerMessageId} IS NOT NULL) AND (${t.deliveredAt} IS NULL OR ${t.acceptedAt} IS NOT NULL)`,
    ),
  ],
);

export const notificationAttempt = timeSchema.table(
  "notification_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    deliveryId: uuid("delivery_id").notNull(),
    attemptNo: integer("attempt_no").notNull(),
    outcome: text("outcome").notNull().default("attempted"),
    recipientFingerprint: text("recipient_fingerprint").notNull(),
    startedAt: stamp("started_at").notNull().defaultNow(),
    finishedAt: stamp("finished_at"),
  },
  (t) => [
    unique("uq_notification_attempt_no").on(
      t.workspaceId,
      t.deliveryId,
      t.attemptNo,
    ),
    foreignKey({
      columns: [t.workspaceId, t.deliveryId],
      foreignColumns: [
        notificationDelivery.workspaceId,
        notificationDelivery.id,
      ],
    }),
    check(
      "ck_notification_attempt",
      sql`${t.attemptNo} BETWEEN 1 AND 3 AND ${t.outcome} IN ('attempted','accepted','rejected','uncertain') AND ${t.recipientFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const notificationProviderEvent = timeSchema.table(
  "notification_provider_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    deliveryId: uuid("delivery_id").notNull(),
    providerEventId: text("provider_event_id").notNull().unique(),
    eventType: text("event_type").notNull(),
    occurredAt: stamp("occurred_at").notNull(),
    receivedAt: stamp("received_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.deliveryId],
      foreignColumns: [
        notificationDelivery.workspaceId,
        notificationDelivery.id,
      ],
    }),
    check(
      "ck_notification_event",
      sql`${t.eventType} IN ('email.sent','email.delivered','email.bounced','email.failed') AND char_length(${t.providerEventId}) BETWEEN 1 AND 200`,
    ),
  ],
);
