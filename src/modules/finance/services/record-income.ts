import { randomUUID } from "node:crypto";

import { z } from "zod";

import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "@/modules/finance/repositories/financial-account-repository";
import {
  createIncomeActionRevision,
  createIncomeCashPosting,
  createIncomeCreditPosting,
  createIncomeFinancialAction,
  createIncomeJournal,
  createIncomeReceiptDetail,
  ensureActiveIncomeCategory,
  getOrCreateSharedIncomeLedger,
  type IncomeClass,
  resolveReceivingFinancialAccount,
} from "@/modules/finance/repositories/income-repository";
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

const RECORD_INCOME_COMMAND_TYPE = "finance.record_income";

const incomeClassSchema = z.enum(["earned", "gift", "reward", "other"]);

const recordIncomeInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),

    receivingAccountId: z.uuid(),

    effectiveDate: z.string().refine(isCalendarDate, {
      message:
        "Income effective date must be a valid YYYY-MM-DD calendar date.",
    }),

    amountMinor: z.string().regex(/^[1-9]\d*$/, {
      message: "Income amount must be a positive minor-unit integer string.",
    }),

    incomeClass: incomeClassSchema,

    categoryId: z.uuid().nullable().optional(),

    senderName: z.string().trim().min(1).nullable().optional(),

    sourceLabel: z.string().trim().min(1).nullable().optional(),

    description: z.string().trim().min(1).max(2000),

    reference: z.string().trim().min(1).nullable().optional(),

    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict();

const recordIncomeResultSchema = z.object({
  actionId: z.uuid(),
  actionRevisionId: z.uuid(),
  financialRevision: z.string().regex(/^\d+$/),
});

export type RecordIncomeInput = z.input<typeof recordIncomeInputSchema>;

export type RecordIncomeResult = z.infer<typeof recordIncomeResultSchema>;

type NormalizedRecordIncomeInput = {
  userId: string;
  workspaceId: string;
  clientCommandId: string;
  requestId: string | null;

  receivingAccountId: string;
  effectiveDate: CalendarDate;
  amountMinor: bigint;
  incomeClass: IncomeClass;

  categoryId: string | null;
  senderName: string | null;
  sourceLabel: string | null;

  description: string;
  reference: string | null;
  notes: string | null;
};

function normalizeRecordIncomeInput(
  input: RecordIncomeInput,
): NormalizedRecordIncomeInput {
  const parsed = recordIncomeInputSchema.parse(input);

  const effectiveDate = parseCalendarDate(parsed.effectiveDate);

  const amountMinor = assertPositiveFinancialAmountMinor(
    parseMinorUnits(parsed.amountMinor),
  );

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,
    clientCommandId: parsed.clientCommandId,
    requestId: parsed.requestId ?? null,

    receivingAccountId: parsed.receivingAccountId,
    effectiveDate,
    amountMinor,
    incomeClass: parsed.incomeClass,

    categoryId: parsed.categoryId ?? null,
    senderName: parsed.senderName ?? null,
    sourceLabel: parsed.sourceLabel ?? null,

    description: parsed.description,
    reference: parsed.reference ?? null,
    notes: parsed.notes ?? null,
  };
}

async function executeRecordIncome(
  transaction: ScopedTransaction,
  input: NormalizedRecordIncomeInput,
): Promise<RecordIncomeResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    input.workspaceId,
  );

  const payloadHash = hashFinancialCommandPayload({
    receivingAccountId: input.receivingAccountId,
    effectiveDate: input.effectiveDate,
    amountMinor: input.amountMinor.toString(),
    incomeClass: input.incomeClass,
    categoryId: input.categoryId,
    senderName: input.senderName,
    sourceLabel: input.sourceLabel,
    description: input.description,
    reference: input.reference,
    notes: input.notes,
  });

  const receipt = await claimFinancialCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    clientCommandId: input.clientCommandId,
    commandType: RECORD_INCOME_COMMAND_TYPE,
    payloadHash,
  });

  /*
   * Replay must return the original committed result before checking mutable
   * current state. The receiving account may have been archived after the
   * original income was recorded, but that must not invalidate an idempotent
   * replay of the completed command.
   */
  if (receipt.kind === "replay") {
    return recordIncomeResultSchema.parse(receipt.result);
  }

  const receivingAccount = await resolveReceivingFinancialAccount(transaction, {
    workspaceId: input.workspaceId,
    accountId: input.receivingAccountId,
  });

  if (receivingAccount.archived) {
    throw new RangeError(
      "New income requires an active receiving financial account.",
    );
  }

  if (receivingAccount.currency !== workspace.currency) {
    throw new Error(
      "The receiving account currency does not match the workspace currency.",
    );
  }

  const openingCutoffDate = parseCalendarDate(
    receivingAccount.openingCutoffDate,
  );

  if (compareCalendarDates(input.effectiveDate, openingCutoffDate) <= 0) {
    throw new RangeError(
      "Income effective date must be after the receiving account opening cutoff.",
    );
  }

  if (input.categoryId !== null) {
    await ensureActiveIncomeCategory(transaction, {
      workspaceId: input.workspaceId,
      categoryId: input.categoryId,
    });
  }

  const incomeLedgerAccountId = await getOrCreateSharedIncomeLedger(
    transaction,
    {
      workspaceId: input.workspaceId,
      currency: workspace.currency,
    },
  );

  const actionId = randomUUID();
  const actionRevisionId = randomUUID();
  const journalId = randomUUID();

  await createIncomeFinancialAction(transaction, {
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

  await createIncomeActionRevision(transaction, {
    id: actionRevisionId,
    workspaceId: input.workspaceId,
    actionId,
    commandReceiptId: receipt.receiptId,
    effectiveDate: input.effectiveDate,
    currency: workspace.currency,
    recordedByUserId: input.userId,
    requestId: input.requestId,
  });

  await createIncomeReceiptDetail(transaction, {
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    receivingAccountId: input.receivingAccountId,
    actualReceivedMinor: input.amountMinor,
    senderName: input.senderName,
    sourceLabel: input.sourceLabel,
  });

  await createIncomeJournal(transaction, {
    id: journalId,
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    effectiveDate: input.effectiveDate,
    currency: workspace.currency,
  });

  await createIncomeCashPosting(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    journalId,
    receivingLedgerAccountId: receivingAccount.ledgerAccountId,
    currency: workspace.currency,
    amountMinor: input.amountMinor,
  });

  await createIncomeCreditPosting(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    actionId,
    actionRevisionId,
    journalId,
    incomeLedgerAccountId,
    currency: workspace.currency,
    amountMinor: input.amountMinor,
    incomeClass: input.incomeClass,
    categoryId: input.categoryId,
  });

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
      actionKind: "income",
      receivingAccountId: input.receivingAccountId,
      effectiveDate: input.effectiveDate,
      currency: workspace.currency,
      amountMinor: input.amountMinor.toString(),
      incomeClass: input.incomeClass,
      categoryId: input.categoryId,
      senderName: input.senderName,
      sourceLabel: input.sourceLabel,
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

  const result: RecordIncomeResult = {
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

export async function recordIncomeInTransaction(
  transaction: ScopedTransaction,
  input: RecordIncomeInput,
): Promise<RecordIncomeResult> {
  return executeRecordIncome(transaction, normalizeRecordIncomeInput(input));
}

export async function recordIncome(
  input: RecordIncomeInput,
): Promise<RecordIncomeResult> {
  const normalizedInput = normalizeRecordIncomeInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeRecordIncome(transaction, normalizedInput),
  );
}
