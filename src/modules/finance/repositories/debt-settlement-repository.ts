import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  actionRevision,
  debtActionLink,
  debtScheduleVersion,
  debtSettlement,
  feeComponent,
  financialAction,
  journal,
  posting,
  scheduledInstallment,
  scheduleAllocationMap,
  settlementComponent,
} from "@/platform/db/schema";
import {
  settlementAdjustmentTreatment,
  type SettlementBody,
  type SettlementPreview,
  type SettlementSetup,
} from "../domain/debt-settlement";
import { insertDebtPayment } from "./debt-payment-repository";

export async function readSettlementChargeSources(
  t: ScopedTransaction,
  input: { workspaceId: string; debtId: string },
) {
  const r = await t.db.execute<{
    postingId: string;
    label: string;
    kind: "interest" | "fee" | "penalty";
    amountMinor: string;
    effectiveDate: string;
  }>(sql`SELECT DISTINCT p.id AS "postingId",COALESCE(p.memo,'Recognized charge') AS label,lp.liability_component AS kind,p.amount_minor::text AS "amountMinor",j.effective_date::text AS "effectiveDate" FROM finance.posting p
 JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='expense'
 JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted'
 JOIN finance.financial_action a ON a.workspace_id=p.workspace_id AND a.current_revision_id=p.action_revision_id
 JOIN finance.debt_action_link dl ON dl.workspace_id=p.workspace_id AND dl.action_revision_id=p.action_revision_id AND dl.purpose IN ('charge','borrowing')
 JOIN finance.debt d ON d.workspace_id=dl.workspace_id AND d.id=dl.debt_id
 JOIN finance.posting lp ON lp.workspace_id=p.workspace_id AND lp.action_revision_id=p.action_revision_id AND lp.ledger_account_id=d.liability_ledger_account_id AND lp.liability_component IN ('interest','fee','penalty') AND lp.amount_minor::numeric=-p.amount_minor::numeric
 WHERE p.workspace_id=${input.workspaceId}::uuid AND dl.debt_id=${input.debtId}::uuid AND p.expense_class='gross' AND p.amount_minor>0 ORDER BY "effectiveDate","postingId" LIMIT 10001`);
  if (r.rows.length > 10000)
    throw new RangeError(
      "Recognized charge history exceeds the supported settlement review limit.",
    );
  return r.rows;
}

export async function readDebtSettlement(
  t: ScopedTransaction,
  input: { workspaceId: string; debtId: string },
) {
  const r = await t.db.execute<{ item: unknown }>(
    sql`SELECT jsonb_build_object('settlementId',s.id,'actionId',s.action_id,'actionRevisionId',s.action_revision_id,'paymentId',s.payment_id,'priorScheduleVersionId',s.prior_schedule_version_id,'closingScheduleVersionId',s.closing_schedule_version_id,'settlementDate',s.settlement_date::text,'settlementKind',s.settlement_kind,'confirmedPayoffMinor',s.confirmed_payoff_minor::text,'actualCashPaidMinor',s.actual_cash_paid_minor::text,'resolvedUnappliedMinor',s.resolved_unapplied_minor::text,'unappliedResolutionNote',s.unapplied_resolution_note,'providerReference',s.provider_reference,'reason',s.reason,'confirmationSource',s.confirmation_source,'confirmationNote',s.confirmation_note,'components',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',c.component_kind,'amountMinor',c.amount_minor::text,'liabilityComponent',c.liability_component,'recognizedSourcePostingId',c.recognized_source_posting_id,'effectPostingId',c.effect_posting_id,'unknownOpening',c.unknown_opening,'roundingTreatment',c.rounding_treatment,'explanation',c.explanation) ORDER BY c.created_at,c.id) FROM finance.settlement_component c WHERE c.workspace_id=s.workspace_id AND c.settlement_id=s.id),'[]'::jsonb)) AS item FROM finance.debt_settlement s WHERE s.workspace_id=${input.workspaceId}::uuid AND s.debt_id=${input.debtId}::uuid`,
  );
  return r.rows[0]?.item ?? null;
}

export async function readWaiverSource(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    debtId: string;
    sourceId: string;
    component: string;
    date: string;
  },
) {
  const r = await t.db.execute<{
    id: string;
    ledger_account_id: string;
    category_id: string | null;
    amount: string;
  }>(sql`SELECT p.id,p.ledger_account_id,p.category_id,p.amount_minor::text AS amount FROM finance.posting p
 JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='expense'
 JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' AND j.effective_date<=${input.date}::date
 JOIN finance.financial_action a ON a.workspace_id=p.workspace_id AND a.current_revision_id=p.action_revision_id
 JOIN finance.debt_action_link dl ON dl.workspace_id=p.workspace_id AND dl.action_revision_id=p.action_revision_id AND dl.purpose IN ('charge','borrowing')
 WHERE p.workspace_id=${input.workspaceId}::uuid AND p.id=${input.sourceId}::uuid AND dl.debt_id=${input.debtId}::uuid AND p.expense_class='gross' AND p.amount_minor>0
 AND EXISTS(SELECT 1 FROM finance.posting lp JOIN finance.debt d ON d.workspace_id=lp.workspace_id AND d.liability_ledger_account_id=lp.ledger_account_id WHERE lp.workspace_id=p.workspace_id AND lp.action_revision_id=p.action_revision_id AND d.id=dl.debt_id AND lp.liability_component=${input.component} AND lp.amount_minor::numeric=-p.amount_minor::numeric)`);
  return r.rows[0] ?? null;
}
export async function readOpeningWaiverCapacity(
  t: ScopedTransaction,
  input: { workspaceId: string; debtId: string; component: string },
) {
  const r = await t.db.execute<{ amount: string }>(
    sql`SELECT COALESCE(-sum(p.amount_minor::numeric),0)::text AS amount FROM finance.posting p JOIN finance.debt d ON d.workspace_id=p.workspace_id AND d.liability_ledger_account_id=p.ledger_account_id JOIN finance.debt_action_link dl ON dl.workspace_id=p.workspace_id AND dl.action_revision_id=p.action_revision_id AND dl.debt_id=d.id AND dl.purpose='opening' WHERE d.workspace_id=${input.workspaceId}::uuid AND d.id=${input.debtId}::uuid AND p.liability_component=${input.component}`,
  );
  return BigInt(r.rows[0]?.amount ?? "0");
}
export async function latestDebtActivityDate(
  t: ScopedTransaction,
  input: { workspaceId: string; debtId: string },
) {
  const r = await t.db.execute<{ date: string | null }>(
    sql`SELECT max(j.effective_date)::text AS date FROM finance.journal j JOIN finance.debt_action_link dl ON dl.workspace_id=j.workspace_id AND dl.action_revision_id=j.action_revision_id WHERE dl.workspace_id=${input.workspaceId}::uuid AND dl.debt_id=${input.debtId}::uuid AND j.state='posted'`,
  );
  return r.rows[0]?.date ?? null;
}

export async function insertSettlement(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    userId: string;
    requestId: string | null;
    receiptId: string;
    currency: string;
    liabilityLedgerId: string;
    payingLedgerId: string | null;
    expenseLedgerId: string | null;
    adjustmentLedgerId: string | null;
    body: SettlementBody;
    setup: SettlementSetup;
    preview: SettlementPreview;
    waiverSources: Map<
      string,
      NonNullable<Awaited<ReturnType<typeof readWaiverSource>>>
    >;
  },
) {
  const { body: b } = input;
  const scope = { workspaceId: input.workspaceId };
  const attribution = {
    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  };
  const closingScheduleVersionId = randomUUID(),
    settlementId = randomUUID();
  await t.db.insert(debtScheduleVersion).values({
    ...scope,
    ...attribution,
    id: closingScheduleVersionId,
    debtId: b.debtId,
    versionNo: input.setup.versionNo + 1,
    previousVersionId: b.expectedScheduleVersionId,
    effectiveDate: b.settlementDate,
    revisionKind: "settlement",
    reason: b.reason,
    frequency: input.setup.frequency,
  });
  let ids: {
    actionId: string;
    actionRevisionId: string;
    journalId: string | null;
    paymentId: string | null;
    paymentRevisionId: string | null;
    nextLineNo: number;
  };
  if (BigInt(b.actualCashPaidMinor) > 0n) {
    ids = await insertDebtPayment(t, {
      ...input,
      body: {
        clientCommandId: b.clientCommandId,
        debtId: b.debtId,
        payingAccountId: b.payingAccountId!,
        paymentDate: b.settlementDate,
        scheduleVersionId: b.expectedScheduleVersionId,
        expectedFinancialRevision: b.expectedFinancialRevision,
        actualPaidMinor: b.actualCashPaidMinor,
        contractualMinor: b.confirmedPayoffMinor,
        externalFeeMinor: b.externalFeeMinor,
        externalFeeLabel: b.externalFeeLabel,
        externalFeeCategoryId: b.externalFeeCategoryId,
        allocationCertainty: b.liabilityPayments.every(
          (p) => p.kind === "unclassified",
        )
          ? "confirmed_total"
          : "known_components",
        components: b.liabilityPayments.map((p) => ({
          disposition: "liability_reduction",
          amountMinor: p.amountMinor,
          liabilityComponent: p.kind,
          categoryId: null,
          label: `Settlement ${p.kind} repayment`,
        })),
        dueAllocations: b.dueAllocations,
        unappliedContractualMinor: b.unappliedContractualMinor,
        dueAllocationConfirmed: true,
        confirmationSource: b.confirmationSource,
        confirmationNote: b.confirmationNote,
        acknowledgeNegativeBalance: b.acknowledgeNegativeBalance,
        description: b.reason,
        reference: b.providerReference,
        notes: null,
      },
      payingLedgerId: input.payingLedgerId!,
      clearingLedgerId: null,
      actionKind: "debt_settlement",
    });
  } else {
    ids = {
      actionId: randomUUID(),
      actionRevisionId: randomUUID(),
      journalId: b.adjustments.some((a) => a.kind !== "avoided_future_charge")
        ? randomUUID()
        : null,
      paymentId: null,
      paymentRevisionId: null,
      nextLineNo: 1,
    };
    await t.db.insert(financialAction).values({
      ...scope,
      ...attribution,
      id: ids.actionId,
      originalCommandReceiptId: input.receiptId,
      currentRevisionId: ids.actionRevisionId,
      description: b.reason,
      reference: b.providerReference,
    });
    await t.db.insert(actionRevision).values({
      ...scope,
      ...attribution,
      id: ids.actionRevisionId,
      actionId: ids.actionId,
      revisionNo: 1,
      changeKind: "create",
      actionKind: "debt_settlement",
      commandReceiptId: input.receiptId,
      primaryEffectiveDate: b.settlementDate,
      currency: input.currency,
    });
    await t.db.insert(debtActionLink).values({
      ...scope,
      debtId: b.debtId,
      actionId: ids.actionId,
      actionRevisionId: ids.actionRevisionId,
      purpose: "settlement",
    });
    if (ids.journalId)
      await t.db.insert(journal).values({
        ...scope,
        id: ids.journalId,
        actionId: ids.actionId,
        actionRevisionId: ids.actionRevisionId,
        sequenceNo: 1,
        effectiveDate: b.settlementDate,
        currency: input.currency,
        role: "economic",
      });
  }
  await t.db.insert(debtSettlement).values({
    ...scope,
    ...attribution,
    id: settlementId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    debtId: b.debtId,
    paymentId: ids.paymentId,
    priorScheduleVersionId: b.expectedScheduleVersionId,
    closingScheduleVersionId,
    settlementDate: b.settlementDate,
    confirmedPayoffMinor: BigInt(b.confirmedPayoffMinor),
    actualCashPaidMinor: BigInt(b.actualCashPaidMinor),
    settlementKind: b.settlementKind,
    providerReference: b.providerReference,
    reason: b.reason,
    resolvedUnappliedMinor: BigInt(input.preview.resolvedUnappliedMinor),
    unappliedResolutionNote: b.unappliedResolutionNote,
    confirmationSource: b.confirmationSource,
    confirmationNote: b.confirmationNote,
  });
  let lineNo = ids.nextLineNo;
  for (const a of b.adjustments) {
    let effectId: string | null = null,
      counterId: string | null = null,
      sourceId = a.recognizedSourcePostingId;
    if (a.kind !== "avoided_future_charge") {
      effectId = randomUUID();
      counterId = randomUUID();
      const source = sourceId ? input.waiverSources.get(sourceId) : null;
      const charge = settlementAdjustmentTreatment(a) === "recognized_charge";
      const counterLedger = charge
        ? input.expenseLedgerId
        : a.unknownOpening
          ? input.adjustmentLedgerId
          : source?.ledger_account_id;
      if (!counterLedger || !ids.journalId)
        throw new Error("Settlement accounting ledger unavailable.");
      const line = {
        ...scope,
        actionId: ids.actionId,
        actionRevisionId: ids.actionRevisionId,
        journalId: ids.journalId,
        currency: input.currency,
        memo: a.explanation,
      };
      const amount = BigInt(a.amountMinor);
      await t.db.insert(posting).values([
        {
          ...line,
          id: effectId,
          lineNo: lineNo++,
          ledgerAccountId: input.liabilityLedgerId,
          amountMinor: charge ? -amount : amount,
          liabilityComponent: a.liabilityComponent,
        },
        {
          ...line,
          id: counterId,
          lineNo: lineNo++,
          ledgerAccountId: counterLedger,
          amountMinor: charge ? amount : -amount,
          expenseClass: charge
            ? "gross"
            : a.unknownOpening
              ? "none"
              : "waiver_offset",
          categoryId: charge ? a.categoryId : (source?.category_id ?? null),
        },
      ]);
      if (charge) {
        sourceId = counterId;
        if (a.liabilityComponent === "fee")
          await t.db.insert(feeComponent).values({
            ...scope,
            id: randomUUID(),
            actionId: ids.actionId,
            actionRevisionId: ids.actionRevisionId,
            label: a.explanation,
            amountMinor: amount,
            effectiveDate: b.settlementDate,
            bearingLedgerAccountId: input.liabilityLedgerId,
            expensePostingId: counterId,
            treatment: "capitalized",
          });
      }
    }
    await t.db.insert(settlementComponent).values({
      ...scope,
      id: randomUUID(),
      settlementId,
      componentKind: a.kind,
      roundingTreatment: a.roundingTreatment,
      amountMinor: BigInt(a.amountMinor),
      recognizedSourcePostingId: sourceId,
      effectPostingId: effectId,
      counterPostingId: counterId,
      liabilityComponent: a.liabilityComponent,
      unknownOpening: a.unknownOpening,
      explanation: a.explanation,
    });
  }
  const targets = new Map<string, string>();
  for (const e of input.preview.entries) {
    const old = input.setup.detail.installments.find(
      (i) => i.obligationId === e.obligationId,
    )!;
    const id = randomUUID();
    targets.set(e.obligationId, id);
    await t.db.insert(scheduledInstallment).values({
      ...scope,
      id,
      debtId: b.debtId,
      scheduleVersionId: closingScheduleVersionId,
      obligationId: e.obligationId,
      sequenceNo: old.sequenceNo,
      dueDate: old.dueDate,
      contractualMinor: BigInt(old.contractualMinor),
      openingSatisfiedMinor: BigInt(old.openingSatisfiedMinor),
      knownPrincipalMinor:
        old.knownPrincipalMinor === null
          ? null
          : BigInt(old.knownPrincipalMinor),
      knownInterestMinor:
        old.knownInterestMinor === null ? null : BigInt(old.knownInterestMinor),
      knownFeeMinor:
        old.knownFeeMinor === null ? null : BigInt(old.knownFeeMinor),
      breakdownComplete: old.breakdownComplete,
      disposition: e.disposition,
      cancellationReason:
        e.disposition === "cancelled"
          ? (old.cancellationReason ?? b.reason)
          : null,
      notes: old.notes,
    });
  }
  const maps = b.poolMappings.map((m) => ({
    ...scope,
    id: randomUUID(),
    debtId: b.debtId,
    targetScheduleVersionId: closingScheduleVersionId,
    paymentRevisionId: m.paymentRevisionId,
    sourceAllocationId: m.sourceAllocationId,
    sourceKind: m.sourceAllocationId ? "allocation" : "unapplied",
    targetInstallmentId: m.targetObligationId
      ? targets.get(m.targetObligationId)!
      : null,
    targetKind: m.targetObligationId ? "installment" : "unapplied",
    amountMinor: BigInt(m.amountMinor),
  }));
  if (ids.paymentRevisionId) {
    const allocations = await t.db.execute<{
      id: string;
      installment_id: string;
      amount: string;
    }>(
      sql`SELECT id,installment_id,amount_minor::text AS amount FROM finance.payment_due_allocation WHERE workspace_id=${input.workspaceId}::uuid AND payment_revision_id=${ids.paymentRevisionId}::uuid`,
    );
    for (const a of allocations.rows) {
      const old = input.setup.detail.installments.find(
        (i) => i.installmentId === a.installment_id,
      )!;
      maps.push({
        ...scope,
        id: randomUUID(),
        debtId: b.debtId,
        targetScheduleVersionId: closingScheduleVersionId,
        paymentRevisionId: ids.paymentRevisionId,
        sourceAllocationId: a.id,
        sourceKind: "allocation",
        targetInstallmentId: targets.get(old.obligationId)!,
        targetKind: "installment",
        amountMinor: BigInt(a.amount),
      });
    }
    if (BigInt(b.unappliedContractualMinor) > 0n)
      maps.push({
        ...scope,
        id: randomUUID(),
        debtId: b.debtId,
        targetScheduleVersionId: closingScheduleVersionId,
        paymentRevisionId: ids.paymentRevisionId,
        sourceAllocationId: null,
        sourceKind: "unapplied",
        targetInstallmentId: null,
        targetKind: "unapplied",
        amountMinor: BigInt(b.unappliedContractualMinor),
      });
  }
  if (maps.length) await t.db.insert(scheduleAllocationMap).values(maps);
  return { ...ids, settlementId, closingScheduleVersionId };
}

export async function closeSettledDebt(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    body: SettlementBody;
    closingScheduleVersionId: string;
  },
) {
  await t.db.execute(
    sql`UPDATE finance.debt_schedule_version SET state='finalized',finalized_at=now() WHERE workspace_id=${input.workspaceId}::uuid AND id=${input.closingScheduleVersionId}::uuid`,
  );
  const r = await t.db.execute<{ version: number }>(
    sql`UPDATE finance.debt SET current_schedule_version_id=${input.closingScheduleVersionId}::uuid,lifecycle=${input.body.settlementKind === "early" ? "settled_early" : "settled"},closed_at=now() WHERE workspace_id=${input.workspaceId}::uuid AND id=${input.body.debtId}::uuid AND version=${input.body.expectedDebtVersion} AND lifecycle='active' RETURNING version`,
  );
  if (!r.rows[0]) throw new RangeError("The debt changed before settlement.");
  return r.rows[0].version;
}
