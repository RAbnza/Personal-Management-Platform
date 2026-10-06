import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type JobApplicationDetailStageHistoryRow = {
  historyId: string;

  sequenceNo: number;

  stage: string;
  outcome: string | null;

  effectiveDate: string;
  effectiveOrder: number;

  supersedesHistoryId: string | null;
  supersededByHistoryId: string | null;

  reason: string | null;

  recordedAt: string;

  isCurrent: boolean;
};

export type JobApplicationDetailEventRow = {
  eventId: string;

  eventKind: string;
  title: string;

  temporalKind: string;

  eventDate: string | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  status: string;

  location: string | null;
  meetingUrl: string | null;

  preparationNotes: string | null;
  outcomeNotes: string | null;

  completedAt: string | null;

  notificationGeneration: number;

  createdAt: string;
  updatedAt: string;

  version: number;

  isNextAction: boolean;
};

export type JobApplicationDetailQueryRow = {
  application_id: string;

  company_name: string;
  role_title: string;

  posting_url: string | null;
  source_name: string | null;
  role_description_snapshot: string | null;

  location: string | null;
  work_arrangement: string | null;

  salary_min_minor: string | null;
  salary_max_minor: string | null;
  salary_currency: string | null;
  salary_period: string | null;

  technology_tags: string[];

  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;

  resume_version_id: string | null;
  resume_label: string | null;
  resume_reference_url: string | null;
  resume_notes: string | null;
  resume_archived: boolean | null;

  applied_date: string | null;

  current_stage: string;
  current_outcome: string | null;

  current_history_id: string;

  next_action_event_id: string | null;

  notes: string | null;

  archived: boolean;

  created_at: string;
  updated_at: string;

  version: number;

  stage_history: JobApplicationDetailStageHistoryRow[];

  events: JobApplicationDetailEventRow[];
};

export async function readJobApplicationDetail(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
  },
): Promise<JobApplicationDetailQueryRow | null> {
  /*
   * Application metadata, immutable stage evidence and mutable application
   * events are assembled by one PostgreSQL statement.
   *
   * Under READ COMMITTED this is important: one statement observes one
   * PostgreSQL snapshot. We therefore cannot return an application header from
   * one version together with stage/event history observed after a concurrent
   * Career mutation.
   */
  const result = await transaction.db.execute<JobApplicationDetailQueryRow>(sql`
      SELECT
        application."id"
          AS "application_id",

        application."company_name",
        application."role_title",

        application."posting_url",
        application."source_name",
        application."role_description_snapshot",

        application."location",
        application."work_arrangement",

        application."salary_min_minor"::text
          AS "salary_min_minor",

        application."salary_max_minor"::text
          AS "salary_max_minor",

        application."salary_currency",
        application."salary_period",

        application."technology_tags",

        application."contact_name",
        application."contact_email",
        application."contact_phone",

        resume."id"
          AS "resume_version_id",

        resume."label"
          AS "resume_label",

        resume."reference_url"
          AS "resume_reference_url",

        resume."notes"
          AS "resume_notes",

        CASE
          WHEN resume."id" IS NULL
          THEN NULL
          ELSE resume."archived_at" IS NOT NULL
        END
          AS "resume_archived",

        application."applied_date"::text
          AS "applied_date",

        application."current_stage",
        application."current_outcome",

        application."current_history_id",

        application."next_action_event_id",

        application."notes",

        (
          application."archived_at"
          IS NOT NULL
        )
          AS "archived",

        to_char(
          application."created_at"
            AT TIME ZONE 'UTC',

          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
          AS "created_at",

        to_char(
          application."updated_at"
            AT TIME ZONE 'UTC',

          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
          AS "updated_at",

        application."version",

        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'historyId',
                  history."id",

                'sequenceNo',
                  history."sequence_no",

                'stage',
                  history."stage",

                'outcome',
                  history."outcome",

                'effectiveDate',
                  history."effective_date"::text,

                'effectiveOrder',
                  history."effective_order",

                'supersedesHistoryId',
                  history."supersedes_history_id",

                'supersededByHistoryId',
                  correction."id",

                'reason',
                  history."reason",

                'recordedAt',
                  to_char(
                    history."created_at"
                      AT TIME ZONE 'UTC',

                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                  ),

                'isCurrent',
                  (
                    history."id" =
                    application."current_history_id"
                  )
              )

              ORDER BY
                history."effective_date" ASC,
                history."effective_order" ASC,
                history."sequence_no" ASC,
                history."id" ASC
            )

            FROM career."application_stage_history"
              AS history

            LEFT JOIN career."application_stage_history"
              AS correction
              ON correction."workspace_id" =
                history."workspace_id"

              AND correction."application_id" =
                history."application_id"

              AND correction."supersedes_history_id" =
                history."id"

            WHERE
              history."workspace_id" =
                application."workspace_id"

              AND history."application_id" =
                application."id"
          ),

          '[]'::jsonb
        )
          AS "stage_history",

        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'eventId',
                  event."id",

                'eventKind',
                  event."event_kind",

                'title',
                  event."title",

                'temporalKind',
                  event."temporal_kind",

                'eventDate',
                  event."event_date"::text,

                'startsAt',
                  CASE
                    WHEN event."starts_at" IS NULL
                    THEN NULL
                    ELSE to_char(
                      event."starts_at"
                        AT TIME ZONE 'UTC',

                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    )
                  END,

                'endsAt',
                  CASE
                    WHEN event."ends_at" IS NULL
                    THEN NULL
                    ELSE to_char(
                      event."ends_at"
                        AT TIME ZONE 'UTC',

                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    )
                  END,

                'timezone',
                  event."timezone",

                'status',
                  event."status",

                'location',
                  event."location",

                'meetingUrl',
                  event."meeting_url",

                'preparationNotes',
                  event."preparation_notes",

                'outcomeNotes',
                  event."outcome_notes",

                'completedAt',
                  CASE
                    WHEN event."completed_at" IS NULL
                    THEN NULL
                    ELSE to_char(
                      event."completed_at"
                        AT TIME ZONE 'UTC',

                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    )
                  END,

                'notificationGeneration',
                  event."notification_generation",

                'createdAt',
                  to_char(
                    event."created_at"
                      AT TIME ZONE 'UTC',

                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                  ),

                'updatedAt',
                  to_char(
                    event."updated_at"
                      AT TIME ZONE 'UTC',

                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                  ),

                'version',
                  event."version",

                'isNextAction',
                  (
                    event."id" =
                    application."next_action_event_id"
                  )
              )

              ORDER BY
                COALESCE(
                  event."starts_at",

                  event."event_date"::timestamp
                    AT TIME ZONE 'UTC'
                )
                  ASC,

                event."created_at" ASC,

                event."id" ASC
            )

            FROM career."application_event"
              AS event

            WHERE
              event."workspace_id" =
                application."workspace_id"

              AND event."application_id" =
                application."id"
          ),

          '[]'::jsonb
        )
          AS "events"

      FROM career."job_application"
        AS application

      LEFT JOIN career."resume_version"
        AS resume
        ON resume."workspace_id" =
          application."workspace_id"

        AND resume."id" =
          application."resume_version_id"

      WHERE
        application."workspace_id" =
          ${input.workspaceId}::uuid

        AND application."id" =
          ${input.applicationId}::uuid
    `);

  return result.rows[0] ?? null;
}
