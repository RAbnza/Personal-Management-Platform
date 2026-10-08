import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";

import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import {
  lockActivePrivateWorkspace,
  PrivateDomainWriteUnavailableError,
} from "@/modules/core/repositories/private-domain-write-repository";
import {
  lockWorkspacePreference,
  updateStoredWorkspacePreference,
} from "@/modules/core/repositories/workspace-preference-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const UPDATE_WORKSPACE_PREFERENCE_COMMAND_TYPE =
  "core.update_workspace_preference";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const WORKSPACE_THEMES = ["system", "light", "dark"] as const;

const updateWorkspacePreferenceInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    clientCommandId: z.uuid(),

    expectedVersion: z.number().int().positive().max(POSTGRES_INTEGER_MAX),

    theme: z.enum(WORKSPACE_THEMES),

    gettingStartedDismissed: z.boolean(),
  })
  .strict();

const updateWorkspacePreferenceResultSchema = z.object({
  theme: z.enum(WORKSPACE_THEMES),

  gettingStartedDismissedAt: z.iso.datetime().nullable(),

  version: z.number().int().positive(),
});

export type UpdateWorkspacePreferenceInput = z.input<
  typeof updateWorkspacePreferenceInputSchema
>;

export type UpdateWorkspacePreferenceResult = z.infer<
  typeof updateWorkspacePreferenceResultSchema
>;

export class WorkspacePreferenceVersionConflictError extends Error {
  readonly code = "STALE_VERSION";

  constructor(
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `Workspace preferences changed since they were loaded. Expected version ${expectedVersion}, but the current version is ${currentVersion}.`,
    );

    this.name = "WorkspacePreferenceVersionConflictError";
  }
}

type NormalizedUpdateWorkspacePreferenceInput = {
  userId: string;
  workspaceId: string;

  clientCommandId: string;

  expectedVersion: number;

  theme: UpdateWorkspacePreferenceResult["theme"];

  gettingStartedDismissed: boolean;
};

function normalizeInput(
  input: UpdateWorkspacePreferenceInput,
): NormalizedUpdateWorkspacePreferenceInput {
  return updateWorkspacePreferenceInputSchema.parse(input);
}

function getPayloadHash(input: NormalizedUpdateWorkspacePreferenceInput) {
  return hashCommandPayload({
    expectedVersion: input.expectedVersion,

    theme: input.theme,

    gettingStartedDismissed: input.gettingStartedDismissed,
  });
}

function mapResult(input: {
  theme: UpdateWorkspacePreferenceResult["theme"];

  gettingStartedDismissedAt: string | null;

  version: number;
}): UpdateWorkspacePreferenceResult {
  return {
    theme: input.theme,

    gettingStartedDismissedAt: input.gettingStartedDismissedAt,

    version: input.version,
  };
}

async function executeUpdateWorkspacePreference(
  transaction: ScopedTransaction,
  input: NormalizedUpdateWorkspacePreferenceInput,
): Promise<UpdateWorkspacePreferenceResult> {
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    clientCommandId: input.clientCommandId,

    commandType: UPDATE_WORKSPACE_PREFERENCE_COMMAND_TYPE,

    payloadHash: getPayloadHash(input),
  });

  /*
   * Resolve committed retries before looking at the current aggregate version.
   * A successful earlier preference command remains replayable even after the
   * user changes presentation preferences again.
   */
  if (receipt.kind === "replay") {
    return updateWorkspacePreferenceResultSchema.parse(receipt.result);
  }

  const current = await lockWorkspacePreference(transaction, {
    workspaceId: input.workspaceId,
  });

  if (!current) {
    throw new PrivateDomainWriteUnavailableError();
  }

  if (current.version !== input.expectedVersion) {
    throw new WorkspacePreferenceVersionConflictError(
      input.expectedVersion,
      current.version,
    );
  }

  const currentlyDismissed = current.gettingStartedDismissedAt !== null;

  /*
   * Saving an unchanged preference is a real successful command but not an
   * aggregate mutation. Do not bump version/updated_at merely because the user
   * submitted values that are already current.
   */
  if (
    current.theme === input.theme &&
    currentlyDismissed === input.gettingStartedDismissed
  ) {
    const result = mapResult(current);

    await completeCommandReceipt(transaction, {
      workspaceId: input.workspaceId,

      receiptId: receipt.receiptId,

      result,
    });

    return result;
  }

  const updated = await updateStoredWorkspacePreference(transaction, {
    workspaceId: input.workspaceId,

    expectedVersion: input.expectedVersion,

    theme: input.theme,

    gettingStartedDismissed: input.gettingStartedDismissed,
  });

  if (!updated) {
    throw new PrivateDomainWriteUnavailableError();
  }

  const result = mapResult(updated);
  await createPrivateRevision(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "workspace_preference",
    subjectId: input.workspaceId,
    subjectVersion: result.version,
    operation: "update",
    beforeJson: { ...mapResult(current) },
    afterJson: { ...result },
    reason: null,
    effectiveDate: null,
    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: null,
  });

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    receiptId: receipt.receiptId,

    result,
  });

  return result;
}

export async function updateWorkspacePreferenceInTransaction(
  transaction: ScopedTransaction,
  input: UpdateWorkspacePreferenceInput,
): Promise<UpdateWorkspacePreferenceResult> {
  return executeUpdateWorkspacePreference(transaction, normalizeInput(input));
}

export async function updateWorkspacePreference(
  input: UpdateWorkspacePreferenceInput,
): Promise<UpdateWorkspacePreferenceResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,
      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeUpdateWorkspacePreference(transaction, normalized),
  );
}
