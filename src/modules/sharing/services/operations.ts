import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  SharingConflictError,
  SharingUnavailableError,
  type GroupCommand,
} from "../domain/sharing";
import { previewSettlement } from "../domain/balances";
import { readGroupLedger } from "./ledger";

export type OperationalCommand = Extract<
  GroupCommand,
  { kind: "settlement" | "settlement_transition" | "refund" }
>;
export async function executeGroupOperation(
  t: ScopedTransaction,
  c: OperationalCommand,
  g: { participantId: string; owner: boolean },
  receipt: string,
) {
  const ledger = await readGroupLedger(t, c.groupId);
  if (c.kind === "settlement") {
    if (c.recipientId === g.participantId)
      throw new RangeError("Choose another recipient.");
    const participant = (
      await t.db.execute(
        sql`SELECT id FROM sharing.participant WHERE group_id=${c.groupId}::uuid AND id=${c.recipientId}::uuid`,
      )
    ).rows[0];
    if (!participant) throw new SharingUnavailableError();
    if (c.mode !== "selected" && c.allocations.length)
      throw new RangeError(
        "Only selected-expense mode accepts explicit allocations.",
      );
    if (c.mode === "selected" && !c.allocations.length)
      throw new RangeError("Select at least one bill allocation.");
    const preview = previewSettlement(
      ledger.sources,
      ledger.settlements,
      g.participantId,
      c.recipientId,
      c.amountMinor,
      c.mode === "selected" ? c.allocations : undefined,
    );
    if (c.mode === "full" && preview.dueMinor !== c.amountMinor)
      throw new SharingConflictError(
        "The full relationship balance changed. Review the current amount.",
      );
    if (
      (BigInt(preview.advanceMinor) > 0n ||
        BigInt(preview.projectedRelationshipMinor) < 0n) &&
      !c.acknowledgeAdvance
    )
      throw new RangeError(
        "Acknowledge the unallocated advance/reverse position before reporting this payment.",
      );
    const subjectId = randomUUID();
    await t.db.execute(
      sql`INSERT INTO sharing.settlement(id,group_id,sender_id,recipient_id,reported_by,amount_minor,advance_minor,mode,payment_date,note,original_receipt_id) VALUES(${subjectId}::uuid,${c.groupId}::uuid,${g.participantId}::uuid,${c.recipientId}::uuid,${g.participantId}::uuid,${c.amountMinor}::bigint,${preview.advanceMinor}::bigint,${c.mode},${c.paymentDate}::date,${c.note},${receipt}::uuid)`,
    );
    for (const a of preview.allocations)
      await t.db.execute(
        sql`INSERT INTO sharing.settlement_allocation(group_id,settlement_id,expense_id,source_revision_id,amount_minor) VALUES(${c.groupId}::uuid,${subjectId}::uuid,${a.expenseId}::uuid,${a.sourceRevisionId}::uuid,${a.amountMinor}::bigint)`,
      );
    await t.db.execute(
      sql`INSERT INTO sharing.settlement_event(group_id,settlement_id,version,actor_id,receipt_id,to_state,confirmation_type,reason) VALUES(${c.groupId}::uuid,${subjectId}::uuid,1,${g.participantId}::uuid,${receipt}::uuid,'pending','reported',${c.acknowledgeAdvance ? "Sender reported payment; explicitly acknowledged unallocated advance/reverse position." : "Sender reported payment. Recipient receipt remains unconfirmed."})`,
    );
    return {
      subjectId,
      subjectKind: "settlement",
      after: {
        settlementId: subjectId,
        amountMinor: c.amountMinor,
        state: "pending",
      },
    };
  }
  if (c.kind === "settlement_transition") {
    const s = ledger.settlements.find((s) => s.id === c.settlementId);
    if (!s) throw new SharingUnavailableError();
    if (s.version !== c.expectedSettlementVersion)
      throw new SharingConflictError();
    const recipient = (
      await t.db.execute<{ kind: string }>(
        sql`SELECT identity_kind AS kind FROM sharing.participant WHERE group_id=${c.groupId}::uuid AND id=${s.recipientId}::uuid`,
      )
    ).rows[0];
    const manual = !!recipient && recipient.kind !== "registered";
    const allowed =
      c.operation === "manual_confirm"
        ? manual &&
          g.owner &&
          c.acknowledgeManualLimitation &&
          s.state === "pending"
        : c.operation === "confirm" || c.operation === "dispute"
          ? !manual &&
            s.recipientId === g.participantId &&
            s.state === "pending"
          : c.operation === "cancel"
            ? [s.senderId, s.recipientId].includes(g.participantId) &&
              ["pending", "disputed"].includes(s.state)
            : s.state === "confirmed" &&
              (s.recipientId === g.participantId || (manual && g.owner));
    if (!allowed) throw new SharingUnavailableError();
    const state =
      c.operation === "confirm" || c.operation === "manual_confirm"
        ? "confirmed"
        : c.operation === "dispute"
          ? "disputed"
          : c.operation === "cancel"
            ? "cancelled"
            : "reversed";
    if (state === "confirmed") {
      // Confirmation applies the immutable allocations only after a fresh review.
      const preview = previewSettlement(
        ledger.sources,
        ledger.settlements,
        s.senderId,
        s.recipientId,
        s.amountMinor,
        s.allocations,
      );
      if (preview.advanceMinor !== s.advanceMinor)
        throw new SharingConflictError(
          "Settlement sources changed. Cancel and report a reviewed payment.",
        );
    }
    await t.db.execute(
      sql`UPDATE sharing.settlement SET state=${state},version=version+1 WHERE group_id=${c.groupId}::uuid AND id=${s.id}::uuid`,
    );
    await t.db.execute(
      sql`INSERT INTO sharing.settlement_event(group_id,settlement_id,version,actor_id,receipt_id,from_state,to_state,confirmation_type,reason) VALUES(${c.groupId}::uuid,${s.id}::uuid,${s.version + 1},${g.participantId}::uuid,${receipt}::uuid,${s.state},${state},${c.operation === "manual_confirm" ? "manual_entry" : c.operation === "confirm" ? "recipient_authenticated" : "participant_transition"},${c.operation === "manual_confirm" ? `Recipient-authenticated confirmation unavailable. Owner entered manual confirmation: ${c.reason}` : c.reason})`,
    );
    return {
      subjectId: s.id,
      subjectKind: "settlement",
      after: { settlementId: s.id, state, reason: c.reason },
    };
  }
  const source = ledger.sources.filter((p) => p.expenseId === c.expenseId);
  if (!source.length || source[0]!.revisionId !== c.expectedRevisionId)
    throw new SharingConflictError();
  const creator = (
    await t.db.execute<{ id: string }>(
      sql`SELECT created_by_participant_id AS id FROM sharing.shared_expense WHERE group_id=${c.groupId}::uuid AND id=${c.expenseId}::uuid`,
    )
  ).rows[0];
  if (creator?.id !== g.participantId) throw new SharingUnavailableError();
  for (const [axis, rows] of [
    ["received", c.received],
    ["share_credit", c.shareCredits],
  ] as const) {
    if (
      new Set(rows.map((p) => p.participantId)).size !== rows.length ||
      rows.reduce((n, p) => n + BigInt(p.amountMinor), 0n) !==
        BigInt(c.totalMinor)
    )
      throw new RangeError(
        "Each refund axis must exactly equal the refund total without duplicate people.",
      );
    for (const p of rows) {
      const own = source.find((s) => s.participantId === p.participantId),
        limit = own
          ? axis === "received"
            ? BigInt(own.paidMinor) - BigInt(own.refundReceivedMinor)
            : BigInt(own.shareMinor) - BigInt(own.refundShareMinor)
          : 0n;
      if (BigInt(p.amountMinor) > limit)
        throw new RangeError(
          "Refund exceeds this person's remaining paid amount or consumed share.",
        );
    }
  }
  const subjectId = randomUUID();
  await t.db.execute(
    sql`INSERT INTO sharing.refund(id,group_id,expense_id,source_revision_id,actor_id,receipt_id,total_minor,refund_date,reason) VALUES(${subjectId}::uuid,${c.groupId}::uuid,${c.expenseId}::uuid,${c.expectedRevisionId}::uuid,${g.participantId}::uuid,${receipt}::uuid,${c.totalMinor}::bigint,${c.refundDate}::date,${c.reason})`,
  );
  for (const [axis, rows] of [
    ["received", c.received],
    ["share_credit", c.shareCredits],
  ] as const)
    for (const p of rows)
      await t.db.execute(
        sql`INSERT INTO sharing.refund_allocation(group_id,refund_id,participant_id,axis,amount_minor) VALUES(${c.groupId}::uuid,${subjectId}::uuid,${p.participantId}::uuid,${axis},${p.amountMinor}::bigint)`,
      );
  return {
    subjectId,
    subjectKind: "refund",
    after: {
      refundId: subjectId,
      expenseId: c.expenseId,
      totalMinor: c.totalMinor,
      reason: c.reason,
    },
  };
}
