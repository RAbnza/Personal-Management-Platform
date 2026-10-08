import { sql } from "drizzle-orm";
import type { FinancialCorrectionContext } from "@/modules/finance/repositories/financial-correction-repository";
import { reviewCashChanges } from "@/modules/finance/repositories/negative-balance-repository";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  buildDebtPaymentPreview,
  PaymentPreviewStaleError,
  recordDebtPaymentBodySchema,
  recordDebtPaymentResultSchema,
  type RecordDebtPaymentBody,
  type RecordDebtPaymentResult,
  type ValidatedDebtPayment,
} from "@/modules/finance/domain/debt-payment";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import {
  ensurePaymentClearingLedger,
  insertDebtPayment,
  resolvePaymentAccount,
  resolvePaymentDebt,
} from "@/modules/finance/repositories/debt-payment-repository";
import { readDebtInstallments } from "@/modules/finance/repositories/debt-read-repository";
import { debtInstallmentReadSchema } from "@/modules/finance/domain/debt";
import {
  ensureActiveExpenseCategory,
  getOrCreateSharedExpenseLedger,
} from "@/modules/finance/repositories/expense-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "@/modules/finance/repositories/financial-write-repository";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
  })
  .strict();
export type RecordDebtPaymentInput = RecordDebtPaymentBody &
  z.input<typeof actorSchema>;

function normalize(input: RecordDebtPaymentInput) {
  const { userId, workspaceId, requestId, ...body } = input;
  return {
    actor: actorSchema.parse({ userId, workspaceId, requestId }),
    body: recordDebtPaymentBodySchema.parse(body),
  };
}

async function execute(
  transaction: ScopedTransaction,
  actor: z.output<typeof actorSchema>,
  body: ValidatedDebtPayment,
  correction?: FinancialCorrectionContext,
): Promise<RecordDebtPaymentResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    actor.workspaceId,
  );
  const { clientCommandId, ...intent } = body;
  const receipt = correction
    ? { kind: "claimed" as const, receiptId: correction.receiptId }
    : await claimFinancialCommandReceipt(transaction, {
        workspaceId: actor.workspaceId,
        clientCommandId,
        commandType: "finance.record_debt_payment",
        payloadHash: hashFinancialCommandPayload(intent),
      });
  // Replay precedes stale-preview/reference checks: the original result remains
  // recoverable after payment, account archival, or a later schedule change.
  if (receipt.kind === "replay")
    return recordDebtPaymentResultSchema.parse(receipt.result);
  const debt = await resolvePaymentDebt(transaction, {
    workspaceId: actor.workspaceId,
    debtId: body.debtId,
  });
  if (!debt) throw new DebtUnavailableError();
  if (
    debt.financial_revision !== body.expectedFinancialRevision ||
    debt.current_schedule_version_id !== body.scheduleVersionId
  )
    throw new PaymentPreviewStaleError();
  if (debt.lifecycle !== "active")
    throw new RangeError("New payments require an active debt.");
  if (debt.currency !== workspace.currency)
    throw new RangeError("Debt currency must match the workspace.");
  if (
    body.paymentDate < debt.start_date ||
    (debt.opening_cutoff_date && body.paymentDate <= debt.opening_cutoff_date)
  )
    throw new RangeError(
      "Payment must follow the debt coverage cutoff and cannot precede its start date.",
    );
  const account = await resolvePaymentAccount(transaction, {
    workspaceId: actor.workspaceId,
    accountId: body.payingAccountId,
  });
  if (
    (account.archived && !correction) ||
    account.currency !== debt.currency ||
    body.paymentDate <= account.opening_cutoff_date
  )
    throw new RangeError(
      "Choose an active paying account in the debt currency and a payment date after its opening cutoff.",
    );
  const negativeBalanceWarnings = await reviewCashChanges(transaction, {
    workspaceId: actor.workspaceId,
    acknowledgeNegativeBalance: body.acknowledgeNegativeBalance,
    changes: [
      {
        accountId: body.payingAccountId,
        effectiveDate: body.paymentDate,
        signedMinor: -BigInt(body.actualPaidMinor),
      },
    ],
    excludeRevisionId: correction?.previousRevisionId,
  });
  const balanceAfter = BigInt(account.balance) - BigInt(body.actualPaidMinor);
  if (correction) {
    const original = await transaction.db.execute<{
      component: string;
      amount: string;
    }>(
      sql`SELECT p.liability_component AS component,sum(p.amount_minor::numeric)::text AS amount FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' WHERE p.workspace_id=${actor.workspaceId}::uuid AND p.action_revision_id=${correction.previousRevisionId}::uuid AND p.ledger_account_id=${debt.liability_ledger_account_id}::uuid GROUP BY p.liability_component`,
    );
    for (const p of original.rows)
      debt.liability_balances[p.component] = (
        BigInt(debt.liability_balances[p.component] ?? "0") + BigInt(p.amount)
      ).toString();
  }
  const installments = z.array(debtInstallmentReadSchema).parse(
    await readDebtInstallments(transaction, {
      workspaceId: actor.workspaceId,
      debtId: body.debtId,
      scheduleVersionId: body.scheduleVersionId,
    }),
  );
  for (const allocation of body.dueAllocations) {
    const installment = installments.find(
      (i) =>
        i.installmentId === allocation.installmentId &&
        i.disposition === "scheduled",
    );
    if (!installment)
      throw new RangeError(
        "An allocated installment is unavailable in this debt's current schedule.",
      );
    if (BigInt(allocation.amountMinor) > BigInt(installment.remainingMinor))
      throw new RangeError(
        "An allocation exceeds the current installment remaining amount. Review a smaller allocation or explicit unapplied amount.",
      );
  }
  const reductions = new Map<string, bigint>();
  for (const component of body.components)
    if (component.disposition === "liability_reduction") {
      const key = component.liabilityComponent!;
      reductions.set(
        key,
        (reductions.get(key) ?? 0n) + BigInt(component.amountMinor),
      );
    }
  for (const [key, amount] of reductions)
    if (amount > BigInt(debt.liability_balances[key] ?? "0"))
      throw new RangeError(
        `The payment exceeds recognized ${key} liability. New charges or advances need their own explicit accounting components.`,
      );
  const categoryIds = [
    ...new Set([
      ...body.components.flatMap((c) => (c.categoryId ? [c.categoryId] : [])),
      ...(BigInt(body.externalFeeMinor) > 0n && body.externalFeeCategoryId
        ? [body.externalFeeCategoryId]
        : []),
    ]),
  ];
  for (const categoryId of categoryIds)
    await ensureActiveExpenseCategory(transaction, {
      workspaceId: actor.workspaceId,
      categoryId,
      historicalRevisionId: correction?.previousRevisionId,
    });
  const preview = buildDebtPaymentPreview(body);
  const expenseLedgerId =
    preview.newExpenseMinor > 0n
      ? await getOrCreateSharedExpenseLedger(transaction, {
          workspaceId: actor.workspaceId,
          currency: workspace.currency,
        })
      : null;
  const clearingLedgerId =
    preview.clearingMinor > 0n
      ? await ensurePaymentClearingLedger(transaction, {
          workspaceId: actor.workspaceId,
          debtId: body.debtId,
          currency: workspace.currency,
          existingId: debt.clearing_ledger_account_id,
        })
      : debt.clearing_ledger_account_id;
  const ids = await insertDebtPayment(transaction, {
    ...actor,
    requestId: actor.requestId ?? null,
    receiptId: receipt.receiptId,
    currency: workspace.currency,
    body,
    correction,
    payingLedgerId: account.ledger_account_id,
    liabilityLedgerId: debt.liability_ledger_account_id,
    clearingLedgerId,
    expenseLedgerId,
  });
  await createPrivateFinancialRevision(transaction, {
    id: randomUUID(),
    workspaceId: actor.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_action",
    subjectId: ids.actionId,
    subjectVersion: correction?.revisionNo ?? 1,
    operation: correction ? "replace" : "create",
    beforeJson: correction?.before,
    reason: correction?.reason,
    effectiveDate: body.paymentDate,
    recordedByUserId: actor.userId,
    requestId: actor.requestId ?? null,
    afterJson: {
      ...intent,
      negativeBalanceWarnings,
      actionKind: "debt_payment",
      actionRevisionId: ids.actionRevisionId,
      paymentId: ids.paymentId,
      paymentRevisionId: ids.paymentRevisionId,
      currency: workspace.currency,
      clearingLedgerAccountId: clearingLedgerId,
      payingBalanceBeforeMinor: account.balance,
      payingBalanceAfterMinor: balanceAfter.toString(),
      negativeBalanceWarning: balanceAfter < 0n,
    },
  });
  await finalizeJournal(transaction, {
    workspaceId: actor.workspaceId,
    journalId: ids.journalId,
  });
  await finalizeActionRevision(transaction, {
    workspaceId: actor.workspaceId,
    actionRevisionId: ids.actionRevisionId,
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
    transaction,
    actor.workspaceId,
  );
  const result = {
    debtId: body.debtId,
    paymentId: ids.paymentId,
    paymentRevisionId: ids.paymentRevisionId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    financialRevision,
  };
  await completeFinancialCommandReceipt(transaction, {
    workspaceId: actor.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  // Corrections may still need a new allocation-correction schedule version
  // before current payment pools and current maps can be verified together.
  if (!correction) await enforceDeferredFinancialConstraints(transaction);
  return result;
}

export function recordDebtPaymentInTransaction(
  transaction: ScopedTransaction,
  input: RecordDebtPaymentInput,
  correction?: FinancialCorrectionContext,
) {
  const { actor, body } = normalize(input);
  return execute(transaction, actor, body, correction);
}
export function recordDebtPayment(input: RecordDebtPaymentInput) {
  const { actor, body } = normalize(input);
  return withDomainTransaction(actor, (transaction) =>
    execute(transaction, actor, body),
  );
}
