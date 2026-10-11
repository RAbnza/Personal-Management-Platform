import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  cardActionDetail,
  cardRefundPart,
  journal,
  posting,
} from "@/platform/db/schema";
import {
  recordCardCommandBodySchema,
  CardEvidenceConflictError,
  CardEvidenceUnavailableError,
} from "../domain/card-command";
import { statementIdentifierSchema } from "../domain/card-statement";
import { financialMutationResultSchema } from "../domain/financial-correction";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import { resolvePurchaseCard } from "../repositories/card-purchase-repository";
import {
  createCardCommandActivity,
  readCardRefundSources,
} from "../repositories/card-command-repository";
import {
  createExpenseFinancialAction,
  ensureActiveExpenseCategory,
  getOrCreateSharedExpenseLedger,
  resolveFundingFinancialAccount,
} from "../repositories/expense-repository";
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
const actorSchema = z
  .object({
    userId: statementIdentifierSchema,
    workspaceId: statementIdentifierSchema,
    requestId: statementIdentifierSchema.optional(),
  })
  .strict();
export type RecordCardCommandInput = z.input<
  typeof recordCardCommandBodySchema
> &
  z.input<typeof actorSchema>;
export async function recordCardCommandInTransaction(
  t: ScopedTransaction,
  input: RecordCardCommandInput,
  correction?: FinancialCorrectionContext,
) {
  const { userId, workspaceId, requestId, ...raw } = input,
    a = actorSchema.parse({ userId, workspaceId, requestId }),
    b = recordCardCommandBodySchema.parse(raw);
  const w = await lockActiveFinancialWorkspace(t, a.workspaceId),
    { clientCommandId, ...intent } = b;
  const receipt = correction
    ? { kind: "claimed" as const, receiptId: correction.receiptId }
    : await claimFinancialCommandReceipt(t, {
        workspaceId: a.workspaceId,
        clientCommandId,
        commandType: `finance.record_${b.actionKind}`,
        payloadHash: hashFinancialCommandPayload(intent),
      });
  if (receipt.kind === "replay")
    return financialMutationResultSchema.parse(receipt.result);
  const card = await resolvePurchaseCard(t, a.workspaceId, b.cardId);
  if (
    card.currency !== w.currency ||
    (card.archived && (!correction || correction.before.cardId !== b.cardId))
  )
    throw new RangeError(
      "Choose an active card; a correction may retain its original archived card.",
    );
  const cash = b.payingAccountId
    ? await resolveFundingFinancialAccount(t, {
        workspaceId: a.workspaceId,
        accountId: b.payingAccountId,
      })
    : null;
  if (
    cash &&
    (cash.currency !== w.currency ||
      b.effectiveDate <= cash.openingCutoffDate ||
      (cash.archived &&
        (!correction ||
          correction.before.payingAccountId !== b.payingAccountId)))
  )
    throw new RangeError(
      "Choose an active paying account and a date after its opening cutoff.",
    );
  if (b.categoryId)
    await ensureActiveExpenseCategory(t, {
      workspaceId: a.workspaceId,
      categoryId: b.categoryId,
      historicalRevisionId: correction?.previousRevisionId,
    });
  const sources = b.purchaseActionId
    ? await readCardRefundSources(
        t,
        a.workspaceId,
        b.purchaseActionId,
        correction?.previousRevisionId,
      )
    : [];
  if (b.purchaseActionId && !sources.length)
    throw new CardEvidenceUnavailableError();
  const used = new Map<string, bigint>();
  for (const part of b.refundParts) {
    const s = sources.find(
      (s) => s.postingId === part.originalPurchasePostingId,
    );
    if (
      !s ||
      s.cardId !== b.cardId ||
      b.effectiveDate < s.effectiveDate ||
      BigInt(part.amountMinor) > BigInt(s.remainingMinor)
    )
      throw new CardEvidenceConflictError(
        "Refund exceeds the eligible original purchase classification or uses another card.",
      );
    const key = s.categoryId ?? "uncategorized",
      n = (used.get(key) ?? 0n) + BigInt(part.amountMinor);
    used.set(key, n);
    const max = BigInt(s.groupRemainingMinor);
    if (n > max)
      throw new CardEvidenceConflictError(
        "Refund exceeds the remaining category amount.",
      );
  }
  const amount = BigInt(b.amountMinor);
  const warnings = await reviewCashChanges(t, {
    workspaceId: a.workspaceId,
    acknowledgeNegativeBalance: b.acknowledgeNegativeBalance,
    excludeRevisionId: correction?.previousRevisionId,
    changes: cash
      ? [
          {
            accountId: b.payingAccountId!,
            effectiveDate: b.effectiveDate,
            signedMinor: -amount,
          },
        ]
      : [],
  });
  const actionId = correction?.actionId ?? randomUUID(),
    actionRevisionId = correction?.actionRevisionId ?? randomUUID(),
    journalId = randomUUID(),
    scope = { workspaceId: a.workspaceId, actionId, actionRevisionId };
  if (!correction) {
    await createExpenseFinancialAction(t, {
      id: actionId,
      workspaceId: a.workspaceId,
      commandReceiptId: receipt.receiptId,
      currentRevisionId: actionRevisionId,
      description: b.description,
      reference: b.reference,
      notes: b.notes,
      recordedByUserId: a.userId,
      requestId: a.requestId ?? null,
    });
    await t.db.execute(
      sql`INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,recorded_by_user_id,actor_kind,request_id) VALUES(${actionRevisionId}::uuid,${a.workspaceId}::uuid,${actionId}::uuid,1,${receipt.receiptId}::uuid,'create',${b.actionKind},${b.effectiveDate}::date,${w.currency},${a.userId}::uuid,'user',${a.requestId ?? null}::uuid)`,
    );
  }
  await t.db.insert(cardActionDetail).values({
    ...scope,
    cardId: b.cardId,
    amountMinor: amount,
    postingDate: b.postingDate,
    providerReference: b.providerReference,
    confirmationSource: b.confirmationSource,
    payingAccountId: b.payingAccountId,
    purchaseActionId: b.purchaseActionId,
  });
  await t.db.insert(journal).values({
    ...scope,
    id: journalId,
    sequenceNo: 1,
    effectiveDate: b.effectiveDate,
    currency: w.currency,
    role: "economic",
  });
  const line = { ...scope, journalId, currency: w.currency };
  const credit =
    b.actionKind === "card_payment" || b.actionKind === "card_refund";
  await t.db.insert(posting).values({
    ...line,
    id: randomUUID(),
    lineNo: 1,
    ledgerAccountId: card.ledgerAccountId,
    amountMinor: credit ? amount : -amount,
  });
  if (cash) {
    await t.db.insert(posting).values({
      ...line,
      id: randomUUID(),
      lineNo: 2,
      ledgerAccountId: cash.ledgerAccountId,
      amountMinor: -amount,
      cashFlowKind: "transfer",
      cashFlowDirection: "out",
    });
  } else if (b.purchaseActionId) {
    for (const [index, part] of b.refundParts.entries()) {
      const s = sources.find(
          (s) => s.postingId === part.originalPurchasePostingId,
        )!,
        id = randomUUID();
      await t.db.insert(posting).values({
        ...line,
        id,
        lineNo: index + 2,
        ledgerAccountId: s.ledgerAccountId,
        categoryId: s.categoryId,
        amountMinor: -BigInt(part.amountMinor),
        expenseClass: "refund_offset",
        memo: b.description,
      });
      await t.db.insert(cardRefundPart).values({
        ...scope,
        originalPurchasePostingId: part.originalPurchasePostingId,
        refundPostingId: id,
        amountMinor: BigInt(part.amountMinor),
      });
    }
  } else {
    const expense = await getOrCreateSharedExpenseLedger(t, {
      workspaceId: a.workspaceId,
      currency: w.currency,
    });
    await t.db.insert(posting).values({
      ...line,
      id: randomUUID(),
      lineNo: 2,
      ledgerAccountId: expense,
      categoryId: b.categoryId,
      amountMinor: credit ? -amount : amount,
      expenseClass: credit ? "refund_offset" : "gross",
      memo: b.description,
    });
  }
  await createCardCommandActivity(t, scope);
  await createPrivateFinancialRevision(t, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_action",
    subjectId: actionId,
    subjectVersion: correction?.revisionNo ?? 1,
    operation: correction ? "replace" : "create",
    beforeJson: correction?.before,
    reason: correction?.reason,
    afterJson: {
      ...intent,
      actionRevisionId,
      negativeBalanceWarnings: warnings,
    },
    effectiveDate: b.effectiveDate,
    recordedByUserId: a.userId,
    requestId: a.requestId ?? null,
  });
  await finalizeJournal(t, { workspaceId: a.workspaceId, journalId });
  await finalizeActionRevision(t, {
    workspaceId: a.workspaceId,
    actionRevisionId,
  });
  const result = {
    actionId,
    actionRevisionId,
    financialRevision: await advanceWorkspaceFinancialRevision(
      t,
      a.workspaceId,
    ),
  };
  await completeFinancialCommandReceipt(t, {
    workspaceId: a.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(t);
  return result;
}
export function recordCardCommand(input: RecordCardCommandInput) {
  return withDomainTransaction(input, (t) =>
    recordCardCommandInTransaction(t, input),
  );
}
