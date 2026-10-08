import {
  resolvePaymentClearingInTransaction,
  readClearingSources,
} from "./resolve-payment-clearing";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  correctFinancialActionBodySchema,
  reverseFinancialActionBodySchema,
  financialMutationResultSchema,
  FinancialCorrectionStaleError,
  projectReplacementIntent,
  type CorrectFinancialActionBody,
} from "../domain/financial-correction";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  beginActionReplacement,
  readCurrentFinancialAction,
  readFinancialActionHistory,
  type FinancialCorrectionContext,
} from "../repositories/financial-correction-repository";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "../repositories/financial-write-repository";
import { reviewCashChanges } from "../repositories/negative-balance-repository";
import { readRefundSources } from "../repositories/refund-repository";
import { recordIncomeInTransaction } from "./record-income";
import { recordExpenseInTransaction } from "./record-expense";
import { recordTransferInTransaction } from "./record-transfer";
import { recordDebtPaymentInTransaction } from "./record-debt-payment";
import { recordBorrowingInTransaction } from "./record-borrowing";
import { recordRefundInTransaction } from "./record-refund";
import { getDebtDetailInTransaction } from "./read-debts";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  readScheduleContext,
  readSchedulePaymentPools,
  insertScheduleRevision,
  activateScheduleRevision,
} from "../repositories/debt-schedule-repository";
import { reviseDebtScheduleBodySchema } from "../domain/debt-schedule-revision";
import {
  readAccountBalanceAt,
  insertAccountAdjustment,
} from "../repositories/reconciliation-repository";
import { getOrCreateAdjustmentEquityLedger } from "../repositories/adjustment-equity-repository";
import {
  ensureActiveExpenseCategory,
  getOrCreateSharedExpenseLedger,
} from "../repositories/expense-repository";
import {
  journal,
  posting,
  debtActionLink,
  feeComponent,
} from "@/platform/db/schema";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
    actionId: z.uuid(),
  })
  .strict();
type Actor = z.infer<typeof actorSchema>;
function withoutKind<T extends { actionKind: string }>(value: T) {
  const { actionKind: _kind, ...intent } = value;
  void _kind;
  return intent;
}
export type CorrectFinancialActionInput = CorrectFinancialActionBody & Actor;

async function validateSource(
  t: ScopedTransaction,
  a: Actor,
  expected: {
    expectedActionRevisionId: string;
    expectedFinancialRevision: string;
  },
) {
  const current = await readCurrentFinancialAction(
    t,
    a.workspaceId,
    a.actionId,
  );
  if (
    current.actionRevisionId !== expected.expectedActionRevisionId ||
    current.financialRevision !== expected.expectedFinancialRevision
  )
    throw new FinancialCorrectionStaleError();
  if (current.changeKind === "void")
    throw new RangeError(
      "This action is already reversed. Record a new genuine action if needed.",
    );
  const links = await t.db.execute<{
    debtId: string;
    liabilityLedgerId: string;
    scheduleVersionId: string;
    lifecycle: string;
    startDate: string;
    openingCutoffDate: string | null;
    name: string;
    lenderName: string;
    productName: string | null;
    debtType: string;
    paymentId: string | null;
  }>(
    sql`SELECT d.id AS "debtId",d.liability_ledger_account_id AS "liabilityLedgerId",d.current_schedule_version_id AS "scheduleVersionId",d.lifecycle,d.start_date::text AS "startDate",d.opening_cutoff_date::text AS "openingCutoffDate",d.name,d.lender_name AS "lenderName",d.product_name AS "productName",d.debt_type AS "debtType",p.id AS "paymentId" FROM finance.debt_action_link l JOIN finance.debt d ON d.workspace_id=l.workspace_id AND d.id=l.debt_id LEFT JOIN finance.debt_payment p ON p.workspace_id=l.workspace_id AND p.action_id=l.action_id WHERE l.workspace_id=${a.workspaceId}::uuid AND l.action_revision_id=${current.actionRevisionId}::uuid`,
  );
  const debt = links.rows[0];
  if (debt && debt.lifecycle !== "active")
    throw new RangeError(
      "This action belongs to a closed debt. Resolve the dependent settlement explicitly before correcting its financial history.",
    );
  if (current.actionKind === "debt_payment") {
    const resolved = await t.db.execute<{ id: string }>(
      sql`SELECT c.id FROM finance.payment_reclassification c JOIN finance.financial_action f ON f.workspace_id=c.workspace_id AND f.id=c.action_id AND f.current_revision_id=c.action_revision_id JOIN finance.payment_component pc ON pc.workspace_id=c.workspace_id AND pc.id=c.source_component_id JOIN finance.debt_payment_revision pr ON pr.workspace_id=pc.workspace_id AND pr.id=pc.payment_revision_id WHERE pr.workspace_id=${a.workspaceId}::uuid AND pr.action_revision_id=${current.actionRevisionId}::uuid LIMIT 1`,
    );
    if (resolved.rows.length)
      throw new RangeError(
        "Reverse or correct the linked clearing reclassification first, then review this payment correction and its contractual allocations.",
      );
  }
  return { current, debt };
}
async function finish(
  t: ScopedTransaction,
  a: Actor,
  c: FinancialCorrectionContext,
  effectiveDate: string,
  after: Record<string, unknown>,
  journalId?: string,
  voided = false,
  deferConstraints = false,
) {
  await createPrivateFinancialRevision(t, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: c.receiptId,
    subjectKind: "financial_action",
    subjectId: c.actionId,
    subjectVersion: c.revisionNo,
    operation: voided ? "void" : "replace",
    beforeJson: c.before,
    reason: c.reason,
    afterJson: { ...after, actionRevisionId: c.actionRevisionId },
    effectiveDate,
    recordedByUserId: a.userId,
    requestId: a.requestId ?? null,
  });
  if (journalId)
    await finalizeJournal(t, { workspaceId: a.workspaceId, journalId });
  await finalizeActionRevision(t, {
    workspaceId: a.workspaceId,
    actionRevisionId: c.actionRevisionId,
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
      t,
      a.workspaceId,
    ),
    result = {
      actionId: c.actionId,
      actionRevisionId: c.actionRevisionId,
      financialRevision,
    };
  await completeFinancialCommandReceipt(t, {
    workspaceId: a.workspaceId,
    receiptId: c.receiptId,
    result,
  });
  if (!deferConstraints) await enforceDeferredFinancialConstraints(t);
  return result;
}

/** A mapped payment correction produces fresh maps against original current
 * payment pools. All surviving obligations and terms remain unchanged. */
async function rebuildCorrectedPaymentSchedule(
  t: ScopedTransaction,
  a: Actor,
  c: FinancialCorrectionContext,
  debtId: string,
  effectiveDate: string,
) {
  const detail = await getDebtDetailInTransaction(t, {
    userId: a.userId,
    workspaceId: a.workspaceId,
    debtId,
  });
  const scheduleVersionId = detail.debt.scheduleVersionId!;
  const scope = { workspaceId: a.workspaceId, debtId, scheduleVersionId };
  const context = await readScheduleContext(t, scope);
  const pools = await readSchedulePaymentPools(t, scope);
  const entries = detail.installments.map((i) => ({
    entryKey: randomUUID(),
    obligationId: i.obligationId,
    dueDate: i.dueDate,
    contractualMinor: i.contractualMinor,
    knownPrincipalMinor: i.knownPrincipalMinor,
    knownInterestMinor: i.knownInterestMinor,
    knownFeeMinor: i.knownFeeMinor,
    breakdownComplete: i.breakdownComplete,
    disposition: i.disposition,
    cancellationReason: i.cancellationReason,
    notes: i.notes,
  }));
  const body = reviseDebtScheduleBodySchema.parse({
    clientCommandId: c.receiptId,
    debtId,
    expectedDebtVersion: detail.debt.version,
    expectedScheduleVersionId: scheduleVersionId,
    expectedFinancialRevision: detail.financialRevision,
    effectiveDate,
    revisionKind: "allocation_correction",
    reason: c.reason,
    frequency: context.frequency,
    entries,
    mappings: pools.flatMap((p) =>
      p.currentTargets.map((target) => ({
        paymentRevisionId: p.paymentRevisionId,
        sourceAllocationId: p.sourceAllocationId,
        targetEntryKey: target.obligationId
          ? entries.find((e) => e.obligationId === target.obligationId)!
              .entryKey
          : null,
        amountMinor: target.amountMinor,
      })),
    ),
    allocationMappingConfirmed: true,
  });
  const inserted = await insertScheduleRevision(t, {
    ...a,
    requestId: a.requestId ?? null,
    body,
    setup: { detail, frequency: context.frequency, pools },
    versionNo: context.version_no + 1,
  });
  const debtVersion = await activateScheduleRevision(t, {
    ...scope,
    scheduleVersionId: inserted.scheduleVersionId,
    expectedDebtVersion: detail.debt.version,
  });
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: c.receiptId,
    subjectKind: "debt_schedule_version",
    subjectId: inserted.scheduleVersionId,
    subjectVersion: context.version_no + 1,
    operation: "create",
    beforeJson: { scheduleVersionId, entries: detail.installments, pools },
    afterJson: {
      ...body,
      ...inserted,
      debtVersion,
      correctedActionId: c.actionId,
    },
    reason: c.reason,
    effectiveDate,
    recordedByUserId: a.userId,
    actorKind: "user",
    requestId: a.requestId ?? null,
  });
  await enforceDeferredFinancialConstraints(t);
}

async function mappedPaymentNeedsRevision(
  t: ScopedTransaction,
  a: Actor,
  previousRevisionId: string,
  currentScheduleId: string,
) {
  const r = await t.db.execute<{ scheduleId: string }>(
    sql`SELECT paid_against_schedule_version_id AS "scheduleId" FROM finance.debt_payment_revision WHERE workspace_id=${a.workspaceId}::uuid AND action_revision_id=${previousRevisionId}::uuid`,
  );
  return r.rows[0]?.scheduleId !== currentScheduleId;
}

async function executeCorrection(
  t: ScopedTransaction,
  input: CorrectFinancialActionInput,
) {
  const { userId, workspaceId, requestId, actionId, ...raw } = input,
    a = actorSchema.parse({ userId, workspaceId, requestId, actionId }),
    b = correctFinancialActionBodySchema.parse(raw);
  const w = await lockActiveFinancialWorkspace(t, workspaceId),
    { clientCommandId, ...intent } = b;
  const receipt = await claimFinancialCommandReceipt(t, {
    workspaceId,
    clientCommandId,
    commandType: "finance.correct_financial_action",
    payloadHash: hashFinancialCommandPayload(
      JSON.parse(JSON.stringify({ actionId, ...intent })),
    ),
  });
  if (receipt.kind === "replay")
    return financialMutationResultSchema.parse(receipt.result);
  const { current, debt } = await validateSource(t, a, b),
    p = b.replacement;
  let rebuildPaymentSchedule = false;
  if (
    p.actionKind === "debt_payment" &&
    debt &&
    (await mappedPaymentNeedsRevision(
      t,
      a,
      current.actionRevisionId,
      debt.scheduleVersionId,
    ))
  ) {
    const proposal = (
      await getFinancialActionDetailInTransaction(t, { workspaceId, actionId })
    ).replacement;
    if (proposal?.actionKind !== "debt_payment")
      throw new RangeError(
        "Current payment allocation evidence is unavailable.",
      );
    const economics = (value: typeof proposal) =>
      JSON.stringify({
        ...value,
        description: undefined,
        reference: undefined,
        notes: undefined,
        acknowledgeNegativeBalance: undefined,
      });
    if (economics(p) === economics(proposal))
      throw new RangeError(
        "No payment economics changed. Metadata-only edits do not require a financial correction or a schedule version.",
      );
    rebuildPaymentSchedule = true;
  }
  if (
    p.actionKind !== current.actionKind &&
    !(
      ["income", "expense"].includes(p.actionKind) &&
      ["income", "expense"].includes(current.actionKind)
    )
  )
    throw new RangeError(
      "This correction would change dependent typed evidence. Use the explicit dependent resolution workflow first.",
    );
  // Removing a receipt from its old account can expose a negative balance even
  // when the replacement account remains positive. Review every affected cash
  // account, including those absent from the replacement.
  const oldCash = await t.db.execute<{
    accountId: string;
    effectiveDate: string;
    signedMinor: string;
  }>(
    sql`SELECT a.id AS "accountId",j.effective_date::text AS "effectiveDate",(-sum(p.amount_minor::numeric))::text AS "signedMinor" FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.financial_account a ON a.workspace_id=p.workspace_id AND a.ledger_account_id=p.ledger_account_id WHERE p.workspace_id=${workspaceId}::uuid AND p.action_revision_id=${current.actionRevisionId}::uuid GROUP BY a.id,j.effective_date`,
  );
  // The complete before/after projection is evaluated by the replacement
  // writer for its accounts. Accounts removed entirely are evaluated here.
  const newAccounts =
    p.actionKind === "income" ||
    p.actionKind === "refund" ||
    p.actionKind === "borrowing"
      ? [p.receivingAccountId]
      : p.actionKind === "expense"
        ? [p.fundingAccountId]
        : p.actionKind === "transfer"
          ? [
              p.sourceAccountId,
              p.destinationAccountId,
              ...p.fees.flatMap((f) =>
                f.bearingAccountId ? [f.bearingAccountId] : [],
              ),
            ]
          : p.actionKind === "debt_payment"
            ? [p.payingAccountId]
            : p.actionKind === "balance_adjustment" ||
                p.actionKind === "opening_cash"
              ? [p.financialAccountId]
              : [];
  await reviewCashChanges(t, {
    workspaceId,
    acknowledgeNegativeBalance: p.acknowledgeNegativeBalance,
    changes: oldCash.rows
      .filter((row) => !newAccounts.includes(row.accountId))
      .map((row) => ({ ...row, signedMinor: BigInt(row.signedMinor) })),
  });
  const effectiveDate =
    p.actionKind === "debt_payment" ? p.paymentDate : p.effectiveDate;
  const c = await beginActionReplacement(t, {
    ...a,
    receiptId: receipt.receiptId,
    current,
    reason: b.reason,
    effectiveDate,
    actionKind: p.actionKind,
  });
  if (debt) Object.assign(c, debt);
  await t.db.execute(
    sql`UPDATE finance.financial_action SET description=${p.description} ${"reference" in p ? sql`,reference=${p.reference ?? null}` : sql``} ${"notes" in p ? sql`,notes=${p.notes ?? null}` : sql``} WHERE workspace_id=${workspaceId}::uuid AND id=${actionId}::uuid`,
  );
  const attribution = { userId, workspaceId, requestId, clientCommandId };
  switch (p.actionKind) {
    case "payment_reclassification":
      return resolvePaymentClearingInTransaction(
        t,
        {
          ...attribution,
          ...withoutKind(p),
          reason: b.reason,
          expectedFinancialRevision: b.expectedFinancialRevision,
        },
        c,
      );
    case "opening_cash": {
      const account = await readAccountBalanceAt(t, {
        workspaceId,
        financialAccountId: p.financialAccountId,
        cutoffDate: p.effectiveDate,
      });
      if (
        p.effectiveDate !== account.openingCutoffDate ||
        p.effectiveDate !== current.effectiveDate ||
        current.evidence.accountId !== p.financialAccountId
      )
        throw new RangeError(
          "Opening baseline correction must retain its account and coverage cutoff. Coverage changes require explicit rebaselining with reconciliation.",
        );
      const warnings = await reviewCashChanges(t, {
        workspaceId,
        acknowledgeNegativeBalance: p.acknowledgeNegativeBalance,
        excludeRevisionId: c.previousRevisionId,
        changes: [
          {
            accountId: p.financialAccountId,
            effectiveDate: p.effectiveDate,
            signedMinor: BigInt(p.amountMinor),
          },
        ],
      });
      const equity = await t.db.execute<{ id: string }>(
          sql`SELECT p.ledger_account_id AS id FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='opening_equity' WHERE p.workspace_id=${workspaceId}::uuid AND p.action_revision_id=${c.previousRevisionId}::uuid LIMIT 1`,
        ),
        journalId = randomUUID(),
        scope = { workspaceId, actionId, actionRevisionId: c.actionRevisionId };
      if (!equity.rows[0])
        throw new RangeError("Opening equity evidence is unavailable.");
      await t.db.insert(journal).values({
        ...scope,
        id: journalId,
        sequenceNo: 1,
        effectiveDate,
        currency: w.currency,
        role: "economic",
      });
      await t.db.insert(posting).values([
        {
          ...scope,
          journalId,
          id: randomUUID(),
          currency: w.currency,
          lineNo: 1,
          ledgerAccountId: account.ledgerAccountId,
          amountMinor: BigInt(p.amountMinor),
          cashFlowKind: "opening",
          cashFlowDirection: "baseline",
        },
        {
          ...scope,
          journalId,
          id: randomUUID(),
          currency: w.currency,
          lineNo: 2,
          ledgerAccountId: equity.rows[0].id,
          amountMinor: -BigInt(p.amountMinor),
        },
      ]);
      return finish(
        t,
        a,
        c,
        effectiveDate,
        {
          ...p,
          accountId: p.financialAccountId,
          baselineBeforeMinor: current.evidence.amountMinor,
          baselineAfterMinor: p.amountMinor,
          negativeBalanceWarnings: warnings,
        },
        journalId,
      );
    }
    case "opening_debt": {
      if (
        !debt ||
        p.debtId !== debt.debtId ||
        p.effectiveDate !== debt.openingCutoffDate ||
        new Set(p.components.map((c) => c.liabilityComponent)).size !==
          p.components.length
      )
        throw new RangeError(
          "Debt opening correction must retain its debt, coverage cutoff and unique liability components.",
        );
      const total = p.components.reduce(
        (s, c) => s + BigInt(c.amountMinor),
        0n,
      );
      if (total > 100000000000n)
        throw new RangeError("Opening liability exceeds the financial limit.");
      const equity = await t.db.execute<{ id: string }>(
          sql`SELECT p.ledger_account_id AS id FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='opening_equity' WHERE p.workspace_id=${workspaceId}::uuid AND p.action_revision_id=${c.previousRevisionId}::uuid LIMIT 1`,
        ),
        journalId = randomUUID(),
        scope = { workspaceId, actionId, actionRevisionId: c.actionRevisionId };
      if (!equity.rows[0])
        throw new RangeError("Opening equity evidence is unavailable.");
      const unknown = p.components.some(
          (c) => c.liabilityComponent === "unclassified",
        ),
        known = p.components.some(
          (c) => c.liabilityComponent !== "unclassified",
        );
      await t.db.execute(
        sql`UPDATE finance.debt SET breakdown_status=${unknown ? (known ? "partial" : "unknown") : "known"},version=version+1,updated_at=clock_timestamp() WHERE workspace_id=${workspaceId}::uuid AND id=${p.debtId}::uuid`,
      );
      await t.db.insert(journal).values({
        ...scope,
        id: journalId,
        sequenceNo: 1,
        effectiveDate,
        currency: w.currency,
        role: "economic",
      });
      await t.db
        .insert(debtActionLink)
        .values({ ...scope, debtId: p.debtId, purpose: "opening" });
      await t.db.insert(posting).values([
        ...p.components.map((component, i) => ({
          ...scope,
          journalId,
          id: randomUUID(),
          currency: w.currency,
          lineNo: i + 1,
          ledgerAccountId: debt.liabilityLedgerId,
          amountMinor: -BigInt(component.amountMinor),
          liabilityComponent: component.liabilityComponent,
        })),
        {
          ...scope,
          journalId,
          id: randomUUID(),
          currency: w.currency,
          lineNo: p.components.length + 1,
          ledgerAccountId: equity.rows[0].id,
          amountMinor: total,
        },
      ]);
      return finish(
        t,
        a,
        c,
        effectiveDate,
        {
          ...p,
          baselineBefore: current.evidence,
          baselineAfterMinor: total.toString(),
        },
        journalId,
      );
    }
    case "income":
      return recordIncomeInTransaction(
        t,
        { ...attribution, ...withoutKind(p) },
        c,
      );
    case "expense":
      return recordExpenseInTransaction(
        t,
        { ...attribution, ...withoutKind(p) },
        c,
      );
    case "transfer":
      return recordTransferInTransaction(
        t,
        { ...attribution, ...withoutKind(p) },
        c,
      );
    case "refund":
      return recordRefundInTransaction(
        t,
        { ...attribution, ...withoutKind(p) },
        c,
      );
    case "debt_payment": {
      if (
        !debt ||
        p.debtId !== debt.debtId ||
        p.scheduleVersionId !== debt.scheduleVersionId
      )
        throw new RangeError(
          "Review corrected contractual allocations against this debt's current schedule. Older allocation mappings remain historical evidence.",
        );
      const { actionKind: _kind, ...payment } = p;
      void _kind;
      const result = await recordDebtPaymentInTransaction(
        t,
        { ...attribution, ...payment },
        c,
      );
      if (rebuildPaymentSchedule)
        await rebuildCorrectedPaymentSchedule(
          t,
          a,
          c,
          debt.debtId,
          p.paymentDate,
        );
      else await enforceDeferredFinancialConstraints(t);
      return result;
    }
    case "borrowing": {
      if (!debt) throw new RangeError("Borrowing debt is unavailable.");
      // The financial correction retains the debt and finalized schedule.
      // Changing contractual terms is a separate reviewed D9 revision.
      await t.db.execute(
        sql`UPDATE finance.debt SET original_principal_minor=${p.principalMinor}::bigint,start_date=${p.effectiveDate}::date,version=version+1,updated_at=clock_timestamp() WHERE workspace_id=${workspaceId}::uuid AND id=${debt.debtId}::uuid`,
      );
      return recordBorrowingInTransaction(
        t,
        {
          ...attribution,
          name: debt.name,
          lenderName: debt.lenderName,
          productName: debt.productName,
          debtType: debt.debtType as "personal_loan",
          borrowingDate: p.effectiveDate,
          receivingAccountId: p.receivingAccountId,
          principalMinor: p.principalMinor,
          actualReceivedMinor: p.actualReceivedMinor,
          fees: p.fees,
          installments: [],
          scheduleReason: b.reason,
          description: p.description,
          reference: p.reference,
          notes: p.notes,
        },
        c,
      );
    }
    case "balance_adjustment": {
      const originalAdjustment = await t.db.execute<{
        reconciliationId: string | null;
        financialAccountId: string;
      }>(
        sql`SELECT reconciliation_id AS "reconciliationId",financial_account_id AS "financialAccountId" FROM finance.adjustment_detail WHERE workspace_id=${workspaceId}::uuid AND action_revision_id=${c.previousRevisionId}::uuid`,
      );
      const reconciliationId =
        originalAdjustment.rows[0]?.financialAccountId === p.financialAccountId
          ? originalAdjustment.rows[0].reconciliationId
          : null;
      const account = await readAccountBalanceAt(t, {
        workspaceId,
        financialAccountId: p.financialAccountId,
        cutoffDate: p.effectiveDate,
      });
      if (
        account.currency !== w.currency ||
        p.effectiveDate <= account.openingCutoffDate
      )
        throw new RangeError(
          "Adjustment correction must follow the account opening cutoff.",
        );
      const warnings = await reviewCashChanges(t, {
        workspaceId,
        acknowledgeNegativeBalance: p.acknowledgeNegativeBalance,
        excludeRevisionId: c.previousRevisionId,
        changes: [
          {
            accountId: p.financialAccountId,
            effectiveDate: p.effectiveDate,
            signedMinor: BigInt(p.signedAdjustmentMinor),
          },
        ],
      });
      const ids = await insertAccountAdjustment(t, {
        ...a,
        requestId: requestId ?? null,
        receiptId: c.receiptId,
        cashLedgerId: account.ledgerAccountId,
        equityLedgerId: await getOrCreateAdjustmentEquityLedger(t, {
          workspaceId,
          currency: w.currency,
        }),
        currency: w.currency,
        body: {
          clientCommandId,
          financialAccountId: p.financialAccountId,
          effectiveDate: p.effectiveDate,
          signedAdjustmentMinor: p.signedAdjustmentMinor,
          reason: b.reason,
          reconciliationId,
          expectedFinancialRevision: b.expectedFinancialRevision,
          expectedAccountVersion: account.version,
          acknowledgeNegativeBalance: p.acknowledgeNegativeBalance,
        },
        correction: c,
      });
      return finish(
        t,
        a,
        c,
        effectiveDate,
        {
          ...p,
          reason: b.reason,
          reconciliationId,
          negativeBalanceWarnings: warnings,
        },
        ids.journalId,
      );
    }
    case "debt_charge": {
      if (
        !debt ||
        p.debtId !== debt.debtId ||
        p.effectiveDate < debt.startDate ||
        (debt.openingCutoffDate && p.effectiveDate <= debt.openingCutoffDate)
      )
        throw new RangeError(
          "Charge correction must reference the same debt in its tracked period.",
        );
      if (p.categoryId)
        await ensureActiveExpenseCategory(t, {
          workspaceId,
          categoryId: p.categoryId,
          historicalRevisionId: c.previousRevisionId,
        });
      const expenseLedgerId = await getOrCreateSharedExpenseLedger(t, {
          workspaceId,
          currency: w.currency,
        }),
        journalId = randomUUID(),
        expensePostingId = randomUUID(),
        scope = { workspaceId, actionId, actionRevisionId: c.actionRevisionId };
      await t.db.insert(journal).values({
        ...scope,
        id: journalId,
        sequenceNo: 1,
        effectiveDate,
        currency: w.currency,
        role: "economic",
      });
      await t.db
        .insert(debtActionLink)
        .values({ ...scope, debtId: p.debtId, purpose: "charge" });
      await t.db.insert(posting).values([
        {
          ...scope,
          journalId,
          id: expensePostingId,
          currency: w.currency,
          lineNo: 1,
          ledgerAccountId: expenseLedgerId,
          amountMinor: BigInt(p.amountMinor),
          categoryId: p.categoryId,
          expenseClass: "gross",
          memo: p.description,
        },
        {
          ...scope,
          journalId,
          id: randomUUID(),
          currency: w.currency,
          lineNo: 2,
          ledgerAccountId: debt.liabilityLedgerId,
          amountMinor: -BigInt(p.amountMinor),
          liabilityComponent: p.component,
          memo: p.description,
        },
      ]);
      if (p.component === "fee")
        await t.db.insert(feeComponent).values({
          ...scope,
          label: p.description,
          amountMinor: BigInt(p.amountMinor),
          effectiveDate,
          bearingLedgerAccountId: debt.liabilityLedgerId,
          expensePostingId,
          treatment: "capitalized",
        });
      return finish(
        t,
        a,
        c,
        effectiveDate,
        { ...p, kind: p.component, explanation: p.description },
        journalId,
      );
    }
  }
}
export async function correctFinancialActionInTransaction(
  t: ScopedTransaction,
  input: CorrectFinancialActionInput,
) {
  return financialMutationResultSchema.parse(await executeCorrection(t, input));
}
export function correctFinancialAction(input: CorrectFinancialActionInput) {
  return withDomainTransaction(input, (t) =>
    correctFinancialActionInTransaction(t, input),
  );
}
export async function reverseFinancialActionInTransaction(
  t: ScopedTransaction,
  input: z.input<typeof reverseFinancialActionBodySchema> & Actor,
) {
  const { userId, workspaceId, requestId, actionId, ...raw } = input,
    a = actorSchema.parse({ userId, workspaceId, requestId, actionId }),
    b = reverseFinancialActionBodySchema.parse(raw);
  await lockActiveFinancialWorkspace(t, workspaceId);
  const { clientCommandId, ...intent } = b,
    receipt = await claimFinancialCommandReceipt(t, {
      workspaceId,
      clientCommandId,
      commandType: "finance.reverse_financial_action",
      payloadHash: hashFinancialCommandPayload(
        JSON.parse(JSON.stringify({ actionId, ...intent })),
      ),
    });
  if (receipt.kind === "replay")
    return financialMutationResultSchema.parse(receipt.result);
  const { current, debt } = await validateSource(t, a, b);
  const rebuildPaymentSchedule =
    current.actionKind === "debt_payment" &&
    debt &&
    (await mappedPaymentNeedsRevision(
      t,
      a,
      current.actionRevisionId,
      debt.scheduleVersionId,
    ));
  if (["borrowing", "debt_settlement"].includes(current.actionKind))
    throw new RangeError(
      "This action establishes dependent debt evidence. Resolve those dependencies explicitly before reversing it.",
    );
  const cash = await t.db.execute<{
    accountId: string;
    effectiveDate: string;
    signedMinor: string;
  }>(
    sql`SELECT a.id AS "accountId",j.effective_date::text AS "effectiveDate",(-sum(p.amount_minor::numeric))::text AS "signedMinor" FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.financial_account a ON a.workspace_id=p.workspace_id AND a.ledger_account_id=p.ledger_account_id WHERE p.workspace_id=${workspaceId}::uuid AND p.action_revision_id=${current.actionRevisionId}::uuid GROUP BY a.id,j.effective_date`,
  );
  const warnings = await reviewCashChanges(t, {
    workspaceId,
    acknowledgeNegativeBalance: b.acknowledgeNegativeBalance,
    changes: cash.rows.map((row) => ({
      ...row,
      signedMinor: BigInt(row.signedMinor),
    })),
  });
  const c = await beginActionReplacement(t, {
    ...a,
    receiptId: receipt.receiptId,
    current,
    reason: b.reason,
    effectiveDate: current.effectiveDate,
    void: true,
  });
  if (current.actionKind === "opening_cash")
    await t.db.execute(
      sql`UPDATE finance.financial_account SET opening_action_id=NULL,version=version+1,updated_at=clock_timestamp() WHERE workspace_id=${workspaceId}::uuid AND opening_action_id=${actionId}::uuid`,
    );
  const result = await finish(
    t,
    a,
    c,
    current.effectiveDate,
    {
      actionKind: current.actionKind,
      acknowledgeNegativeBalance: b.acknowledgeNegativeBalance,
      negativeBalanceWarnings: warnings,
    },
    undefined,
    true,
    Boolean(rebuildPaymentSchedule),
  );
  if (rebuildPaymentSchedule && debt)
    await rebuildCorrectedPaymentSchedule(
      t,
      a,
      c,
      debt.debtId,
      current.effectiveDate,
    );
  return result;
}
export function reverseFinancialAction(
  input: z.input<typeof reverseFinancialActionBodySchema> & Actor,
) {
  return withDomainTransaction(input, (t) =>
    reverseFinancialActionInTransaction(t, input),
  );
}
export async function getFinancialActionDetailInTransaction(
  t: ScopedTransaction,
  input: { workspaceId: string; actionId: string },
) {
  const current = await readCurrentFinancialAction(
      t,
      input.workspaceId,
      input.actionId,
    ),
    history = await readFinancialActionHistory(
      t,
      input.workspaceId,
      input.actionId,
    ),
    refundSources = await readRefundSources(
      t,
      input.workspaceId,
      current.actionKind === "refund" &&
        typeof current.evidence.purchaseActionId === "string"
        ? current.evidence.purchaseActionId
        : input.actionId,
      current.actionKind === "refund" ? current.actionRevisionId : undefined,
    ),
    clearingSources = await readClearingSources(
      t,
      input.workspaceId,
      input.actionId,
    );
  const rows = await t.db.execute<{ item: Record<string, unknown> }>(
    sql`SELECT jsonb_build_object('accountId',a.id,'accountName',a.name,'effectiveDate',j.effective_date::text,'signedMinor',sum(p.amount_minor::numeric)::text) AS item FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.financial_account a ON a.workspace_id=p.workspace_id AND a.ledger_account_id=p.ledger_account_id WHERE p.workspace_id=${input.workspaceId}::uuid AND p.action_revision_id=${current.actionRevisionId}::uuid GROUP BY a.id,j.effective_date`,
  );
  if (current.actionKind === "opening_debt") {
    const components = await t.db.execute<{
      liabilityComponent: string;
      amountMinor: string;
    }>(
      sql`SELECT p.liability_component AS "liabilityComponent",(-p.amount_minor::numeric)::text AS "amountMinor" FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='debt_liability' WHERE p.workspace_id=${input.workspaceId}::uuid AND p.action_revision_id=${current.actionRevisionId}::uuid ORDER BY p.line_no`,
    );
    current.evidence = { ...current.evidence, components: components.rows };
  }
  if (
    current.actionKind === "payment_reclassification" &&
    typeof current.evidence.paymentId === "string"
  ) {
    const payment = await t.db.execute<{ actionId: string }>(
      sql`SELECT action_id AS "actionId" FROM finance.debt_payment WHERE workspace_id=${input.workspaceId}::uuid AND id=${current.evidence.paymentId}::uuid`,
    );
    if (payment.rows[0]) {
      const sources = await readClearingSources(
        t,
        input.workspaceId,
        payment.rows[0].actionId,
      );
      clearingSources.splice(
        0,
        clearingSources.length,
        ...sources.map((s) => ({
          ...s,
          remainingMinor:
            s.sourceComponentId === current.evidence.sourceComponentId
              ? (
                  BigInt(s.remainingMinor) +
                  BigInt(String(current.evidence.resolvedMinor ?? "0"))
                ).toString()
              : s.remainingMinor,
        })),
      );
    }
  }
  let replacement = projectReplacementIntent(current);
  const installments = await t.db.execute<{
    installmentId: string;
    label: string;
    remainingMinor: string;
  }>(
    sql`SELECT i.id AS "installmentId",'Installment '||i.sequence_no||' due '||i.due_date::text AS label,i.remaining_minor::text AS "remainingMinor" FROM finance.debt_action_link l JOIN finance.current_installment_due_v i ON i.workspace_id=l.workspace_id AND i.debt_id=l.debt_id AND i.disposition='scheduled' WHERE l.workspace_id=${input.workspaceId}::uuid AND l.action_revision_id=${current.actionRevisionId}::uuid ORDER BY i.sequence_no`,
  );
  if (replacement?.actionKind === "debt_payment") {
    const d = await t.db.execute<{ scheduleVersionId: string }>(
      sql`SELECT current_schedule_version_id AS "scheduleVersionId" FROM finance.debt WHERE workspace_id=${input.workspaceId}::uuid AND id=${replacement.debtId}::uuid`,
    );
    if (
      d.rows[0] &&
      replacement.scheduleVersionId !== d.rows[0].scheduleVersionId
    ) {
      // Propose the prior confirmed mapping in the current schedule. The UI
      // exposes every target and still requires fresh explicit confirmation.
      const maps = await t.db.execute<{
        installmentId: string;
        amountMinor: string;
      }>(
        sql`SELECT m.target_installment_id AS "installmentId",sum(m.amount_minor::numeric)::text AS "amountMinor" FROM finance.schedule_allocation_map m JOIN finance.debt_payment_revision p ON p.workspace_id=m.workspace_id AND p.id=m.payment_revision_id WHERE m.workspace_id=${input.workspaceId}::uuid AND p.action_revision_id=${current.actionRevisionId}::uuid AND m.target_schedule_version_id=${d.rows[0].scheduleVersionId}::uuid AND m.target_kind='installment' GROUP BY m.target_installment_id`,
      );
      replacement = {
        ...replacement,
        scheduleVersionId: d.rows[0].scheduleVersionId,
        dueAllocations: maps.rows,
        unappliedContractualMinor: (
          BigInt(replacement.contractualMinor) -
          maps.rows.reduce((s, m) => s + BigInt(m.amountMinor), 0n)
        ).toString(),
      };
    }
  }
  const linkedDebt = await t.db.execute<{ lifecycle: string }>(
    sql`SELECT d.lifecycle FROM finance.debt_action_link l JOIN finance.debt d ON d.workspace_id=l.workspace_id AND d.id=l.debt_id WHERE l.workspace_id=${input.workspaceId}::uuid AND l.action_revision_id=${current.actionRevisionId}::uuid LIMIT 1`,
  );
  const closedDebt =
    linkedDebt.rows[0] && linkedDebt.rows[0].lifecycle !== "active";
  const dependentClosure =
    closedDebt || current.actionKind === "debt_settlement"
      ? "This action has dependent settlement and closing-schedule evidence. Corrections and reversals require an explicit resolution of that closure, which this workflow does not provide."
      : null;
  return {
    current,
    history,
    refundSources,
    clearingSources,
    cashEffects: rows.rows.map((r) => r.item),
    replacement,
    installments: installments.rows,
    ...(dependentClosure
      ? {
          correctionUnavailableReason: dependentClosure,
          reversalUnavailableReason: dependentClosure,
        }
      : {}),
    ...(!dependentClosure && current.actionKind === "borrowing"
      ? {
          reversalUnavailableReason:
            "Borrowing establishes the debt and its initial schedule. Correct its economic fields here; reversing the debt's origin requires explicit dependent-record resolution.",
        }
      : {}),
  };
}
export function getFinancialActionDetail(input: Actor) {
  return withDomainTransaction(input, (t) =>
    getFinancialActionDetailInTransaction(t, input),
  );
}
