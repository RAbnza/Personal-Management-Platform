import { sql } from "drizzle-orm";

import type {
  CareerApplicationOutcome,
  CareerApplicationStage,
} from "@/modules/career/domain/application";
import type { ScopedTransaction } from "@/platform/db";
import type { CalendarDate } from "@/shared/calendar-date";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

type JobApplicationStageAggregateRow = {
  id: string;
  version: number;
  applied_date: string | null;
  current_stage: string;
  current_outcome: string | null;
  current_history_id: string;
  archived: boolean;
};

type ApplicationHistoryPositionRow = {
  max_sequence_no: number;
  max_effective_order: number;
};

type ResolvedApplicationStageRow = {
  id: string;
  sequence_no: number;
  stage: string;
  outcome: string | null;
  effective_date: string;
  effective_order: number;
};

type UpdatedApplicationRow = {
  version: number;
};

export type JobApplicationStageAggregate = {
  applicationId: string;
  version: number;
  appliedDate: CalendarDate | null;
  currentStage: CareerApplicationStage;
  currentOutcome: CareerApplicationOutcome | null;
  currentHistoryId: string;
  archived: boolean;
};

export type ApplicationStageHistoryPosition = {
  sequenceNo: number;
  effectiveOrder: number;
};

export type ResolvedApplicationStage = {
  historyId: string;
  sequenceNo: number;
  stage: CareerApplicationStage;
  outcome: CareerApplicationOutcome | null;
  effectiveDate: CalendarDate;
  effectiveOrder: number;
};

export async function lockJobApplicationStageAggregate(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
  },
): Promise<JobApplicationStageAggregate | null> {
  const result = await transaction.db
    .execute<JobApplicationStageAggregateRow>(sql`
      SELECT
        application."id",
        application."version",
        application."applied_date"::text AS "applied_date",
        application."current_stage",
        application."current_outcome",
        application."current_history_id",
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
    appliedDate: row.applied_date as CalendarDate | null,
    currentStage: row.current_stage as CareerApplicationStage,
    currentOutcome: row.current_outcome as CareerApplicationOutcome | null,
    currentHistoryId: row.current_history_id,
    archived: row.archived,
  };
}

export async function getNextApplicationStageHistoryPosition(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    effectiveDate: CalendarDate;
    requestedEffectiveOrder: number | null;
  },
): Promise<ApplicationStageHistoryPosition> {
  const result = await transaction.db
    .execute<ApplicationHistoryPositionRow>(sql`
      SELECT
        COALESCE(
          max(history."sequence_no"),
          0
        ) AS "max_sequence_no",
        COALESCE(
          max(history."effective_order")
            FILTER (
              WHERE history."effective_date" =
                ${input.effectiveDate}::date
            ),
          -1
        ) AS "max_effective_order"
      FROM career."application_stage_history" AS history
      WHERE
        history."workspace_id" = ${input.workspaceId}::uuid
        AND history."application_id" = ${input.applicationId}::uuid
    `);

  const row = result.rows[0];

  if (!row) {
    throw new Error(
      "The application stage-history position could not be resolved.",
    );
  }

  if (row.max_sequence_no >= POSTGRES_INTEGER_MAX) {
    throw new RangeError(
      "The application stage-history sequence has reached the supported database limit.",
    );
  }

  const sequenceNo = row.max_sequence_no + 1;

  if (input.requestedEffectiveOrder !== null) {
    return {
      sequenceNo,
      effectiveOrder: input.requestedEffectiveOrder,
    };
  }

  if (row.max_effective_order >= POSTGRES_INTEGER_MAX) {
    throw new RangeError(
      "The application same-day stage ordering has reached the supported database limit.",
    );
  }

  return {
    sequenceNo,
    effectiveOrder: row.max_effective_order + 1,
  };
}

export async function appendApplicationStageHistory(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    applicationId: string;

    sequenceNo: number;
    stage: CareerApplicationStage;
    outcome: CareerApplicationOutcome | null;

    effectiveDate: CalendarDate;
    effectiveOrder: number;

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
      ${input.sequenceNo},
      ${input.stage},
      ${input.outcome},
      ${input.effectiveDate}::date,
      ${input.effectiveOrder},
      NULL,
      ${input.reason},
      ${input.commandReceiptId}::uuid,
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function resolveApplicationCurrentStage(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
  },
): Promise<ResolvedApplicationStage> {
  const result = await transaction.db.execute<ResolvedApplicationStageRow>(sql`
      SELECT
        history."id",
        history."sequence_no",
        history."stage",
        history."outcome",
        history."effective_date"::text AS "effective_date",
        history."effective_order"
      FROM career."application_stage_history" AS history
      WHERE
        history."workspace_id" = ${input.workspaceId}::uuid
        AND history."application_id" = ${input.applicationId}::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM career."application_stage_history" AS correction
          WHERE
            correction."workspace_id" = history."workspace_id"
            AND correction."application_id" = history."application_id"
            AND correction."supersedes_history_id" = history."id"
        )
      ORDER BY
        history."effective_date" DESC,
        history."effective_order" DESC,
        history."id" DESC
      LIMIT 1
    `);

  const row = result.rows[0];

  if (!row) {
    throw new Error("The job application has no resolved stage-history state.");
  }

  return {
    historyId: row.id,
    sequenceNo: row.sequence_no,
    stage: row.stage as CareerApplicationStage,
    outcome: row.outcome as CareerApplicationOutcome | null,
    effectiveDate: row.effective_date as CalendarDate,
    effectiveOrder: row.effective_order,
  };
}

export async function updateJobApplicationResolvedStage(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    applicationId: string;
    expectedVersion: number;

    appliedDate: CalendarDate | null;

    currentHistoryId: string;
    currentStage: CareerApplicationStage;
    currentOutcome: CareerApplicationOutcome | null;
  },
): Promise<number | null> {
  const result = await transaction.db.execute<UpdatedApplicationRow>(sql`
    UPDATE career."job_application"
    SET
      "applied_date" = ${input.appliedDate}::date,
      "current_history_id" = ${input.currentHistoryId}::uuid,
      "current_stage" = ${input.currentStage},
      "current_outcome" = ${input.currentOutcome}
    WHERE
      "workspace_id" = ${input.workspaceId}::uuid
      AND "id" = ${input.applicationId}::uuid
      AND "version" = ${input.expectedVersion}
      AND "archived_at" IS NULL
    RETURNING "version"
  `);

  return result.rows[0]?.version ?? null;
}
