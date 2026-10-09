import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql, inArray } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  commandReceipt,
  financialAction,
  actionRevision,
  journal,
  posting,
  purchaseDetail,
  privateRevision,
} from "@/platform/db/schema";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  getOrCreateSharedExpenseLedger,
  resolveFundingFinancialAccount,
} from "@/modules/finance/repositories/expense-repository";
import {
  lockActiveFinancialWorkspace,
  enforceDeferredFinancialConstraints,
} from "@/modules/finance/repositories/financial-write-repository";

/** Large synthetic history uses ordinary building -> posted transitions,
 * real app_domain RLS and all recipe/integrity triggers. It is a data factory,
 * not a command latency benchmark. Command latency is measured separately
 * through released services after this history has been committed. */
export async function seedExpenseHistory(
  t: ScopedTransaction,
  owner: { userId: string; workspaceId: string },
  accountId: string,
  start: number,
  count: number,
) {
  const root = await t.db.execute<{ name: string; label: string }>(
    sql`SELECT current_database() name,display_name label FROM core.user_profile WHERE user_id=${owner.userId}::uuid`,
  );
  assert.equal(root.rows[0]?.name, "personal_management_test");
  assert.equal(root.rows[0]?.label, "C5 performance fixture");
  const { currency } = await lockActiveFinancialWorkspace(t, owner.workspaceId);
  const account = await resolveFundingFinancialAccount(t, {
    workspaceId: owner.workspaceId,
    accountId,
  });
  const expenseLedger = await getOrCreateSharedExpenseLedger(t, {
    workspaceId: owner.workspaceId,
    currency,
  });
  const rows = Array.from({ length: count }, (_, index) => {
    const n = start + index,
      date = new Date(Date.UTC(2016, 0, 2) + (n % 3900) * 86400000)
        .toISOString()
        .slice(0, 10),
      description = `Synthetic purchase ${n}`,
      splits = [100n, 100n, 100n, 100n, 200n];
    return {
      receiptId: randomUUID(),
      commandId: randomUUID(),
      actionId: randomUUID(),
      revisionId: randomUUID(),
      journalId: randomUUID(),
      auditId: randomUUID(),
      date,
      description,
      splits,
      hash: hashFinancialCommandPayload({
        fundingAccountId: accountId,
        effectiveDate: date,
        purchaseMinor: "600",
        splits: splits.map((amount) => ({
          amountMinor: amount.toString(),
          categoryId: null,
          memo: null,
        })),
        merchantName: null,
        description,
        reference: null,
        notes: null,
      }),
    };
  });
  const ws = owner.workspaceId,
    actor = { recordedByUserId: owner.userId, actorKind: "user" };
  await t.db.insert(commandReceipt).values(
    rows.map((r) => ({
      id: r.receiptId,
      workspaceId: ws,
      clientCommandId: r.commandId,
      commandType: "finance.record_expense",
      payloadHash: r.hash,
    })),
  );
  await t.db.insert(financialAction).values(
    rows.map((r) => ({
      id: r.actionId,
      workspaceId: ws,
      originalCommandReceiptId: r.receiptId,
      currentRevisionId: r.revisionId,
      description: r.description,
      ...actor,
    })),
  );
  await t.db.insert(actionRevision).values(
    rows.map((r) => ({
      id: r.revisionId,
      workspaceId: ws,
      actionId: r.actionId,
      revisionNo: 1,
      commandReceiptId: r.receiptId,
      changeKind: "create",
      actionKind: "expense",
      primaryEffectiveDate: r.date,
      currency,
      ...actor,
    })),
  );
  await t.db.insert(purchaseDetail).values(
    rows.map((r) => ({
      workspaceId: ws,
      actionId: r.actionId,
      actionRevisionId: r.revisionId,
      fundingLedgerAccountId: account.ledgerAccountId,
      purchaseMinor: 600n,
    })),
  );
  await t.db.insert(journal).values(
    rows.map((r) => ({
      id: r.journalId,
      workspaceId: ws,
      actionId: r.actionId,
      actionRevisionId: r.revisionId,
      sequenceNo: 1,
      effectiveDate: r.date,
      currency,
      role: "economic",
    })),
  );
  await t.db.insert(posting).values(
    rows.flatMap((r) => {
      const base = {
        workspaceId: ws,
        actionId: r.actionId,
        actionRevisionId: r.revisionId,
        journalId: r.journalId,
        currency,
      };
      return [
        {
          ...base,
          id: randomUUID(),
          ledgerAccountId: account.ledgerAccountId,
          lineNo: 1,
          amountMinor: -600n,
          cashFlowKind: "purchase",
          cashFlowDirection: "out",
        },
        ...r.splits.map((amount, i) => ({
          ...base,
          id: randomUUID(),
          ledgerAccountId: expenseLedger,
          lineNo: i + 2,
          amountMinor: amount,
          expenseClass: "gross",
        })),
      ];
    }),
  );
  await t.db.insert(privateRevision).values(
    rows.map((r) => ({
      id: r.auditId,
      workspaceId: ws,
      commandReceiptId: r.receiptId,
      subjectKind: "financial_action",
      subjectId: r.actionId,
      subjectVersion: 1,
      operation: "create",
      effectiveDate: r.date,
      ...actor,
      afterJson: {
        acknowledgeNegativeBalance: false,
        negativeBalanceWarnings: [],
        actionRevisionId: r.revisionId,
        actionKind: "expense",
        fundingAccountId: accountId,
        effectiveDate: r.date,
        currency,
        purchaseMinor: "600",
        merchantName: null,
        splits: r.splits.map((amount) => ({
          amountMinor: amount.toString(),
          categoryId: null,
          memo: null,
        })),
        description: r.description,
        reference: null,
      },
    })),
  );
  await t.db
    .update(journal)
    .set({ state: "posted", finalizedAt: sql`clock_timestamp()` })
    .where(
      inArray(
        journal.id,
        rows.map((r) => r.journalId),
      ),
    );
  await t.db
    .update(actionRevision)
    .set({ state: "posted", finalizedAt: sql`clock_timestamp()` })
    .where(
      inArray(
        actionRevision.id,
        rows.map((r) => r.revisionId),
      ),
    );
  const revision = await t.db.execute<{ revision: string }>(
    sql`UPDATE core.workspace SET financial_revision=financial_revision+${count} WHERE id=${ws}::uuid RETURNING financial_revision::text revision`,
  );
  const resultRows = rows.map((r, i) => ({
    id: r.receiptId,
    result: {
      actionId: r.actionId,
      actionRevisionId: r.revisionId,
      financialRevision: (
        BigInt(revision.rows[0]!.revision) -
        BigInt(count) +
        BigInt(i) +
        1n
      ).toString(),
    },
  }));
  await t.db.execute(
    sql`UPDATE core.command_receipt c SET state='completed',completed_at=clock_timestamp(),result_json=r.result FROM jsonb_to_recordset(${JSON.stringify(resultRows)}::jsonb) AS r(id uuid,result jsonb) WHERE c.workspace_id=${ws}::uuid AND c.id=r.id`,
  );
  await enforceDeferredFinancialConstraints(t);
}
