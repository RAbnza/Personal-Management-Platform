import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type OpeningLedgerKind = "cash_asset" | "opening_equity";

export async function createLedgerAccount(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    code: string;
    name: string;
    kind: OpeningLedgerKind;
    currency: string;
  },
): Promise<void> {
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
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.code},
      ${input.name},
      ${input.kind},
      ${input.currency}
    )
  `);
}

export async function createFinancialAction(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    commandReceiptId: string;
    currentRevisionId: string;
    description: string;
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
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function createOpeningActionRevision(
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
      'opening_cash',
      ${input.effectiveDate}::date,
      ${input.currency},
      ${input.recordedByUserId}::uuid,
      'user',
      ${input.requestId}::uuid
    )
  `);
}

export async function createOpeningJournal(
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

export async function createOpeningPosting(
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
    cashFlowKind: "none" | "opening";
    cashFlowDirection: "none" | "baseline";
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
      ${input.cashFlowKind},
      ${input.cashFlowDirection}
    )
  `);
}

export async function createFinancialAccount(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    ledgerAccountId: string;
    name: string;
    accountType: "cash" | "e_wallet" | "checking" | "savings";
    institutionName: string | null;
    currency: string;
    openingCutoffDate: string;
    openingActionId: string | null;
    notes: string | null;
  },
): Promise<void> {
  await transaction.db.execute(sql`
    INSERT INTO "finance"."financial_account" (
      "id",
      "workspace_id",
      "ledger_account_id",
      "name",
      "account_type",
      "institution_name",
      "currency",
      "opening_cutoff_date",
      "opening_action_id",
      "notes"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.ledgerAccountId}::uuid,
      ${input.name},
      ${input.accountType},
      ${input.institutionName},
      ${input.currency},
      ${input.openingCutoffDate}::date,
      ${input.openingActionId}::uuid,
      ${input.notes}
    )
  `);
}
