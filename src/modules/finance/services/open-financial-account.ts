import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import {
  advanceWorkspaceFinancialRevision,
  createFinancialAccount,
  createFinancialAction,
  createLedgerAccount,
  createOpeningActionRevision,
  createOpeningJournal,
  createOpeningPosting,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "@/modules/finance/repositories/financial-account-repository";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import { MAX_FINANCIAL_COMPONENT_MINOR, parseMinorUnits } from "@/shared/money";
import { isCalendarDate, parseCalendarDate } from "@/shared/calendar-date";

const OPEN_FINANCIAL_ACCOUNT_COMMAND_TYPE = "finance.open_account";

const financialAccountTypeSchema = z.enum([
  "cash",
  "e_wallet",
  "checking",
  "savings",
]);

const openFinancialAccountInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),

    name: z.string().trim().min(1).max(200),
    accountType: financialAccountTypeSchema,

    institutionName: z.string().trim().min(1).max(200).nullable().optional(),

    openingCutoffDate: z.string().refine(isCalendarDate, {
      message: "Opening cutoff date must be a valid YYYY-MM-DD calendar date.",
    }),

    openingBalanceMinor: z.string().regex(/^(?:0|[1-9]\d*)$/, {
      message:
        "Opening balance must be a non-negative minor-unit integer string.",
    }),

    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict();

const openFinancialAccountResultSchema = z.object({
  accountId: z.uuid(),
  ledgerAccountId: z.uuid(),
  openingActionId: z.uuid().nullable(),
  financialRevision: z.string().regex(/^\d+$/),
});

export type OpenFinancialAccountInput = z.input<
  typeof openFinancialAccountInputSchema
>;

export type OpenFinancialAccountResult = z.infer<
  typeof openFinancialAccountResultSchema
>;

type NormalizedOpenFinancialAccountInput = {
  userId: string;
  workspaceId: string;
  clientCommandId: string;
  requestId: string | null;

  name: string;
  accountType: "cash" | "e_wallet" | "checking" | "savings";

  institutionName: string | null;
  openingCutoffDate: string;
  openingBalanceMinor: bigint;
  notes: string | null;
};

function normalizeOpenFinancialAccountInput(
  input: OpenFinancialAccountInput,
): NormalizedOpenFinancialAccountInput {
  const parsed = openFinancialAccountInputSchema.parse(input);

  const openingCutoffDate = parseCalendarDate(parsed.openingCutoffDate);

  const openingBalanceMinor = parseMinorUnits(parsed.openingBalanceMinor);

  if (openingBalanceMinor > MAX_FINANCIAL_COMPONENT_MINOR) {
    throw new RangeError(
      `Opening balance must not exceed ${MAX_FINANCIAL_COMPONENT_MINOR.toString()} minor units.`,
    );
  }

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,
    clientCommandId: parsed.clientCommandId,
    requestId: parsed.requestId ?? null,

    name: parsed.name,
    accountType: parsed.accountType,

    institutionName: parsed.institutionName ?? null,

    openingCutoffDate,
    openingBalanceMinor,

    notes: parsed.notes ?? null,
  };
}

async function executeOpenFinancialAccount(
  transaction: ScopedTransaction,
  input: NormalizedOpenFinancialAccountInput,
): Promise<OpenFinancialAccountResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    input.workspaceId,
  );

  const payloadHash = hashFinancialCommandPayload({
    name: input.name,
    accountType: input.accountType,
    institutionName: input.institutionName,
    openingCutoffDate: input.openingCutoffDate,
    openingBalanceMinor: input.openingBalanceMinor.toString(),
    notes: input.notes,
  });

  const receipt = await claimFinancialCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    clientCommandId: input.clientCommandId,
    commandType: OPEN_FINANCIAL_ACCOUNT_COMMAND_TYPE,
    payloadHash,
  });

  if (receipt.kind === "replay") {
    return openFinancialAccountResultSchema.parse(receipt.result);
  }

  const accountId = randomUUID();
  const cashLedgerAccountId = randomUUID();

  await createLedgerAccount(transaction, {
    id: cashLedgerAccountId,
    workspaceId: input.workspaceId,
    code: `cash:${accountId}`,
    name: input.name,
    kind: "cash_asset",
    currency: workspace.currency,
  });

  let openingActionId: string | null = null;

  if (input.openingBalanceMinor > 0n) {
    const openingEquityLedgerAccountId = randomUUID();

    const actionId = randomUUID();
    const actionRevisionId = randomUUID();
    const journalId = randomUUID();

    openingActionId = actionId;

    await createLedgerAccount(transaction, {
      id: openingEquityLedgerAccountId,
      workspaceId: input.workspaceId,
      code: `opening-equity:${accountId}`,
      name: "Opening Equity",
      kind: "opening_equity",
      currency: workspace.currency,
    });

    await createFinancialAction(transaction, {
      id: actionId,
      workspaceId: input.workspaceId,
      commandReceiptId: receipt.receiptId,
      currentRevisionId: actionRevisionId,
      description: `Opening balance for ${input.name}`,
      recordedByUserId: input.userId,
      requestId: input.requestId,
    });

    await createOpeningActionRevision(transaction, {
      id: actionRevisionId,
      workspaceId: input.workspaceId,
      actionId,
      commandReceiptId: receipt.receiptId,
      effectiveDate: input.openingCutoffDate,
      currency: workspace.currency,
      recordedByUserId: input.userId,
      requestId: input.requestId,
    });

    await createOpeningJournal(transaction, {
      id: journalId,
      workspaceId: input.workspaceId,
      actionId,
      actionRevisionId,
      effectiveDate: input.openingCutoffDate,
      currency: workspace.currency,
    });

    await createOpeningPosting(transaction, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actionId,
      actionRevisionId,
      journalId,
      ledgerAccountId: cashLedgerAccountId,
      currency: workspace.currency,
      lineNo: 1,
      amountMinor: input.openingBalanceMinor,
      cashFlowKind: "opening",
      cashFlowDirection: "baseline",
    });

    await createOpeningPosting(transaction, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actionId,
      actionRevisionId,
      journalId,
      ledgerAccountId: openingEquityLedgerAccountId,
      currency: workspace.currency,
      lineNo: 2,
      amountMinor: -input.openingBalanceMinor,
      cashFlowKind: "none",
      cashFlowDirection: "none",
    });

    /*
     * Mandatory financial audit evidence is inserted before finalization.
     * requestId is deliberately attribution metadata and is excluded from
     * canonical command hashing.
     */
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
        actionKind: "opening_cash",
        accountId,
        effectiveDate: input.openingCutoffDate,
        currency: workspace.currency,
        amountMinor: input.openingBalanceMinor.toString(),
      },
      effectiveDate: input.openingCutoffDate,
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
  }

  /*
   * For a nonzero opening balance, openingActionId now references an already
   * existing action. This keeps the new account at version 1 instead of
   * inserting it and immediately mutating it only to attach the baseline.
   */
  await createFinancialAccount(transaction, {
    id: accountId,
    workspaceId: input.workspaceId,
    ledgerAccountId: cashLedgerAccountId,
    name: input.name,
    accountType: input.accountType,
    institutionName: input.institutionName,
    currency: workspace.currency,
    openingCutoffDate: input.openingCutoffDate,
    openingActionId,
    notes: input.notes,
  });

  await createPrivateFinancialRevision(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_account",
    subjectId: accountId,
    subjectVersion: 1,
    operation: "create",
    afterJson: {
      ledgerAccountId: cashLedgerAccountId,
      name: input.name,
      accountType: input.accountType,
      institutionName: input.institutionName,
      currency: workspace.currency,
      openingCutoffDate: input.openingCutoffDate,
      openingActionId,
      notes: input.notes,
    },
    effectiveDate: input.openingCutoffDate,
    recordedByUserId: input.userId,
    requestId: input.requestId,
  });

  const financialRevision = await advanceWorkspaceFinancialRevision(
    transaction,
    input.workspaceId,
  );

  const result: OpenFinancialAccountResult = {
    accountId,
    ledgerAccountId: cashLedgerAccountId,
    openingActionId,
    financialRevision,
  };

  await completeFinancialCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });

  /*
   * Surface deferred FK, journal, recipe and opening-account integrity failures
   * inside the service rather than only at COMMIT.
   */
  await enforceDeferredFinancialConstraints(transaction);

  return result;
}

export async function openFinancialAccountInTransaction(
  transaction: ScopedTransaction,
  input: OpenFinancialAccountInput,
): Promise<OpenFinancialAccountResult> {
  return executeOpenFinancialAccount(
    transaction,
    normalizeOpenFinancialAccountInput(input),
  );
}

export async function openFinancialAccount(
  input: OpenFinancialAccountInput,
): Promise<OpenFinancialAccountResult> {
  const normalizedInput = normalizeOpenFinancialAccountInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeOpenFinancialAccount(transaction, normalizedInput),
  );
}
