import { sql } from "drizzle-orm";

import type {
  OnboardingStepKey,
  OnboardingStepState,
} from "@/modules/core/domain/onboarding";
import type { ScopedTransaction } from "@/platform/db";

type OnboardingStepRow = {
  step_key: string;
  state: string;

  completed_at: string | null;
  updated_at: string;
};

export type StoredOnboardingStep = {
  stepKey: OnboardingStepKey;
  state: OnboardingStepState;

  completedAt: string | null;
  updatedAt: string;
};

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapOnboardingStepRow(row: OnboardingStepRow): StoredOnboardingStep {
  return {
    stepKey: row.step_key as OnboardingStepKey,

    state: row.state as OnboardingStepState,

    completedAt: normalizeInstant(row.completed_at),

    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function canReadActiveOnboardingWorkspace(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<boolean> {
  const result = await transaction.db.execute<{
    id: string;
  }>(sql`
    SELECT workspace."id"

    FROM core."workspace" AS workspace

    INNER JOIN core."user_profile" AS profile
      ON profile."user_id" =
        workspace."owner_user_id"

    WHERE
      workspace."id" =
        ${input.workspaceId}::uuid

      AND workspace."state" = 'active'

      AND profile."lifecycle" = 'active'
  `);

  return result.rows[0] !== undefined;
}

export async function readStoredOnboardingSteps(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    guideVersion: number;
  },
): Promise<StoredOnboardingStep[]> {
  const result = await transaction.db.execute<OnboardingStepRow>(sql`
      SELECT
        step."step_key",
        step."state",

        step."completed_at"::text
          AS "completed_at",

        step."updated_at"::text
          AS "updated_at"

      FROM core."onboarding_step" AS step

      WHERE
        step."workspace_id" =
          ${input.workspaceId}::uuid

        AND step."guide_version" =
          ${input.guideVersion}

      ORDER BY
        step."step_key"
    `);

  return result.rows.map(mapOnboardingStepRow);
}

export async function setOnboardingStepState(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;

    guideVersion: number;
    stepKey: OnboardingStepKey;

    state: OnboardingStepState;
  },
): Promise<StoredOnboardingStep> {
  const result = await transaction.db.execute<OnboardingStepRow>(sql`
      INSERT INTO core."onboarding_step" AS existing (
        "workspace_id",
        "guide_version",
        "step_key",
        "state",
        "completed_at",
        "updated_at"
      )
      VALUES (
        ${input.workspaceId}::uuid,

        ${input.guideVersion},

        ${input.stepKey},

        ${input.state},

        CASE
          WHEN ${input.state} = 'completed'
          THEN clock_timestamp()
          ELSE NULL
        END,

        clock_timestamp()
      )

      ON CONFLICT (
        "workspace_id",
        "guide_version",
        "step_key"
      )
      DO UPDATE

      SET
        "state" =
          EXCLUDED."state",

        /*
         * Repeating the same completed state with a distinct legitimate
         * command does not rewrite the original completion instant.
         *
         * Leaving completed clears the completion instant, while completing a
         * previously pending/skipped step records the new completion instant.
         */
        "completed_at" =
          CASE
            WHEN
              EXCLUDED."state" = 'completed'
              AND existing."state" = 'completed'
            THEN existing."completed_at"

            WHEN EXCLUDED."state" = 'completed'
            THEN clock_timestamp()

            ELSE NULL
          END,

        /*
         * Do not manufacture a new change timestamp when a new command merely
         * confirms the state already stored.
         */
        "updated_at" =
          CASE
            WHEN
              existing."state"
              IS DISTINCT FROM
              EXCLUDED."state"
            THEN clock_timestamp()

            ELSE existing."updated_at"
          END

      RETURNING
        "step_key",
        "state",

        "completed_at"::text
          AS "completed_at",

        "updated_at"::text
          AS "updated_at"
    `);

  const row = result.rows[0];

  if (!row) {
    throw new Error("The onboarding step state could not be persisted.");
  }

  return mapOnboardingStepRow(row);
}
