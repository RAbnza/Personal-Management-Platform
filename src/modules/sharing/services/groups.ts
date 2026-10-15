import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { hashCommandPayload } from "@/modules/core/domain/command";
import { assertRecentAuthentication } from "@/modules/core/services/workspace-lifecycle";
import {
  allocateBill,
  groupCommandSchema,
  SharingConflictError,
  SharingUnavailableError,
  type GroupCommand,
} from "../domain/sharing";

export type SharingActor = {
  userId: string;
  workspaceId: string;
  sessionId: string;
  requestId?: string;
};
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export type GroupResult = {
  groupId: string;
  version: number;
  subjectId: string;
};
export async function lockGroup(t: ScopedTransaction, groupId: string) {
  await t.db.execute(sql`SET LOCAL lock_timeout='5s'`);
  await t.db.execute(sql`SET LOCAL statement_timeout='15s'`);
  const locked = await t.db.execute(
    sql`SELECT id FROM sharing.expense_group WHERE id=${groupId}::uuid FOR UPDATE`,
  );
  if (!locked.rows[0]) throw new SharingUnavailableError();
  const profile = await t.db.execute(
    sql`SELECT user_id FROM core.user_profile WHERE user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND lifecycle='active' FOR SHARE`,
  );
  if (!profile.rows[0]) throw new SharingUnavailableError();
  // A separate statement sees membership changes committed while the group
  // lock was being acquired; permission predicates must not use the old snapshot.
  const g = (
    await t.db.execute<{
      id: string;
      name: string;
      version: number;
      archived: boolean;
      participantId: string;
      owner: boolean;
      active: boolean;
    }>(
      sql`SELECT id,name,version,archived_at IS NOT NULL AS archived,sharing.actor(id) AS "participantId",sharing.active(id,true) AS owner,sharing.active(id) AS active FROM sharing.expense_group WHERE id=${groupId}::uuid`,
    )
  ).rows[0];
  if (!g) throw new SharingUnavailableError();
  return g;
}
export async function finishGroupCommand(
  t: ScopedTransaction,
  g: { id: string; version: number },
  receiptId: string,
  actorId: string,
  subjectKind: string,
  subjectId: string,
  operation: string,
  snapshot?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  },
): Promise<GroupResult> {
  const result = { groupId: g.id, version: g.version, subjectId };
  await t.db.execute(
    sql`INSERT INTO audit.group_revision(group_id,actor_participant_id,command_receipt_id,subject_kind,subject_id,subject_version,operation,before_json,after_json) VALUES(${g.id}::uuid,${actorId}::uuid,${receiptId}::uuid,${subjectKind},${subjectId}::uuid,${g.version},${operation},${JSON.stringify(snapshot?.before ?? null)}::jsonb,${JSON.stringify({ groupVersion: g.version, ...snapshot?.after })}::jsonb)`,
  );
  await t.db.execute(
    sql`UPDATE sharing.group_command_receipt SET state='completed',result_json=${JSON.stringify(result)}::jsonb,completed_at=clock_timestamp() WHERE group_id=${g.id}::uuid AND id=${receiptId}::uuid`,
  );
  return result;
}
export async function executeGroupCommand(
  t: ScopedTransaction,
  actor: SharingActor,
  raw: unknown,
): Promise<GroupResult> {
  const c = groupCommandSchema.parse(raw);
  await t.db.execute(sql`SET LOCAL lock_timeout='5s'`);
  await t.db.execute(sql`SET LOCAL statement_timeout='15s'`);
  // Exclude raw bearer credentials from both receipts and audit.
  const payload =
    c.kind === "invite"
      ? { ...c, token: tokenHash(c.token) }
      : c.kind === "bill"
        ? { ...c, bill: allocateBill(c.bill) }
        : c;
  const hash = hashCommandPayload(payload).toString("hex");
  let g = await t.db.execute<{ id: string }>(
    sql`SELECT id FROM sharing.expense_group WHERE id=${c.groupId}::uuid FOR UPDATE`,
  );
  let createdHere = false;
  if (!g.rows[0] && c.kind === "create") {
    const inserted = await t.db.execute(
      sql`INSERT INTO sharing.expense_group(id,name,created_by_user_id) VALUES(${c.groupId}::uuid,${c.name},${actor.userId}::uuid) ON CONFLICT(id) DO NOTHING RETURNING id`,
    );
    createdHere = inserted.rows.length === 1;
    if (createdHere) {
      const p = randomUUID();
      await t.db.execute(
        sql`INSERT INTO sharing.participant(id,group_id,registered_user_id,display_name,identity_kind,linked_at) VALUES(${p}::uuid,${c.groupId}::uuid,${actor.userId}::uuid,${c.displayName},'registered',clock_timestamp())`,
      );
      await t.db.execute(
        sql`INSERT INTO sharing.membership(group_id,participant_id,role) VALUES(${c.groupId}::uuid,${p}::uuid,'owner')`,
      );
    }
    g = await t.db.execute(
      sql`SELECT id FROM sharing.expense_group WHERE id=${c.groupId}::uuid`,
    );
  }
  if (!g.rows[0]) throw new SharingUnavailableError();
  const group = await lockGroup(t, c.groupId);
  const prior = (
    await t.db.execute<{ actor: string; hash: string; result: GroupResult }>(
      sql`SELECT actor_participant_id AS actor,payload_hash AS hash,result_json AS result FROM sharing.group_command_receipt WHERE group_id=${c.groupId}::uuid AND client_command_id=${c.clientCommandId}::uuid`,
    )
  ).rows[0];
  if (prior) {
    if (prior.actor !== group.participantId || prior.hash !== hash)
      throw new SharingConflictError(
        "This command ID was used for another request.",
      );
    return prior.result;
  }
  if (!group.active) throw new SharingUnavailableError();
  if (c.kind === "create" && !createdHere) throw new SharingConflictError();
  if (c.kind !== "create" && c.expectedVersion !== group.version)
    throw new SharingConflictError();
  if (!["create", "bill", "membership"].includes(c.kind) && !group.owner)
    throw new SharingUnavailableError();
  if (c.kind !== "create" && c.kind !== "bill")
    await assertRecentAuthentication(t, actor.sessionId);
  if (group.archived && c.kind !== "settings" && c.kind !== "membership")
    throw new RangeError("Archived groups are read only.");
  const receipt = randomUUID();
  await t.db.execute(
    sql`INSERT INTO sharing.group_command_receipt(id,group_id,client_command_id,actor_participant_id,command_type,payload_hash) VALUES(${receipt}::uuid,${c.groupId}::uuid,${c.clientCommandId}::uuid,${group.participantId}::uuid,${c.kind},${hash})`,
  );
  let subjectId = c.groupId,
    subjectKind = "group";
  const snapshot: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  } = {};
  if (c.kind === "create") snapshot.after = { name: c.name };
  if (!["settings", "create"].includes(c.kind))
    await t.db.execute(
      sql`UPDATE sharing.expense_group SET version=version+1 WHERE id=${c.groupId}::uuid`,
    );
  if (c.kind === "manual") {
    subjectId = randomUUID();
    subjectKind = "participant";
    snapshot.after = {};
    await t.db.execute(
      sql`INSERT INTO sharing.participant(id,group_id,display_name,identity_kind) VALUES(${subjectId}::uuid,${c.groupId}::uuid,${c.displayName},'manual')`,
    );
  } else if (c.kind === "settings") {
    snapshot.before = { name: group.name, archived: group.archived };
    snapshot.after = { name: c.name, archived: c.archived };
    await t.db.execute(
      sql`UPDATE sharing.expense_group SET name=${c.name},archived_at=CASE WHEN ${c.archived} THEN coalesce(archived_at,clock_timestamp()) ELSE NULL END,version=version+1 WHERE id=${c.groupId}::uuid`,
    );
  } else if (c.kind === "membership") {
    if (
      c.operation === "leave"
        ? c.participantId !== group.participantId
        : !group.owner
    )
      throw new SharingUnavailableError();
    subjectId = c.participantId;
    subjectKind = "membership";
    const priorMember = (
      await t.db.execute<{ role: string; id: string }>(
        sql`SELECT id,role FROM sharing.membership WHERE group_id=${c.groupId}::uuid AND participant_id=${c.participantId}::uuid AND left_at IS NULL`,
      )
    ).rows[0];
    snapshot.before = priorMember
      ? { membershipId: priorMember.id, role: priorMember.role }
      : {};
    snapshot.after = { operation: c.operation };
    const result = await t.db.execute(
      sql`UPDATE sharing.membership SET role=CASE WHEN ${c.operation} IN ('owner','member') THEN ${c.operation} ELSE role END,left_at=CASE WHEN ${c.operation} IN ('leave','remove') THEN clock_timestamp() ELSE NULL END,exit_kind=CASE WHEN ${c.operation}='leave' THEN 'left' WHEN ${c.operation}='remove' THEN 'removed' ELSE NULL END WHERE group_id=${c.groupId}::uuid AND participant_id=${c.participantId}::uuid AND left_at IS NULL RETURNING id`,
    );
    if (!result.rows[0]) throw new SharingUnavailableError();
    if (c.operation !== "owner") {
      await t.db.execute(
        sql`UPDATE sharing.invitation SET state='revoked' WHERE group_id=${c.groupId}::uuid AND inviter_participant_id=${c.participantId}::uuid AND state='pending'`,
      );
      await t.db.execute(
        sql`UPDATE sharing.participant_claim SET state='rejected' WHERE group_id=${c.groupId}::uuid AND state='pending' AND invitation_id IN(SELECT id FROM sharing.invitation WHERE group_id=${c.groupId}::uuid AND state='revoked')`,
      );
    }
  } else if (c.kind === "invite") {
    subjectId = randomUUID();
    subjectKind = "invitation";
    snapshot.after = {
      invitationId: subjectId,
      claimParticipantId: c.claimParticipantId,
    };
    await t.db.execute(
      sql`UPDATE sharing.invitation SET state='expired' WHERE group_id=${c.groupId}::uuid AND state='pending' AND expires_at<=clock_timestamp()`,
    );
    await t.db.execute(
      sql`UPDATE sharing.participant_claim SET state='expired' WHERE group_id=${c.groupId}::uuid AND state='pending' AND invitation_id IN(SELECT id FROM sharing.invitation WHERE group_id=${c.groupId}::uuid AND state='expired')`,
    );
    await t.db.execute(
      sql`INSERT INTO sharing.invitation(id,group_id,inviter_participant_id,target_email_normalized,token_hash,expires_at) VALUES(${subjectId}::uuid,${c.groupId}::uuid,${group.participantId}::uuid,${c.email},${tokenHash(c.token)},clock_timestamp()+interval '7 days')`,
    );
    if (c.claimParticipantId) {
      const p = (
        await t.db.execute(
          sql`SELECT id FROM sharing.participant WHERE group_id=${c.groupId}::uuid AND id=${c.claimParticipantId}::uuid AND identity_kind='manual'`,
        )
      ).rows[0];
      if (!p) throw new SharingUnavailableError();
      await t.db.execute(
        sql`INSERT INTO sharing.participant_claim(group_id,participant_id,invitation_id,balance_review_json,review_group_version) VALUES(${c.groupId}::uuid,${c.claimParticipantId}::uuid,${subjectId}::uuid,'{}'::jsonb,${group.version + 1})`,
      );
    }
  } else if (c.kind === "revoke") {
    subjectId = c.invitationId;
    subjectKind = "invitation";
    snapshot.after = { invitationId: subjectId, operation: "revoke" };
    const r = await t.db.execute(
      sql`UPDATE sharing.invitation SET state='revoked' WHERE group_id=${c.groupId}::uuid AND id=${c.invitationId}::uuid AND state='pending' RETURNING id`,
    );
    if (!r.rows[0]) throw new SharingUnavailableError();
    await t.db.execute(
      sql`UPDATE sharing.participant_claim SET state='rejected' WHERE group_id=${c.groupId}::uuid AND invitation_id=${c.invitationId}::uuid AND state='pending'`,
    );
  } else if (c.kind === "bill") {
    subjectId = await writeBill(t, c, group.participantId, receipt);
    subjectKind = "expense";
    const revision = (
      await t.db.execute<{ id: string }>(
        sql`SELECT current_revision_id AS id FROM sharing.shared_expense WHERE group_id=${c.groupId}::uuid AND id=${subjectId}::uuid`,
      )
    ).rows[0]!;
    snapshot.after = {
      expenseId: subjectId,
      revisionId: revision.id,
      totalMinor: c.bill.totalMinor,
      splitMethod: c.bill.splitMethod,
      reason: c.reason,
    };
  }
  return finishGroupCommand(
    t,
    { id: c.groupId, version: group.version + (c.kind === "create" ? 0 : 1) },
    receipt,
    group.participantId,
    subjectKind,
    subjectId,
    c.kind,
    snapshot,
  );
}
async function writeBill(
  t: ScopedTransaction,
  c: Extract<GroupCommand, { kind: "bill" }>,
  actor: string,
  receipt: string,
) {
  const bill = allocateBill(c.bill),
    expenseId = c.expenseId ?? randomUUID(),
    revisionId = randomUUID();
  let previous: string | null = null,
    revisionNo = 1;
  if (c.expenseId) {
    const current = (
      await t.db.execute<{
        revisionId: string;
        revisionNo: number;
        creator: string;
      }>(
        sql`SELECT e.current_revision_id AS "revisionId",r.revision_no AS "revisionNo",e.created_by_participant_id AS creator FROM sharing.shared_expense e JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id WHERE e.group_id=${c.groupId}::uuid AND e.id=${expenseId}::uuid`,
      )
    ).rows[0];
    if (!current || current.creator !== actor)
      throw new SharingUnavailableError();
    if (current.revisionId !== c.expectedRevisionId || !c.reason)
      throw new SharingConflictError();
    previous = current.revisionId;
    revisionNo = current.revisionNo + 1;
    await t.db.execute(
      sql`UPDATE sharing.shared_expense SET current_revision_id=${revisionId}::uuid WHERE group_id=${c.groupId}::uuid AND id=${expenseId}::uuid`,
    );
  } else
    await t.db.execute(
      sql`INSERT INTO sharing.shared_expense(id,group_id,created_by_participant_id,current_revision_id,original_command_receipt_id) VALUES(${expenseId}::uuid,${c.groupId}::uuid,${actor}::uuid,${revisionId}::uuid,${receipt}::uuid)`,
    );
  await t.db.execute(
    sql`INSERT INTO sharing.expense_revision(id,group_id,expense_id,revision_no,previous_revision_id,command_receipt_id,actor_participant_id,description,expense_date,total_minor,split_method,category_label,notes,reason) VALUES(${revisionId}::uuid,${c.groupId}::uuid,${expenseId}::uuid,${revisionNo},${previous}::uuid,${receipt}::uuid,${actor}::uuid,${bill.description},${bill.expenseDate}::date,${bill.totalMinor}::bigint,${bill.splitMethod},${bill.categoryLabel},${bill.notes},${c.reason})`,
  );
  for (const p of bill.contributions)
    await t.db.execute(
      sql`INSERT INTO sharing.payer_contribution(group_id,expense_id,expense_revision_id,participant_id,amount_minor) VALUES(${c.groupId}::uuid,${expenseId}::uuid,${revisionId}::uuid,${p.participantId}::uuid,${p.amountMinor}::bigint)`,
    );
  for (const p of bill.shares)
    await t.db.execute(
      sql`INSERT INTO sharing.participant_share(group_id,expense_id,expense_revision_id,participant_id,amount_minor,rounding_rank,rounding_extra_minor) VALUES(${c.groupId}::uuid,${expenseId}::uuid,${revisionId}::uuid,${p.participantId}::uuid,${p.amountMinor}::bigint,${p.roundingRank},${p.roundingExtraMinor})`,
    );
  await t.db.execute(
    sql`UPDATE sharing.expense_revision SET state='finalized' WHERE group_id=${c.groupId}::uuid AND id=${revisionId}::uuid`,
  );
  return expenseId;
}
export function recordGroupCommand(actor: SharingActor, command: unknown) {
  return withDomainTransaction(actor, (t) =>
    executeGroupCommand(t, actor, command),
  );
}
