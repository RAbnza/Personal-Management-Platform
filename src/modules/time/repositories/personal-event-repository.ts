import { sql } from "drizzle-orm";

import type {
  PersonalEventStatus,
  PersonalEventTemporalKind,
} from "@/modules/time/domain/personal-event";
import type { ScopedTransaction } from "@/platform/db";
import type { CalendarDate } from "@/shared/calendar-date";

type PersonalEventRow = {
  id: string;

  title: string;

  temporal_kind: string;

  event_date: string | null;
  end_date_exclusive: string | null;

  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;

  status: string;

  description: string | null;
  location: string | null;
  reference_url: string | null;

  completed_at: string | null;

  notification_generation: number;
  version: number;
};

type UpdatedPersonalEventRow = {
  version: number;
  notification_generation: number;
  completed_at: string | null;
};

export type LockedPersonalEvent = {
  eventId: string;

  title: string;

  temporalKind: PersonalEventTemporalKind;

  eventDate: CalendarDate | null;
  endDateExclusive: CalendarDate | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  status: PersonalEventStatus;

  description: string | null;
  location: string | null;
  referenceUrl: string | null;

  completedAt: string | null;

  notificationGeneration: number;
  version: number;
};

export type UpdatedPersonalEvent = {
  version: number;
  notificationGeneration: number;
  completedAt: string | null;
};

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

export async function lockPersonalEventForMutation(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    eventId: string;
  },
): Promise<LockedPersonalEvent | null> {
  const result = await transaction.db.execute<PersonalEventRow>(sql`
    SELECT
      event."id",

      event."title",

      event."temporal_kind",

      event."event_date"::text
        AS "event_date",

      event."end_date_exclusive"::text
        AS "end_date_exclusive",

      event."starts_at"::text
        AS "starts_at",

      event."ends_at"::text
        AS "ends_at",

      event."timezone",

      event."status",

      event."description",
      event."location",
      event."reference_url",

      event."completed_at"::text
        AS "completed_at",

      event."notification_generation",
      event."version"

    FROM time."personal_event" AS event

    WHERE
      event."workspace_id" =
        ${input.workspaceId}::uuid

      AND event."id" =
        ${input.eventId}::uuid

    FOR UPDATE OF event
  `);

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    eventId: row.id,

    title: row.title,

    temporalKind: row.temporal_kind as PersonalEventTemporalKind,

    eventDate: row.event_date as CalendarDate | null,

    endDateExclusive: row.end_date_exclusive as CalendarDate | null,

    startsAt: normalizeInstant(row.starts_at),

    endsAt: normalizeInstant(row.ends_at),

    timezone: row.timezone,

    status: row.status as PersonalEventStatus,

    description: row.description,
    location: row.location,
    referenceUrl: row.reference_url,

    completedAt: normalizeInstant(row.completed_at),

    notificationGeneration: row.notification_generation,

    version: row.version,
  };
}

export async function createScheduledPersonalEvent(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;

    title: string;

    temporalKind: PersonalEventTemporalKind;

    eventDate: CalendarDate | null;
    endDateExclusive: CalendarDate | null;

    startsAt: string | null;
    endsAt: string | null;
    timezone: string | null;

    description: string | null;
    location: string | null;
    referenceUrl: string | null;

    recordedByUserId: string;
    requestId: string | null;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO time."personal_event" (
      "id",
      "workspace_id",

      "title",
      "temporal_kind",

      "event_date",
      "end_date_exclusive",

      "starts_at",
      "ends_at",
      "timezone",

      "status",

      "description",
      "location",
      "reference_url",

      "completed_at",

      "recorded_by_user_id",
      "actor_kind",
      "request_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,

      ${input.title},
      ${input.temporalKind},

      ${input.eventDate}::date,
      ${input.endDateExclusive}::date,

      ${input.startsAt}::timestamptz,
      ${input.endsAt}::timestamptz,
      ${input.timezone},

      'scheduled',

      ${input.description},
      ${input.location},
      ${input.referenceUrl},

      NULL,

      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function updateScheduledPersonalEvent(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    eventId: string;

    expectedVersion: number;

    title: string;

    temporalKind: PersonalEventTemporalKind;

    eventDate: CalendarDate | null;
    endDateExclusive: CalendarDate | null;

    startsAt: string | null;
    endsAt: string | null;
    timezone: string | null;

    description: string | null;
    location: string | null;
    referenceUrl: string | null;
  },
): Promise<UpdatedPersonalEvent | null> {
  const result = await transaction.db.execute<UpdatedPersonalEventRow>(sql`
      UPDATE time."personal_event"

      SET
        "title" = ${input.title},

        "temporal_kind" =
          ${input.temporalKind},

        "event_date" =
          ${input.eventDate}::date,

        "end_date_exclusive" =
          ${input.endDateExclusive}::date,

        "starts_at" =
          ${input.startsAt}::timestamptz,

        "ends_at" =
          ${input.endsAt}::timestamptz,

        "timezone" =
          ${input.timezone},

        "description" =
          ${input.description},

        "location" =
          ${input.location},

        "reference_url" =
          ${input.referenceUrl}

      WHERE
        "workspace_id" =
          ${input.workspaceId}::uuid

        AND "id" =
          ${input.eventId}::uuid

        AND "version" =
          ${input.expectedVersion}

        AND "status" = 'scheduled'

      RETURNING
        "version",

        "notification_generation",

        "completed_at"::text
          AS "completed_at"
    `);

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    version: row.version,

    notificationGeneration: row.notification_generation,

    completedAt: normalizeInstant(row.completed_at),
  };
}

export async function finishPersonalEvent(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    eventId: string;

    expectedVersion: number;

    status: "completed" | "cancelled";
  },
): Promise<UpdatedPersonalEvent | null> {
  const result = await transaction.db.execute<UpdatedPersonalEventRow>(sql`
      UPDATE time."personal_event"

      SET
        "status" = ${input.status},

        "completed_at" =
          CASE
            WHEN ${input.status} = 'completed'
            THEN clock_timestamp()
            ELSE NULL
          END

      WHERE
        "workspace_id" =
          ${input.workspaceId}::uuid

        AND "id" =
          ${input.eventId}::uuid

        AND "version" =
          ${input.expectedVersion}

        AND "status" = 'scheduled'

      RETURNING
        "version",

        "notification_generation",

        "completed_at"::text
          AS "completed_at"
    `);

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    version: row.version,

    notificationGeneration: row.notification_generation,

    completedAt: normalizeInstant(row.completed_at),
  };
}
