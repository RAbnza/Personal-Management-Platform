import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

type WorkspaceSettingsRow = {
  currency: string;
  timezone: string;
  week_start: number;
  workspace_version: number;

  locale: string;
  theme: string;
  default_salary_account_id: string | null;
  getting_started_dismissed_at: string | null;
  preference_version: number;

  has_financial_structure: boolean;
};

type LockedWorkspaceSettingsRow = {
  currency: string;
  timezone: string;
  week_start: number;
  version: number;
};

type UpdatedWorkspaceSettingsRow = {
  currency: string;
  timezone: string;
  week_start: number;
  version: number;
};

export type StoredWorkspaceSettings = {
  currency: string;
  timezone: string;
  weekStart: number;
  workspaceVersion: number;

  locale: string;
  theme: string;
  defaultSalaryAccountId: string | null;
  gettingStartedDismissedAt: string | null;
  preferenceVersion: number;

  hasFinancialStructure: boolean;
};

export type LockedWorkspaceSettings = {
  currency: string;
  timezone: string;
  weekStart: number;
  version: number;
};

export type UpdatedWorkspaceSettings = {
  currency: string;
  timezone: string;
  weekStart: number;
  version: number;
};

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapWorkspaceSettingsRow(
  row: WorkspaceSettingsRow,
): StoredWorkspaceSettings {
  return {
    currency: row.currency,
    timezone: row.timezone,
    weekStart: row.week_start,
    workspaceVersion: row.workspace_version,

    locale: row.locale,
    theme: row.theme,
    defaultSalaryAccountId: row.default_salary_account_id,

    gettingStartedDismissedAt: normalizeInstant(
      row.getting_started_dismissed_at,
    ),

    preferenceVersion: row.preference_version,

    hasFinancialStructure: row.has_financial_structure,
  };
}

export async function readActiveWorkspaceSettings(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<StoredWorkspaceSettings | null> {
  const result = await transaction.db.execute<WorkspaceSettingsRow>(sql`
      SELECT
        workspace."currency",
        workspace."timezone",
        workspace."week_start",
        workspace."version"
          AS "workspace_version",

        preference."locale",
        preference."theme",
        preference."default_salary_account_id",

        preference."getting_started_dismissed_at"::text
          AS "getting_started_dismissed_at",

        preference."version"
          AS "preference_version",

        EXISTS (
          SELECT 1

          FROM finance."ledger_account"
            AS ledger

          WHERE
            ledger."workspace_id" =
              workspace."id"
        )
          AS "has_financial_structure"

      FROM core."workspace"
        AS workspace

      INNER JOIN core."user_profile"
        AS profile
        ON profile."user_id" =
          workspace."owner_user_id"

      INNER JOIN core."workspace_preference"
        AS preference
        ON preference."workspace_id" =
          workspace."id"

      WHERE
        workspace."id" =
          ${input.workspaceId}::uuid

        AND workspace."state" =
          'active'

        AND profile."lifecycle" =
          'active'
    `);

  const row = result.rows[0];

  return row ? mapWorkspaceSettingsRow(row) : null;
}

/**
 * Lock the workspace aggregate itself.
 *
 * Settings writes use the same profile -> workspace lock ordering as Finance:
 *
 *   1. active user profile FOR SHARE
 *   2. active workspace FOR UPDATE
 *
 * This prevents a first financial-account creation from racing a workspace
 * currency change.
 */
export async function lockWorkspaceSettings(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<LockedWorkspaceSettings | null> {
  const result = await transaction.db.execute<LockedWorkspaceSettingsRow>(sql`
      SELECT
        workspace."currency",
        workspace."timezone",
        workspace."week_start",
        workspace."version"

      FROM core."workspace"
        AS workspace

      WHERE
        workspace."id" =
          ${input.workspaceId}::uuid

        AND workspace."state" =
          'active'

      FOR UPDATE
    `);

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    currency: row.currency,
    timezone: row.timezone,
    weekStart: row.week_start,
    version: row.version,
  };
}

export async function workspaceHasFinancialStructure(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<boolean> {
  const result = await transaction.db.execute<{
    has_financial_structure: boolean;
  }>(sql`
    SELECT EXISTS (
      SELECT 1

      FROM finance."ledger_account"
        AS ledger

      WHERE
        ledger."workspace_id" =
          ${input.workspaceId}::uuid
    )
      AS "has_financial_structure"
  `);

  return result.rows[0]?.has_financial_structure ?? false;
}

export async function updateStoredWorkspaceSettings(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    expectedVersion: number;

    currency: string;
    timezone: string;
    weekStart: number;
  },
): Promise<UpdatedWorkspaceSettings | null> {
  const result = await transaction.db.execute<UpdatedWorkspaceSettingsRow>(sql`
      UPDATE core."workspace"

      SET
        "currency" =
          ${input.currency},

        "timezone" =
          ${input.timezone},

        "week_start" =
          ${input.weekStart}

      WHERE
        "id" =
          ${input.workspaceId}::uuid

        AND "state" =
          'active'

        AND "version" =
          ${input.expectedVersion}

      RETURNING
        "currency",
        "timezone",
        "week_start",
        "version"
    `);

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    currency: row.currency,
    timezone: row.timezone,
    weekStart: row.week_start,
    version: row.version,
  };
}
