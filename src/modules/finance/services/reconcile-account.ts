import { getOrCreateAdjustmentEquityLedger } from "../repositories/adjustment-equity-repository";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  adjustAccountBodySchema,
  reconcileAccountBodySchema,
  adjustmentResultSchema,
  reconciliationResultSchema,
  ReconciliationPreviewStaleError,
  ReconciliationUnavailableError,
  signedBalanceSchema,
  type AdjustmentPreview,
  type ReconciliationPreview,
  type ReconciliationSetup,
} from "../domain/reconciliation";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  advanceWorkspaceFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "../repositories/financial-write-repository";
import {
  insertAccountAdjustment,
  insertReconciliation,
  readAccountBalanceAt,
  readReconciliationHistory,
  readAccountAdjustments,
} from "../repositories/reconciliation-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const actorSchema = z.object({
  userId: z.uuid(),
  workspaceId: z.uuid(),
  requestId: z.uuid().optional(),
});
type Actor = z.infer<typeof actorSchema>;
export type ReconcileAccountInput = z.input<typeof reconcileAccountBodySchema> &
  Actor;
export type AdjustAccountInput = z.input<typeof adjustAccountBodySchema> &
  Actor;
function normalize<T extends z.ZodType>(schema: T, input: z.input<T> & Actor) {
  const { userId, workspaceId, requestId, ...values } = input;
  return {
    actor: actorSchema.parse({ userId, workspaceId, requestId }),
    body: schema.parse(values),
  };
}
function checkVersions(
  account: Awaited<ReturnType<typeof readAccountBalanceAt>>,
  b: { expectedFinancialRevision: string; expectedAccountVersion: number },
) {
  if (
    account.financialRevision !== b.expectedFinancialRevision ||
    account.version !== b.expectedAccountVersion
  )
    throw new ReconciliationPreviewStaleError();
}
async function validateComparison(
  t: ScopedTransaction,
  a: Actor,
  b: z.infer<typeof reconcileAccountBodySchema>,
) {
  const account = await readAccountBalanceAt(t, {
    workspaceId: a.workspaceId,
    financialAccountId: b.financialAccountId,
    cutoffDate: b.cutoffDate,
  });
  checkVersions(account, b);
  if (b.cutoffDate < account.openingCutoffDate)
    throw new RangeError(
      "The comparison date must be on or after the account opening cutoff.",
    );
  if (!signedBalanceSchema.safeParse(account.calculatedMinor).success)
    throw new RangeError(
      "Calculated balance exceeds the supported comparison range.",
    );
  if (b.supersedesReconciliationId) {
    const previous = (
      await readReconciliationHistory(t, {
        workspaceId: a.workspaceId,
        financialAccountId: b.financialAccountId,
        reconciliationId: b.supersedesReconciliationId,
      })
    )[0];
    if (!previous) throw new ReconciliationUnavailableError();
    if (previous.supersededByReconciliationId)
      throw new ReconciliationPreviewStaleError();
  }
  const differenceMinor = (
    BigInt(b.observedMinor) - BigInt(account.calculatedMinor)
  ).toString();
  const preview: ReconciliationPreview = {
    financialAccountId: b.financialAccountId,
    accountName: account.name,
    currency: account.currency,
    cutoffDate: b.cutoffDate,
    observedMinor: b.observedMinor,
    calculatedMinor: account.calculatedMinor,
    differenceMinor,
    financialRevision: account.financialRevision,
    sourceJournalCount: account.sourceJournalCount,
    status: differenceMinor === "0" ? "verified" : "difference",
    supersedesReconciliationId: b.supersedesReconciliationId,
  };
  return { account, preview };
}
async function validateAdjustment(
  t: ScopedTransaction,
  a: Actor,
  b: z.infer<typeof adjustAccountBodySchema>,
) {
  const account = await readAccountBalanceAt(t, {
    workspaceId: a.workspaceId,
    financialAccountId: b.financialAccountId,
    cutoffDate: b.effectiveDate,
  });
  checkVersions(account, b);
  if (account.archived)
    throw new RangeError(
      "Restore this account before recording an adjustment.",
    );
  if (b.effectiveDate <= account.openingCutoffDate)
    throw new RangeError(
      "Adjustments must occur after the account opening cutoff. Opening evidence requires a correction workflow.",
    );
  let comparison: AdjustmentPreview["reconciliation"] = null;
  if (b.reconciliationId) {
    const r = (
      await readReconciliationHistory(t, {
        workspaceId: a.workspaceId,
        financialAccountId: b.financialAccountId,
        reconciliationId: b.reconciliationId,
      })
    )[0];
    if (!r) throw new ReconciliationUnavailableError();
    if (r.needsReview || r.supersededByReconciliationId)
      throw new ReconciliationPreviewStaleError();
    if (b.effectiveDate > r.cutoffDate)
      throw new RangeError(
        "A linked adjustment must affect the comparison cutoff. Choose a date on or before that cutoff.",
      );
    comparison = {
      reconciliationId: r.reconciliationId,
      cutoffDate: r.cutoffDate,
      observedMinor: r.observedMinor,
      calculatedMinor: r.calculatedMinor,
      differenceBeforeMinor: r.differenceMinor,
      differenceAfterMinor: (
        BigInt(r.differenceMinor) - BigInt(b.signedAdjustmentMinor)
      ).toString(),
    };
  }
  const amount = BigInt(b.signedAdjustmentMinor),
    atDate = BigInt(account.calculatedMinor) + amount,
    current = BigInt(account.currentBalanceMinor) + amount;
  const negativeBalance = atDate < 0n || current < 0n;
  if (negativeBalance && !b.acknowledgeNegativeBalance)
    throw new RangeError(
      "Acknowledge the negative tracked balance before recording this adjustment.",
    );
  const preview: AdjustmentPreview = {
    financialAccountId: b.financialAccountId,
    accountName: account.name,
    currency: account.currency,
    effectiveDate: b.effectiveDate,
    signedAdjustmentMinor: b.signedAdjustmentMinor,
    reason: b.reason,
    balanceAtDateBeforeMinor: account.calculatedMinor,
    balanceAtDateAfterMinor: atDate.toString(),
    currentBalanceBeforeMinor: account.currentBalanceMinor,
    currentBalanceAfterMinor: current.toString(),
    adjustmentEquityMinor: (-amount).toString(),
    negativeBalance,
    financialRevision: account.financialRevision,
    reconciliation: comparison,
  };
  return { account, preview };
}
async function executeComparison(
  t: ScopedTransaction,
  input: ReconcileAccountInput,
) {
  const { actor: a, body: b } = normalize(reconcileAccountBodySchema, input);
  await lockActiveFinancialWorkspace(t, a.workspaceId);
  const { clientCommandId, ...payload } = b;
  const receipt = await claimFinancialCommandReceipt(t, {
    workspaceId: a.workspaceId,
    clientCommandId,
    commandType: "finance.reconcile_account",
    payloadHash: hashFinancialCommandPayload(payload),
  });
  if (receipt.kind === "replay")
    return reconciliationResultSchema.parse(receipt.result);
  const { preview } = await validateComparison(t, a, b),
    id = randomUUID();
  await insertReconciliation(t, {
    id,
    workspaceId: a.workspaceId,
    commandReceiptId: receipt.receiptId,
    financialAccountId: b.financialAccountId,
    cutoffDate: b.cutoffDate,
    observedMinor: BigInt(b.observedMinor),
    calculatedMinor: BigInt(preview.calculatedMinor),
    financialRevision: BigInt(preview.financialRevision),
    sourceJournalCount: BigInt(preview.sourceJournalCount),
    reference: b.reference,
    notes: b.notes,
    supersedesReconciliationId: b.supersedesReconciliationId,
    recordedByUserId: a.userId,
    actorKind: "user",
    requestId: a.requestId ?? null,
  });
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "reconciliation",
    subjectId: id,
    subjectVersion: 1,
    operation: "create",
    beforeJson: null,
    afterJson: { ...preview, reference: b.reference, notes: b.notes },
    reason: b.notes,
    effectiveDate: b.cutoffDate,
    recordedByUserId: a.userId,
    actorKind: "user",
    requestId: a.requestId ?? null,
  });
  const result = {
    clientCommandId: b.clientCommandId,
    reconciliationId: id,
    financialRevision: preview.financialRevision,
    preview,
  };
  // A comparison is evidence only: no postings and no financial revision bump.
  await completeFinancialCommandReceipt(t, {
    workspaceId: a.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(t);
  return result;
}
async function executeAdjustment(
  t: ScopedTransaction,
  input: AdjustAccountInput,
) {
  const { actor: a, body: b } = normalize(adjustAccountBodySchema, input);
  const workspace = await lockActiveFinancialWorkspace(t, a.workspaceId);
  const { clientCommandId, ...payload } = b;
  const receipt = await claimFinancialCommandReceipt(t, {
    workspaceId: a.workspaceId,
    clientCommandId,
    commandType: "finance.adjust_account_balance",
    payloadHash: hashFinancialCommandPayload(payload),
  });
  if (receipt.kind === "replay")
    return adjustmentResultSchema.parse(receipt.result);
  const { account, preview } = await validateAdjustment(t, a, b);
  if (workspace.currency !== account.currency)
    throw new RangeError("Adjustment currency must match the workspace.");
  const equityLedgerId = await getOrCreateAdjustmentEquityLedger(t, {
    workspaceId: a.workspaceId,
    currency: workspace.currency,
  });
  const ids = await insertAccountAdjustment(t, {
    ...a,
    requestId: a.requestId ?? null,
    receiptId: receipt.receiptId,
    cashLedgerId: account.ledgerAccountId,
    equityLedgerId,
    currency: account.currency,
    body: b,
  });
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_action",
    subjectId: ids.actionId,
    subjectVersion: 1,
    operation: "create",
    beforeJson: {
      balanceAtDateMinor: preview.balanceAtDateBeforeMinor,
      currentBalanceMinor: preview.currentBalanceBeforeMinor,
    },
    afterJson: {
      actionKind: "balance_adjustment",
      actionRevisionId: ids.actionRevisionId,
      ...payload,
      preview,
    },
    reason: b.reason,
    effectiveDate: b.effectiveDate,
    recordedByUserId: a.userId,
    actorKind: "user",
    requestId: a.requestId ?? null,
  });
  await finalizeJournal(t, {
    workspaceId: a.workspaceId,
    journalId: ids.journalId,
  });
  await finalizeActionRevision(t, {
    workspaceId: a.workspaceId,
    actionRevisionId: ids.actionRevisionId,
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
    t,
    a.workspaceId,
  );
  const result = {
    clientCommandId: b.clientCommandId,
    adjustmentId: ids.adjustmentId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    financialRevision,
    reconciliationId: b.reconciliationId,
    preview,
  };
  await completeFinancialCommandReceipt(t, {
    workspaceId: a.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(t);
  return result;
}
export function reconcileAccountInTransaction(
  t: ScopedTransaction,
  input: ReconcileAccountInput,
) {
  return executeComparison(t, input);
}
export function reconcileAccount(input: ReconcileAccountInput) {
  const { actor } = normalize(reconcileAccountBodySchema, input);
  return withDomainTransaction(actor, (t) => executeComparison(t, input));
}
export function adjustAccountBalanceInTransaction(
  t: ScopedTransaction,
  input: AdjustAccountInput,
) {
  return executeAdjustment(t, input);
}
export function adjustAccountBalance(input: AdjustAccountInput) {
  const { actor } = normalize(adjustAccountBodySchema, input);
  return withDomainTransaction(actor, (t) => executeAdjustment(t, input));
}
export function previewAccountReconciliation(input: ReconcileAccountInput) {
  const { actor, body } = normalize(reconcileAccountBodySchema, input);
  return withDomainTransaction(
    actor,
    async (t) => (await validateComparison(t, actor, body)).preview,
    { readOnlySnapshot: true },
  );
}
export function previewAccountAdjustment(input: AdjustAccountInput) {
  const { actor, body } = normalize(adjustAccountBodySchema, input);
  return withDomainTransaction(
    actor,
    async (t) => (await validateAdjustment(t, actor, body)).preview,
    { readOnlySnapshot: true },
  );
}
export async function getAccountReconciliationSetupInTransaction(
  t: ScopedTransaction,
  input: { userId: string; workspaceId: string; financialAccountId: string },
): Promise<ReconciliationSetup> {
  actorSchema.parse(input);
  z.uuid().parse(input.financialAccountId);
  const a = await readAccountBalanceAt(t, {
    ...input,
    cutoffDate: "9999-12-31",
  });
  const history = await readReconciliationHistory(t, input);
  return {
    account: {
      financialAccountId: a.financialAccountId,
      name: a.name,
      currency: a.currency,
      openingCutoffDate: a.openingCutoffDate,
      archived: a.archived,
      version: a.version,
      currentBalanceMinor: a.currentBalanceMinor,
    },
    financialRevision: a.financialRevision,
    history,
    adjustments: await readAccountAdjustments(t, input),
  };
}
export function getAccountReconciliationSetup(input: {
  userId: string;
  workspaceId: string;
  financialAccountId: string;
}) {
  return withDomainTransaction(
    input,
    (t) => getAccountReconciliationSetupInTransaction(t, input),
    { readOnlySnapshot: true },
  );
}
