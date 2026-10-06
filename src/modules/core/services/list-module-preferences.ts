import { z } from "zod";

import {
  canReadActiveModulePreferenceWorkspace,
  readStoredModulePreferences,
} from "@/modules/core/repositories/module-preference-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  implementedModuleKeys,
  type ImplementedModuleKey,
} from "@/platform/db/schema/core";

const listModulePreferencesInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
  })
  .strict();

export type ListModulePreferencesInput = z.input<
  typeof listModulePreferencesInputSchema
>;

export type ModulePreferenceItem = {
  moduleKey: ImplementedModuleKey;

  enabled: boolean;
  agendaVisible: boolean;
  remindersEnabled: boolean;

  /**
   * Zero means the preference is still using its virtual documented defaults
   * and has not yet been materialized in core.module_preference.
   */
  version: number;
};

export type ListModulePreferencesResult = {
  items: ModulePreferenceItem[];
};

export class ModulePreferenceWorkspaceUnavailableError extends Error {
  readonly code = "MODULE_PREFERENCE_WORKSPACE_UNAVAILABLE";

  constructor() {
    super("The active workspace could not be resolved for module preferences.");

    this.name = "ModulePreferenceWorkspaceUnavailableError";
  }
}

type NormalizedListModulePreferencesInput = {
  userId: string;
  workspaceId: string;
};

function normalizeInput(
  input: ListModulePreferencesInput,
): NormalizedListModulePreferencesInput {
  return listModulePreferencesInputSchema.parse(input);
}

async function executeListModulePreferences(
  transaction: ScopedTransaction,
  input: NormalizedListModulePreferencesInput,
): Promise<ListModulePreferencesResult> {
  const workspaceAvailable = await canReadActiveModulePreferenceWorkspace(
    transaction,
    {
      workspaceId: input.workspaceId,
    },
  );

  if (!workspaceAvailable) {
    throw new ModulePreferenceWorkspaceUnavailableError();
  }

  const stored = await readStoredModulePreferences(transaction, {
    workspaceId: input.workspaceId,
  });

  const byModule = new Map(
    stored.map((preference) => [preference.moduleKey, preference]),
  );

  const items = implementedModuleKeys.map((moduleKey): ModulePreferenceItem => {
    const preference = byModule.get(moduleKey);

    if (!preference) {
      return {
        moduleKey,

        enabled: true,
        agendaVisible: true,
        remindersEnabled: true,

        version: 0,
      };
    }

    return preference;
  });

  return {
    items,
  };
}

export async function listModulePreferencesInTransaction(
  transaction: ScopedTransaction,
  input: ListModulePreferencesInput,
): Promise<ListModulePreferencesResult> {
  return executeListModulePreferences(transaction, normalizeInput(input));
}

export async function listModulePreferences(
  input: ListModulePreferencesInput,
): Promise<ListModulePreferencesResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,

      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeListModulePreferences(transaction, normalized),
  );
}
