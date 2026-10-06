import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

type ReceivingFinancialAccountRow = {
  ledger_account_id: string;
  currency: string;
  opening_cutoff_date: string;
  archived: boolean;
};

type SharedIncomeLedgerRow = {
  id: string;
  kind: string;
  currency: string;
  archived: boolean;
};

export type IncomeClass = "earned" | "gift" | "reward" | "other";

export async function resolveReceivingFinancialAccount(
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
  const result = await transaction.db.execute<ReceivingFinancialAccountRow>(sql`
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
      "The receiving financial account does not exist in the active workspace.",
    );
  }

  return {
    ledgerAccountId: account.ledger_account_id,
    currency: account.currency,
    openingCutoffDate: account.opening_cutoff_date,
    archived: account.archived,
  };
}

export async function ensureActiveIncomeCategory(
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
        AND "kind" = 'income'
        AND "archived_at" IS NULL
    `);

  if (!result.rows[0]) {
    throw new Error(
      "The selected income category does not exist or is archived.",
    );
  }
}

export async function getOrCreateSharedIncomeLedger(
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
      'income:shared',
      'Income',
      'income',
      ${input.currency}
    )
    ON CONFLICT (
      "workspace_id",
      "code"
    )
    DO NOTHING
  `);

  const result = await transaction.db.execute<SharedIncomeLedgerRow>(sql`
      SELECT
        "id",
        "kind",
        "currency",
        ("archived_at" IS NOT NULL)
          AS "archived"
      FROM "finance"."ledger_account"
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "code" = 'income:shared'
    `);

  const ledger = result.rows[0];

  if (!ledger) {
    throw new Error("The shared income ledger could not be resolved.");
  }

  if (ledger.kind !== "income" || ledger.currency !== input.currency) {
    throw new Error(
      "The shared income ledger has an invalid accounting identity.",
    );
  }

  if (ledger.archived) {
    throw new Error("The shared income ledger is archived.");
  }

  return ledger.id;
}

export async function createIncomeFinancialAction(
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

export async function createIncomeActionRevision(
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
      'income',
      ${input.effectiveDate}::date,
      ${input.currency},
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function createIncomeReceiptDetail(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    receivingAccountId: string;
    actualReceivedMinor: bigint;
    senderName: string | null;
    sourceLabel: string | null;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."receipt_detail" (
      "workspace_id",
      "action_id",
      "action_revision_id",
      "receiving_account_id",
      "actual_received_minor",
      "sender_name",
      "source_label"
    )
    VALUES (
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.receivingAccountId}::uuid,
      ${input.actualReceivedMinor},
      ${input.senderName},
      ${input.sourceLabel}
    )
  `);
}

export async function createIncomeJournal(
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

export async function createIncomeCashPosting(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    journalId: string;
    receivingLedgerAccountId: string;
    currency: string;
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
      ${input.receivingLedgerAccountId}::uuid,
      ${input.currency},
      1,
      ${input.amountMinor},
      'income',
      'in'
    )
  `);
}

export async function createIncomeCreditPosting(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    actionId: string;
    actionRevisionId: string;
    journalId: string;
    incomeLedgerAccountId: string;
    currency: string;
    amountMinor: bigint;
    incomeClass: IncomeClass;
    categoryId: string | null;
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
      "income_class"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.actionId}::uuid,
      ${input.actionRevisionId}::uuid,
      ${input.journalId}::uuid,
      ${input.incomeLedgerAccountId}::uuid,
      ${input.currency},
      2,
      ${-input.amountMinor},
      ${input.categoryId}::uuid,
      ${input.incomeClass}
    )
  `);
}
