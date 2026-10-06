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
} from "@/modules/finance/repositories/financial-account-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  compareCalendarDates,
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";
import {
  assertPositiveFinancialAmountMinor,
  parseMinorUnits,
} from "@/shared/money";

const RECORD_EXPENSE_COMMAND_TYPE = "finance.record_expense";

const expenseSplitSchema = z
  .object({
    amountMinor: z.string().regex(/^[1-9]\d*$/, {
      message:
        "Expense split amount must be a positive minor-unit integer string.",
    }),

    categoryId: z.uuid().nullable().optional(),

    memo: z.string().max(20_000).nullable().optional(),
  })
  .strict();

const recordExpenseInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),

    fundingAccountId: z.uuid(),

    effectiveDate: z.string().refine(isCalendarDate, {
      message:
        "Expense effective date must be a valid YYYY-MM-DD calendar date.",
    }),

    purchaseMinor: z.string().regex(/^[1-9]\d*$/, {
      message: "Purchase amount must be a positive minor-unit integer string.",
    }),

    splits: z.array(expenseSplitSchema).min(1),

    merchantName: z.string().trim().min(1).nullable().optional(),

    description: z.string().trim().min(1).max(2000),

    reference: z.string().trim().min(1).nullable().optional(),

    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict();

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
): Promise<RecordExpenseResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    input.workspaceId,
  );

  const payloadHash = hashFinancialCommandPayload({
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

  const receipt = await claimFinancialCommandReceipt(transaction, {
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

  if (fundingAccount.archived) {
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
    });
  }

  const expenseLedgerAccountId = await getOrCreateSharedExpenseLedger(
    transaction,
    {
      workspaceId: input.workspaceId,
      currency: workspace.currency,
    },
  );

  const actionId = randomUUID();
  const actionRevisionId = randomUUID();
  const journalId = randomUUID();

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
    subjectVersion: 1,
    operation: "create",
    afterJson: {
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
): Promise<RecordExpenseResult> {
  return executeRecordExpense(transaction, normalizeRecordExpenseInput(input));
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
