import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScopedTransaction, ScopedDatabaseContext } from "@/platform/db";
import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  createFinancialAction,
  createLedgerAccount,
  createOpeningActionRevision,
  createOpeningJournal,
  createOpeningPosting,
} from "../repositories/financial-account-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  finalizeActionRevision,
  finalizeJournal,
  enforceDeferredFinancialConstraints,
} from "../repositories/financial-write-repository";
import {
  rebaseCashOpeningForImport,
  reverseFinancialActionInTransaction,
} from "./correct-financial-action";
export async function rebaseCashHistory(
  tx: ScopedTransaction,
  a: ScopedDatabaseContext,
  c: {
    batchId: string;
    accountId: string;
    openingActionId: string | null;
    openingRevisionId: string | null;
    clientCommandId: string;
    expectedFinancialRevision: string;
    earlierDate: string;
    earlierMinor: string;
    acknowledgeNegativeBalance: boolean;
  },
) {
  if (c.openingActionId && c.openingRevisionId && BigInt(c.earlierMinor) > 0n)
    return rebaseCashOpeningForImport(
      tx,
      {
        userId: a.userId,
        workspaceId: a.workspaceId,
        actionId: c.openingActionId,
        clientCommandId: c.clientCommandId,
        expectedActionRevisionId: c.openingRevisionId,
        expectedFinancialRevision: c.expectedFinancialRevision,
        reason: `Confirmed history rebase ${c.batchId}`,
        replacement: {
          actionKind: "opening_cash",
          financialAccountId: c.accountId,
          effectiveDate: c.earlierDate,
          amountMinor: c.earlierMinor,
          description: "Confirmed earlier opening baseline",
          acknowledgeNegativeBalance: c.acknowledgeNegativeBalance,
        },
      },
      c.batchId,
    );
  await tx.db.execute(
    sql`SELECT ops.authorize_cash_rebase(${c.batchId}::uuid)`,
  );
  await tx.db.execute(
    sql`UPDATE finance.financial_account SET opening_cutoff_date=${c.earlierDate}::date,version=version+1,updated_at=clock_timestamp() WHERE id=${c.accountId}::uuid`,
  );
  const fresh = (
    await tx.db.execute<{ revision: string }>(
      sql`SELECT financial_revision::text revision FROM core.workspace`,
    )
  ).rows[0]!.revision;
  if (c.openingActionId && c.openingRevisionId)
    return reverseFinancialActionInTransaction(tx, {
      userId: a.userId,
      workspaceId: a.workspaceId,
      actionId: c.openingActionId,
      clientCommandId: c.clientCommandId,
      expectedActionRevisionId: c.openingRevisionId,
      expectedFinancialRevision: fresh,
      reason: `Confirmed zero earlier baseline ${c.batchId}`,
      acknowledgeNegativeBalance: c.acknowledgeNegativeBalance,
    });
  if (BigInt(c.earlierMinor) === 0n) return { rebased: true };
  const r = await claimFinancialCommandReceipt(tx, {
    workspaceId: a.workspaceId,
    clientCommandId: c.clientCommandId,
    commandType: "finance.rebase_cash",
    payloadHash: hashCommandPayload(c),
  });
  if (r.kind === "replay") return r.result;
  const account = (
    await tx.db.execute<{ ledger_account_id: string; currency: string }>(
      sql`SELECT ledger_account_id,currency FROM finance.financial_account WHERE id=${c.accountId}::uuid`,
    )
  ).rows[0]!;
  const equity = randomUUID(),
    actionId = randomUUID(),
    actionRevisionId = randomUUID(),
    journalId = randomUUID();
  await createLedgerAccount(tx, {
    id: equity,
    workspaceId: a.workspaceId,
    code: `rebase-equity:${c.accountId}:${c.batchId}`,
    name: "Confirmed earlier opening equity",
    kind: "opening_equity",
    currency: account.currency,
  });
  await createFinancialAction(tx, {
    id: actionId,
    workspaceId: a.workspaceId,
    commandReceiptId: r.receiptId,
    currentRevisionId: actionRevisionId,
    description: "Confirmed earlier opening balance",
    recordedByUserId: a.userId,
    requestId: null,
  });
  await createOpeningActionRevision(tx, {
    id: actionRevisionId,
    workspaceId: a.workspaceId,
    actionId,
    commandReceiptId: r.receiptId,
    effectiveDate: c.earlierDate,
    currency: account.currency,
    recordedByUserId: a.userId,
    requestId: null,
  });
  await createOpeningJournal(tx, {
    id: journalId,
    workspaceId: a.workspaceId,
    actionId,
    actionRevisionId,
    effectiveDate: c.earlierDate,
    currency: account.currency,
  });
  for (const [lineNo, ledgerAccountId, amountMinor] of [
    [1, account.ledger_account_id, BigInt(c.earlierMinor)],
    [2, equity, -BigInt(c.earlierMinor)],
  ] as const)
    await createOpeningPosting(tx, {
      id: randomUUID(),
      workspaceId: a.workspaceId,
      actionId,
      actionRevisionId,
      journalId,
      ledgerAccountId,
      currency: account.currency,
      lineNo,
      amountMinor,
      cashFlowKind: lineNo === 1 ? "opening" : "none",
      cashFlowDirection: lineNo === 1 ? "baseline" : "none",
    });
  await tx.db.execute(
    sql`UPDATE finance.financial_account SET opening_action_id=${actionId}::uuid,version=version+1,updated_at=clock_timestamp() WHERE id=${c.accountId}::uuid`,
  );
  await createPrivateFinancialRevision(tx, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: r.receiptId,
    subjectKind: "financial_action",
    subjectId: actionId,
    subjectVersion: 1,
    operation: "create",
    afterJson: {
      actionRevisionId,
      actionKind: "opening_cash",
      accountId: c.accountId,
      effectiveDate: c.earlierDate,
      currency: account.currency,
      amountMinor: c.earlierMinor,
      batchId: c.batchId,
    },
    effectiveDate: c.earlierDate,
    recordedByUserId: a.userId,
    requestId: null,
  });
  await finalizeJournal(tx, { workspaceId: a.workspaceId, journalId });
  await finalizeActionRevision(tx, {
    workspaceId: a.workspaceId,
    actionRevisionId,
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
      tx,
      a.workspaceId,
    ),
    result = { actionId, actionRevisionId, financialRevision };
  await completeFinancialCommandReceipt(tx, {
    workspaceId: a.workspaceId,
    receiptId: r.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(tx);
  return result;
}
