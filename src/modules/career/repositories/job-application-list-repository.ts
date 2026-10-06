import { sql } from "drizzle-orm";

import type { CareerApplicationStage } from "@/modules/career/domain/application";
import type { ScopedTransaction } from "@/platform/db";
import type { CalendarDate } from "@/shared/calendar-date";

export type JobApplicationListCursorPosition = {
  appliedDate: CalendarDate | null;
  applicationId: string;
};

export type JobApplicationListArchiveFilter = "active" | "archived" | "all";

export type JobApplicationListQueryRow = {
  workspace_id: string;

  application_id: string | null;

  company_name: string | null;
  role_title: string | null;

  location: string | null;
  work_arrangement: string | null;

  applied_date: string | null;

  current_stage: string | null;
  current_outcome: string | null;

  archived: boolean | null;
  version: number | null;

  next_action_event_id: string | null;
  next_event_kind: string | null;
  next_title: string | null;
  next_temporal_kind: string | null;
  next_event_date: string | null;
  next_starts_at: string | null;
  next_ends_at: string | null;
  next_timezone: string | null;
};

function buildArchivePredicate(archive: JobApplicationListArchiveFilter) {
  switch (archive) {
    case "active":
      return sql`application."archived_at" IS NULL`;

    case "archived":
      return sql`application."archived_at" IS NOT NULL`;

    case "all":
      return sql`TRUE`;
  }
}

function buildStagePredicate(stage: CareerApplicationStage | null) {
  if (stage === null) {
    return sql`TRUE`;
  }

  return sql`
    application."current_stage" = ${stage}
  `;
}

function buildSearchPredicate(search: string | null) {
  if (search === null) {
    return sql`TRUE`;
  }

  /*
   * strpos() gives us literal substring search. Unlike ILIKE '%...%',
   * characters such as % and _ in user input do not become accidental SQL
   * wildcard syntax.
   */
  return sql`
    (
      strpos(
        lower(application."company_name"),
        lower(${search})
      ) > 0
      OR
      strpos(
        lower(application."role_title"),
        lower(${search})
      ) > 0
    )
  `;
}

function buildCursorPredicate(cursor: JobApplicationListCursorPosition | null) {
  if (cursor === null) {
    return sql`TRUE`;
  }

  /*
   * The list orders submitted applications first:
   *
   *   applied_date DESC NULLS LAST,
   *   id DESC
   *
   * Once pagination reaches the NULL applied-date partition, subsequent pages
   * remain in that partition and continue by UUID.
   */
  if (cursor.appliedDate === null) {
    return sql`
      application."applied_date" IS NULL
      AND application."id" < ${cursor.applicationId}::uuid
    `;
  }

  return sql`
    (
      application."applied_date" < ${cursor.appliedDate}::date
      OR application."applied_date" IS NULL
      OR (
        application."applied_date" = ${cursor.appliedDate}::date
        AND application."id" < ${cursor.applicationId}::uuid
      )
    )
  `;
}

export async function readJobApplicationListPage(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;

    archive: JobApplicationListArchiveFilter;
    stage: CareerApplicationStage | null;
    search: string | null;

    limit: number;

    cursor: JobApplicationListCursorPosition | null;
  },
): Promise<JobApplicationListQueryRow[]> {
  const archivePredicate = buildArchivePredicate(input.archive);

  const stagePredicate = buildStagePredicate(input.stage);

  const searchPredicate = buildSearchPredicate(input.search);

  const cursorPredicate = buildCursorPredicate(input.cursor);

  const result = await transaction.db.execute<JobApplicationListQueryRow>(sql`
    WITH workspace_context AS (
      SELECT
        workspace."id"

      FROM core."workspace"
        AS workspace

      WHERE
        workspace."id" =
          ${input.workspaceId}::uuid

        AND workspace."kind" =
          'personal'

        AND workspace."state" =
          'active'
    ),

    application_page AS (
      SELECT
        application."id"
          AS "application_id",

        application."company_name",
        application."role_title",

        application."location",
        application."work_arrangement",

        application."applied_date"::text
          AS "applied_date",

        application."current_stage",
        application."current_outcome",

        (
          application."archived_at" IS NOT NULL
        ) AS "archived",

        application."version",

        application."next_action_event_id",

        next_event."event_kind"
          AS "next_event_kind",

        next_event."title"
          AS "next_title",

        next_event."temporal_kind"
          AS "next_temporal_kind",

        next_event."event_date"::text
          AS "next_event_date",

        to_char(
          next_event."starts_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) AS "next_starts_at",

        to_char(
          next_event."ends_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) AS "next_ends_at",

        next_event."timezone"
          AS "next_timezone"

      FROM career."job_application"
        AS application

      INNER JOIN workspace_context
        AS workspace
        ON workspace."id" =
          application."workspace_id"

      LEFT JOIN career."application_event"
        AS next_event
        ON next_event."workspace_id" =
          application."workspace_id"
        AND next_event."application_id" =
          application."id"
        AND next_event."id" =
          application."next_action_event_id"

      WHERE
        ${archivePredicate}
        AND ${stagePredicate}
        AND ${searchPredicate}
        AND ${cursorPredicate}

      ORDER BY
        application."applied_date"
          DESC NULLS LAST,

        application."id"
          DESC

      LIMIT ${input.limit}
    )

    SELECT
      workspace."id"
        AS "workspace_id",

      application."application_id",

      application."company_name",
      application."role_title",

      application."location",
      application."work_arrangement",

      application."applied_date",

      application."current_stage",
      application."current_outcome",

      application."archived",
      application."version",

      application."next_action_event_id",

      application."next_event_kind",
      application."next_title",
      application."next_temporal_kind",
      application."next_event_date",
      application."next_starts_at",
      application."next_ends_at",
      application."next_timezone"

    FROM workspace_context
      AS workspace

    LEFT JOIN application_page
      AS application
      ON TRUE

    ORDER BY
      application."applied_date"
        DESC NULLS LAST,

      application."application_id"
        DESC
  `);

  return result.rows;
}
