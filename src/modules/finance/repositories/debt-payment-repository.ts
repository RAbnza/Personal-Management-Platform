import type { FinancialCorrectionContext } from "./financial-correction-repository";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import type { ValidatedDebtPayment } from "@/modules/finance/domain/debt-payment";
import { FinancialAccountReferenceUnavailableError } from "@/modules/finance/domain/financial-reference";
import type { ScopedTransaction } from "@/platform/db";
import {
  debtPayment,
  debtPaymentRevision,
  paymentComponent,
  paymentDueAllocation,
} from "@/platform/db/schema/debt-payments";
import {
  actionRevision,
  debtActionLink,
  feeComponent,
  financialAction,
  journal,
  ledgerAccount,
  posting,
} from "@/platform/db/schema/finance";

export async function resolvePaymentDebt(
  transaction: ScopedTransaction,
  input: { workspaceId: string; debtId: string },
) {
  const result = await transaction.db.execute<{
    currency: string;
    lifecycle: string;
    start_date: string;
    opening_cutoff_date: string | null;
    liability_ledger_account_id: string;
    clearing_ledger_account_id: string | null;
    current_schedule_version_id: string | null;
    financial_revision: string;
    liability_balances: Record<string, string>;
  }>(sql`
    SELECT d.currency,d.lifecycle,d.start_date::text,d.opening_cutoff_date::text,
      d.liability_ledger_account_id,d.clearing_ledger_account_id,d.current_schedule_version_id,
      w.financial_revision::text,
      COALESCE((SELECT jsonb_object_agg(component,balance) FROM (
        SELECT p.liability_component AS component,(-sum(p.amount_minor::numeric))::text AS balance
        FROM finance.posting p
        JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted'
        JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
        WHERE p.workspace_id=d.workspace_id AND p.ledger_account_id=d.liability_ledger_account_id
        GROUP BY p.liability_component
      ) balances),'{}'::jsonb) AS liability_balances
    FROM finance.debt d JOIN core.workspace w ON w.id=d.workspace_id
    WHERE d.workspace_id=${input.workspaceId}::uuid AND d.id=${input.debtId}::uuid
  `);
  return result.rows[0] ?? null;
}

export async function resolvePaymentAccount(
  transaction: ScopedTransaction,
  input: { workspaceId: string; accountId: string },
) {
  const result = await transaction.db.execute<{
    ledger_account_id: string;
    currency: string;
    opening_cutoff_date: string;
    archived: boolean;
    balance: string;
  }>(sql`
    SELECT a.ledger_account_id,a.currency,a.opening_cutoff_date::text,a.archived_at IS NOT NULL AS archived,
      COALESCE((SELECT sum(p.amount_minor::numeric) FROM finance.posting p
        JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted'
        JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
        WHERE p.workspace_id=a.workspace_id AND p.ledger_account_id=a.ledger_account_id),0)::text AS balance
    FROM finance.financial_account a WHERE a.workspace_id=${input.workspaceId}::uuid AND a.id=${input.accountId}::uuid
  `);
  if (!result.rows[0])
    throw new FinancialAccountReferenceUnavailableError("funding");
  return result.rows[0];
}

export async function ensurePaymentClearingLedger(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    debtId: string;
    currency: string;
    existingId: string | null;
  },
) {
  if (input.existingId) return input.existingId;
  const id = randomUUID();
  await transaction.db.insert(ledgerAccount).values({
    id,
    workspaceId: input.workspaceId,
    code: `debt-clearing:${input.debtId}`,
    name: "Debt payment clearing",
    kind: "payment_clearing_asset",
    currency: input.currency,
  });
  await transaction.db
    .execute(sql`UPDATE finance.debt SET clearing_ledger_account_id=${id}::uuid,version=version+1,updated_at=clock_timestamp()
    WHERE workspace_id=${input.workspaceId}::uuid AND id=${input.debtId}::uuid AND clearing_ledger_account_id IS NULL`);
  return id;
}

export async function insertDebtPayment(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    userId: string;
    requestId: string | null;
    receiptId: string;
    currency: string;
    body: ValidatedDebtPayment;
    correction?: FinancialCorrectionContext | undefined;
    actionKind?: "debt_payment" | "debt_settlement";
    payingLedgerId: string;
    liabilityLedgerId: string;
    clearingLedgerId: string | null;
    expenseLedgerId: string | null;
  },
) {
  const ids = {
    paymentId: input.correction?.paymentId ?? randomUUID(),
    paymentRevisionId: randomUUID(),
    actionId: input.correction?.actionId ?? randomUUID(),
    actionRevisionId: input.correction?.actionRevisionId ?? randomUUID(),
    journalId: randomUUID(),
  };
  const scope = { workspaceId: input.workspaceId };
  const attribution = {
    actorKind: "user" as const,
    recordedByUserId: input.userId,
    requestId: input.requestId,
  };
  const body = input.body;
  if (!input.correction) {
    await transaction.db.insert(financialAction).values({
      ...scope,
      ...attribution,
      id: ids.actionId,
      originalCommandReceiptId: input.receiptId,
      currentRevisionId: ids.actionRevisionId,
      description: body.description,
      reference: body.reference,
      notes: body.notes,
    });
    await transaction.db.insert(actionRevision).values({
      ...scope,
      ...attribution,
      id: ids.actionRevisionId,
      actionId: ids.actionId,
      revisionNo: 1,
      commandReceiptId: input.receiptId,
      changeKind: "create",
      actionKind: input.actionKind ?? "debt_payment",
      primaryEffectiveDate: body.paymentDate,
      currency: input.currency,
    });
  }
  await transaction.db.insert(debtActionLink).values({
    ...scope,
    debtId: body.debtId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    purpose: input.actionKind === "debt_settlement" ? "settlement" : "payment",
  });
  if (!input.correction) {
    await transaction.db.insert(debtPayment).values({
      ...scope,
      ...attribution,
      id: ids.paymentId,
      debtId: body.debtId,
      actionId: ids.actionId,
    });
  }
  await transaction.db.insert(debtPaymentRevision).values({
    ...scope,
    id: ids.paymentRevisionId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    paymentId: ids.paymentId,
    debtId: body.debtId,
    paidAgainstScheduleVersionId: body.scheduleVersionId,
    payingAccountId: body.payingAccountId,
    actualPaidMinor: BigInt(body.actualPaidMinor),
    contractualMinor: BigInt(body.contractualMinor),
    externalFeeMinor: BigInt(body.externalFeeMinor),
    unappliedContractualMinor: BigInt(body.unappliedContractualMinor),
    allocationCertainty: body.allocationCertainty,
  });
  await transaction.db.insert(journal).values({
    ...scope,
    id: ids.journalId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    sequenceNo: 1,
    effectiveDate: body.paymentDate,
    currency: input.currency,
    role: "economic",
  });
  const line = {
    ...scope,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    journalId: ids.journalId,
    currency: input.currency,
  };
  let lineNo = 1;
  // Separate reporting legs share one economic action/journal. Their combined
  // deduction is actual paid, never actual paid plus the contractual amount.
  for (const [amount, kind] of [
    [body.contractualMinor, "debt_payment"],
    [body.externalFeeMinor, "fee"],
  ] as const) {
    if (BigInt(amount) === 0n) continue;
    await transaction.db.insert(posting).values({
      ...line,
      id: randomUUID(),
      lineNo: lineNo++,
      ledgerAccountId: input.payingLedgerId,
      amountMinor: -BigInt(amount),
      cashFlowKind: kind,
      cashFlowDirection: "out",
      memo: body.description,
    });
  }
  const components = [
    ...body.components,
    ...(BigInt(body.externalFeeMinor) === 0n
      ? []
      : [
          {
            disposition: "external_fee" as const,
            amountMinor: body.externalFeeMinor,
            liabilityComponent: null,
            categoryId: body.externalFeeCategoryId,
            label: body.externalFeeLabel,
          },
        ]),
  ];
  for (const component of components) {
    const isLiability = component.disposition === "liability_reduction";
    const isClearing =
      component.disposition === "clearing" ||
      component.disposition === "advance";
    const ledgerId = isLiability
      ? input.liabilityLedgerId
      : isClearing
        ? input.clearingLedgerId
        : input.expenseLedgerId;
    if (!ledgerId) throw new Error("Payment accounting ledger unavailable.");
    const postingId = randomUUID();
    await transaction.db.insert(posting).values({
      ...line,
      id: postingId,
      lineNo: lineNo++,
      ledgerAccountId: ledgerId,
      amountMinor: BigInt(component.amountMinor),
      liabilityComponent: component.liabilityComponent,
      expenseClass: isLiability || isClearing ? "none" : "gross",
      categoryId: component.categoryId,
      memo: component.label,
    });
    const feeId =
      component.disposition === "new_fee" ||
      component.disposition === "external_fee"
        ? randomUUID()
        : null;
    if (feeId)
      await transaction.db.insert(feeComponent).values({
        ...scope,
        id: feeId,
        actionId: ids.actionId,
        actionRevisionId: ids.actionRevisionId,
        label: component.label,
        amountMinor: BigInt(component.amountMinor),
        effectiveDate: body.paymentDate,
        bearingLedgerAccountId: input.payingLedgerId,
        expensePostingId: postingId,
        treatment: "source_additional",
      });
    await transaction.db.insert(paymentComponent).values({
      ...scope,
      id: randomUUID(),
      debtId: body.debtId,
      paymentRevisionId: ids.paymentRevisionId,
      postingId,
      disposition: component.disposition,
      amountMinor: BigInt(component.amountMinor),
      feeComponentId: feeId,
    });
  }
  if (body.dueAllocations.length)
    await transaction.db.insert(paymentDueAllocation).values(
      body.dueAllocations.map((allocation) => ({
        ...scope,
        id: randomUUID(),
        debtId: body.debtId,
        paymentRevisionId: ids.paymentRevisionId,
        scheduleVersionId: body.scheduleVersionId,
        installmentId: allocation.installmentId,
        amountMinor: BigInt(allocation.amountMinor),
      })),
    );
  return { ...ids, nextLineNo: lineNo };
}
