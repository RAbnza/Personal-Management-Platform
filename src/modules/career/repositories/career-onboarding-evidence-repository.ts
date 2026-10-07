import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type CareerOnboardingEvidenceQueryRow = {
  first_application_created_at: string | null;

  first_next_action_set_at: string | null;
};

/**
 * Return only the narrow Career evidence needed by Guidance.
 *
 * `first_next_action_set_at` is intentionally historical rather than reading
 * job_application.next_action_event_id directly.
 *
 * A user who schedules a real next action and later completes, cancels or
 * replaces it has still completed the onboarding lesson. The immutable
 * `next_action_set` audit revision therefore remains authoritative evidence
 * that the workflow was actually performed.
 */
export async function readCareerOnboardingEvidence(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<CareerOnboardingEvidenceQueryRow> {
  const result = await transaction.db
    .execute<CareerOnboardingEvidenceQueryRow>(sql`
      SELECT
        (
          SELECT
            min(application."created_at")::text

          FROM career."job_application"
            AS application

          WHERE
            application."workspace_id" =
              ${input.workspaceId}::uuid
        )
          AS "first_application_created_at",

        (
          SELECT
            min(revision."created_at")::text

          FROM audit."private_revision"
            AS revision

          INNER JOIN career."job_application"
            AS application
            ON application."workspace_id" =
              revision."workspace_id"

            AND application."id" =
              revision."subject_id"

          WHERE
            revision."workspace_id" =
              ${input.workspaceId}::uuid

            AND revision."subject_kind" =
              'job_application'

            AND revision."operation" =
              'next_action_set'
        )
          AS "first_next_action_set_at"
    `);

  return (
    result.rows[0] ?? {
      first_application_created_at: null,

      first_next_action_set_at: null,
    }
  );
}
