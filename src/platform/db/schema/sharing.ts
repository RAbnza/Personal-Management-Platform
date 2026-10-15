import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  timestamp,
  date,
  bigint,
  smallint,
  jsonb,
  unique,
  uniqueIndex,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sharingSchema, auditSchema } from "./namespaces";

const id = () => uuid("id").defaultRandom().primaryKey();
const group = () =>
  uuid("group_id")
    .notNull()
    .references(() => expenseGroup.id);
const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const time = (name: string) => timestamp(name, { withTimezone: true });

export const expenseGroup = sharingSchema.table(
  "expense_group",
  {
    id: id(),
    name: text("name").notNull(),
    currency: text("currency").default("PHP").notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: created(),
    archivedAt: time("archived_at"),
    version: integer("version").default(1).notNull(),
  },
  (t) => [
    check(
      "ck_group_shape",
      sql`length(btrim(${t.name})) BETWEEN 1 AND 200 AND ${t.currency}='PHP' AND ${t.version}>0`,
    ),
  ],
);

export const groupParticipant = sharingSchema.table(
  "participant",
  {
    id: id(),
    groupId: group(),
    registeredUserId: uuid("registered_user_id"),
    displayName: text("display_name").notNull(),
    identityKind: text("identity_kind").notNull(),
    linkedAt: time("linked_at"),
    createdAt: created(),
  },
  (t) => [
    unique("uq_participant_scope").on(t.groupId, t.id),
    unique("uq_participant_user").on(t.groupId, t.registeredUserId),
    check(
      "ck_participant_identity",
      sql`length(btrim(${t.displayName})) BETWEEN 1 AND 200 AND ((${t.identityKind}='registered' AND ${t.registeredUserId} IS NOT NULL AND ${t.linkedAt} IS NOT NULL) OR (${t.identityKind} IN ('manual','deleted') AND ${t.registeredUserId} IS NULL))`,
    ),
  ],
);

export const groupMembership = sharingSchema.table(
  "membership",
  {
    id: id(),
    groupId: group(),
    participantId: uuid("participant_id").notNull(),
    role: text("role").notNull(),
    joinedAt: time("joined_at").defaultNow().notNull(),
    leftAt: time("left_at"),
    exitKind: text("exit_kind"),
    historyPolicyVersion: integer("history_policy_version")
      .default(1)
      .notNull(),
    acceptedInvitationId: uuid("accepted_invitation_id"),
  },
  (t) => [
    unique("uq_membership_scope").on(t.groupId, t.id),
    foreignKey({
      name: "fk_membership_participant",
      columns: [t.groupId, t.participantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    uniqueIndex("uq_membership_active")
      .on(t.groupId, t.participantId)
      .where(sql`${t.leftAt} IS NULL`),
    check(
      "ck_membership_shape",
      sql`${t.role} IN ('owner','member') AND ${t.historyPolicyVersion}=1 AND ((${t.leftAt} IS NULL AND ${t.exitKind} IS NULL) OR (${t.leftAt}>=${t.joinedAt} AND ${t.exitKind} IN ('left','removed')))`,
    ),
  ],
);

export const groupInvitation = sharingSchema.table(
  "invitation",
  {
    id: id(),
    groupId: group(),
    inviterParticipantId: uuid("inviter_participant_id").notNull(),
    targetEmailNormalized: text("target_email_normalized").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: time("expires_at").notNull(),
    state: text("state").default("pending").notNull(),
    role: text("role").default("member").notNull(),
    acceptedUserId: uuid("accepted_user_id"),
    acceptedAt: time("accepted_at"),
    createdAt: created(),
  },
  (t) => [
    unique("uq_invitation_scope").on(t.groupId, t.id),
    unique("uq_invitation_token").on(t.tokenHash),
    uniqueIndex("uq_invitation_pending")
      .on(t.groupId, t.targetEmailNormalized)
      .where(sql`${t.state}='pending'`),
    foreignKey({
      name: "fk_invitation_actor",
      columns: [t.groupId, t.inviterParticipantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    check(
      "ck_invitation_shape",
      sql`${t.tokenHash} ~ '^[a-f0-9]{64}$' AND ${t.role}='member' AND ${t.expiresAt}>${t.createdAt} AND ${t.state} IN ('pending','accepted','expired','revoked') AND ((${t.state}='accepted' AND ${t.acceptedUserId} IS NOT NULL AND ${t.acceptedAt} IS NOT NULL) OR (${t.state}<>'accepted' AND ${t.acceptedUserId} IS NULL AND ${t.acceptedAt} IS NULL))`,
    ),
  ],
);

export const participantClaim = sharingSchema.table(
  "participant_claim",
  {
    id: id(),
    groupId: group(),
    participantId: uuid("participant_id").notNull(),
    invitationId: uuid("invitation_id").notNull(),
    claimingUserId: uuid("claiming_user_id"),
    balanceReviewJson: jsonb("balance_review_json").notNull(),
    reviewGroupVersion: integer("review_group_version").notNull(),
    state: text("state").default("pending").notNull(),
    reviewedAt: time("reviewed_at"),
  },
  (t) => [
    unique("uq_claim_scope").on(t.groupId, t.id),
    unique("uq_claim_invitation").on(t.groupId, t.invitationId),
    foreignKey({
      name: "fk_claim_participant",
      columns: [t.groupId, t.participantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    foreignKey({
      name: "fk_claim_invitation",
      columns: [t.groupId, t.invitationId],
      foreignColumns: [groupInvitation.groupId, groupInvitation.id],
    }),
    uniqueIndex("uq_claim_live")
      .on(t.groupId, t.participantId)
      .where(sql`${t.state}='pending'`),
    check(
      "ck_claim_state",
      sql`${t.state} IN ('pending','accepted','rejected','expired')`,
    ),
  ],
);

export const groupCommandReceipt = sharingSchema.table(
  "group_command_receipt",
  {
    id: id(),
    groupId: group(),
    clientCommandId: uuid("client_command_id").notNull(),
    actorParticipantId: uuid("actor_participant_id").notNull(),
    commandType: text("command_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    state: text("state").default("claimed").notNull(),
    resultJson: jsonb("result_json"),
    createdAt: created(),
    completedAt: time("completed_at"),
  },
  (t) => [
    unique("uq_group_receipt_scope").on(t.groupId, t.id),
    unique("uq_group_command").on(t.groupId, t.clientCommandId),
    foreignKey({
      name: "fk_group_receipt_actor",
      columns: [t.groupId, t.actorParticipantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    check(
      "ck_group_receipt_shape",
      sql`${t.payloadHash} ~ '^[a-f0-9]{64}$' AND ((${t.state}='claimed' AND ${t.completedAt} IS NULL) OR (${t.state}='completed' AND ${t.completedAt} IS NOT NULL AND ${t.resultJson} IS NOT NULL))`,
    ),
  ],
);

export const sharedExpense = sharingSchema.table(
  "shared_expense",
  {
    id: id(),
    groupId: group(),
    createdByParticipantId: uuid("created_by_participant_id").notNull(),
    currentRevisionId: uuid("current_revision_id").notNull(),
    originalCommandReceiptId: uuid("original_command_receipt_id").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("uq_expense_scope").on(t.groupId, t.id),
    unique("uq_expense_receipt").on(t.groupId, t.originalCommandReceiptId),
    foreignKey({
      name: "fk_expense_creator",
      columns: [t.groupId, t.createdByParticipantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    foreignKey({
      name: "fk_expense_receipt",
      columns: [t.groupId, t.originalCommandReceiptId],
      foreignColumns: [groupCommandReceipt.groupId, groupCommandReceipt.id],
    }),
  ],
);

export const expenseRevision = sharingSchema.table(
  "expense_revision",
  {
    id: id(),
    groupId: group(),
    expenseId: uuid("expense_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    previousRevisionId: uuid("previous_revision_id"),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    actorParticipantId: uuid("actor_participant_id").notNull(),
    description: text("description").notNull(),
    expenseDate: date("expense_date").notNull(),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    splitMethod: text("split_method").notNull(),
    categoryLabel: text("category_label"),
    notes: text("notes"),
    reason: text("reason"),
    state: text("state").default("building").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("uq_expense_revision_scope").on(t.groupId, t.id),
    unique("uq_expense_revision_identity").on(t.groupId, t.expenseId, t.id),
    unique("uq_expense_revision_no").on(t.groupId, t.expenseId, t.revisionNo),
    foreignKey({
      name: "fk_revision_expense",
      columns: [t.groupId, t.expenseId],
      foreignColumns: [sharedExpense.groupId, sharedExpense.id],
    }),
    foreignKey({
      name: "fk_revision_receipt",
      columns: [t.groupId, t.commandReceiptId],
      foreignColumns: [groupCommandReceipt.groupId, groupCommandReceipt.id],
    }),
    foreignKey({
      name: "fk_revision_actor",
      columns: [t.groupId, t.actorParticipantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    check(
      "ck_expense_revision_shape",
      sql`${t.totalMinor}>0 AND ${t.splitMethod} IN ('equal','exact') AND ${t.state} IN ('building','finalized','void') AND length(btrim(${t.description})) BETWEEN 1 AND 2000 AND ((${t.revisionNo}=1 AND ${t.previousRevisionId} IS NULL) OR (${t.revisionNo}>1 AND ${t.previousRevisionId} IS NOT NULL AND length(btrim(${t.reason}))>0))`,
    ),
  ],
);

export const payerContribution = sharingSchema.table(
  "payer_contribution",
  {
    id: id(),
    groupId: group(),
    expenseId: uuid("expense_id").notNull(),
    expenseRevisionId: uuid("expense_revision_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  },
  (t) => [
    unique("uq_contribution_scope").on(t.groupId, t.id),
    unique("uq_contribution_person").on(
      t.groupId,
      t.expenseRevisionId,
      t.participantId,
    ),
    foreignKey({
      name: "fk_contribution_revision",
      columns: [t.groupId, t.expenseId, t.expenseRevisionId],
      foreignColumns: [
        expenseRevision.groupId,
        expenseRevision.expenseId,
        expenseRevision.id,
      ],
    }),
    foreignKey({
      name: "fk_contribution_person",
      columns: [t.groupId, t.participantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    check("ck_contribution_amount", sql`${t.amountMinor}>0`),
  ],
);

export const participantShare = sharingSchema.table(
  "participant_share",
  {
    id: id(),
    groupId: group(),
    expenseId: uuid("expense_id").notNull(),
    expenseRevisionId: uuid("expense_revision_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    roundingRank: integer("rounding_rank").notNull(),
    roundingExtraMinor: smallint("rounding_extra_minor").default(0).notNull(),
  },
  (t) => [
    unique("uq_share_scope").on(t.groupId, t.id),
    unique("uq_share_person").on(
      t.groupId,
      t.expenseRevisionId,
      t.participantId,
    ),
    unique("uq_share_rank").on(t.groupId, t.expenseRevisionId, t.roundingRank),
    foreignKey({
      name: "fk_share_revision",
      columns: [t.groupId, t.expenseId, t.expenseRevisionId],
      foreignColumns: [
        expenseRevision.groupId,
        expenseRevision.expenseId,
        expenseRevision.id,
      ],
    }),
    foreignKey({
      name: "fk_share_person",
      columns: [t.groupId, t.participantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    check(
      "ck_share_amount",
      sql`${t.amountMinor}>=0 AND ${t.roundingRank}>=0 AND ${t.roundingExtraMinor} IN (0,1)`,
    ),
  ],
);

export const memberRecordAccess = sharingSchema.table(
  "member_record_access",
  {
    id: id(),
    groupId: group(),
    membershipId: uuid("membership_id").notNull(),
    expenseId: uuid("expense_id").notNull(),
    visibility: text("visibility").default("full").notNull(),
    grantedAt: time("granted_at").defaultNow().notNull(),
  },
  (t) => [
    unique("uq_access_record").on(t.groupId, t.membershipId, t.expenseId),
    foreignKey({
      name: "fk_access_membership",
      columns: [t.groupId, t.membershipId],
      foreignColumns: [groupMembership.groupId, groupMembership.id],
    }),
    foreignKey({
      name: "fk_access_expense",
      columns: [t.groupId, t.expenseId],
      foreignColumns: [sharedExpense.groupId, sharedExpense.id],
    }),
    check("ck_access_visibility", sql`${t.visibility}='full'`),
  ],
);

export const groupRevision = auditSchema.table(
  "group_revision",
  {
    id: id(),
    groupId: group(),
    actorParticipantId: uuid("actor_participant_id").notNull(),
    actorKind: text("actor_kind").default("participant").notNull(),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersion: integer("subject_version").notNull(),
    operation: text("operation").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("uq_group_audit_command").on(t.groupId, t.commandReceiptId),
    check(
      "ck_group_actor_kind",
      sql`${t.actorKind} IN ('participant','system')`,
    ),
    foreignKey({
      name: "fk_group_audit_actor",
      columns: [t.groupId, t.actorParticipantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    foreignKey({
      name: "fk_group_audit_receipt",
      columns: [t.groupId, t.commandReceiptId],
      foreignColumns: [groupCommandReceipt.groupId, groupCommandReceipt.id],
    }),
  ],
);
