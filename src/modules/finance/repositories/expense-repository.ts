import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

type FundingFinancialAccountRow = {
  ledger_account_id: string;
  currency: string;
  opening_cutoff_date: string;
  archived: boolean;
};

type SharedExpenseLedgerRow = {
  id: string;
  kind: string;
  currency: string;
  archived: boolean;
};

export async function resolveFundingFinancialAccount(
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
  const result = await transaction.db.execute<FundingFinancialAccountRow>(sql`
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
    throw new Error(
      "The funding financial account does not exist in the active workspace.",
    );
  }

  return {
    ledgerAccountId: account.ledger_account_id,
    currency: account.currency,
    openingCutoffDate: account.opening_cutoff_date,
    archived: account.archived,
  };
}

export async function ensureActiveExpenseCategory(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    categoryId: string;
  },
): Promise<void> {
  const result = await transaction.db.execute<{ id: string }>(sql`
      SELECT "id"
      FROM "core"."category"
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "id" = ${input.categoryId}::uuid
        AND "kind" = 'expense'
        AND "archived_at" IS NULL
    `);

  if (!result.rows[0]) {
    throw new Error(
      "The selected expense category does not exist or is archived.",
    );
  }
}

export async function getOrCreateSharedExpenseLedger(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    currency: string;
  },
): Promise<string> {
  const candidateId = randomUUID();

  await transaction.db.execute(sql`
    INSERT INTO "finance"."ledger_account" (
      "id",
      "workspace_id",
      "code",
      "name",
      "kind",
      "currency"
    )
    VALUES (
      ${candidateId}::uuid,
      ${input.workspaceId}::uuid,
      'expense:shared',
      'Expense',
      'expense',
      ${input.currency}
    )
    ON CONFLICT (
      "workspace_id",
      "code"
    )
    DO NOTHING
  `);

  const result = await transaction.db.execute<SharedExpenseLedgerRow>(sql`
      SELECT
        "id",
        "kind",
        "currency",
        ("archived_at" IS NOT NULL)
          AS "archived"
      FROM "finance"."ledger_account"
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "code" = 'expense:shared'
    `);

  const ledger = result.rows[0];

  if (!ledger) {
    throw new Error("The shared expense ledger could not be resolved.");
  }

  if (ledger.kind !== "expense" || ledger.currency !== input.currency) {
    throw new Error(
      "The shared expense ledger has an invalid accounting identity.",
    );
  }

  if (ledger.archived) {
    throw new Error("The shared expense ledger is archived.");
  }

  return ledger.id;
}

export async function createExpenseFinancialAction(
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

export async function createExpenseActionRevision(
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
      'expense',
      ${input.effectiveDate}::date,
      ${input.currency},
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function createPurchaseDetail(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    fundingLedgerAccountId: string;
    purchaseMinor: bigint;
    merchantName: string | null;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."purchase_detail" (
      "workspace_id",
      "action_id",
      "action_revision_id",
      "funding_ledger_account_id",
      "purchase_minor",
      "merchant_name"
    )
    VALUES (
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.fundingLedgerAccountId}::uuid,
      ${input.purchaseMinor},
      ${input.merchantName}
    )
  `);
}

export async function createExpenseJournal(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
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
      1,
      ${input.effectiveDate}::date,
      ${input.currency},
      'economic'
    )
  `);
}

export async function createExpenseCashPosting(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    journalId: string;
    fundingLedgerAccountId: string;
    currency: string;
    purchaseMinor: bigint;
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
      ${input.fundingLedgerAccountId}::uuid,
      ${input.currency},
      1,
      ${-input.purchaseMinor},
      'purchase',
      'out'
    )
  `);
}

export async function createGrossExpensePosting(
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
    memo: string | null;
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
