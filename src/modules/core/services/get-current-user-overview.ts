import { z } from "zod";

import {
  listModulePreferencesInTransaction,
  ModulePreferenceWorkspaceUnavailableError,
  type ModulePreferenceItem,
} from "@/modules/core/services/list-module-preferences";
import {
  getWorkspaceSettingsInTransaction,
  WorkspaceSettingsWorkspaceUnavailableError,
  type GetWorkspaceSettingsResult,
} from "@/modules/core/services/get-workspace-settings";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const getCurrentUserOverviewInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
  })
  .strict();

export type GetCurrentUserOverviewInput = z.input<
  typeof getCurrentUserOverviewInputSchema
>;

export type GetCurrentUserOverviewResult = {
  workspace: GetWorkspaceSettingsResult["workspace"];

  preference: GetWorkspaceSettingsResult["preference"];

  modules: ModulePreferenceItem[];
};

export class CurrentUserOverviewUnavailableError extends Error {
  readonly code = "CURRENT_USER_OVERVIEW_UNAVAILABLE";

  constructor() {
    super("The current private workspace is unavailable.");

    this.name = "CurrentUserOverviewUnavailableError";
  }
}

type NormalizedGetCurrentUserOverviewInput = {
  userId: string;
  workspaceId: string;
};

function normalizeInput(
  input: GetCurrentUserOverviewInput,
): NormalizedGetCurrentUserOverviewInput {
  return getCurrentUserOverviewInputSchema.parse(input);
}

async function executeGetCurrentUserOverview(
  transaction: ScopedTransaction,
  input: NormalizedGetCurrentUserOverviewInput,
): Promise<GetCurrentUserOverviewResult> {
  try {
    /*
     * Keep the overview reads on one scoped connection/transaction so the
     * settings and capability snapshot cannot accidentally cross workspace
     * context or come from independently authorized requests.
     *
     * Queries remain sequential because one pg client must not be used for
     * concurrent transaction queries.
     */
    const settings = await getWorkspaceSettingsInTransaction(
      transaction,
      input,
    );

    const modulePreferences = await listModulePreferencesInTransaction(
      transaction,
      input,
    );

    return {
      workspace: settings.workspace,

      preference: settings.preference,

      modules: modulePreferences.items,
    };
  } catch (error) {
    if (
      error instanceof WorkspaceSettingsWorkspaceUnavailableError ||
      error instanceof ModulePreferenceWorkspaceUnavailableError
    ) {
      throw new CurrentUserOverviewUnavailableError();
    }

    throw error;
  }
}

export async function getCurrentUserOverviewInTransaction(
  transaction: ScopedTransaction,
  input: GetCurrentUserOverviewInput,
): Promise<GetCurrentUserOverviewResult> {
  return executeGetCurrentUserOverview(transaction, normalizeInput(input));
}

export async function getCurrentUserOverview(
  input: GetCurrentUserOverviewInput,
): Promise<GetCurrentUserOverviewResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,
      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeGetCurrentUserOverview(transaction, normalized),
  );
}
