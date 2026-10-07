import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  buildBorrowingPlan,
  recordBorrowingBodySchema,
  type RecordBorrowingBody,
  type ValidatedRecordBorrowing,
} from "@/modules/finance/domain/borrowing";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  insertBorrowing,
  resolveBorrowingReceivingAccount,
  type BorrowingReceivingAccount,
} from "@/modules/finance/repositories/borrowing-repository";
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
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  compareCalendarDates,
  parseCalendarDate,
} from "@/shared/calendar-date";

const RECORD_BORROWING_COMMAND_TYPE = "finance.record_borrowing";

const actorSchema = z
  .object({
    userId: z.uuid(),

    workspaceId: z.uuid(),

    requestId: z.uuid().optional(),
  })
  .strict();

const recordBorrowingResultSchema = z
  .object({
    debtId: z.uuid(),

    actionId: z.uuid(),

    actionRevisionId: z.uuid(),

    scheduleVersionId: z.uuid(),

    financialRevision: z.string().regex(/^\d+$/),
  })
  .strict();

export type RecordBorrowingInput = RecordBorrowingBody &
  z.input<typeof actorSchema>;

export type RecordBorrowingResult = z.infer<typeof recordBorrowingResultSchema>;

type NormalizedBorrowingInput = {
  actor: z.output<typeof actorSchema>;

  body: ValidatedRecordBorrowing;
};

function normalizeRecordBorrowingInput(
  input: RecordBorrowingInput,
): NormalizedBorrowingInput {
  const { userId, workspaceId, requestId, ...body } = input;

  return {
    actor: actorSchema.parse({
      userId,
      workspaceId,
      requestId,
    }),

    body: recordBorrowingBodySchema.parse(body),
  };
}

function assertReceivingAccountUsableForBorrowing(
  account: BorrowingReceivingAccount,
  input: {
    expectedCurrency: string;
    borrowingDate: string;
  },
): void {
  if (account.archived) {
    throw new RangeError(
      "New borrowing requires an active receiving financial account.",
    );
  }

  if (account.currency !== input.expectedCurrency) {
    throw new RangeError(
      "The receiving account currency must match the workspace currency.",
    );
  }

  if (
    compareCalendarDates(
      parseCalendarDate(input.borrowingDate),
      parseCalendarDate(account.openingCutoffDate),
    ) <= 0
  ) {
    throw new RangeError(
      "Borrowing activity must occur after the receiving account opening cutoff.",
    );
  }
}

async function executeRecordBorrowing(
  transaction: ScopedTransaction,
  actor: z.output<typeof actorSchema>,
  body: ValidatedRecordBorrowing,
): Promise<RecordBorrowingResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    actor.workspaceId,
  );

  const { clientCommandId, ...intent } = body;

  /*
   * The normalized, validated business intent is hashed.
   *
   * user/workspace/request attribution is intentionally excluded because
   * those values come from server-owned ActorContext rather than client
   * business intent.
   */
  const receipt = await claimFinancialCommandReceipt(transaction, {
    workspaceId: actor.workspaceId,

    clientCommandId,

    commandType: RECORD_BORROWING_COMMAND_TYPE,

    payloadHash: hashFinancialCommandPayload(intent),
  });

  /*
   * Return a previously committed result before consulting mutable references.
   *
   * The receiving account/category might have been archived after the
   * original borrowing. That must not make a safe retry fail or create another
   * loan.
   */
  if (receipt.kind === "replay") {
    return recordBorrowingResultSchema.parse(receipt.result);
  }

  const plan = buildBorrowingPlan(body);

  const receivingAccount = await resolveBorrowingReceivingAccount(transaction, {
    workspaceId: actor.workspaceId,

    accountId: body.receivingAccountId,
  });

  assertReceivingAccountUsableForBorrowing(receivingAccount, {
    expectedCurrency: workspace.currency,

    borrowingDate: body.borrowingDate,
  });

  /*
   * Resolve all user-supplied fee categories before creating any financial
   * evidence.
   */
  const categoryIds = [
    ...new Set(
      body.fees.flatMap((fee) =>
        fee.categoryId === null ? [] : [fee.categoryId],
      ),
    ),
  ];

  for (const categoryId of categoryIds) {
    await ensureActiveExpenseCategory(transaction, {
      workspaceId: actor.workspaceId,

      categoryId,
    });
  }

  const expenseLedgerAccountId =
    body.fees.length === 0
      ? null
      : await getOrCreateSharedExpenseLedger(transaction, {
          workspaceId: actor.workspaceId,

          currency: workspace.currency,
        });

  const ids = await insertBorrowing(transaction, {
    workspaceId: actor.workspaceId,

    userId: actor.userId,

    requestId: actor.requestId ?? null,

    currency: workspace.currency,

    receiptId: receipt.receiptId,

    body,

    plan,

    receivingLedgerAccountId: receivingAccount.ledgerAccountId,

    expenseLedgerAccountId,
  });

  /*
   * -----------------------------------------------------------------------
   * Audit evidence
   * -----------------------------------------------------------------------
   */

  await createPrivateFinancialRevision(transaction, {
    id: randomUUID(),

    workspaceId: actor.workspaceId,

    commandReceiptId: receipt.receiptId,

    subjectKind: "financial_action",

    subjectId: ids.actionId,

    subjectVersion: 1,

    operation: "create",

    afterJson: {
      actionRevisionId: ids.actionRevisionId,

      actionKind: "borrowing",

      debtId: ids.debtId,

      receivingAccountId: body.receivingAccountId,

      effectiveDate: body.borrowingDate,

      currency: workspace.currency,

      principalMinor: plan.principalMinor.toString(),

      actualReceivedMinor: plan.actualReceivedMinor.toString(),

      withheldFeeMinor: plan.withheldFeeMinor.toString(),

      capitalizedFeeMinor: plan.capitalizedFeeMinor.toString(),

      totalFeeExpenseMinor: plan.totalFeeExpenseMinor.toString(),

      recognizedLiabilityMinor: plan.recognizedLiabilityMinor.toString(),

      fees: plan.fees.map((fee) => ({
        label: fee.label,

        amountMinor: fee.amountMinor.toString(),

        treatment: fee.treatment,

        categoryId: fee.categoryId,
      })),

      description: body.description,

      reference: body.reference,
    },

    effectiveDate: body.borrowingDate,

    recordedByUserId: actor.userId,

    requestId: actor.requestId ?? null,
  });

  await createPrivateFinancialRevision(transaction, {
    id: randomUUID(),

    workspaceId: actor.workspaceId,

    commandReceiptId: receipt.receiptId,

    subjectKind: "debt",

    subjectId: ids.debtId,

    subjectVersion: 1,

    operation: "create",

    afterJson: {
      name: body.name,

      lenderName: body.lenderName,

      productName: body.productName,

      debtType: body.debtType,

      currency: workspace.currency,

      originalPrincipalMinor: plan.principalMinor.toString(),

      recognizedLiabilityMinor: plan.recognizedLiabilityMinor.toString(),

      startDate: body.borrowingDate,

      openingCutoffDate: null,

      breakdownStatus: "known",

      borrowingActionId: ids.actionId,

      scheduleVersionId: ids.scheduleVersionId,

      scheduleReason: body.scheduleReason,

      installmentCount: body.installments.length,

      notes: body.notes,
    },

    effectiveDate: body.borrowingDate,

    recordedByUserId: actor.userId,

    requestId: actor.requestId ?? null,
  });

  /*
   * Finalize the economic evidence only after every typed detail/posting and
   * audit row has been assembled.
   */
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

  const result: RecordBorrowingResult = {
    debtId: ids.debtId,

    actionId: ids.actionId,

    actionRevisionId: ids.actionRevisionId,

    scheduleVersionId: ids.scheduleVersionId,

    financialRevision,
  };

  await completeFinancialCommandReceipt(transaction, {
    workspaceId: actor.workspaceId,

    receiptId: receipt.receiptId,

    result,
  });

  /*
   * Force all deferred financial/debt recipe validation to happen inside this
   * service. No invalid borrowing should survive until transaction COMMIT
   * without being attributable to this command.
   */
  await enforceDeferredFinancialConstraints(transaction);

  return result;
}

export async function recordBorrowingInTransaction(
  transaction: ScopedTransaction,
  input: RecordBorrowingInput,
): Promise<RecordBorrowingResult> {
  const { actor, body } = normalizeRecordBorrowingInput(input);

  return executeRecordBorrowing(transaction, actor, body);
}

export async function recordBorrowing(
  input: RecordBorrowingInput,
): Promise<RecordBorrowingResult> {
  const { actor, body } = normalizeRecordBorrowingInput(input);

  return withDomainTransaction(
    {
      userId: actor.userId,

      workspaceId: actor.workspaceId,
    },

    (transaction) => executeRecordBorrowing(transaction, actor, body),
  );
}
