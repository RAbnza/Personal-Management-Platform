import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  importDebtBodySchema,
  importDebtResultSchema,
  type ImportDebtBody,
  type ImportDebtResult,
  type ValidatedImportDebt,
} from "@/modules/finance/domain/debt";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import { insertImportedDebt } from "@/modules/finance/repositories/debt-import-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "@/modules/finance/repositories/financial-write-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
  })
  .strict();
export type ImportExistingDebtInput = ImportDebtBody &
  z.input<typeof actorSchema>;

function normalize(input: ImportExistingDebtInput) {
  const { userId, workspaceId, requestId, ...body } = input;
  return {
    actor: actorSchema.parse({ userId, workspaceId, requestId }),
    body: importDebtBodySchema.parse(body),
  };
}
async function execute(
  transaction: ScopedTransaction,
  actor: z.output<typeof actorSchema>,
  body: ValidatedImportDebt,
): Promise<ImportDebtResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    actor.workspaceId,
  );
  const { clientCommandId, ...intent } = body;
  const receipt = await claimFinancialCommandReceipt(transaction, {
    workspaceId: actor.workspaceId,
    clientCommandId,
    commandType: "finance.import_existing_debt",
    payloadHash: hashFinancialCommandPayload(intent),
  });
  if (receipt.kind === "replay")
    return importDebtResultSchema.parse(receipt.result);
  const ids = await insertImportedDebt(transaction, {
    ...body,
    ...actor,
    requestId: actor.requestId ?? null,
    currency: workspace.currency,
    receiptId: receipt.receiptId,
  });
  for (const [subjectKind, subjectId, afterJson] of [
    [
      "financial_action",
      ids.actionId,
      {
        actionRevisionId: ids.revisionId,
        actionKind: "opening_debt",
        debtId: ids.debtId,
        effectiveDate: body.openingCutoffDate,
        currency: workspace.currency,
        amountMinor: body.openingLiabilityMinor,
      },
    ],
    [
      "debt",
      ids.debtId,
      {
        ...intent,
        currency: workspace.currency,
        openingActionId: ids.actionId,
        scheduleVersionId: ids.scheduleId,
      },
    ],
  ] as const) {
    await createPrivateFinancialRevision(transaction, {
      id: randomUUID(),
      workspaceId: actor.workspaceId,
      commandReceiptId: receipt.receiptId,
      subjectKind,
      subjectId,
      subjectVersion: 1,
      operation: "create",
      afterJson,
      effectiveDate: body.openingCutoffDate,
      recordedByUserId: actor.userId,
      requestId: actor.requestId ?? null,
    });
  }
  await finalizeJournal(transaction, {
    workspaceId: actor.workspaceId,
    journalId: ids.journalId,
  });
  await finalizeActionRevision(transaction, {
    workspaceId: actor.workspaceId,
    actionRevisionId: ids.revisionId,
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
    transaction,
    actor.workspaceId,
  );
  const result = {
    debtId: ids.debtId,
    openingActionId: ids.actionId,
    scheduleVersionId: ids.scheduleId,
    financialRevision,
  };
  await completeFinancialCommandReceipt(transaction, {
    workspaceId: actor.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(transaction);
  return result;
}
export async function importExistingDebtInTransaction(
  transaction: ScopedTransaction,
  input: ImportExistingDebtInput,
) {
  const { actor, body } = normalize(input);
  return execute(transaction, actor, body);
}
export async function importExistingDebt(input: ImportExistingDebtInput) {
  const { actor, body } = normalize(input);
  return withDomainTransaction(actor, (transaction) =>
    execute(transaction, actor, body),
  );
}
