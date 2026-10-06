import { z } from "zod";

import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import {
  createModulePreferenceIfMissing,
  readStoredModulePreference,
  updateStoredModulePreference,
} from "@/modules/core/repositories/module-preference-repository";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  implementedModuleKeys,
  type ImplementedModuleKey,
} from "@/platform/db/schema/core";

const UPDATE_MODULE_PREFERENCE_COMMAND_TYPE = "core.update_module_preference";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const updateModulePreferenceInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    clientCommandId: z.uuid(),

    moduleKey: z.enum(implementedModuleKeys),

    /**
     * Version zero represents a virtual default preference for which no
     * database row exists yet.
     */
    expectedVersion: z.number().int().min(0).max(POSTGRES_INTEGER_MAX),

    enabled: z.boolean(),

    agendaVisible: z.boolean(),

    remindersEnabled: z.boolean(),
  })
  .strict();

const updateModulePreferenceResultSchema = z.object({
  moduleKey: z.enum(implementedModuleKeys),

  enabled: z.boolean(),
  agendaVisible: z.boolean(),
  remindersEnabled: z.boolean(),

  version: z.number().int().positive(),
});

export type UpdateModulePreferenceInput = z.input<
  typeof updateModulePreferenceInputSchema
>;

export type UpdateModulePreferenceResult = z.infer<
  typeof updateModulePreferenceResultSchema
>;

export class ModulePreferenceVersionConflictError extends Error {
  readonly code = "STALE_VERSION";

  constructor(
    readonly moduleKey: ImplementedModuleKey,

    readonly expectedVersion: number,

    readonly currentVersion: number,
  ) {
    super(
      `The ${moduleKey} module preference changed since it was loaded. Expected version ${expectedVersion}, but the current version is ${currentVersion}.`,
    );

    this.name = "ModulePreferenceVersionConflictError";
  }
}

type NormalizedUpdateModulePreferenceInput = {
  userId: string;
  workspaceId: string;

  clientCommandId: string;

  moduleKey: ImplementedModuleKey;

  expectedVersion: number;

  enabled: boolean;
  agendaVisible: boolean;
  remindersEnabled: boolean;
};

function normalizeInput(
  input: UpdateModulePreferenceInput,
): NormalizedUpdateModulePreferenceInput {
  return updateModulePreferenceInputSchema.parse(input);
}

function getPayloadHash(input: NormalizedUpdateModulePreferenceInput) {
  return hashCommandPayload({
    moduleKey: input.moduleKey,

    expectedVersion: input.expectedVersion,

    enabled: input.enabled,

    agendaVisible: input.agendaVisible,

    remindersEnabled: input.remindersEnabled,
  });
}

async function resolveCurrentVersion(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    moduleKey: ImplementedModuleKey;
  },
): Promise<number> {
  const current = await readStoredModulePreference(transaction, input);

  return current?.version ?? 0;
}

async function executeUpdateModulePreference(
  transaction: ScopedTransaction,
  input: NormalizedUpdateModulePreferenceInput,
): Promise<UpdateModulePreferenceResult> {
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    clientCommandId: input.clientCommandId,

    commandType: UPDATE_MODULE_PREFERENCE_COMMAND_TYPE,

    payloadHash: getPayloadHash(input),
  });

  /*
   * Replay resolves before optimistic-version checks. A successfully committed
   * preference command remains replayable even if later commands have changed
   * that module again.
   */
  if (receipt.kind === "replay") {
    return updateModulePreferenceResultSchema.parse(receipt.result);
  }

  let updated: UpdateModulePreferenceResult | null;

  if (input.expectedVersion === 0) {
    /*
     * Version zero is not a stored aggregate version. It means the caller read
     * the virtual default state and expects no row to exist yet.
     *
     * ON CONFLICT DO NOTHING safely resolves concurrent first writes without
     * aborting the PostgreSQL transaction.
     */
    updated = await createModulePreferenceIfMissing(transaction, {
      workspaceId: input.workspaceId,

      moduleKey: input.moduleKey,

      enabled: input.enabled,

      agendaVisible: input.agendaVisible,

      remindersEnabled: input.remindersEnabled,
    });
  } else {
    updated = await updateStoredModulePreference(transaction, {
      workspaceId: input.workspaceId,

      moduleKey: input.moduleKey,

      expectedVersion: input.expectedVersion,

      enabled: input.enabled,

      agendaVisible: input.agendaVisible,

      remindersEnabled: input.remindersEnabled,
    });
  }

  if (!updated) {
    const currentVersion = await resolveCurrentVersion(transaction, {
      workspaceId: input.workspaceId,

      moduleKey: input.moduleKey,
    });

    throw new ModulePreferenceVersionConflictError(
      input.moduleKey,
      input.expectedVersion,
      currentVersion,
    );
  }

  const result: UpdateModulePreferenceResult = {
    moduleKey: updated.moduleKey,

    enabled: updated.enabled,

    agendaVisible: updated.agendaVisible,

    remindersEnabled: updated.remindersEnabled,

    version: updated.version,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    receiptId: receipt.receiptId,

    result,
  });

  return result;
}

export async function updateModulePreferenceInTransaction(
  transaction: ScopedTransaction,
  input: UpdateModulePreferenceInput,
): Promise<UpdateModulePreferenceResult> {
  return executeUpdateModulePreference(transaction, normalizeInput(input));
}

export async function updateModulePreference(
  input: UpdateModulePreferenceInput,
): Promise<UpdateModulePreferenceResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,

      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeUpdateModulePreference(transaction, normalized),
  );
}
