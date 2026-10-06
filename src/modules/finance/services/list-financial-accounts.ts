import { z } from "zod";

import { readFinancialAccountList } from "@/modules/finance/repositories/financial-account-read-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import { parseCalendarDate, type CalendarDate } from "@/shared/calendar-date";
import { parseMinorUnits } from "@/shared/money";

const financialAccountTypeSchema = z.enum([
  "cash",
  "e_wallet",
  "checking",
  "savings",
]);

const listFinancialAccountsInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    includeArchived: z.boolean().default(false),
  })
  .strict();

export type ListFinancialAccountsInput = z.input<
  typeof listFinancialAccountsInputSchema
>;

export type FinancialAccountListItem = {
  accountId: string;

  name: string;

  accountType: z.infer<typeof financialAccountTypeSchema>;

  institutionName: string | null;

  currency: string;

  openingCutoffDate: CalendarDate;

  notes: string | null;

  archived: boolean;

  currentBalanceMinor: string;

  version: number;
};

export type ListFinancialAccountsResult = {
  financialRevision: string;

  items: FinancialAccountListItem[];
};

export class FinancialAccountWorkspaceUnavailableError extends Error {
  readonly code = "FINANCIAL_ACCOUNT_WORKSPACE_UNAVAILABLE";

  constructor() {
    super("The active workspace could not be resolved for financial accounts.");

    this.name = "FinancialAccountWorkspaceUnavailableError";
  }
}

type NormalizedListFinancialAccountsInput = {
  userId: string;
  workspaceId: string;

  includeArchived: boolean;
};

function normalizeInput(
  input: ListFinancialAccountsInput,
): NormalizedListFinancialAccountsInput {
  return listFinancialAccountsInputSchema.parse(input);
}

async function executeListFinancialAccounts(
  transaction: ScopedTransaction,
  input: NormalizedListFinancialAccountsInput,
): Promise<ListFinancialAccountsResult> {
  const rows = await readFinancialAccountList(transaction, {
    workspaceId: input.workspaceId,
    includeArchived: input.includeArchived,
  });

  const firstRow = rows[0];

  if (!firstRow) {
    throw new FinancialAccountWorkspaceUnavailableError();
  }

  const items = rows.flatMap((row): FinancialAccountListItem[] => {
    /*
     * The workspace-header LEFT JOIN deliberately emits one row even when
     * the workspace has no financial accounts. That preserves an empty-list
     * result while still allowing us to distinguish an unavailable
     * workspace from a valid empty one.
     */
    if (row.account_id === null) {
      return [];
    }

    if (
      row.name === null ||
      row.account_type === null ||
      row.currency === null ||
      row.opening_cutoff_date === null ||
      row.version === null
    ) {
      throw new Error(
        "Financial account list query returned an incomplete account.",
      );
    }

    const accountType = financialAccountTypeSchema.parse(row.account_type);

    return [
      {
        accountId: row.account_id,

        name: row.name,

        accountType,

        institutionName: row.institution_name,

        currency: row.currency,

        openingCutoffDate: parseCalendarDate(row.opening_cutoff_date),

        notes: row.notes,

        archived: row.archived,

        /*
         * Database aggregates remain exact integer strings. Never convert
         * account balances through JavaScript Number.
         */
        currentBalanceMinor: parseMinorUnits(
          row.current_balance_minor,
        ).toString(),

        version: row.version,
      },
    ];
  });

  return {
    financialRevision: firstRow.financial_revision,

    items,
  };
}

export async function listFinancialAccountsInTransaction(
  transaction: ScopedTransaction,
  input: ListFinancialAccountsInput,
): Promise<ListFinancialAccountsResult> {
  return executeListFinancialAccounts(transaction, normalizeInput(input));
}

export async function listFinancialAccounts(
  input: ListFinancialAccountsInput,
): Promise<ListFinancialAccountsResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,
      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeListFinancialAccounts(transaction, normalized),
  );
}
