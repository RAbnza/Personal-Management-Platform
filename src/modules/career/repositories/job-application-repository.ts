import { sql } from "drizzle-orm";

import type {
  CareerApplicationOutcome,
  CareerApplicationStage,
  CareerSalaryPeriod,
  CareerWorkArrangement,
  PossibleDuplicateJobApplication,
} from "@/modules/career/domain/application";
import type { ScopedTransaction } from "@/platform/db";
import type { CalendarDate } from "@/shared/calendar-date";

type DuplicateApplicationRow = {
  id: string;
  archived: boolean;
};

function createTextArraySql(values: readonly string[]) {
  if (values.length === 0) {
    return sql`ARRAY[]::text[]`;
  }

  return sql`
    ARRAY[
      ${sql.join(
        values.map((value) => sql`${value}`),
        sql`, `,
      )}
    ]::text[]
  `;
}

export async function findPossibleDuplicateJobApplications(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    companyName: string;
    roleTitle: string;
  },
): Promise<PossibleDuplicateJobApplication[]> {
  const result = await transaction.db.execute<DuplicateApplicationRow>(sql`
    SELECT
      application."id",
      application."archived_at" IS NOT NULL AS "archived"
    FROM career."job_application" AS application
    WHERE
      application."workspace_id" = ${input.workspaceId}::uuid
      AND lower(btrim(application."company_name")) =
        lower(btrim(${input.companyName}::text))
      AND lower(btrim(application."role_title")) =
        lower(btrim(${input.roleTitle}::text))
    ORDER BY
      (application."archived_at" IS NULL) DESC,
      application."created_at" DESC,
      application."id" DESC
    LIMIT 5
  `);

  return result.rows.map((row) => ({
    applicationId: row.id,
    archived: row.archived,
  }));
}

/**
 * Lock the exact resume version before a new application begins referencing
 * it.
 *
 * This serializes application creation against edits to resume reference
 * metadata. Once this transaction commits, the existing database trigger sees
 * the application reference and prevents silent reference/notes rewrites.
 */
export async function lockResumeVersionForApplication(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    resumeVersionId: string;
  },
): Promise<void> {
  const result = await transaction.db.execute<{ id: string }>(sql`
    SELECT resume."id"
    FROM career."resume_version" AS resume
    WHERE
      resume."workspace_id" = ${input.workspaceId}::uuid
      AND resume."id" = ${input.resumeVersionId}::uuid
    FOR SHARE
  `);

  if (!result.rows[0]) {
    throw new RangeError(
      "The selected resume version does not exist in this workspace.",
    );
  }
}

export async function createJobApplicationRecord(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;

    companyName: string;
    roleTitle: string;

    postingUrl: string | null;
    sourceName: string | null;
    roleDescriptionSnapshot: string | null;
    location: string | null;
    workArrangement: CareerWorkArrangement | null;

    salaryMinMinor: bigint | null;
    salaryMaxMinor: bigint | null;
    salaryCurrency: string | null;
    salaryPeriod: CareerSalaryPeriod | null;

    technologyTags: readonly string[];

    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;

    resumeVersionId: string | null;
    appliedDate: CalendarDate | null;

    currentStage: CareerApplicationStage;
    currentOutcome: CareerApplicationOutcome | null;
    currentHistoryId: string;

    notes: string | null;

    recordedByUserId: string;
    requestId: string | null;
  },
): Promise<void> {
  const salaryMinMinor =
    input.salaryMinMinor === null ? null : input.salaryMinMinor.toString();

  const salaryMaxMinor =
    input.salaryMaxMinor === null ? null : input.salaryMaxMinor.toString();

  const technologyTags = createTextArraySql(input.technologyTags);

  await transaction.db.execute(sql`
    INSERT INTO career."job_application" (
      "id",
      "workspace_id",
      "company_name",
      "role_title",
      "posting_url",
      "source_name",
      "role_description_snapshot",
      "location",
      "work_arrangement",
      "salary_min_minor",
      "salary_max_minor",
      "salary_currency",
      "salary_period",
      "technology_tags",
      "contact_name",
      "contact_email",
      "contact_phone",
      "resume_version_id",
      "applied_date",
      "current_stage",
      "current_outcome",
      "current_history_id",
      "next_action_event_id",
      "notes",
      "recorded_by_user_id",
      "actor_kind",
      "request_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.companyName},
      ${input.roleTitle},
      ${input.postingUrl},
      ${input.sourceName},
      ${input.roleDescriptionSnapshot},
      ${input.location},
      ${input.workArrangement},
      ${salaryMinMinor}::bigint,
      ${salaryMaxMinor}::bigint,
      ${input.salaryCurrency},
      ${input.salaryPeriod},
      ${technologyTags},
      ${input.contactName},
      ${input.contactEmail},
      ${input.contactPhone},
      ${input.resumeVersionId}::uuid,
      ${input.appliedDate}::date,
      ${input.currentStage},
      ${input.currentOutcome},
      ${input.currentHistoryId}::uuid,
      NULL,
      ${input.notes},
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function createInitialApplicationStageHistory(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    applicationId: string;

    stage: CareerApplicationStage;
    outcome: CareerApplicationOutcome | null;
    effectiveDate: CalendarDate;
    reason: string | null;

    commandReceiptId: string;

    recordedByUserId: string;
    requestId: string | null;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO career."application_stage_history" (
      "id",
      "workspace_id",
      "application_id",
      "sequence_no",
      "stage",
      "outcome",
      "effective_date",
      "effective_order",
      "supersedes_history_id",
      "reason",
      "command_receipt_id",
      "recorded_by_user_id",
      "actor_kind",
      "request_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.applicationId}::uuid,
      1,
      ${input.stage},
      ${input.outcome},
      ${input.effectiveDate}::date,
      0,
      NULL,
      ${input.reason},
      ${input.commandReceiptId}::uuid,
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

/**
 * Force the Career constraints that are intentionally DEFERRABLE to validate
 * before a service returns, then restore their documented deferred mode.
 *
 * SET CONSTRAINTS persists for the rest of the transaction. Restoring these
 * Career constraints to DEFERRED keeps separate Career commands composable
 * inside one scoped transaction.
 *
 * Constraint names are schema-qualified because PostgreSQL otherwise resolves
 * them through the current search_path.
 */
export async function enforceDeferredCareerConstraints(
  transaction: ScopedTransaction,
): Promise<void> {
  await transaction.db.execute(sql`
    SET CONSTRAINTS
      career."fk_job_application_current_history",
      career."fk_job_application_next_action_event",
      career."job_application_current_history_integrity",
      career."application_history_current_pointer_integrity",
      career."job_application_next_action_integrity",
      career."application_event_next_action_integrity"
    IMMEDIATE
  `);

  await transaction.db.execute(sql`
    SET CONSTRAINTS
      career."fk_job_application_current_history",
      career."fk_job_application_next_action_event",
      career."job_application_current_history_integrity",
      career."application_history_current_pointer_integrity",
      career."job_application_next_action_integrity",
      career."application_event_next_action_integrity"
    DEFERRED
  `);
}
