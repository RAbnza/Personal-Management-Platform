import { sql } from "drizzle-orm";

import type {
  ApplicationEventStatus,
  ApplicationEventTemporalKind,
  CareerActionableEventKind,
} from "@/modules/career/domain/application-event";
import type { ScopedTransaction } from "@/platform/db";
import type { CalendarDate } from "@/shared/calendar-date";

type JobApplicationForEventRow = {
  id: string;
  version: number;
  next_action_event_id: string | null;
  archived: boolean;
};

type ApplicationEventRow = {
  id: string;
  application_id: string;

  event_kind: string;
  title: string;

  temporal_kind: string;
  event_date: string | null;

  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;

  status: string;

  location: string | null;
  meeting_url: string | null;
  preparation_notes: string | null;
  outcome_notes: string | null;

  completed_at: string | null;

  notification_generation: number;
  version: number;
};

type UpdatedApplicationEventRow = {
  version: number;
  notification_generation: number;
  completed_at: string | null;
};

type UpdatedApplicationRow = {
  version: number;
};

type ReplacementEventRow = {
  id: string;
};

export type JobApplicationForEvent = {
  applicationId: string;
  version: number;
  nextActionEventId: string | null;
  archived: boolean;
};

export type LockedApplicationEvent = {
  eventId: string;
  applicationId: string;

  eventKind: CareerActionableEventKind;
  title: string;

  temporalKind: ApplicationEventTemporalKind;
  eventDate: CalendarDate | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  status: ApplicationEventStatus;

  location: string | null;
  meetingUrl: string | null;
  preparationNotes: string | null;
  outcomeNotes: string | null;

  completedAt: string | null;

  notificationGeneration: number;
  version: number;
};

export type UpdatedApplicationEvent = {
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

async function lockJobApplicationForEvent(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
  },
): Promise<JobApplicationForEvent | null> {
  const result = await transaction.db.execute<JobApplicationForEventRow>(sql`
      SELECT
        application."id",
        application."version",
        application."next_action_event_id",
        application."archived_at" IS NOT NULL AS "archived"
      FROM career."job_application" AS application
      WHERE
        application."workspace_id" = ${input.workspaceId}::uuid
        AND application."id" = ${input.applicationId}::uuid
      FOR UPDATE OF application
    `);

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    applicationId: row.id,
    version: row.version,
    nextActionEventId: row.next_action_event_id,
    archived: row.archived,
  };
}

export async function lockJobApplicationForEventCreation(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
  },
): Promise<JobApplicationForEvent | null> {
  return lockJobApplicationForEvent(transaction, input);
}

export async function lockJobApplicationForEventMutation(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
  },
): Promise<JobApplicationForEvent | null> {
  return lockJobApplicationForEvent(transaction, input);
}

export async function lockApplicationEventForMutation(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    eventId: string;
  },
): Promise<LockedApplicationEvent | null> {
  const result = await transaction.db.execute<ApplicationEventRow>(sql`
    SELECT
      event."id",
      event."application_id",

      event."event_kind",
      event."title",

      event."temporal_kind",
      event."event_date"::text AS "event_date",

      event."starts_at"::text AS "starts_at",
      event."ends_at"::text AS "ends_at",
      event."timezone",

      event."status",

      event."location",
      event."meeting_url",
      event."preparation_notes",
      event."outcome_notes",

      event."completed_at"::text AS "completed_at",

      event."notification_generation",
      event."version"
    FROM career."application_event" AS event
    WHERE
      event."workspace_id" = ${input.workspaceId}::uuid
      AND event."application_id" = ${input.applicationId}::uuid
      AND event."id" = ${input.eventId}::uuid
      AND event."event_kind" IN (
        'interview',
        'assessment',
        'follow_up'
      )
    FOR UPDATE OF event
  `);

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    eventId: row.id,
    applicationId: row.application_id,

    eventKind: row.event_kind as CareerActionableEventKind,
    title: row.title,

    temporalKind: row.temporal_kind as ApplicationEventTemporalKind,
    eventDate: row.event_date as CalendarDate | null,

    startsAt: normalizeInstant(row.starts_at),
    endsAt: normalizeInstant(row.ends_at),
    timezone: row.timezone,

    status: row.status as ApplicationEventStatus,

    location: row.location,
    meetingUrl: row.meeting_url,
    preparationNotes: row.preparation_notes,
    outcomeNotes: row.outcome_notes,

    completedAt: normalizeInstant(row.completed_at),

    notificationGeneration: row.notification_generation,
    version: row.version,
  };
}

export async function lockReplacementNextActionEvent(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    eventId: string;
    excludedEventId: string;
  },
): Promise<boolean> {
  const result = await transaction.db.execute<ReplacementEventRow>(sql`
    SELECT event."id"
    FROM career."application_event" AS event
    WHERE
      event."workspace_id" = ${input.workspaceId}::uuid
      AND event."application_id" = ${input.applicationId}::uuid
      AND event."id" = ${input.eventId}::uuid
      AND event."id" <> ${input.excludedEventId}::uuid
      AND event."status" = 'scheduled'
      AND event."event_kind" IN (
        'interview',
        'assessment',
        'follow_up'
      )
    FOR UPDATE OF event
  `);

  return result.rows[0] !== undefined;
}

export async function createScheduledApplicationEvent(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    applicationId: string;

    eventKind: CareerActionableEventKind;
    title: string;

    temporalKind: ApplicationEventTemporalKind;

    eventDate: CalendarDate | null;

    startsAt: string | null;
    endsAt: string | null;
    timezone: string | null;

    location: string | null;
    meetingUrl: string | null;
    preparationNotes: string | null;

    recordedByUserId: string;
    requestId: string | null;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO career."application_event" (
      "id",
      "workspace_id",
      "application_id",
      "event_kind",
      "title",
      "temporal_kind",
      "event_date",
      "starts_at",
      "ends_at",
      "timezone",
      "status",
      "location",
      "meeting_url",
      "preparation_notes",
      "outcome_notes",
      "completed_at",
      "recorded_by_user_id",
      "actor_kind",
      "request_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.applicationId}::uuid,
      ${input.eventKind},
      ${input.title},
      ${input.temporalKind},
      ${input.eventDate}::date,
      ${input.startsAt}::timestamptz,
      ${input.endsAt}::timestamptz,
      ${input.timezone},
      'scheduled',
      ${input.location},
      ${input.meetingUrl},
      ${input.preparationNotes},
      NULL,
      NULL,
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function rescheduleApplicationEvent(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    eventId: string;

    expectedVersion: number;

    temporalKind: ApplicationEventTemporalKind;

    eventDate: CalendarDate | null;

    startsAt: string | null;
    endsAt: string | null;
    timezone: string | null;
  },
): Promise<UpdatedApplicationEvent | null> {
  const result = await transaction.db.execute<UpdatedApplicationEventRow>(sql`
      UPDATE career."application_event"
      SET
        "temporal_kind" = ${input.temporalKind},
        "event_date" = ${input.eventDate}::date,
        "starts_at" = ${input.startsAt}::timestamptz,
        "ends_at" = ${input.endsAt}::timestamptz,
        "timezone" = ${input.timezone}
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "application_id" = ${input.applicationId}::uuid
        AND "id" = ${input.eventId}::uuid
        AND "version" = ${input.expectedVersion}
        AND "status" = 'scheduled'
      RETURNING
        "version",
        "notification_generation",
        "completed_at"::text AS "completed_at"
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

export async function finishApplicationEvent(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    eventId: string;

    expectedVersion: number;

    status: "completed" | "cancelled";
    outcomeNotes: string | null;
  },
): Promise<UpdatedApplicationEvent | null> {
  const result = await transaction.db.execute<UpdatedApplicationEventRow>(sql`
      UPDATE career."application_event"
      SET
        "status" = ${input.status},
        "outcome_notes" = ${input.outcomeNotes},
        "completed_at" =
          CASE
            WHEN ${input.status} = 'completed'
            THEN clock_timestamp()
            ELSE NULL
          END
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "application_id" = ${input.applicationId}::uuid
        AND "id" = ${input.eventId}::uuid
        AND "version" = ${input.expectedVersion}
        AND "status" = 'scheduled'
      RETURNING
        "version",
        "notification_generation",
        "completed_at"::text AS "completed_at"
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

export async function updateJobApplicationNextAction(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    nextActionEventId: string | null;
    expectedVersion: number;
  },
): Promise<number | null> {
  const result = await transaction.db.execute<UpdatedApplicationRow>(sql`
    UPDATE career."job_application"
    SET
      "next_action_event_id" =
        ${input.nextActionEventId}::uuid
    WHERE
      "workspace_id" = ${input.workspaceId}::uuid
      AND "id" = ${input.applicationId}::uuid
      AND "version" = ${input.expectedVersion}
      AND "archived_at" IS NULL
    RETURNING "version"
  `);

  return result.rows[0]?.version ?? null;
}

export async function setJobApplicationNextAction(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    eventId: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  return updateJobApplicationNextAction(transaction, {
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
    nextActionEventId: input.eventId,
    expectedVersion: input.expectedVersion,
  });
}
