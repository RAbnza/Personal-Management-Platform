import { z } from "zod";

import { readActiveWorkspaceSettings } from "@/modules/core/repositories/workspace-settings-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const getWorkspaceSettingsInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
  })
  .strict();

export type GetWorkspaceSettingsInput = z.input<
  typeof getWorkspaceSettingsInputSchema
>;

export type GetWorkspaceSettingsResult = {
  workspace: {
    currency: string;
    timezone: string;
    weekStart: number;
    version: number;
    currencyChangeAllowed: boolean;
  };

  preference: {
    locale: string;
    theme: string;

    defaultSalaryAccountId: string | null;

    gettingStartedDismissedAt: string | null;

    version: number;
  };
};

export class WorkspaceSettingsWorkspaceUnavailableError extends Error {
  readonly code = "WORKSPACE_SETTINGS_WORKSPACE_UNAVAILABLE";

  constructor() {
    super("The active workspace could not be resolved for settings.");

    this.name = "WorkspaceSettingsWorkspaceUnavailableError";
  }
}

type NormalizedGetWorkspaceSettingsInput = {
  userId: string;
  workspaceId: string;
};

function normalizeInput(
  input: GetWorkspaceSettingsInput,
): NormalizedGetWorkspaceSettingsInput {
  return getWorkspaceSettingsInputSchema.parse(input);
}

async function executeGetWorkspaceSettings(
  transaction: ScopedTransaction,
  input: NormalizedGetWorkspaceSettingsInput,
): Promise<GetWorkspaceSettingsResult> {
  const stored = await readActiveWorkspaceSettings(transaction, {
    workspaceId: input.workspaceId,
  });

  if (!stored) {
    throw new WorkspaceSettingsWorkspaceUnavailableError();
  }

  return {
    workspace: {
      currency: stored.currency,
      timezone: stored.timezone,
      weekStart: stored.weekStart,
      version: stored.workspaceVersion,

      /*
       * Workspace currency is a setup-time choice. Once any Finance ledger
       * structure exists, changing it would conflict with already-established
       * account/ledger identity even if no posting has yet been recorded.
       */
      currencyChangeAllowed: !stored.hasFinancialStructure,
    },

    preference: {
      locale: stored.locale,
      theme: stored.theme,

      defaultSalaryAccountId: stored.defaultSalaryAccountId,

      gettingStartedDismissedAt: stored.gettingStartedDismissedAt,

      version: stored.preferenceVersion,
    },
  };
}

export async function getWorkspaceSettingsInTransaction(
  transaction: ScopedTransaction,
  input: GetWorkspaceSettingsInput,
): Promise<GetWorkspaceSettingsResult> {
  return executeGetWorkspaceSettings(transaction, normalizeInput(input));
}

export async function getWorkspaceSettings(
  input: GetWorkspaceSettingsInput,
): Promise<GetWorkspaceSettingsResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,

      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeGetWorkspaceSettings(transaction, normalized),
  );
}
