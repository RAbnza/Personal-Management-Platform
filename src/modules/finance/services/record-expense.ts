import { randomUUID } from "node:crypto";

import { z } from "zod";

import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import {
  createExpenseActionRevision,
  createExpenseCashPosting,
  createExpenseFinancialAction,
  createExpenseJournal,
  createGrossExpensePosting,
  createPurchaseDetail,
  ensureActiveExpenseCategory,
  getOrCreateSharedExpenseLedger,
  resolveFundingFinancialAccount,
} from "@/modules/finance/repositories/expense-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "@/modules/finance/repositories/financial-write-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  compareCalendarDates,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";
import {
  assertPositiveFinancialAmountMinor,
  parseMinorUnits,
} from "@/shared/money";

import type { FinancialCorrectionContext } from "@/modules/finance/repositories/financial-correction-repository";
import { reviewCashChanges } from "@/modules/finance/repositories/negative-balance-repository";

const RECORD_EXPENSE_COMMAND_TYPE = "finance.record_expense";

import { recordExpenseInputSchema } from "@/modules/finance/domain/manual-financial-action";

const recordExpenseResultSchema = z.object({
  actionId: z.uuid(),
  actionRevisionId: z.uuid(),
  financialRevision: z.string().regex(/^\d+$/),
});

export type RecordExpenseInput = z.input<typeof recordExpenseInputSchema>;

export type RecordExpenseResult = z.infer<typeof recordExpenseResultSchema>;

type NormalizedExpenseSplit = {
  amountMinor: bigint;
  categoryId: string | null;
  memo: string | null;
};

type NormalizedRecordExpenseInput = {
  userId: string;
  workspaceId: string;
  clientCommandId: string;
  requestId: string | null;
  acknowledgeNegativeBalance: boolean;

  fundingAccountId: string;
  effectiveDate: CalendarDate;
  purchaseMinor: bigint;
  splits: NormalizedExpenseSplit[];

  merchantName: string | null;
  description: string;
  reference: string | null;
  notes: string | null;
};

function normalizeRecordExpenseInput(
  input: RecordExpenseInput,
): NormalizedRecordExpenseInput {
  const parsed = recordExpenseInputSchema.parse(input);

  const effectiveDate = parseCalendarDate(parsed.effectiveDate);

  const purchaseMinor = assertPositiveFinancialAmountMinor(
    parseMinorUnits(parsed.purchaseMinor),
  );

  const splits = parsed.splits.map((split): NormalizedExpenseSplit => ({
    amountMinor: assertPositiveFinancialAmountMinor(
      parseMinorUnits(split.amountMinor),
    ),
    categoryId: split.categoryId ?? null,
    memo: split.memo ?? null,
  }));

  const splitTotal = splits.reduce(
    (total, split) => total + split.amountMinor,
    0n,
  );

  if (splitTotal !== purchaseMinor) {
    throw new RangeError(
      "Expense category portions must sum exactly to the purchase amount.",
    );
  }

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,
    clientCommandId: parsed.clientCommandId,
    requestId: parsed.requestId ?? null,
    acknowledgeNegativeBalance: parsed.acknowledgeNegativeBalance,

    fundingAccountId: parsed.fundingAccountId,
    effectiveDate,
    purchaseMinor,
    splits,

    merchantName: parsed.merchantName ?? null,
    description: parsed.description,
    reference: parsed.reference ?? null,
    notes: parsed.notes ?? null,
  };
}

async function executeRecordExpense(
  transaction: ScopedTransaction,
  input: NormalizedRecordExpenseInput,
  correction?: FinancialCorrectionContext,
): Promise<RecordExpenseResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    input.workspaceId,
  );

  const payloadHash = hashFinancialCommandPayload({
    ...(input.acknowledgeNegativeBalance
      ? { acknowledgeNegativeBalance: true }
      : {}),
    fundingAccountId: input.fundingAccountId,
    effectiveDate: input.effectiveDate,
    purchaseMinor: input.purchaseMinor.toString(),
    splits: input.splits.map((split) => ({
      amountMinor: split.amountMinor.toString(),
      categoryId: split.categoryId,
      memo: split.memo,
    })),
    merchantName: input.merchantName,
    description: input.description,
    reference: input.reference,
    notes: input.notes,
  });

  const receipt = correction
    ? { kind: "claimed" as const, receiptId: correction.receiptId }
    : await claimFinancialCommandReceipt(transaction, {
        workspaceId: input.workspaceId,
        clientCommandId: input.clientCommandId,
        commandType: RECORD_EXPENSE_COMMAND_TYPE,
        payloadHash,
      });

  /*
   * A completed retry returns its original result before evaluating mutable
   * account/category state. Archiving either after the original purchase must
   * not invalidate idempotent replay.
   */
  if (receipt.kind === "replay") {
    return recordExpenseResultSchema.parse(receipt.result);
  }

  const fundingAccount = await resolveFundingFinancialAccount(transaction, {
    workspaceId: input.workspaceId,
    accountId: input.fundingAccountId,
  });

  if (fundingAccount.archived && !correction) {
    throw new RangeError(
      "New expenses require an active funding financial account.",
    );
  }

  if (fundingAccount.currency !== workspace.currency) {
    throw new Error(
      "The funding account currency does not match the workspace currency.",
    );
  }

  const openingCutoffDate = parseCalendarDate(fundingAccount.openingCutoffDate);

  if (compareCalendarDates(input.effectiveDate, openingCutoffDate) <= 0) {
    throw new RangeError(
      "Expense effective date must be after the funding account opening cutoff.",
    );
  }

  const categoryIds = [
    ...new Set(
      input.splits.flatMap((split) =>
        split.categoryId === null ? [] : [split.categoryId],
      ),
    ),
  ];

  for (const categoryId of categoryIds) {
    await ensureActiveExpenseCategory(transaction, {
      workspaceId: input.workspaceId,
      categoryId,
      historicalRevisionId: correction?.previousRevisionId,
    });
  }

  const expenseLedgerAccountId = await getOrCreateSharedExpenseLedger(
    transaction,
    {
      workspaceId: input.workspaceId,
      currency: workspace.currency,
    },
  );

  const negativeBalanceWarnings = await reviewCashChanges(transaction, {
    workspaceId: input.workspaceId,
    acknowledgeNegativeBalance: input.acknowledgeNegativeBalance,
    changes: [
      {
        accountId: input.fundingAccountId,
        effectiveDate: input.effectiveDate,
        signedMinor: -input.purchaseMinor,
      },
    ],
    excludeRevisionId: correction?.previousRevisionId,
  });

  const actionId = correction?.actionId ?? randomUUID();
  const actionRevisionId = correction?.actionRevisionId ?? randomUUID();
  const journalId = randomUUID();

  if (!correction) {
    await createExpenseFinancialAction(transaction, {
      id: actionId,
      workspaceId: input.workspaceId,
      commandReceiptId: receipt.receiptId,
      currentRevisionId: actionRevisionId,
      description: input.description,
      reference: input.reference,
      notes: input.notes,
      recordedByUserId: input.userId,
      requestId: input.requestId,
    });

    await createExpenseActionRevision(transaction, {
      id: actionRevisionId,
      workspaceId: input.workspaceId,
      actionId,
      commandReceiptId: receipt.receiptId,
      effectiveDate: input.effectiveDate,
      currency: workspace.currency,
      recordedByUserId: input.userId,
      requestId: input.requestId,
    });
  }

  await createPurchaseDetail(transaction, {
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    fundingLedgerAccountId: fundingAccount.ledgerAccountId,
    purchaseMinor: input.purchaseMinor,
    merchantName: input.merchantName,
  });

  await createExpenseJournal(transaction, {
    id: journalId,
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    effectiveDate: input.effectiveDate,
    currency: workspace.currency,
  });

  await createExpenseCashPosting(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    journalId,
    fundingLedgerAccountId: fundingAccount.ledgerAccountId,
    currency: workspace.currency,
    purchaseMinor: input.purchaseMinor,
  });

  for (const [index, split] of input.splits.entries()) {
    await createGrossExpensePosting(transaction, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actionId,
      actionRevisionId,
      journalId,
      expenseLedgerAccountId,
      currency: workspace.currency,
      lineNo: index + 2,
      amountMinor: split.amountMinor,
      categoryId: split.categoryId,
      memo: split.memo,
    });
  }

  await createPrivateFinancialRevision(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_action",
    subjectId: actionId,
    subjectVersion: correction?.revisionNo ?? 1,
    operation: correction ? "replace" : "create",
    beforeJson: correction?.before,
    reason: correction?.reason,
    afterJson: {
      acknowledgeNegativeBalance: input.acknowledgeNegativeBalance,
      negativeBalanceWarnings,
      actionRevisionId,
      actionKind: "expense",
      fundingAccountId: input.fundingAccountId,
      effectiveDate: input.effectiveDate,
      currency: workspace.currency,
      purchaseMinor: input.purchaseMinor.toString(),
      merchantName: input.merchantName,
      splits: input.splits.map((split) => ({
        amountMinor: split.amountMinor.toString(),
        categoryId: split.categoryId,
        memo: split.memo,
      })),
      description: input.description,
      reference: input.reference,
    },
    effectiveDate: input.effectiveDate,
    recordedByUserId: input.userId,
    requestId: input.requestId,
  });

  await finalizeJournal(transaction, {
    workspaceId: input.workspaceId,
    journalId,
  });

  await finalizeActionRevision(transaction, {
    workspaceId: input.workspaceId,
    actionRevisionId,
  });

  const financialRevision = await advanceWorkspaceFinancialRevision(
    transaction,
    input.workspaceId,
  );

  const result: RecordExpenseResult = {
    actionId,
    actionRevisionId,
    financialRevision,
  };

  await completeFinancialCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });

  await enforceDeferredFinancialConstraints(transaction);

  return result;
}

export async function recordExpenseInTransaction(
  transaction: ScopedTransaction,
  input: RecordExpenseInput,
  correction?: FinancialCorrectionContext,
): Promise<RecordExpenseResult> {
  return executeRecordExpense(
    transaction,
    normalizeRecordExpenseInput(input),
    correction,
  );
}

export async function recordExpense(
  input: RecordExpenseInput,
): Promise<RecordExpenseResult> {
  const normalizedInput = normalizeRecordExpenseInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeRecordExpense(transaction, normalizedInput),
  );
}
