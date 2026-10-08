import { randomUUID } from "node:crypto";

import { z } from "zod";

import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
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
import {
  createTransferActionRevision,
  createTransferDetail,
  createTransferFeeCashPosting,
  createTransferFeeComponent,
  createTransferFeeExpensePosting,
  createTransferFinancialAction,
  createTransferJournal,
  createTransferPrincipalPosting,
  resolveTransferFinancialAccount,
  type TransferFeeTreatment,
} from "@/modules/finance/repositories/transfer-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  compareCalendarDates,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";
import {
  assertPositiveFinancialAmountMinor,
  MAX_FINANCIAL_COMPONENT_MINOR,
  parseMinorUnits,
} from "@/shared/money";

import type { FinancialCorrectionContext } from "@/modules/finance/repositories/financial-correction-repository";
import { reviewCashChanges } from "@/modules/finance/repositories/negative-balance-repository";

const RECORD_TRANSFER_COMMAND_TYPE = "finance.record_transfer";

import { recordTransferInputSchema } from "@/modules/finance/domain/manual-financial-action";

const recordTransferResultSchema = z.object({
  actionId: z.uuid(),
  actionRevisionId: z.uuid(),
  financialRevision: z.string().regex(/^\d+$/),
});

export type RecordTransferInput = z.input<typeof recordTransferInputSchema>;

export type RecordTransferResult = z.infer<typeof recordTransferResultSchema>;

type NormalizedTransferFee = {
  label: string;
  amountMinor: bigint;
  effectiveDate: CalendarDate;
  bearingAccountId: string;
  treatment: TransferFeeTreatment;
  categoryId: string | null;
};

type NormalizedRecordTransferInput = {
  userId: string;
  workspaceId: string;
  clientCommandId: string;
  requestId: string | null;
  acknowledgeNegativeBalance: boolean;

  sourceAccountId: string;
  destinationAccountId: string;

  effectiveDate: CalendarDate;
  destinationPrincipalMinor: bigint;
  withheldFeeMinor: bigint;
  sourcePrincipalMinor: bigint;

  fees: NormalizedTransferFee[];

  description: string;
  reference: string | null;
  notes: string | null;
};

type ResolvedTransferAccount = {
  ledgerAccountId: string;
  currency: string;
  openingCutoffDate: string;
  archived: boolean;
};

function normalizeRecordTransferInput(
  input: RecordTransferInput,
): NormalizedRecordTransferInput {
  const parsed = recordTransferInputSchema.parse(input);

  if (parsed.sourceAccountId === parsed.destinationAccountId) {
    throw new RangeError(
      "Transfer source and destination accounts must be different.",
    );
  }

  const effectiveDate = parseCalendarDate(parsed.effectiveDate);

  const destinationPrincipalMinor = assertPositiveFinancialAmountMinor(
    parseMinorUnits(parsed.destinationPrincipalMinor),
  );

  const fees = parsed.fees.map((fee): NormalizedTransferFee => {
    const amountMinor = assertPositiveFinancialAmountMinor(
      parseMinorUnits(fee.amountMinor),
    );

    const feeEffectiveDate = parseCalendarDate(
      fee.effectiveDate ?? effectiveDate,
    );

    let bearingAccountId = fee.bearingAccountId;

    if (fee.treatment === "withheld" || fee.treatment === "source_additional") {
      bearingAccountId ??= parsed.sourceAccountId;

      if (bearingAccountId !== parsed.sourceAccountId) {
        throw new RangeError(
          `${fee.treatment} transfer fees must be borne by the source account.`,
        );
      }
    }

    if (fee.treatment === "separate" && bearingAccountId === undefined) {
      throw new RangeError(
        "A separate transfer fee requires a bearing financial account.",
      );
    }

    if (
      fee.treatment === "withheld" &&
      compareCalendarDates(feeEffectiveDate, effectiveDate) !== 0
    ) {
      throw new RangeError(
        "A withheld transfer fee must use the transfer effective date.",
      );
    }

    if (bearingAccountId === undefined) {
      throw new Error(
        "The transfer fee bearing account could not be resolved.",
      );
    }

    return {
      label: fee.label,
      amountMinor,
      effectiveDate: feeEffectiveDate,
      bearingAccountId,
      treatment: fee.treatment,
      categoryId: fee.categoryId ?? null,
    };
  });

  const withheldFeeMinor = fees.reduce(
    (total, fee) =>
      fee.treatment === "withheld" ? total + fee.amountMinor : total,
    0n,
  );

  if (withheldFeeMinor > MAX_FINANCIAL_COMPONENT_MINOR) {
    throw new RangeError(
      `Total withheld transfer fees must not exceed ${MAX_FINANCIAL_COMPONENT_MINOR.toString()} minor units.`,
    );
  }

  const sourcePrincipalMinor = destinationPrincipalMinor + withheldFeeMinor;

  if (sourcePrincipalMinor > MAX_FINANCIAL_COMPONENT_MINOR) {
    throw new RangeError(
      `Transfer source principal must not exceed ${MAX_FINANCIAL_COMPONENT_MINOR.toString()} minor units.`,
    );
  }

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,
    clientCommandId: parsed.clientCommandId,
    requestId: parsed.requestId ?? null,
    acknowledgeNegativeBalance: parsed.acknowledgeNegativeBalance,

    sourceAccountId: parsed.sourceAccountId,
    destinationAccountId: parsed.destinationAccountId,

    effectiveDate,
    destinationPrincipalMinor,
    withheldFeeMinor,
    sourcePrincipalMinor,

    fees,

    description: parsed.description,
    reference: parsed.reference ?? null,
    notes: parsed.notes ?? null,
  };
}

function assertAccountUsableForTransfer(
  account: ResolvedTransferAccount,
  input: {
    role: string;
    expectedCurrency: string;
    effectiveDate: CalendarDate;
    correction?: boolean;
  },
): void {
  if (account.archived && !input.correction) {
    throw new RangeError(
      `New transfers require an active ${input.role} financial account.`,
    );
  }

  if (account.currency !== input.expectedCurrency) {
    throw new Error(
      `The ${input.role} account currency does not match the workspace currency.`,
    );
  }

  const openingCutoffDate = parseCalendarDate(account.openingCutoffDate);

  if (compareCalendarDates(input.effectiveDate, openingCutoffDate) <= 0) {
    throw new RangeError(
      `Transfer activity must occur after the ${input.role} account opening cutoff.`,
    );
  }
}

async function executeRecordTransfer(
  transaction: ScopedTransaction,
  input: NormalizedRecordTransferInput,
  correction?: FinancialCorrectionContext,
): Promise<RecordTransferResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    input.workspaceId,
  );

  const payloadHash = hashFinancialCommandPayload({
    ...(input.acknowledgeNegativeBalance
      ? { acknowledgeNegativeBalance: true }
      : {}),
    sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId,
    effectiveDate: input.effectiveDate,
    destinationPrincipalMinor: input.destinationPrincipalMinor.toString(),
    fees: input.fees.map((fee) => ({
      label: fee.label,
      amountMinor: fee.amountMinor.toString(),
      effectiveDate: fee.effectiveDate,
      bearingAccountId: fee.bearingAccountId,
      treatment: fee.treatment,
      categoryId: fee.categoryId,
    })),
    description: input.description,
    reference: input.reference,
    notes: input.notes,
  });

  const receipt = correction
    ? { kind: "claimed" as const, receiptId: correction.receiptId }
    : await claimFinancialCommandReceipt(transaction, {
        workspaceId: input.workspaceId,
        clientCommandId: input.clientCommandId,
        commandType: RECORD_TRANSFER_COMMAND_TYPE,
        payloadHash,
      });

  /*
   * Replay returns the original committed IDs before evaluating mutable
   * account/category state. Accounts may have been archived after the
   * original transfer and that must not invalidate an idempotent retry.
   */
  if (receipt.kind === "replay") {
    return recordTransferResultSchema.parse(receipt.result);
  }

  const resolvedAccounts = new Map<string, ResolvedTransferAccount>();

  const resolveAccount = async (
    accountId: string,
  ): Promise<ResolvedTransferAccount> => {
    const existing = resolvedAccounts.get(accountId);

    if (existing) {
      return existing;
    }

    const account = await resolveTransferFinancialAccount(transaction, {
      workspaceId: input.workspaceId,
      accountId,
    });

    resolvedAccounts.set(accountId, account);

    return account;
  };

  const sourceAccount = await resolveAccount(input.sourceAccountId);

  const destinationAccount = await resolveAccount(input.destinationAccountId);

  assertAccountUsableForTransfer(sourceAccount, {
    role: "source",
    correction: !!correction,
    expectedCurrency: workspace.currency,
    effectiveDate: input.effectiveDate,
  });

  assertAccountUsableForTransfer(destinationAccount, {
    role: "destination",
    correction: !!correction,
    expectedCurrency: workspace.currency,
    effectiveDate: input.effectiveDate,
  });

  for (const fee of input.fees) {
    const bearingAccount = await resolveAccount(fee.bearingAccountId);

    assertAccountUsableForTransfer(bearingAccount, {
      role: "fee-bearing",
      correction: !!correction,
      expectedCurrency: workspace.currency,
      effectiveDate: fee.effectiveDate,
    });
  }

  const categoryIds = [
    ...new Set(
      input.fees.flatMap((fee) =>
        fee.categoryId === null ? [] : [fee.categoryId],
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

  const expenseLedgerAccountId =
    input.fees.length === 0
      ? null
      : await getOrCreateSharedExpenseLedger(transaction, {
          workspaceId: input.workspaceId,
          currency: workspace.currency,
        });

  const negativeBalanceWarnings = await reviewCashChanges(transaction, {
    workspaceId: input.workspaceId,
    acknowledgeNegativeBalance: input.acknowledgeNegativeBalance,
    changes: [
      {
        accountId: input.sourceAccountId,
        effectiveDate: input.effectiveDate,
        signedMinor: -input.destinationPrincipalMinor,
      },
      {
        accountId: input.destinationAccountId,
        effectiveDate: input.effectiveDate,
        signedMinor: input.destinationPrincipalMinor,
      },
      ...input.fees.map((f) => ({
        accountId: f.bearingAccountId,
        effectiveDate: f.effectiveDate,
        signedMinor: -f.amountMinor,
      })),
    ],
    excludeRevisionId: correction?.previousRevisionId,
  });

  const actionId = correction?.actionId ?? randomUUID();
  const actionRevisionId = correction?.actionRevisionId ?? randomUUID();

  if (!correction) {
    await createTransferFinancialAction(transaction, {
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

    await createTransferActionRevision(transaction, {
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

  await createTransferDetail(transaction, {
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId,
    sourcePrincipalMinor: input.sourcePrincipalMinor,
    destinationPrincipalMinor: input.destinationPrincipalMinor,
    withheldFeeMinor: input.withheldFeeMinor,
  });

  const additionalFeeDates = [
    ...new Set(
      input.fees
        .map((fee) => fee.effectiveDate)
        .filter((effectiveDate) => effectiveDate !== input.effectiveDate),
    ),
  ].sort();

  const journalDates = [input.effectiveDate, ...additionalFeeDates];

  const journalByDate = new Map<
    string,
    {
      id: string;
      sequenceNo: number;
      nextLineNo: number;
    }
  >();

  for (const [index, effectiveDate] of journalDates.entries()) {
    const journalId = randomUUID();

    const sequenceNo = index + 1;

    await createTransferJournal(transaction, {
      id: journalId,
      workspaceId: input.workspaceId,
      actionId,
      actionRevisionId,
      sequenceNo,
      effectiveDate,
      currency: workspace.currency,
    });

    journalByDate.set(effectiveDate, {
      id: journalId,
      sequenceNo,
      nextLineNo: effectiveDate === input.effectiveDate ? 3 : 1,
    });
  }

  const principalJournal = journalByDate.get(input.effectiveDate);

  if (!principalJournal) {
    throw new Error("The principal transfer journal could not be resolved.");
  }

  await createTransferPrincipalPosting(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    journalId: principalJournal.id,
    ledgerAccountId: sourceAccount.ledgerAccountId,
    currency: workspace.currency,
    lineNo: 1,
    amountMinor: -input.destinationPrincipalMinor,
  });

  await createTransferPrincipalPosting(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    journalId: principalJournal.id,
    ledgerAccountId: destinationAccount.ledgerAccountId,
    currency: workspace.currency,
    lineNo: 2,
    amountMinor: input.destinationPrincipalMinor,
  });

  for (const fee of input.fees) {
    if (expenseLedgerAccountId === null) {
      throw new Error("The transfer fee expense ledger could not be resolved.");
    }

    const bearingAccount = resolvedAccounts.get(fee.bearingAccountId);

    if (!bearingAccount) {
      throw new Error(
        "The transfer fee bearing account could not be resolved.",
      );
    }

    const journal = journalByDate.get(fee.effectiveDate);

    if (!journal) {
      throw new Error("The transfer fee journal could not be resolved.");
    }

    const cashLineNo = journal.nextLineNo;

    const expenseLineNo = cashLineNo + 1;

    journal.nextLineNo += 2;

    await createTransferFeeCashPosting(transaction, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actionId,
      actionRevisionId,
      journalId: journal.id,
      bearingLedgerAccountId: bearingAccount.ledgerAccountId,
      currency: workspace.currency,
      lineNo: cashLineNo,
      amountMinor: fee.amountMinor,
      memo: fee.label,
    });

    const expensePostingId = randomUUID();

    await createTransferFeeExpensePosting(transaction, {
      id: expensePostingId,
      workspaceId: input.workspaceId,
      actionId,
      actionRevisionId,
      journalId: journal.id,
      expenseLedgerAccountId,
      currency: workspace.currency,
      lineNo: expenseLineNo,
      amountMinor: fee.amountMinor,
      categoryId: fee.categoryId,
      memo: fee.label,
    });

    await createTransferFeeComponent(transaction, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actionId,
      actionRevisionId,
      label: fee.label,
      amountMinor: fee.amountMinor,
      effectiveDate: fee.effectiveDate,
      bearingLedgerAccountId: bearingAccount.ledgerAccountId,
      expensePostingId,
      treatment: fee.treatment,
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
      actionKind: "transfer",
      sourceAccountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId,
      effectiveDate: input.effectiveDate,
      currency: workspace.currency,
      sourcePrincipalMinor: input.sourcePrincipalMinor.toString(),
      destinationPrincipalMinor: input.destinationPrincipalMinor.toString(),
      withheldFeeMinor: input.withheldFeeMinor.toString(),
      fees: input.fees.map((fee) => ({
        label: fee.label,
        amountMinor: fee.amountMinor.toString(),
        effectiveDate: fee.effectiveDate,
        bearingAccountId: fee.bearingAccountId,
        treatment: fee.treatment,
        categoryId: fee.categoryId,
      })),
      description: input.description,
      reference: input.reference,
    },
    effectiveDate: input.effectiveDate,
    recordedByUserId: input.userId,
    requestId: input.requestId,
  });

  for (const journal of [...journalByDate.values()].sort(
    (left, right) => left.sequenceNo - right.sequenceNo,
  )) {
    await finalizeJournal(transaction, {
      workspaceId: input.workspaceId,
      journalId: journal.id,
    });
  }

  await finalizeActionRevision(transaction, {
    workspaceId: input.workspaceId,
    actionRevisionId,
  });

  const financialRevision = await advanceWorkspaceFinancialRevision(
    transaction,
    input.workspaceId,
  );

  const result: RecordTransferResult = {
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

export async function recordTransferInTransaction(
  transaction: ScopedTransaction,
  input: RecordTransferInput,
  correction?: FinancialCorrectionContext,
): Promise<RecordTransferResult> {
  return executeRecordTransfer(
    transaction,
    normalizeRecordTransferInput(input),
    correction,
  );
}

export async function recordTransfer(
  input: RecordTransferInput,
): Promise<RecordTransferResult> {
  const normalizedInput = normalizeRecordTransferInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeRecordTransfer(transaction, normalizedInput),
  );
}
