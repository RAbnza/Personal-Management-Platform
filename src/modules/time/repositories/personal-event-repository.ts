import { sql } from "drizzle-orm";

import type { PersonalEventTemporalKind } from "@/modules/time/domain/personal-event";
import type { ScopedTransaction } from "@/platform/db";
import type { CalendarDate } from "@/shared/calendar-date";

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
