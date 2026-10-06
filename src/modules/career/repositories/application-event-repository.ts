import { sql } from "drizzle-orm";

import type {
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

type UpdatedApplicationRow = {
  version: number;
};

export type JobApplicationForEvent = {
  applicationId: string;
  version: number;
  nextActionEventId: string | null;
  archived: boolean;
};

export async function lockJobApplicationForEventCreation(
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

export async function setJobApplicationNextAction(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    eventId: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  const result = await transaction.db.execute<UpdatedApplicationRow>(sql`
    UPDATE career."job_application"
    SET
      "next_action_event_id" = ${input.eventId}::uuid
    WHERE
      "workspace_id" = ${input.workspaceId}::uuid
      AND "id" = ${input.applicationId}::uuid
      AND "version" = ${input.expectedVersion}
      AND "archived_at" IS NULL
    RETURNING "version"
  `);

  return result.rows[0]?.version ?? null;
}
