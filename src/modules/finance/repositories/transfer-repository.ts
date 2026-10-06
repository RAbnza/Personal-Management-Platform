import { sql } from "drizzle-orm";

import { FinancialAccountReferenceUnavailableError } from "@/modules/finance/domain/financial-reference";
import type { ScopedTransaction } from "@/platform/db";

type TransferFinancialAccountRow = {
  ledger_account_id: string;
  currency: string;
  opening_cutoff_date: string;
  archived: boolean;
};

export type TransferFeeTreatment =
  "withheld" | "source_additional" | "separate";

export async function resolveTransferFinancialAccount(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    accountId: string;
  },
): Promise<{
  ledgerAccountId: string;
  currency: string;
  openingCutoffDate: string;
  archived: boolean;
}> {
  const result = await transaction.db.execute<TransferFinancialAccountRow>(sql`
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
    throw new FinancialAccountReferenceUnavailableError("transfer");
  }

  return {
    ledgerAccountId: account.ledger_account_id,
    currency: account.currency,
    openingCutoffDate: account.opening_cutoff_date,
    archived: account.archived,
  };
}

export async function createTransferFinancialAction(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    commandReceiptId: string;
    currentRevisionId: string;
    description: string;
    reference: string | null;
    notes: string | null;
    recordedByUserId: string;
    requestId: string | null;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."financial_action" (
      "id",
      "workspace_id",
      "original_command_receipt_id",
      "current_revision_id",
      "description",
      "reference",
      "notes",
      "recorded_by_user_id",
      "actor_kind",
      "request_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.commandReceiptId}::uuid,
      ${input.currentRevisionId}::uuid,
      ${input.description},
      ${input.reference},
      ${input.notes},
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function createTransferActionRevision(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    commandReceiptId: string;
    effectiveDate: string;
    currency: string;
    recordedByUserId: string;
    requestId: string | null;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."action_revision" (
      "id",
      "workspace_id",
      "action_id",
      "revision_no",
      "command_receipt_id",
      "change_kind",
      "action_kind",
      "primary_effective_date",
      "currency",
      "recorded_by_user_id",
      "actor_kind",
      "request_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      1,
      ${input.commandReceiptId}::uuid,
      'create',
      'transfer',
      ${input.effectiveDate}::date,
      ${input.currency},
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function createTransferDetail(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    sourcePrincipalMinor: bigint;
    destinationPrincipalMinor: bigint;
    withheldFeeMinor: bigint;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."transfer_detail" (
      "workspace_id",
      "action_id",
      "action_revision_id",
      "source_account_id",
      "destination_account_id",
      "source_principal_minor",
      "destination_principal_minor",
      "withheld_fee_minor"
    )
    VALUES (
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.sourceAccountId}::uuid,
      ${input.destinationAccountId}::uuid,
      ${input.sourcePrincipalMinor},
      ${input.destinationPrincipalMinor},
      ${input.withheldFeeMinor}
    )
  `);
}

export async function createTransferJournal(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    sequenceNo: number;
    effectiveDate: string;
    currency: string;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."journal" (
      "id",
      "workspace_id",
      "action_id",
      "action_revision_id",
      "sequence_no",
      "effective_date",
      "currency",
      "role"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.sequenceNo},
      ${input.effectiveDate}::date,
      ${input.currency},
      'economic'
    )
  `);
}

export async function createTransferPrincipalPosting(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    journalId: string;
    ledgerAccountId: string;
    currency: string;
    lineNo: number;
    amountMinor: bigint;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."posting" (
      "id",
      "workspace_id",
      "action_id",
      "action_revision_id",
      "journal_id",
      "ledger_account_id",
      "currency",
      "line_no",
      "amount_minor",
      "cash_flow_kind",
      "cash_flow_direction"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.journalId}::uuid,
      ${input.ledgerAccountId}::uuid,
      ${input.currency},
      ${input.lineNo},
      ${input.amountMinor},
      'transfer',
      'internal'
    )
  `);
}

export async function createTransferFeeCashPosting(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    journalId: string;
    bearingLedgerAccountId: string;
    currency: string;
    lineNo: number;
    amountMinor: bigint;
    memo: string;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."posting" (
      "id",
      "workspace_id",
      "action_id",
      "action_revision_id",
      "journal_id",
      "ledger_account_id",
      "currency",
      "line_no",
      "amount_minor",
      "cash_flow_kind",
      "cash_flow_direction",
      "memo"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.journalId}::uuid,
      ${input.bearingLedgerAccountId}::uuid,
      ${input.currency},
      ${input.lineNo},
      ${-input.amountMinor},
      'fee',
      'out',
      ${input.memo}
    )
  `);
}

export async function createTransferFeeExpensePosting(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    journalId: string;
    expenseLedgerAccountId: string;
    currency: string;
    lineNo: number;
    amountMinor: bigint;
    categoryId: string | null;
    memo: string;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."posting" (
      "id",
      "workspace_id",
      "action_id",
      "action_revision_id",
      "journal_id",
      "ledger_account_id",
      "currency",
      "line_no",
      "amount_minor",
      "category_id",
      "expense_class",
      "memo"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.journalId}::uuid,
      ${input.expenseLedgerAccountId}::uuid,
      ${input.currency},
      ${input.lineNo},
      ${input.amountMinor},
      ${input.categoryId}::uuid,
      'gross',
      ${input.memo}
    )
  `);
}

export async function createTransferFeeComponent(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    label: string;
    amountMinor: bigint;
    effectiveDate: string;
    bearingLedgerAccountId: string;
    expensePostingId: string;
    treatment: TransferFeeTreatment;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."fee_component" (
      "id",
      "workspace_id",
      "action_id",
      "action_revision_id",
      "label",
      "amount_minor",
      "effective_date",
      "bearing_ledger_account_id",
      "expense_posting_id",
      "treatment"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.label},
      ${input.amountMinor},
      ${input.effectiveDate}::date,
      ${input.bearingLedgerAccountId}::uuid,
      ${input.expensePostingId}::uuid,
      ${input.treatment}
    )
  `);
}
