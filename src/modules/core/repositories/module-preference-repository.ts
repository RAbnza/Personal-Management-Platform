import { sql } from "drizzle-orm";

import type { ImplementedModuleKey } from "@/platform/db/schema/core";
import type { ScopedTransaction } from "@/platform/db";

type ModulePreferenceRow = {
  module_key: string;

  enabled: boolean;
  agenda_visible: boolean;
  reminders_enabled: boolean;

  version: number;
};

export type StoredModulePreference = {
  moduleKey: ImplementedModuleKey;

  enabled: boolean;
  agendaVisible: boolean;
  remindersEnabled: boolean;

  version: number;
};

function mapModulePreferenceRow(
  row: ModulePreferenceRow,
): StoredModulePreference {
  return {
    moduleKey: row.module_key as ImplementedModuleKey,

    enabled: row.enabled,
    agendaVisible: row.agenda_visible,
    remindersEnabled: row.reminders_enabled,

    version: row.version,
  };
}

export async function canReadActiveModulePreferenceWorkspace(
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

export async function readStoredModulePreferences(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
  },
): Promise<StoredModulePreference[]> {
  const result = await transaction.db.execute<ModulePreferenceRow>(sql`
      SELECT
        preference."module_key",

        preference."enabled",
        preference."agenda_visible",
        preference."reminders_enabled",

        preference."version"

      FROM core."module_preference"
        AS preference

      WHERE
        preference."workspace_id" =
          ${input.workspaceId}::uuid

      ORDER BY
        preference."module_key"
    `);

  return result.rows.map(mapModulePreferenceRow);
}

export async function readStoredModulePreference(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    moduleKey: ImplementedModuleKey;
  },
): Promise<StoredModulePreference | null> {
  const result = await transaction.db.execute<ModulePreferenceRow>(sql`
      SELECT
        preference."module_key",

        preference."enabled",
        preference."agenda_visible",
        preference."reminders_enabled",

        preference."version"

      FROM core."module_preference"
        AS preference

      WHERE
        preference."workspace_id" =
          ${input.workspaceId}::uuid

        AND preference."module_key" =
          ${input.moduleKey}
    `);

  const row = result.rows[0];

  return row ? mapModulePreferenceRow(row) : null;
}

export async function createModulePreferenceIfMissing(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    moduleKey: ImplementedModuleKey;

    enabled: boolean;
    agendaVisible: boolean;
    remindersEnabled: boolean;
  },
): Promise<StoredModulePreference | null> {
  const result = await transaction.db.execute<ModulePreferenceRow>(sql`
      INSERT INTO core."module_preference" (
        "workspace_id",
        "module_key",

        "enabled",
        "agenda_visible",
        "reminders_enabled"
      )
      VALUES (
        ${input.workspaceId}::uuid,
        ${input.moduleKey},

        ${input.enabled},
        ${input.agendaVisible},
        ${input.remindersEnabled}
      )

      ON CONFLICT (
        "workspace_id",
        "module_key"
      )
      DO NOTHING

      RETURNING
        "module_key",

        "enabled",
        "agenda_visible",
        "reminders_enabled",

        "version"
    `);

  const row = result.rows[0];

  return row ? mapModulePreferenceRow(row) : null;
}

export async function updateStoredModulePreference(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    moduleKey: ImplementedModuleKey;

    expectedVersion: number;

    enabled: boolean;
    agendaVisible: boolean;
    remindersEnabled: boolean;
  },
): Promise<StoredModulePreference | null> {
  const result = await transaction.db.execute<ModulePreferenceRow>(sql`
      UPDATE core."module_preference"

      SET
        "enabled" =
          ${input.enabled},

        "agenda_visible" =
          ${input.agendaVisible},

        "reminders_enabled" =
          ${input.remindersEnabled}

      WHERE
        "workspace_id" =
          ${input.workspaceId}::uuid

        AND "module_key" =
          ${input.moduleKey}

        AND "version" =
          ${input.expectedVersion}

      RETURNING
        "module_key",

        "enabled",
        "agenda_visible",
        "reminders_enabled",

        "version"
    `);

  const row = result.rows[0];

  return row ? mapModulePreferenceRow(row) : null;
}
