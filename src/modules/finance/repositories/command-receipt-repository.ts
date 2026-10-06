import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
  type CommandReceiptStateErrorReason,
} from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
  type ClaimCommandReceiptResult,
} from "@/modules/core/repositories/command-receipt-repository";
import type { ScopedTransaction } from "@/platform/db";

import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "../domain/financial-command";

export type ClaimFinancialCommandReceiptResult = ClaimCommandReceiptResult;

const financialStateMessages: Record<CommandReceiptStateErrorReason, string> = {
  existing_receipt_unresolved:
    "The existing financial command receipt could not be resolved.",
  existing_receipt_incomplete:
    "An existing financial command receipt was not completed.",
  completion_invalid_state:
    "The financial command receipt could not be completed from its current state.",
};

function translateFinancialCommandReceiptError(error: unknown): never {
  if (error instanceof CommandReceiptConflictError) {
    throw new FinancialCommandConflictError();
  }

  if (error instanceof CommandReceiptStateError) {
    throw new FinancialCommandStateError(financialStateMessages[error.reason]);
  }

  throw error;
}

export async function claimFinancialCommandReceipt(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    clientCommandId: string;
    commandType: string;
    payloadHash: Buffer;
  },
): Promise<ClaimFinancialCommandReceiptResult> {
  if (input.payloadHash.length !== 32) {
    throw new TypeError(
      "Financial command payload hashes must contain exactly 32 bytes.",
    );
  }

  try {
    return await claimCommandReceipt(transaction, input);
  } catch (error) {
    translateFinancialCommandReceiptError(error);
  }
}

export async function completeFinancialCommandReceipt(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    receiptId: string;
    result: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await completeCommandReceipt(transaction, input);
  } catch (error) {
    translateFinancialCommandReceiptError(error);
  }
}
