import { sql } from "drizzle-orm";

import type {
  AgendaDisplayModule,
  AgendaSourceKind,
  AgendaTemporalKind,
} from "@/modules/time/domain/agenda";
import type { ScopedTransaction } from "@/platform/db";
import type { CalendarDate } from "@/shared/calendar-date";

export type AgendaCursorPosition = {
  agendaDate: CalendarDate;

  temporalKind: AgendaTemporalKind;
  startsAt: string | null;

  sourceKind: AgendaSourceKind;
  sourceId: string;
  occurrenceKey: string;
};

export type AgendaListQueryRow = {
  workspace_timezone: string;
  workspace_today: string;

  source_kind: string | null;
  source_id: string | null;
  occurrence_key: string | null;

  application_id: string | null;
  debt_id: string | null;

  title: string | null;

  display_module: string | null;

  notification_generation: number | null;

  temporal_kind: string | null;

  agenda_date: string | null;

  event_date: string | null;
  end_date_exclusive: string | null;

  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;

  status: string | null;

  source_version: number | null;

  timing_state: string | null;

  module_reminders_enabled: boolean | null;
};

function buildModulePredicate(modules: readonly AgendaDisplayModule[]) {
  const includeCareer = modules.includes("career");
  const includeTime = modules.includes("time");
  const includeMoney = modules.includes("money");

  return sql`
    (
      (
        ${includeCareer}::boolean
        AND source."display_module" = 'career'
      )
      OR
      (
        ${includeTime}::boolean
        AND source."display_module" = 'time'
      )
      OR (${includeMoney}::boolean AND source."display_module" = 'money')
    )
  `;
}

function buildCursorPredicate(cursor: AgendaCursorPosition | null) {
  if (cursor === null) {
    return sql`TRUE`;
  }

  const temporalSort = cursor.temporalKind === "date" ? 0 : 1;

  return sql`
    ROW(
      source."agenda_date",
      source."temporal_sort",
      source."sort_instant",
      source."source_kind",
      source."source_id",
      source."occurrence_key"
    )
    >
    ROW(
      ${cursor.agendaDate}::date,
      ${temporalSort},
      COALESCE(
        ${cursor.startsAt}::timestamptz,
        '-infinity'::timestamptz
      ),
      ${cursor.sourceKind},
      ${cursor.sourceId}::uuid,
      ${cursor.occurrenceKey}
    )
  `;
}

export async function readAgendaPage(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;

    startDate: CalendarDate;
    endDate: CalendarDate;

    modules: readonly AgendaDisplayModule[];

    limit: number;

    cursor: AgendaCursorPosition | null;
  },
): Promise<AgendaListQueryRow[]> {
  const modulePredicate = buildModulePredicate(input.modules);

  const cursorPredicate = buildCursorPredicate(input.cursor);

  const result = await transaction.db.execute<AgendaListQueryRow>(sql`
      WITH "workspace_context" AS (
        SELECT
          workspace."id" AS "workspace_id",
          workspace."timezone",

          (
            clock_timestamp()
              AT TIME ZONE workspace."timezone"
          )::date AS "workspace_today",

          (
            ${input.startDate}::date::timestamp
              AT TIME ZONE workspace."timezone"
          ) AS "range_start",

          (
            (
              ${input.endDate}::date + 1
            )::timestamp
              AT TIME ZONE workspace."timezone"
          ) AS "range_end"

        FROM core."workspace" AS workspace

        WHERE
          workspace."id" =
            ${input.workspaceId}::uuid
      ),

      "mapped_sources" AS (
        SELECT
          agenda."source_kind",
          agenda."source_id",
          agenda."occurrence_key",

          career_event."application_id",
          debt_obligation."debt_id",

          agenda."title",

          CASE
            WHEN agenda."source_kind" =
              'application_event'
            THEN 'career'
            WHEN agenda."source_kind" =
              'personal_event'
            THEN 'time'
            WHEN agenda."source_kind" = 'debt_installment' THEN 'money'
            ELSE NULL
          END AS "display_module",

          agenda."notification_generation",

          agenda."temporal_kind",

          CASE
            WHEN agenda."temporal_kind" = 'date'
            THEN agenda."event_date"

            WHEN agenda."temporal_kind" = 'timed'
            THEN (
              agenda."starts_at"
                AT TIME ZONE context."timezone"
            )::date

            ELSE NULL
          END AS "agenda_date",

          CASE
            WHEN agenda."temporal_kind" = 'date'
            THEN 0
            ELSE 1
          END AS "temporal_sort",

          CASE
            WHEN agenda."temporal_kind" = 'timed'
            THEN agenda."starts_at"
            ELSE '-infinity'::timestamptz
          END AS "sort_instant",

          agenda."event_date",
          agenda."end_date_exclusive",

          agenda."starts_at",
          agenda."ends_at",
          agenda."timezone",

          agenda."status",

          agenda."source_version",

          context."workspace_today"

        FROM "workspace_context" AS context

        CROSS JOIN time."agenda_v" AS agenda

        LEFT JOIN career."application_event"
          AS career_event
          ON agenda."source_kind" =
            'application_event'

          AND career_event."workspace_id" =
            context."workspace_id"

          AND career_event."id" =
            agenda."source_id"

        LEFT JOIN finance."debt_obligation" AS debt_obligation
          ON agenda."source_kind"='debt_installment'
          AND debt_obligation."workspace_id"=context."workspace_id"
          AND debt_obligation."id"=agenda."source_id"

        WHERE
          (
            agenda."temporal_kind" = 'date'

            AND agenda."event_date" >=
              ${input.startDate}::date

            AND agenda."event_date" <=
              ${input.endDate}::date
          )

          OR

          (
            agenda."temporal_kind" = 'timed'

            AND agenda."starts_at" >=
              context."range_start"

            AND agenda."starts_at" <
              context."range_end"
          )
      ),

      "visible_sources" AS (
        SELECT
          source.*,

          COALESCE(
            preference."reminders_enabled",
            TRUE
          ) AS "module_reminders_enabled"

        FROM "mapped_sources" AS source

        LEFT JOIN core."module_preference"
          AS preference
          ON preference."workspace_id" =
            ${input.workspaceId}::uuid
          AND preference."module_key" =
            source."display_module"

        WHERE
          source."display_module" IS NOT NULL

          /*
           * Navigation enablement and Agenda visibility are separate
           * preferences. A disabled module may still expose its Agenda
           * sources.
           *
           * Absence of a preference row means the documented default:
           * visible.
           */
          AND COALESCE(
            preference."agenda_visible",
            TRUE
          )

          AND ${modulePredicate}
      ),

      "paged_sources" AS (
        SELECT
          source.*

        FROM "visible_sources" AS source

        WHERE ${cursorPredicate}

        ORDER BY
          source."agenda_date" ASC,
          source."temporal_sort" ASC,
          source."sort_instant" ASC,
          source."source_kind" ASC,
          source."source_id" ASC,
          source."occurrence_key" ASC

        LIMIT ${input.limit}
      )

      SELECT
        context."timezone"
          AS "workspace_timezone",

        context."workspace_today"::text
          AS "workspace_today",

        source."source_kind",
        source."source_id",
        source."occurrence_key",

        source."application_id",
        source."debt_id",

        source."title",

        source."display_module",

        source."notification_generation",

        source."temporal_kind",

        source."agenda_date"::text
          AS "agenda_date",

        source."event_date"::text
          AS "event_date",

        source."end_date_exclusive"::text
          AS "end_date_exclusive",

        to_char(
          source."starts_at"
            AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) AS "starts_at",

        to_char(
          source."ends_at"
            AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) AS "ends_at",

        source."timezone",

        source."status",

        source."source_version",

        CASE
          WHEN source."source_id" IS NULL
          THEN NULL

          WHEN source."agenda_date" <
            context."workspace_today"
          THEN 'overdue'

          WHEN source."agenda_date" =
            context."workspace_today"
          THEN 'today'

          ELSE 'upcoming'
        END AS "timing_state",

        source."module_reminders_enabled"

      FROM "workspace_context" AS context

      LEFT JOIN "paged_sources" AS source
        ON TRUE

      ORDER BY
        source."agenda_date" ASC NULLS LAST,
        source."temporal_sort" ASC NULLS LAST,
        source."sort_instant" ASC NULLS LAST,
        source."source_kind" ASC NULLS LAST,
        source."source_id" ASC NULLS LAST,
        source."occurrence_key" ASC NULLS LAST
    `);

  return result.rows;
}
