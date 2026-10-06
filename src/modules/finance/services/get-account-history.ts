import { z } from "zod";

import {
  readAccountHistoryPage,
  type AccountHistoryCursorPosition,
} from "@/modules/finance/repositories/account-history-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";
import { parseMinorUnits } from "@/shared/money";

const accountHistoryCursorSchema = z
  .object({
    version: z.literal(1),

    effectiveDate: z.string().refine(isCalendarDate),

    journalId: z.uuid(),
  })
  .strict();

const getAccountHistoryInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    accountId: z.uuid(),

    pageSize: z.number().int().min(1).max(100).default(50),

    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();

export type GetAccountHistoryInput = z.input<
  typeof getAccountHistoryInputSchema
>;

export type AccountHistoryEntry = {
  journalId: string;
  actionId: string;
  actionRevisionId: string;

  effectiveDate: CalendarDate;
  recordedAt: string;

  journalRole: string;
  changeKind: string;
  actionKind: string;

  description: string;
  reference: string | null;

  signedAmountMinor: string;
  balanceAfterMinor: string;
};

export type AccountHistoryResult = {
  account: {
    accountId: string;
    name: string;
    accountType: string;
    institutionName: string | null;
    currency: string;
    openingCutoffDate: CalendarDate;
    archived: boolean;
    currentBalanceMinor: string;
  };

  financialRevision: string;

  entries: AccountHistoryEntry[];

  nextCursor: string | null;
};

export class FinancialAccountNotFoundError extends Error {
  readonly code = "FINANCIAL_ACCOUNT_NOT_FOUND";

  constructor() {
    super("The financial account does not exist in the active workspace.");

    this.name = "FinancialAccountNotFoundError";
  }
}

export class InvalidAccountHistoryCursorError extends Error {
  readonly code = "INVALID_ACCOUNT_HISTORY_CURSOR";

  constructor() {
    super("The account history cursor is invalid.");

    this.name = "InvalidAccountHistoryCursorError";
  }
}

type NormalizedGetAccountHistoryInput = {
  userId: string;
  workspaceId: string;
  accountId: string;
  pageSize: number;
  cursor: AccountHistoryCursorPosition | null;
};

function encodeAccountHistoryCursor(
  position: AccountHistoryCursorPosition,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      effectiveDate: position.effectiveDate,
      journalId: position.journalId,
    }),
    "utf8",
  ).toString("base64url");
}

function decodeAccountHistoryCursor(
  cursor: string,
): AccountHistoryCursorPosition {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );

    const parsed = accountHistoryCursorSchema.parse(decoded);

    return {
      effectiveDate: parseCalendarDate(parsed.effectiveDate),
      journalId: parsed.journalId,
    };
  } catch {
    throw new InvalidAccountHistoryCursorError();
  }
}

function normalizeGetAccountHistoryInput(
  input: GetAccountHistoryInput,
): NormalizedGetAccountHistoryInput {
  const parsed = getAccountHistoryInputSchema.parse(input);

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,
    accountId: parsed.accountId,
    pageSize: parsed.pageSize,

    cursor:
      parsed.cursor === undefined
        ? null
        : decodeAccountHistoryCursor(parsed.cursor),
  };
}

async function executeGetAccountHistory(
  transaction: ScopedTransaction,
  input: NormalizedGetAccountHistoryInput,
): Promise<AccountHistoryResult> {
  const rows = await readAccountHistoryPage(transaction, {
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    limit: input.pageSize + 1,
    cursor: input.cursor,
  });

  const firstRow = rows[0];

  if (!firstRow) {
    throw new FinancialAccountNotFoundError();
  }

  /*
   * These conversions deliberately pass database aggregate strings through
   * the exact bigint parser instead of Number. Aggregate balances are allowed
   * to exceed the per-posting component limit.
   */
  const currentBalanceMinor = parseMinorUnits(
    firstRow.current_balance_minor,
  ).toString();

  const entryRows = rows.filter((row) => row.journal_id !== null);

  const hasMore = entryRows.length > input.pageSize;

  const visibleRows = entryRows.slice(0, input.pageSize);

  const entries = visibleRows.map((row): AccountHistoryEntry => {
    if (
      row.journal_id === null ||
      row.action_id === null ||
      row.action_revision_id === null ||
      row.entry_effective_date === null ||
      row.recorded_at === null ||
      row.journal_role === null ||
      row.change_kind === null ||
      row.action_kind === null ||
      row.description === null ||
      row.signed_amount_minor === null ||
      row.balance_after_minor === null
    ) {
      throw new Error(
        "Account history query returned an incomplete ledger entry.",
      );
    }

    return {
      journalId: row.journal_id,
      actionId: row.action_id,
      actionRevisionId: row.action_revision_id,

      effectiveDate: parseCalendarDate(row.entry_effective_date),

      recordedAt: row.recorded_at,

      journalRole: row.journal_role,
      changeKind: row.change_kind,
      actionKind: row.action_kind,

      description: row.description,
      reference: row.reference,

      signedAmountMinor: parseMinorUnits(row.signed_amount_minor).toString(),

      balanceAfterMinor: parseMinorUnits(row.balance_after_minor).toString(),
    };
  });

  const lastVisibleEntry = entries.at(-1);

  const nextCursor =
    hasMore && lastVisibleEntry !== undefined
      ? encodeAccountHistoryCursor({
          effectiveDate: lastVisibleEntry.effectiveDate,
          journalId: lastVisibleEntry.journalId,
        })
      : null;

  return {
    account: {
      accountId: firstRow.account_id,
      name: firstRow.account_name,
      accountType: firstRow.account_type,
      institutionName: firstRow.institution_name,
      currency: firstRow.currency,
      openingCutoffDate: parseCalendarDate(firstRow.opening_cutoff_date),
      archived: firstRow.archived,
      currentBalanceMinor,
    },

    financialRevision: firstRow.financial_revision,

    entries,

    nextCursor,
  };
}

export async function getAccountHistoryInTransaction(
  transaction: ScopedTransaction,
  input: GetAccountHistoryInput,
): Promise<AccountHistoryResult> {
  return executeGetAccountHistory(
    transaction,
    normalizeGetAccountHistoryInput(input),
  );
}

export async function getAccountHistory(
  input: GetAccountHistoryInput,
): Promise<AccountHistoryResult> {
  const normalizedInput = normalizeGetAccountHistoryInput(input);

  /*
   * The repository assembles account metadata, current balance, running
   * balances and the requested page in one PostgreSQL statement. READ
   * COMMITTED is therefore sufficient here: that statement observes one
   * PostgreSQL snapshot rather than combining multiple independently changing
   * reads.
   */
  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeGetAccountHistory(transaction, normalizedInput),
  );
}
