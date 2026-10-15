import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  bigint,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { financeSchema } from "./namespaces";
import { workspace } from "./core";
import { ledgerAccount, financialAction, actionRevision } from "./finance";
import { groupParticipant, sharedExpense, expenseRevision } from "./sharing";
const id = () => uuid("id").defaultRandom().primaryKey();
const ws = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspace.id);
export const groupLedgerBinding = financeSchema.table(
  "group_ledger_binding",
  {
    id: id(),
    workspaceId: ws(),
    groupId: uuid("group_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    receivableLedgerAccountId: uuid("receivable_ledger_account_id").notNull(),
    payableLedgerAccountId: uuid("payable_ledger_account_id").notNull(),
  },
  (t) => [
    unique("uq_binding_scope").on(t.workspaceId, t.id),
    unique("uq_binding_person").on(t.workspaceId, t.groupId, t.participantId),
    unique("uq_binding_receivable").on(
      t.workspaceId,
      t.receivableLedgerAccountId,
    ),
    unique("uq_binding_payable").on(t.workspaceId, t.payableLedgerAccountId),
    foreignKey({
      name: "fk_binding_participant",
      columns: [t.groupId, t.participantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    foreignKey({
      name: "fk_binding_receivable",
      columns: [t.workspaceId, t.receivableLedgerAccountId],
      foreignColumns: [ledgerAccount.workspaceId, ledgerAccount.id],
    }),
    foreignKey({
      name: "fk_binding_payable",
      columns: [t.workspaceId, t.payableLedgerAccountId],
      foreignColumns: [ledgerAccount.workspaceId, ledgerAccount.id],
    }),
  ],
);
export const privateGroupLink = financeSchema.table(
  "private_group_link",
  {
    id: id(),
    workspaceId: ws(),
    groupId: uuid("group_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    expenseId: uuid("expense_id").notNull(),
    purpose: text("purpose").default("bill_adoption").notNull(),
    actionId: uuid("action_id").notNull(),
    currentLinkRevisionId: uuid("current_link_revision_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_private_link_scope").on(t.workspaceId, t.id),
    unique("uq_private_link_source").on(
      t.workspaceId,
      t.groupId,
      t.expenseId,
      t.purpose,
    ),
    unique("uq_private_link_action").on(t.workspaceId, t.actionId),
    foreignKey({
      name: "fk_private_link_participant",
      columns: [t.groupId, t.participantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    foreignKey({
      name: "fk_private_link_expense",
      columns: [t.groupId, t.expenseId],
      foreignColumns: [sharedExpense.groupId, sharedExpense.id],
    }),
    foreignKey({
      name: "fk_private_link_action",
      columns: [t.workspaceId, t.actionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    }),
    check("ck_private_link_purpose", sql`${t.purpose}='bill_adoption'`),
  ],
);
export const privateGroupLinkRevision = financeSchema.table(
  "private_group_link_revision",
  {
    id: id(),
    workspaceId: ws(),
    linkId: uuid("link_id").notNull(),
    groupId: uuid("group_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    expenseId: uuid("expense_id").notNull(),
    sourceExpenseRevisionId: uuid("source_expense_revision_id").notNull(),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    previousLinkRevisionId: uuid("previous_link_revision_id"),
    acceptedSourceHash: text("accepted_source_hash").notNull(),
    adoptionKind: text("adoption_kind").notNull(),
    paidMinor: bigint("paid_minor", { mode: "bigint" }).notNull(),
    shareMinor: bigint("share_minor", { mode: "bigint" }).notNull(),
    consentJson: jsonb("consent_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_private_link_revision_scope").on(t.workspaceId, t.id),
    unique("uq_private_link_revision_no").on(
      t.workspaceId,
      t.linkId,
      t.revisionNo,
    ),
    unique("uq_private_link_revision_identity").on(
      t.workspaceId,
      t.linkId,
      t.id,
    ),
    unique("uq_private_link_action_revision").on(
      t.workspaceId,
      t.actionRevisionId,
    ),
    foreignKey({
      name: "fk_private_revision_link",
      columns: [t.workspaceId, t.linkId],
      foreignColumns: [privateGroupLink.workspaceId, privateGroupLink.id],
    }),
    foreignKey({
      name: "fk_private_revision_source",
      columns: [t.groupId, t.expenseId, t.sourceExpenseRevisionId],
      foreignColumns: [
        expenseRevision.groupId,
        expenseRevision.expenseId,
        expenseRevision.id,
      ],
    }),
    foreignKey({
      name: "fk_private_revision_action",
      columns: [t.workspaceId, t.actionId, t.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    }),
    check(
      "ck_private_revision_shape",
      sql`${t.paidMinor}>=0 AND ${t.shareMinor}>=0 AND ${t.acceptedSourceHash} ~ '^[a-f0-9]{64}$' AND ${t.adoptionKind} IN ('new_posting','existing_action_reclassification') AND ((${t.revisionNo}=1 AND ${t.previousLinkRevisionId} IS NULL) OR (${t.revisionNo}>1 AND ${t.previousLinkRevisionId} IS NOT NULL))`,
    ),
  ],
);
