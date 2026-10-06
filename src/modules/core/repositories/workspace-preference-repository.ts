import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

type WorkspacePreferenceRow = {
  theme: string;
  getting_started_dismissed_at: string | null;
  version: number;
};

export type StoredWorkspacePreferenceMutationState = {
  theme: "system" | "light" | "dark";
  gettingStartedDismissedAt: string | null;
  version: number;
};

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapWorkspacePreferenceRow(
  row: WorkspacePreferenceRow,
): StoredWorkspacePreferenceMutationState {
  return {
    theme: row.theme as StoredWorkspacePreferenceMutationState["theme"],

    gettingStartedDismissedAt: normalizeInstant(
      row.getting_started_dismissed_at,
    ),

    version: row.version,
  };
}

export async function lockWorkspacePreference(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<StoredWorkspacePreferenceMutationState | null> {
  const result = await transaction.db.execute<WorkspacePreferenceRow>(sql`
      SELECT
        preference."theme",

        preference."getting_started_dismissed_at"::text
          AS "getting_started_dismissed_at",

        preference."version"

      FROM core."workspace_preference"
        AS preference

      WHERE
        preference."workspace_id" =
          ${input.workspaceId}::uuid

      FOR UPDATE
    `);

  const row = result.rows[0];

  return row ? mapWorkspacePreferenceRow(row) : null;
}

export async function updateStoredWorkspacePreference(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    expectedVersion: number;

    theme: "system" | "light" | "dark";

    gettingStartedDismissed: boolean;
  },
): Promise<StoredWorkspacePreferenceMutationState | null> {
  const result = await transaction.db.execute<WorkspacePreferenceRow>(sql`
      UPDATE core."workspace_preference"

      SET
        "theme" =
          ${input.theme},

        "getting_started_dismissed_at" =
          CASE
            WHEN ${input.gettingStartedDismissed}
            THEN COALESCE(
              "getting_started_dismissed_at",
              clock_timestamp()
            )

            ELSE NULL
          END

      WHERE
        "workspace_id" =
          ${input.workspaceId}::uuid

        AND "version" =
          ${input.expectedVersion}

      RETURNING
        "theme",

        "getting_started_dismissed_at"::text
          AS "getting_started_dismissed_at",

        "version"
    `);

  const row = result.rows[0];

  return row ? mapWorkspacePreferenceRow(row) : null;
}
