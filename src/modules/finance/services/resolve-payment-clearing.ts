import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  resolveClearingBodySchema,
  financialMutationResultSchema,
  FinancialCorrectionStaleError,
} from "../domain/financial-correction";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  createIncomeFinancialAction,
  createIncomeJournal,
} from "../repositories/income-repository";
import { resolvePaymentDebt } from "../repositories/debt-payment-repository";
import {
  ensureActiveExpenseCategory,
  getOrCreateSharedExpenseLedger,
} from "../repositories/expense-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "../repositories/financial-write-repository";
import type { FinancialCorrectionContext } from "../repositories/financial-correction-repository";
import {
  debtActionLink,
  posting,
  paymentReclassification,
  feeComponent,
} from "@/platform/db/schema";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
  })
  .strict();
type Input = z.input<typeof resolveClearingBodySchema> &
  z.infer<typeof actorSchema>;
export async function readClearingSources(
  t: ScopedTransaction,
  workspaceId: string,
  actionId: string,
) {
  const rows = await t.db.execute<{
    sourceComponentId: string;
    debtId: string;
    paymentId: string;
    paymentDate: string;
    remainingMinor: string;
    sourceAmountMinor: string;
  }>(
    sql`SELECT c.id AS "sourceComponentId",c.debt_id AS "debtId",pr.payment_id AS "paymentId",r.primary_effective_date::text AS "paymentDate",c.amount_minor::text AS "sourceAmountMinor",(c.amount_minor::numeric-COALESCE((SELECT sum(x.amount_minor::numeric) FROM finance.payment_reclassification x JOIN finance.financial_action xf ON xf.workspace_id=x.workspace_id AND xf.id=x.action_id AND xf.current_revision_id=x.action_revision_id JOIN finance.action_revision xr ON xr.workspace_id=xf.workspace_id AND xr.id=xf.current_revision_id AND xr.state='posted' AND xr.change_kind<>'void' WHERE x.workspace_id=c.workspace_id AND x.source_component_id=c.id),0))::text AS "remainingMinor" FROM finance.payment_component c JOIN finance.debt_payment_revision pr ON pr.workspace_id=c.workspace_id AND pr.id=c.payment_revision_id JOIN finance.financial_action f ON f.workspace_id=pr.workspace_id AND f.id=pr.action_id AND f.current_revision_id=pr.action_revision_id JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted' AND r.change_kind<>'void' WHERE c.workspace_id=${workspaceId}::uuid AND f.id=${actionId}::uuid AND c.disposition IN ('clearing','advance') ORDER BY c.id`,
  );
  return rows.rows;
}
export async function resolvePaymentClearingInTransaction(
  t: ScopedTransaction,
  input: Input,
  correction?: FinancialCorrectionContext,
) {
  const { userId, workspaceId, requestId, ...raw } = input,
    a = actorSchema.parse({ userId, workspaceId, requestId }),
    b = resolveClearingBodySchema.parse(raw),
    w = await lockActiveFinancialWorkspace(t, workspaceId),
    { clientCommandId, ...intent } = b;
  const receipt = correction
    ? { kind: "claimed" as const, receiptId: correction.receiptId }
    : await claimFinancialCommandReceipt(t, {
        workspaceId,
        clientCommandId,
        commandType: "finance.resolve_payment_clearing",
        payloadHash: hashFinancialCommandPayload(intent),
      });
  if (receipt.kind === "replay")
    return financialMutationResultSchema.parse(receipt.result);
  const sources = await t.db.execute<{
      debtId: string;
      paymentId: string;
      amount: string;
      paymentDate: string;
      payingLedgerId: string;
    }>(
      sql`SELECT c.debt_id AS "debtId",pr.payment_id AS "paymentId",c.amount_minor::text AS amount,r.primary_effective_date::text AS "paymentDate",a.ledger_account_id AS "payingLedgerId" FROM finance.payment_component c JOIN finance.debt_payment_revision pr ON pr.workspace_id=c.workspace_id AND pr.id=c.payment_revision_id JOIN finance.financial_action f ON f.workspace_id=pr.workspace_id AND f.id=pr.action_id AND f.current_revision_id=pr.action_revision_id JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted' AND r.change_kind<>'void' JOIN finance.financial_account a ON a.workspace_id=pr.workspace_id AND a.id=pr.paying_account_id WHERE c.workspace_id=${workspaceId}::uuid AND c.id=${b.sourceComponentId}::uuid AND c.disposition IN ('clearing','advance')`,
    ),
    source = sources.rows[0];
  if (!source)
    throw new RangeError("Current clearing payment component is unavailable.");
  const debt = await resolvePaymentDebt(t, {
    workspaceId,
    debtId: source.debtId,
  });
  if (!debt || debt.lifecycle !== "active" || !debt.clearing_ledger_account_id)
    throw new RangeError("Resolve clearing for an active debt.");
  if (debt.financial_revision !== b.expectedFinancialRevision)
    throw new FinancialCorrectionStaleError();
  if (b.effectiveDate < source.paymentDate)
    throw new RangeError(
      "A later classification must use its actual confirmation date, on or after the payment.",
    );
  const used = await t.db.execute<{ amount: string }>(
    sql`SELECT COALESCE(sum(c.amount_minor::numeric),0)::text AS amount FROM finance.payment_reclassification c JOIN finance.financial_action f ON f.workspace_id=c.workspace_id AND f.id=c.action_id AND f.current_revision_id=c.action_revision_id JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted' AND r.change_kind<>'void' WHERE c.workspace_id=${workspaceId}::uuid AND c.source_component_id=${b.sourceComponentId}::uuid ${correction ? sql`AND c.action_revision_id<>${correction.previousRevisionId}::uuid` : sql``}`,
  );
  const total = b.components.reduce((s, c) => s + BigInt(c.amountMinor), 0n);
  if (total > BigInt(source.amount) - BigInt(used.rows[0]!.amount))
    throw new RangeError(
      "Resolution exceeds the remaining original clearing component.",
    );
  const reductions = new Map<string, bigint>();
  for (const c of b.components) {
    if (c.disposition === "liability_reduction")
      reductions.set(
        c.liabilityComponent!,
        (reductions.get(c.liabilityComponent!) ?? 0n) + BigInt(c.amountMinor),
      );
    if (c.categoryId)
      await ensureActiveExpenseCategory(t, {
        workspaceId,
        categoryId: c.categoryId,
        historicalRevisionId: correction?.previousRevisionId,
      });
  }
  if (correction) {
    const restored = await t.db.execute<{ component: string; amount: string }>(
      sql`SELECT liability_component AS component,sum(amount_minor::numeric)::text AS amount FROM finance.posting WHERE workspace_id=${workspaceId}::uuid AND action_revision_id=${correction.previousRevisionId}::uuid AND ledger_account_id=${debt.liability_ledger_account_id}::uuid AND reverses_posting_id IS NULL GROUP BY liability_component`,
    );
    for (const row of restored.rows)
      debt.liability_balances[row.component] = (
        BigInt(debt.liability_balances[row.component] ?? "0") +
        BigInt(row.amount)
      ).toString();
  }
  for (const [component, amount] of reductions)
    if (amount > BigInt(debt.liability_balances[component] ?? "0"))
      throw new RangeError(
        "Resolution exceeds a recognized liability component.",
      );
  const expenseId = b.components.some((c) => c.disposition.startsWith("new_"))
      ? await getOrCreateSharedExpenseLedger(t, {
          workspaceId,
          currency: w.currency,
        })
      : null,
    actionId = correction?.actionId ?? randomUUID(),
    actionRevisionId = correction?.actionRevisionId ?? randomUUID(),
    journalId = randomUUID(),
    scope = { workspaceId, actionId, actionRevisionId };
  if (!correction) {
    await createIncomeFinancialAction(t, {
      id: actionId,
      workspaceId,
      commandReceiptId: receipt.receiptId,
      currentRevisionId: actionRevisionId,
      description: b.description,
      reference: null,
      notes: b.reason,
      recordedByUserId: a.userId,
      requestId: requestId ?? null,
    });
    await t.db.execute(
      sql`INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,reason,recorded_by_user_id,actor_kind,request_id) VALUES(${actionRevisionId}::uuid,${workspaceId}::uuid,${actionId}::uuid,1,${receipt.receiptId}::uuid,'create','payment_reclassification',${b.effectiveDate}::date,${w.currency},${b.reason},${userId}::uuid,'user',${requestId ?? null}::uuid)`,
    );
  }
  await createIncomeJournal(t, {
    ...scope,
    id: journalId,
    effectiveDate: b.effectiveDate,
    currency: w.currency,
  });
  await t.db
    .insert(debtActionLink)
    .values({ ...scope, debtId: source.debtId, purpose: "reclassification" });
  const clearingCreditPostingId = randomUUID(),
    line = { ...scope, journalId, currency: w.currency };
  await t.db.insert(posting).values({
    ...line,
    id: clearingCreditPostingId,
    lineNo: 1,
    ledgerAccountId: debt.clearing_ledger_account_id,
    amountMinor: -total,
  });
  for (const [i, c] of b.components.entries()) {
    const id = randomUUID();
    await t.db.insert(posting).values({
      ...line,
      id,
      lineNo: i + 2,
      ledgerAccountId:
        c.disposition === "liability_reduction"
          ? debt.liability_ledger_account_id
          : expenseId!,
      amountMinor: BigInt(c.amountMinor),
      liabilityComponent: c.liabilityComponent,
      categoryId: c.categoryId,
      expenseClass: c.disposition === "liability_reduction" ? "none" : "gross",
      memo: c.label,
    });
    if (c.disposition === "new_fee")
      await t.db.insert(feeComponent).values({
        ...scope,
        label: c.label,
        amountMinor: BigInt(c.amountMinor),
        effectiveDate: b.effectiveDate,
        bearingLedgerAccountId: source.payingLedgerId,
        expensePostingId: id,
        treatment: "source_additional",
      });
  }
  await t.db.insert(paymentReclassification).values({
    ...scope,
    debtId: source.debtId,
    paymentId: source.paymentId,
    sourceComponentId: b.sourceComponentId,
    clearingCreditPostingId,
    amountMinor: total,
    reason: b.reason,
  });
  await createPrivateFinancialRevision(t, {
    id: randomUUID(),
    workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_action",
    subjectId: actionId,
    subjectVersion: correction?.revisionNo ?? 1,
    operation: correction ? "replace" : "create",
    beforeJson: correction?.before,
    reason: b.reason,
    afterJson: {
      ...intent,
      actionKind: "payment_reclassification",
      actionRevisionId,
      debtId: source.debtId,
      paymentId: source.paymentId,
      resolvedMinor: total.toString(),
      cashChangeMinor: "0",
    },
    effectiveDate: b.effectiveDate,
    recordedByUserId: userId,
    requestId: requestId ?? null,
  });
  await finalizeJournal(t, { workspaceId, journalId });
  await finalizeActionRevision(t, { workspaceId, actionRevisionId });
  const financialRevision = await advanceWorkspaceFinancialRevision(
      t,
      workspaceId,
    ),
    result = { actionId, actionRevisionId, financialRevision };
  await completeFinancialCommandReceipt(t, {
    workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(t);
  return result;
}
export function resolvePaymentClearing(input: Input) {
  return withDomainTransaction(input, (t) =>
    resolvePaymentClearingInTransaction(t, input),
  );
}
