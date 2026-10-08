import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  actionRevision,
  debtActionLink,
  debtObligation,
  debtScheduleVersion,
  financialAction,
  journal,
  posting,
  scheduledInstallment,
  scheduleAllocationMap,
  feeComponent,
} from "@/platform/db/schema";
import {
  paymentPoolSchema,
  type RevisionBody,
  type ScheduleRevisionSetup,
  buildScheduleRevisionPreview,
} from "../domain/debt-schedule-revision";

export async function readScheduleContext(
  t: ScopedTransaction,
  input: { workspaceId: string; debtId: string; scheduleVersionId: string },
) {
  const r = await t.db.execute<{
    frequency: ScheduleRevisionSetup["frequency"];
    version_no: number;
  }>(sql`SELECT frequency,version_no FROM finance.debt_schedule_version
    WHERE workspace_id=${input.workspaceId}::uuid AND debt_id=${input.debtId}::uuid AND id=${input.scheduleVersionId}::uuid AND state='finalized'`);
  if (!r.rows[0])
    throw new RangeError("The current finalized schedule is unavailable.");
  return r.rows[0];
}

/** Always return original pools, never map-of-map sources. Current targets
 * merely propose the already-confirmed allocation for the next review. */
export async function readSchedulePaymentPools(
  t: ScopedTransaction,
  input: { workspaceId: string; debtId: string; scheduleVersionId: string },
) {
  const r = await t.db.execute<{ item: unknown }>(sql`
    WITH pools AS (
      SELECT p.id AS payment_id,p.workspace_id,p.paid_against_schedule_version_id,r.primary_effective_date,
        a.id AS source_id,a.amount_minor,a.installment_id,i.due_date
      FROM finance.debt_payment_revision p
      JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id AND f.current_revision_id=p.action_revision_id
      JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted' AND r.change_kind<>'void'
      JOIN finance.payment_due_allocation a ON a.workspace_id=p.workspace_id AND a.payment_revision_id=p.id
      JOIN finance.scheduled_installment i ON i.workspace_id=a.workspace_id AND i.id=a.installment_id
      WHERE p.workspace_id=${input.workspaceId}::uuid AND p.debt_id=${input.debtId}::uuid
      UNION ALL
      SELECT p.id,p.workspace_id,p.paid_against_schedule_version_id,r.primary_effective_date,NULL::uuid,p.unapplied_contractual_minor,NULL::uuid,NULL::date
      FROM finance.debt_payment_revision p
      JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id AND f.current_revision_id=p.action_revision_id
      JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted' AND r.change_kind<>'void'
      WHERE p.workspace_id=${input.workspaceId}::uuid AND p.debt_id=${input.debtId}::uuid AND p.unapplied_contractual_minor>0
    )
    SELECT jsonb_build_object('paymentRevisionId',p.payment_id,'sourceAllocationId',p.source_id,'amountMinor',p.amount_minor::text,
      'paymentDate',p.primary_effective_date::text,'sourceDueDate',p.due_date::text,'currentTargets',
      CASE WHEN p.paid_against_schedule_version_id=${input.scheduleVersionId}::uuid THEN
        jsonb_build_array(jsonb_build_object('obligationId',i.obligation_id,'amountMinor',p.amount_minor::text))
      ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('obligationId',targets.obligation_id,'amountMinor',targets.amount::text)) FROM (
        SELECT ti.obligation_id,sum(m.amount_minor::numeric) AS amount FROM finance.schedule_allocation_map m
        LEFT JOIN finance.scheduled_installment ti ON ti.workspace_id=m.workspace_id AND ti.id=m.target_installment_id
        WHERE m.workspace_id=p.workspace_id AND m.payment_revision_id=p.payment_id AND m.source_allocation_id IS NOT DISTINCT FROM p.source_id
          AND m.target_schedule_version_id=${input.scheduleVersionId}::uuid GROUP BY ti.obligation_id
      ) targets),'[]'::jsonb) END) AS item
    FROM pools p LEFT JOIN finance.scheduled_installment i ON i.workspace_id=p.workspace_id AND i.id=p.installment_id
    ORDER BY p.primary_effective_date,p.payment_id,p.source_id NULLS LAST LIMIT 10001
  `);
  if (r.rows.length > 10000)
    throw new RangeError(
      "This revision exceeds the supported payment-pool limit.",
    );
  return r.rows.map((r) => paymentPoolSchema.parse(r.item));
}

export async function insertScheduleRevision(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    userId: string;
    requestId: string | null;
    body: RevisionBody;
    setup: ScheduleRevisionSetup;
    versionNo: number;
  },
) {
  const { body } = input;
  const preview = buildScheduleRevisionPreview(body, input.setup);
  const scheduleVersionId = randomUUID();
  const scope = { workspaceId: input.workspaceId };
  const attribution = {
    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  };
  await t.db.insert(debtScheduleVersion).values({
    ...scope,
    ...attribution,
    id: scheduleVersionId,
    debtId: body.debtId,
    versionNo: input.versionNo,
    previousVersionId: body.expectedScheduleVersionId,
    effectiveDate: body.effectiveDate,
    revisionKind: body.revisionKind,
    reason: body.reason,
    frequency: body.frequency,
  });
  const entryIds = new Map<string, string>();
  const obligations: Record<string, string> = {};
  for (const [index, e] of preview.entries.entries()) {
    const obligationId = e.obligationId ?? randomUUID();
    if (!e.obligationId)
      await t.db.insert(debtObligation).values({
        ...scope,
        ...attribution,
        id: obligationId,
        debtId: body.debtId,
        externalLabel: `Installment ${index + 1}`,
      });
    const id = randomUUID();
    entryIds.set(e.entryKey, id);
    obligations[e.entryKey] = obligationId;
    await t.db.insert(scheduledInstallment).values({
      ...scope,
      id,
      debtId: body.debtId,
      scheduleVersionId,
      obligationId,
      sequenceNo: index + 1,
      dueDate: e.dueDate,
      contractualMinor: BigInt(e.contractualMinor),
      openingSatisfiedMinor: BigInt(e.openingSatisfiedMinor),
      knownPrincipalMinor:
        e.knownPrincipalMinor === null ? null : BigInt(e.knownPrincipalMinor),
      knownInterestMinor:
        e.knownInterestMinor === null ? null : BigInt(e.knownInterestMinor),
      knownFeeMinor: e.knownFeeMinor === null ? null : BigInt(e.knownFeeMinor),
      breakdownComplete: e.breakdownComplete,
      disposition: e.disposition,
      cancellationReason: e.cancellationReason,
      notes: e.notes,
    });
  }
  if (body.mappings.length)
    await t.db.insert(scheduleAllocationMap).values(
      body.mappings.map((m) => ({
        ...scope,
        id: randomUUID(),
        debtId: body.debtId,
        targetScheduleVersionId: scheduleVersionId,
        paymentRevisionId: m.paymentRevisionId,
        sourceAllocationId: m.sourceAllocationId,
        sourceKind: m.sourceAllocationId ? "allocation" : "unapplied",
        targetInstallmentId: m.targetEntryKey
          ? entryIds.get(m.targetEntryKey)!
          : null,
        targetKind: m.targetEntryKey ? "installment" : "unapplied",
        amountMinor: BigInt(m.amountMinor),
      })),
    );
  return { scheduleVersionId, obligations, preview };
}

/** Explicit provider-confirmed noncash charge, separate from contractual terms. */
export async function insertRevisionCharge(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    userId: string;
    requestId: string | null;
    receiptId: string;
    currency: string;
    liabilityLedgerId: string;
    expenseLedgerId: string;
    body: RevisionBody;
  },
) {
  const c = input.body.recognizedCharge!;
  const ids = {
    actionId: randomUUID(),
    actionRevisionId: randomUUID(),
    journalId: randomUUID(),
  };
  const scope = { workspaceId: input.workspaceId };
  await t.db.insert(financialAction).values({
    ...scope,
    id: ids.actionId,
    originalCommandReceiptId: input.receiptId,
    currentRevisionId: ids.actionRevisionId,
    description: c.explanation,
    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  });
  await t.db.insert(actionRevision).values({
    ...scope,
    id: ids.actionRevisionId,
    actionId: ids.actionId,
    revisionNo: 1,
    changeKind: "create",
    actionKind: "debt_charge",
    commandReceiptId: input.receiptId,
    primaryEffectiveDate: input.body.effectiveDate,
    currency: input.currency,
    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  });
  await t.db.insert(journal).values({
    ...scope,
    id: ids.journalId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    sequenceNo: 1,
    effectiveDate: input.body.effectiveDate,
    currency: input.currency,
    role: "economic",
  });
  await t.db.insert(debtActionLink).values({
    ...scope,
    id: randomUUID(),
    debtId: input.body.debtId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    purpose: "charge",
  });
  const line = {
    ...scope,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    journalId: ids.journalId,
    currency: input.currency,
    memo: c.explanation,
  };
  const expensePostingId = randomUUID();
  await t.db.insert(posting).values([
    {
      ...line,
      id: expensePostingId,
      lineNo: 1,
      ledgerAccountId: input.expenseLedgerId,
      amountMinor: BigInt(c.amountMinor),
      expenseClass: "gross",
      categoryId: c.categoryId,
    },
    {
      ...line,
      id: randomUUID(),
      lineNo: 2,
      ledgerAccountId: input.liabilityLedgerId,
      amountMinor: -BigInt(c.amountMinor),
      liabilityComponent: c.kind,
    },
  ]);
  if (c.kind === "fee")
    await t.db.insert(feeComponent).values({
      ...scope,
      id: randomUUID(),
      actionId: ids.actionId,
      actionRevisionId: ids.actionRevisionId,
      label: c.explanation,
      amountMinor: BigInt(c.amountMinor),
      effectiveDate: input.body.effectiveDate,
      bearingLedgerAccountId: input.liabilityLedgerId,
      expensePostingId,
      treatment: "capitalized",
    });
  return ids;
}

export async function activateScheduleRevision(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    debtId: string;
    scheduleVersionId: string;
    expectedDebtVersion: number;
  },
) {
  await t.db.execute(
    sql`UPDATE finance.debt_schedule_version SET state='finalized',finalized_at=clock_timestamp() WHERE workspace_id=${input.workspaceId}::uuid AND id=${input.scheduleVersionId}::uuid AND state='building'`,
  );
  const r = await t.db.execute<{
    version: number;
  }>(sql`UPDATE finance.debt SET current_schedule_version_id=${input.scheduleVersionId}::uuid
    WHERE workspace_id=${input.workspaceId}::uuid AND id=${input.debtId}::uuid AND version=${input.expectedDebtVersion} RETURNING version`);
  if (!r.rows[0])
    throw new Error("The locked schedule pointer could not be updated.");
  return r.rows[0].version;
}
