import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type PersonalEventDetailQueryRow = {
  event_id: string;

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

  created_at: string;
  updated_at: string;

  version: number;
};

export async function readPersonalEventDetail(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    eventId: string;
  },
): Promise<PersonalEventDetailQueryRow | null> {
  const result = await transaction.db.execute<PersonalEventDetailQueryRow>(sql`
    SELECT
      event."id"
        AS "event_id",

      event."title",

      event."temporal_kind",

      event."event_date"::text
        AS "event_date",

      event."end_date_exclusive"::text
        AS "end_date_exclusive",

      CASE
        WHEN event."starts_at" IS NULL
        THEN NULL
        ELSE to_char(
          event."starts_at"
            AT TIME ZONE 'UTC',

          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      END
        AS "starts_at",

      CASE
        WHEN event."ends_at" IS NULL
        THEN NULL
        ELSE to_char(
          event."ends_at"
            AT TIME ZONE 'UTC',

          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      END
        AS "ends_at",

      event."timezone",

      event."status",

      event."description",
      event."location",
      event."reference_url",

      CASE
        WHEN event."completed_at" IS NULL
        THEN NULL
        ELSE to_char(
          event."completed_at"
            AT TIME ZONE 'UTC',

          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      END
        AS "completed_at",

      event."notification_generation",

      to_char(
        event."created_at"
          AT TIME ZONE 'UTC',

        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
        AS "created_at",

      to_char(
        event."updated_at"
          AT TIME ZONE 'UTC',

        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
        AS "updated_at",

      event."version"

    FROM time."personal_event"
      AS event

    WHERE
      event."workspace_id" =
        ${input.workspaceId}::uuid

      AND event."id" =
        ${input.eventId}::uuid
  `);

  return result.rows[0] ?? null;
}
