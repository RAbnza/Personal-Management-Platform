import type { FinancialCorrectionContext } from "./financial-correction-repository";
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type {
  BorrowingPlan,
  ValidatedRecordBorrowing,
} from "@/modules/finance/domain/borrowing";
import { FinancialAccountReferenceUnavailableError } from "@/modules/finance/domain/financial-reference";
import type { ScopedTransaction } from "@/platform/db";
import {
  actionRevision,
  debt,
  debtActionLink,
  debtObligation,
  debtScheduleVersion,
  feeComponent,
  financialAction,
  journal,
  ledgerAccount,
  posting,
  receiptDetail,
  scheduledInstallment,
} from "@/platform/db/schema/finance";

type BorrowingFinancialAccountRow = {
  ledger_account_id: string;
  currency: string;
  opening_cutoff_date: string;
  archived: boolean;
};

export type BorrowingReceivingAccount = {
  ledgerAccountId: string;
  currency: string;
  openingCutoffDate: string;
  archived: boolean;
};

export type InsertBorrowingResult = {
  debtId: string;
  liabilityLedgerId: string;

  actionId: string;
  actionRevisionId: string;
  journalId: string;

  scheduleVersionId: string;
};

export async function resolveBorrowingReceivingAccount(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    accountId: string;
  },
): Promise<BorrowingReceivingAccount> {
  const result = await transaction.db.execute<BorrowingFinancialAccountRow>(sql`
      SELECT
        "ledger_account_id",
        "currency",
        "opening_cutoff_date"::text
          AS "opening_cutoff_date",
        ("archived_at" IS NOT NULL)
          AS "archived"
      FROM "finance"."financial_account"
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "id" = ${input.accountId}::uuid
    `);

  const account = result.rows[0];

  if (!account) {
    throw new FinancialAccountReferenceUnavailableError("receiving");
  }

  return {
    ledgerAccountId: account.ledger_account_id,
    currency: account.currency,
    openingCutoffDate: account.opening_cutoff_date,
    archived: account.archived,
  };
}

export async function insertBorrowing(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    userId: string;
    requestId: string | null;

    currency: string;
    receiptId: string;

    body: ValidatedRecordBorrowing;
    correction?: FinancialCorrectionContext | undefined;
    plan: BorrowingPlan;

    receivingLedgerAccountId: string;

    expenseLedgerAccountId: string | null;
  },
): Promise<InsertBorrowingResult> {
  const debtId = input.correction?.debtId ?? randomUUID();

  const liabilityLedgerId = input.correction?.liabilityLedgerId ?? randomUUID();

  const actionId = input.correction?.actionId ?? randomUUID();
  const actionRevisionId = input.correction?.actionRevisionId ?? randomUUID();
  const journalId = randomUUID();

  const scheduleVersionId = input.correction?.scheduleVersionId ?? randomUUID();

  const scope = {
    workspaceId: input.workspaceId,
  };

  const attribution = {
    recordedByUserId: input.userId,
    actorKind: "user" as const,
    requestId: input.requestId,
  };

  /*
   * -----------------------------------------------------------------------
   * Debt accounting identity
   * -----------------------------------------------------------------------
   */

  if (!input.correction) {
    await transaction.db.insert(ledgerAccount).values({
      ...scope,

      id: liabilityLedgerId,

      code: `debt:${debtId}`,

      name: input.body.name,

      kind: "debt_liability",

      currency: input.currency,
    });

    await transaction.db.insert(debt).values({
      ...scope,
      ...attribution,

      id: debtId,

      name: input.body.name,

      lenderName: input.body.lenderName,

      productName: input.body.productName,

      debtType: input.body.debtType,

      currency: input.currency,

      liabilityLedgerAccountId: liabilityLedgerId,

      /*
       * D8 may create a payment-clearing ledger if unresolved payment
       * classification actually requires one. D7 does not create speculative
       * clearing state.
       */
      clearingLedgerAccountId: null,

      originalPrincipalMinor: input.plan.principalMinor,

      startDate: input.body.borrowingDate,

      /*
       * A new borrowing is actual tracked-period activity. It is not an imported
       * baseline.
       */
      openingCutoffDate: null,

      breakdownStatus: "known",

      currentScheduleVersionId: scheduleVersionId,

      notes: input.body.notes,
    });

    /*
     * -----------------------------------------------------------------------
     * Financial action
     * -----------------------------------------------------------------------
     */

    await transaction.db.insert(financialAction).values({
      ...scope,

      id: actionId,

      originalCommandReceiptId: input.receiptId,

      currentRevisionId: actionRevisionId,

      description: input.body.description,

      reference: input.body.reference,

      notes: input.body.notes,

      ...attribution,
    });

    await transaction.db.insert(actionRevision).values({
      ...scope,

      id: actionRevisionId,

      actionId,

      revisionNo: 1,

      commandReceiptId: input.receiptId,

      changeKind: "create",

      actionKind: "borrowing",

      primaryEffectiveDate: input.body.borrowingDate,

      currency: input.currency,

      ...attribution,
    });
  }
  await transaction.db.insert(debtActionLink).values({
    ...scope,

    actionId,

    actionRevisionId,

    debtId,

    purpose: "borrowing",
  });

  await transaction.db.insert(receiptDetail).values({
    ...scope,

    actionId,

    actionRevisionId,

    receivingAccountId: input.body.receivingAccountId,

    actualReceivedMinor: input.plan.actualReceivedMinor,

    senderName: input.body.lenderName,

    sourceLabel: input.body.productName ?? input.body.name,
  });

  /*
   * -----------------------------------------------------------------------
   * One economic journal
   * -----------------------------------------------------------------------
   *
   * D7 borrowing fees occur on the borrowing date.
   */

  await transaction.db.insert(journal).values({
    ...scope,

    id: journalId,

    actionId,

    actionRevisionId,

    sequenceNo: 1,

    effectiveDate: input.body.borrowingDate,

    currency: input.currency,

    role: "economic",
  });

  let lineNo = 1;

  /*
   * Actual cash received.
   */
  await transaction.db.insert(posting).values({
    ...scope,

    id: randomUUID(),

    actionId,

    actionRevisionId,

    journalId,

    ledgerAccountId: input.receivingLedgerAccountId,

    currency: input.currency,

    lineNo,

    amountMinor: input.plan.actualReceivedMinor,

    cashFlowKind: "borrowing",

    cashFlowDirection: "in",

    memo: "Loan proceeds received",
  });

  lineNo += 1;

  /*
   * Contractual principal.
   */
  await transaction.db.insert(posting).values({
    ...scope,

    id: randomUUID(),

    actionId,

    actionRevisionId,

    journalId,

    ledgerAccountId: liabilityLedgerId,

    currency: input.currency,

    lineNo,

    amountMinor: -input.plan.principalMinor,

    liabilityComponent: "principal",

    memo: "Borrowing principal",
  });

  lineNo += 1;

  /*
   * Every fee creates one expense posting.
   *
   * A capitalized fee additionally creates liability.
   *
   * A withheld fee does NOT create a separate cash outflow: it is already
   * represented by actual proceeds being lower than principal.
   */
  for (const fee of input.plan.fees) {
    if (input.expenseLedgerAccountId === null) {
      throw new Error(
        "Borrowing fee expense ledger is required when borrowing fees exist.",
      );
    }

    const expensePostingId = randomUUID();

    await transaction.db.insert(posting).values({
      ...scope,

      id: expensePostingId,

      actionId,

      actionRevisionId,

      journalId,

      ledgerAccountId: input.expenseLedgerAccountId,

      currency: input.currency,

      lineNo,

      amountMinor: fee.amountMinor,

      categoryId: fee.categoryId,

      expenseClass: "gross",

      memo: fee.label,
    });

    lineNo += 1;

    if (fee.treatment === "capitalized") {
      await transaction.db.insert(posting).values({
        ...scope,

        id: randomUUID(),

        actionId,

        actionRevisionId,

        journalId,

        ledgerAccountId: liabilityLedgerId,

        currency: input.currency,

        lineNo,

        amountMinor: -fee.amountMinor,

        liabilityComponent: "fee",

        memo: fee.label,
      });

      lineNo += 1;
    }

    await transaction.db.insert(feeComponent).values({
      ...scope,

      id: randomUUID(),

      actionId,

      actionRevisionId,

      label: fee.label,

      amountMinor: fee.amountMinor,

      effectiveDate: input.body.borrowingDate,

      /*
       * The provider debt finances both D7 supported fee treatments.
       *
       * Withheld:
       *   principal liability exists, but part of that principal paid the fee
       *   before the remaining proceeds reached cash.
       *
       * Capitalized:
       *   the fee itself adds debt liability.
       */
      bearingLedgerAccountId: liabilityLedgerId,

      expensePostingId,

      treatment: fee.treatment,
    });
  }

  /*
   * -----------------------------------------------------------------------
   * Initial manual schedule
   * -----------------------------------------------------------------------
   *
   * Even when the provider did not supply due dates, an empty finalized
   * version 1 is retained. D6b's reviewed optional-schedule migration permits
   * this and gives later D8 payments a stable schedule context.
   */

  if (!input.correction) {
    await transaction.db.insert(debtScheduleVersion).values({
      ...scope,
      ...attribution,

      id: scheduleVersionId,

      debtId,

      versionNo: 1,

      previousVersionId: null,

      effectiveDate: input.body.borrowingDate,

      revisionKind: "initial",

      reason: input.body.scheduleReason,

      frequency: "manual",
    });

    for (const [index, installment] of input.body.installments.entries()) {
      const obligationId = randomUUID();

      await transaction.db.insert(debtObligation).values({
        ...scope,
        ...attribution,

        id: obligationId,

        debtId,

        externalLabel: `Installment ${index + 1}`,
      });

      await transaction.db.insert(scheduledInstallment).values({
        ...scope,

        id: randomUUID(),

        debtId,

        scheduleVersionId,

        obligationId,

        sequenceNo: index + 1,

        dueDate: installment.dueDate,

        contractualMinor: BigInt(installment.contractualMinor),

        knownPrincipalMinor:
          installment.knownPrincipalMinor === null
            ? null
            : BigInt(installment.knownPrincipalMinor),

        knownInterestMinor:
          installment.knownInterestMinor === null
            ? null
            : BigInt(installment.knownInterestMinor),

        knownFeeMinor:
          installment.knownFeeMinor === null
            ? null
            : BigInt(installment.knownFeeMinor),

        breakdownComplete: installment.breakdownComplete,

        /*
         * New borrowing cannot import already-paid historical amounts.
         */
        openingSatisfiedMinor: 0n,

        notes: installment.notes,
      });
    }

    const finalizedSchedule = await transaction.db.execute<{ id: string }>(sql`
      UPDATE "finance"."debt_schedule_version"
      SET
        "state" = 'finalized',
        "finalized_at" = clock_timestamp()
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "id" = ${scheduleVersionId}::uuid
        AND "state" = 'building'
      RETURNING "id"
    `);

    if (!finalizedSchedule.rows[0]) {
      throw new Error("The initial borrowing schedule could not be finalized.");
    }
  }
  return {
    debtId,
    liabilityLedgerId,

    actionId,
    actionRevisionId,
    journalId,

    scheduleVersionId,
  };
}
