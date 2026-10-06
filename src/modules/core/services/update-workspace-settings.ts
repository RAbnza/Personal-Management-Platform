import { z } from "zod";

import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import {
  PrivateDomainWriteUnavailableError,
  lockActivePrivateWorkspace,
} from "@/modules/core/repositories/private-domain-write-repository";
import {
  lockWorkspaceSettings,
  updateStoredWorkspaceSettings,
  workspaceHasFinancialStructure,
} from "@/modules/core/repositories/workspace-settings-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const UPDATE_WORKSPACE_SETTINGS_COMMAND_TYPE = "core.update_workspace_settings";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).format(new Date(0));

    return true;
  } catch {
    return false;
  }
}

const updateWorkspaceSettingsInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    clientCommandId: z.uuid(),

    expectedVersion: z.number().int().positive().max(POSTGRES_INTEGER_MAX),

    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, {
        message:
          "Workspace currency must be a three-letter uppercase currency code.",
      }),

    timezone: z.string().trim().min(1).max(100).refine(isIanaTimezone, {
      message: "Timezone must be a valid IANA timezone.",
    }),

    weekStart: z.number().int().min(0).max(6),
  })
  .strict();

const updateWorkspaceSettingsResultSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),

  timezone: z.string().min(1),

  weekStart: z.number().int().min(0).max(6),

  version: z.number().int().positive(),

  currencyChangeAllowed: z.boolean(),
});

export type UpdateWorkspaceSettingsInput = z.input<
  typeof updateWorkspaceSettingsInputSchema
>;

export type UpdateWorkspaceSettingsResult = z.infer<
  typeof updateWorkspaceSettingsResultSchema
>;

export class WorkspaceSettingsVersionConflictError extends Error {
  readonly code = "STALE_VERSION";

  constructor(
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `Workspace settings changed since they were loaded. Expected version ${expectedVersion}, but the current version is ${currentVersion}.`,
    );

    this.name = "WorkspaceSettingsVersionConflictError";
  }
}

export class WorkspaceCurrencyLockedError extends Error {
  readonly code = "WORKSPACE_CURRENCY_LOCKED";

  constructor() {
    super(
      "Workspace currency cannot change after financial account structure has been created.",
    );

    this.name = "WorkspaceCurrencyLockedError";
  }
}

type NormalizedUpdateWorkspaceSettingsInput = {
  userId: string;
  workspaceId: string;

  clientCommandId: string;

  expectedVersion: number;

  currency: string;
  timezone: string;
  weekStart: number;
};

function normalizeInput(
  input: UpdateWorkspaceSettingsInput,
): NormalizedUpdateWorkspaceSettingsInput {
  return updateWorkspaceSettingsInputSchema.parse(input);
}

function getPayloadHash(input: NormalizedUpdateWorkspaceSettingsInput) {
  return hashCommandPayload({
    expectedVersion: input.expectedVersion,

    currency: input.currency,
    timezone: input.timezone,
    weekStart: input.weekStart,
  });
}

async function executeUpdateWorkspaceSettings(
  transaction: ScopedTransaction,
  input: NormalizedUpdateWorkspaceSettingsInput,
): Promise<UpdateWorkspaceSettingsResult> {
  /*
   * Match Finance's lock order:
   *
   *   profile FOR SHARE
   *   workspace FOR UPDATE
   *
   * This makes currency selection and first-account creation mutually
   * exclusive inside one workspace.
   */
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const current = await lockWorkspaceSettings(transaction, {
    workspaceId: input.workspaceId,
  });

  if (!current) {
    throw new PrivateDomainWriteUnavailableError();
  }

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    clientCommandId: input.clientCommandId,

    commandType: UPDATE_WORKSPACE_SETTINGS_COMMAND_TYPE,

    payloadHash: getPayloadHash(input),
  });

  /*
   * Replay resolves before evaluating the current aggregate version or
   * currency lock. Later financial activity must not invalidate an already
   * committed idempotent retry.
   */
  if (receipt.kind === "replay") {
    return updateWorkspaceSettingsResultSchema.parse(receipt.result);
  }

  if (current.version !== input.expectedVersion) {
    throw new WorkspaceSettingsVersionConflictError(
      input.expectedVersion,
      current.version,
    );
  }

  const hasFinancialStructure = await workspaceHasFinancialStructure(
    transaction,
    {
      workspaceId: input.workspaceId,
    },
  );

  if (input.currency !== current.currency && hasFinancialStructure) {
    throw new WorkspaceCurrencyLockedError();
  }

  const updated = await updateStoredWorkspaceSettings(transaction, {
    workspaceId: input.workspaceId,

    expectedVersion: input.expectedVersion,

    currency: input.currency,
    timezone: input.timezone,
    weekStart: input.weekStart,
  });

  if (!updated) {
    /*
     * The workspace row is already locked by this transaction, so reaching
     * this state means it became unavailable unexpectedly rather than losing a
     * normal optimistic-concurrency race.
     */
    throw new PrivateDomainWriteUnavailableError();
  }

  const result: UpdateWorkspaceSettingsResult = {
    currency: updated.currency,

    timezone: updated.timezone,

    weekStart: updated.weekStart,

    version: updated.version,

    currencyChangeAllowed: !hasFinancialStructure,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    receiptId: receipt.receiptId,

    result,
  });

  return result;
}

export async function updateWorkspaceSettingsInTransaction(
  transaction: ScopedTransaction,
  input: UpdateWorkspaceSettingsInput,
): Promise<UpdateWorkspaceSettingsResult> {
  return executeUpdateWorkspaceSettings(transaction, normalizeInput(input));
}

export async function updateWorkspaceSettings(
  input: UpdateWorkspaceSettingsInput,
): Promise<UpdateWorkspaceSettingsResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,
      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeUpdateWorkspaceSettings(transaction, normalized),
  );
}
