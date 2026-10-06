import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user as authUser } from "./auth.generated";
import { workspace } from "./core";
import { timeSchema } from "./namespaces";

export const personalEvent = timeSchema.table(
  "personal_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),

    title: text("title").notNull(),
    temporalKind: text("temporal_kind").notNull(),

    eventDate: date("event_date", {
      mode: "string",
    }),
    endDateExclusive: date("end_date_exclusive", {
      mode: "string",
    }),

    startsAt: timestamp("starts_at", {
      withTimezone: true,
    }),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
    }),
    timezone: text("timezone"),

    status: text("status").default("scheduled").notNull(),

    description: text("description"),
    location: text("location"),
    referenceUrl: text("reference_url"),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),

    notificationGeneration: integer("notification_generation")
      .default(1)
      .notNull(),

    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_personal_event_scope_id").on(table.workspaceId, table.id),

    index("ix_personal_event_date")
      .on(table.workspaceId, table.status, table.eventDate, table.id)
      .where(sql`${table.temporalKind} = 'date'`),

    index("ix_personal_event_timed")
      .on(table.workspaceId, table.status, table.startsAt, table.id)
      .where(sql`${table.temporalKind} = 'timed'`),

    check(
      "ck_personal_event_title",
      sql`
        char_length(${table.title}) BETWEEN 1 AND 200
      `,
    ),
    check(
      "ck_personal_event_temporal_kind",
      sql`${table.temporalKind} IN ('date', 'timed')`,
    ),
    check(
      "ck_personal_event_temporal_shape",
      sql`
        (
          ${table.temporalKind} = 'date'
          AND ${table.eventDate} IS NOT NULL
          AND (
            ${table.endDateExclusive} IS NULL
            OR ${table.endDateExclusive} > ${table.eventDate}
          )
          AND ${table.startsAt} IS NULL
          AND ${table.endsAt} IS NULL
          AND ${table.timezone} IS NULL
        )
        OR
        (
          ${table.temporalKind} = 'timed'
          AND ${table.eventDate} IS NULL
          AND ${table.endDateExclusive} IS NULL
          AND ${table.startsAt} IS NOT NULL
          AND ${table.timezone} IS NOT NULL
          AND (
            ${table.endsAt} IS NULL
            OR ${table.endsAt} > ${table.startsAt}
          )
        )
      `,
    ),
    check(
      "ck_personal_event_status",
      sql`
        ${table.status}
        IN ('scheduled', 'completed', 'cancelled')
      `,
    ),
    check(
      "ck_personal_event_completion",
      sql`
        (
          ${table.status} = 'completed'
          AND ${table.completedAt} IS NOT NULL
        )
        OR
        (
          ${table.status} <> 'completed'
          AND ${table.completedAt} IS NULL
        )
      `,
    ),
    check(
      "ck_personal_event_description",
      sql`
        ${table.description} IS NULL
        OR char_length(${table.description}) <= 2000
      `,
    ),
    check(
      "ck_personal_event_reference_url",
      sql`
        ${table.referenceUrl} IS NULL
        OR char_length(${table.referenceUrl}) <= 2048
      `,
    ),
    check(
      "ck_personal_event_timezone",
      sql`
        ${table.timezone} IS NULL
        OR char_length(${table.timezone}) BETWEEN 1 AND 100
      `,
    ),
    check(
      "ck_personal_event_notification_generation",
      sql`${table.notificationGeneration} > 0`,
    ),
    check(
      "ck_personal_event_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_personal_event_actor_user",
      sql`
        ${table.actorKind} <> 'user'
        OR ${table.recordedByUserId} IS NOT NULL
      `,
    ),
    check("ck_personal_event_version", sql`${table.version} > 0`),
  ],
);
