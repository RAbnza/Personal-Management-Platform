import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  refundIntentSchema,
  financialMutationResultSchema,
} from "../domain/financial-correction";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import { readRefundSources } from "../repositories/refund-repository";
import {
  resolveReceivingFinancialAccount,
  createIncomeFinancialAction,
  createIncomeJournal,
  createIncomeReceiptDetail,
} from "../repositories/income-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "../repositories/financial-write-repository";
import { type FinancialCorrectionContext } from "../repositories/financial-correction-repository";
import { reviewCashChanges } from "../repositories/negative-balance-repository";
import { posting, refundAllocation, refundDetail } from "@/platform/db/schema";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
export const recordRefundBodySchema = refundIntentSchema
  .omit({ actionKind: true })
  .extend({ clientCommandId: z.uuid() })
  .strict();
const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
  })
  .strict();
export type RecordRefundInput = z.input<typeof recordRefundBodySchema> &
  z.infer<typeof actorSchema>;
export async function recordRefundInTransaction(
  t: ScopedTransaction,
  input: RecordRefundInput,
  correction?: FinancialCorrectionContext,
) {
  const { userId, workspaceId, requestId, ...raw } = input,
    actor = actorSchema.parse({ userId, workspaceId, requestId }),
    b = recordRefundBodySchema.parse(raw);
  const w = await lockActiveFinancialWorkspace(t, workspaceId),
    { clientCommandId, ...intent } = b;
  const receipt = correction
    ? { kind: "claimed" as const, receiptId: correction.receiptId }
    : await claimFinancialCommandReceipt(t, {
        workspaceId,
        clientCommandId,
        commandType: "finance.record_refund",
        payloadHash: hashFinancialCommandPayload(intent),
      });
  if (receipt.kind === "replay")
    return financialMutationResultSchema.parse(receipt.result);
  const sources = await readRefundSources(
    t,
    workspaceId,
    b.purchaseActionId,
    correction?.previousRevisionId,
  );
  const account = await resolveReceivingFinancialAccount(t, {
    workspaceId,
    accountId: b.receivingAccountId,
  });
  if (
    (account.archived && !correction) ||
    account.currency !== w.currency ||
    b.effectiveDate <= account.openingCutoffDate
  )
    throw new RangeError(
      "Choose an active receiving account and a refund date after its opening cutoff.",
    );
  if (
    new Set(b.allocations.map((a) => a.originalPurchasePostingId)).size !==
    b.allocations.length
  )
    throw new RangeError("Allocate each purchase or fee portion once.");
  const allocatedGroups = new Map<string, bigint>();
  for (const a of b.allocations) {
    const p = sources.find(
      (p) =>
        p.postingId === a.originalPurchasePostingId &&
        p.allocationKind === a.allocationKind,
    );
    if (
      !p ||
      b.effectiveDate < p.effectiveDate ||
      BigInt(a.amountMinor) > BigInt(p.remainingMinor)
    )
      throw new RangeError(
        "Refund exceeds an eligible purchase/fee portion or precedes the purchase. Review the current purchase and prior refunds.",
      );
    const groupKey = `${p.categoryId ?? "uncategorized"}:${p.allocationKind}`;
    const groupAmount =
      (allocatedGroups.get(groupKey) ?? 0n) + BigInt(a.amountMinor);
    if (groupAmount > BigInt(p.groupRemainingMinor))
      throw new RangeError(
        "Refund exceeds the current eligible category or fee amount. Resolve dependent refunds explicitly first.",
      );
    allocatedGroups.set(groupKey, groupAmount);
  }
  const amount = b.allocations.reduce((s, a) => s + BigInt(a.amountMinor), 0n);
  if (amount > 100000000000n)
    throw new RangeError("Refund exceeds the financial limit.");
  const warnings = await reviewCashChanges(t, {
    workspaceId,
    acknowledgeNegativeBalance: b.acknowledgeNegativeBalance,
    excludeRevisionId: correction?.previousRevisionId,
    changes: [
      {
        accountId: b.receivingAccountId,
        effectiveDate: b.effectiveDate,
        signedMinor: amount,
      },
    ],
  });
  const actionId = correction?.actionId ?? randomUUID(),
    actionRevisionId = correction?.actionRevisionId ?? randomUUID(),
    journalId = randomUUID(),
    scope = { workspaceId, actionId, actionRevisionId };
  if (!correction) {
    await createIncomeFinancialAction(t, {
      id: actionId,
      workspaceId,
      commandReceiptId: receipt.receiptId,
      currentRevisionId: actionRevisionId,
      description: b.description,
      reference: b.reference,
      notes: b.notes,
      recordedByUserId: actor.userId,
      requestId: requestId ?? null,
    });
    await t.db.execute(
      sql`INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,recorded_by_user_id,actor_kind,request_id) VALUES(${actionRevisionId}::uuid,${workspaceId}::uuid,${actionId}::uuid,1,${receipt.receiptId}::uuid,'create','refund',${b.effectiveDate}::date,${w.currency},${userId}::uuid,'user',${requestId ?? null}::uuid)`,
    );
  }
  await t.db.insert(refundDetail).values({
    ...scope,
    purchaseActionId: b.purchaseActionId,
    refundMinor: amount,
    destinationLedgerAccountId: account.ledgerAccountId,
  });
  await createIncomeReceiptDetail(t, {
    ...scope,
    receivingAccountId: b.receivingAccountId,
    actualReceivedMinor: amount,
    senderName: null,
    sourceLabel: "Purchase refund",
  });
  await createIncomeJournal(t, {
    id: journalId,
    ...scope,
    effectiveDate: b.effectiveDate,
    currency: w.currency,
  });
  const line = { ...scope, journalId, currency: w.currency };
  await t.db.insert(posting).values({
    ...line,
    id: randomUUID(),
    lineNo: 1,
    ledgerAccountId: account.ledgerAccountId,
    amountMinor: amount,
    cashFlowKind: "refund",
    cashFlowDirection: "in",
  });
  for (const [index, a] of b.allocations.entries()) {
    const source = sources.find(
        (p) => p.postingId === a.originalPurchasePostingId,
      )!,
      id = randomUUID();
    await t.db.insert(posting).values({
      ...line,
      id,
      lineNo: index + 2,
      ledgerAccountId: source.ledgerAccountId,
      categoryId: source.categoryId,
      amountMinor: -BigInt(a.amountMinor),
      expenseClass: "refund_offset",
      memo: b.description,
    });
    await t.db.insert(refundAllocation).values({
      ...scope,
      originalPurchasePostingId: source.postingId,
      refundPostingId: id,
      amountMinor: BigInt(a.amountMinor),
      allocationKind: a.allocationKind,
    });
  }
  await createPrivateFinancialRevision(t, {
    id: randomUUID(),
    workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_action",
    subjectId: actionId,
    subjectVersion: correction?.revisionNo ?? 1,
    operation: correction ? "replace" : "create",
    beforeJson: correction?.before,
    reason: correction?.reason,
    afterJson: {
      ...intent,
      actionKind: "refund",
      actionRevisionId,
      refundMinor: amount.toString(),
      negativeBalanceWarnings: warnings,
    },
    effectiveDate: b.effectiveDate,
    recordedByUserId: userId,
    requestId: requestId ?? null,
  });
  await finalizeJournal(t, { workspaceId, journalId });
  await finalizeActionRevision(t, { workspaceId, actionRevisionId });
  const financialRevision = await advanceWorkspaceFinancialRevision(
      t,
      workspaceId,
    ),
    result = { actionId, actionRevisionId, financialRevision };
  await completeFinancialCommandReceipt(t, {
    workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(t);
  return result;
}
export function recordRefund(input: RecordRefundInput) {
  return withDomainTransaction(input, (t) =>
    recordRefundInTransaction(t, input),
  );
}
