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
): Promise<RecordDebtPaymentResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    actor.workspaceId,
  );
  const { clientCommandId, ...intent } = body;
  const receipt = await claimFinancialCommandReceipt(transaction, {
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
    account.archived ||
    account.currency !== debt.currency ||
    body.paymentDate <= account.opening_cutoff_date
  )
    throw new RangeError(
      "Choose an active paying account in the debt currency and a payment date after its opening cutoff.",
    );
  const balanceAfter = BigInt(account.balance) - BigInt(body.actualPaidMinor);
  if (balanceAfter < 0n && !body.acknowledgeNegativeBalance)
    throw new RangeError(
      "This payment makes the tracked account negative. Review and explicitly acknowledge the incomplete balance before saving.",
    );
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
    subjectVersion: 1,
    operation: "create",
    effectiveDate: body.paymentDate,
    recordedByUserId: actor.userId,
    requestId: actor.requestId ?? null,
    afterJson: {
      ...intent,
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
  await enforceDeferredFinancialConstraints(transaction);
  return result;
}

export function recordDebtPaymentInTransaction(
  transaction: ScopedTransaction,
  input: RecordDebtPaymentInput,
) {
  const { actor, body } = normalize(input);
  return execute(transaction, actor, body);
}
export function recordDebtPayment(input: RecordDebtPaymentInput) {
  const { actor, body } = normalize(input);
  return withDomainTransaction(actor, (transaction) =>
    execute(transaction, actor, body),
  );
}
