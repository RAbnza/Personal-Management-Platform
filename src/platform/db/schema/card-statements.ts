import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.generated";
import { commandReceipt, workspace } from "./core";
import { creditCard } from "./credit-cards";
import { actionRevision } from "./finance";
import { financeSchema } from "./namespaces";

export const cardStatement = financeSchema.table(
  "card_statement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    cardId: uuid("card_id").notNull(),
    currentRevisionId: uuid("current_revision_id"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_card_statement_scope").on(t.workspaceId, t.id),
    foreignKey({
      name: "fk_card_statement_card",
      columns: [t.workspaceId, t.cardId],
      foreignColumns: [creditCard.workspaceId, creditCard.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_card_statement_card").on(t.workspaceId, t.cardId, t.id),
    check("ck_card_statement_version", sql`${t.version}>0`),
  ],
);

/** Provider snapshots are built and finalized atomically, never posted to the ledger. */
export const cardStatementRevision = financeSchema.table(
  "card_statement_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    statementId: uuid("statement_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    previousRevisionId: uuid("previous_revision_id"),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    cycleStart: date("cycle_start", { mode: "string" }).notNull(),
    cycleEnd: date("cycle_end", { mode: "string" }).notNull(),
    statementDate: date("statement_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    balanceMinor: bigint("balance_minor", { mode: "bigint" }).notNull(),
    minimumDueMinor: bigint("minimum_due_minor", { mode: "bigint" }).notNull(),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" }),
    providerReference: text("provider_reference"),
    verificationSource: text("verification_source").notNull(),
    verifiedDate: date("verified_date", { mode: "string" }).notNull(),
    reason: text("reason"),
    state: text("state").default("building").notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    requestId: uuid("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_statement_revision_scope").on(t.workspaceId, t.id),
    unique("uq_statement_revision_parent").on(
      t.workspaceId,
      t.statementId,
      t.id,
    ),
    unique("uq_statement_revision_number").on(
      t.workspaceId,
      t.statementId,
      t.revisionNo,
    ),
    unique("uq_statement_revision_command").on(
      t.workspaceId,
      t.commandReceiptId,
    ),
    foreignKey({
      name: "fk_statement_revision_root",
      columns: [t.workspaceId, t.statementId],
      foreignColumns: [cardStatement.workspaceId, cardStatement.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_statement_revision_command",
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_statement_revision_actor").on(t.recordedByUserId),
    check("ck_statement_revision_number", sql`${t.revisionNo}>0`),
    check(
      "ck_statement_revision_dates",
      sql`${t.cycleStart}<=${t.cycleEnd} AND ${t.cycleEnd}<=${t.statementDate} AND ${t.statementDate}<=${t.dueDate}`,
    ),
    check(
      "ck_statement_revision_minimum",
      sql`${t.minimumDueMinor}>=0 AND ${t.minimumDueMinor}<=GREATEST(${t.balanceMinor},0)`,
    ),
    check(
      "ck_statement_revision_source",
      sql`char_length(btrim(${t.verificationSource})) BETWEEN 1 AND 2000`,
    ),
    check(
      "ck_statement_revision_reference",
      sql`${t.providerReference} IS NULL OR char_length(btrim(${t.providerReference})) BETWEEN 1 AND 2000`,
    ),
    check(
      "ck_statement_revision_reason",
      sql`(${t.revisionNo}=1 AND ${t.previousRevisionId} IS NULL AND ${t.reason} IS NULL) OR (${t.revisionNo}>1 AND ${t.previousRevisionId} IS NOT NULL AND char_length(btrim(${t.reason})) BETWEEN 1 AND 20000)`,
    ),
    check(
      "ck_statement_revision_state",
      sql`(${t.state}='building' AND ${t.finalizedAt} IS NULL) OR (${t.state}='verified' AND ${t.finalizedAt} IS NOT NULL)`,
    ),
  ],
);

/** An unresolved provider line may have unknown date/amount. No financial action is synthesized. */
export const cardStatementEntry = financeSchema.table(
  "card_statement_entry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    statementRevisionId: uuid("statement_revision_id").notNull(),
    lineNo: integer("line_no").notNull(),
    description: text("description").notNull(),
    postingDate: date("posting_date", { mode: "string" }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }),
    providerReference: text("provider_reference"),
    actionRevisionId: uuid("action_revision_id"),
  },
  (t) => [
    unique("uq_statement_entry_scope").on(t.workspaceId, t.id),
    unique("uq_statement_entry_line").on(
      t.workspaceId,
      t.statementRevisionId,
      t.lineNo,
    ),
    unique("uq_statement_entry_source").on(
      t.workspaceId,
      t.statementRevisionId,
      t.actionRevisionId,
    ),
    foreignKey({
      name: "fk_statement_entry_revision",
      columns: [t.workspaceId, t.statementRevisionId],
      foreignColumns: [
        cardStatementRevision.workspaceId,
        cardStatementRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_statement_entry_activity",
      columns: [t.workspaceId, t.actionRevisionId],
      foreignColumns: [actionRevision.workspaceId, actionRevision.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_statement_entry_activity").on(t.workspaceId, t.actionRevisionId),
    check("ck_statement_entry_line", sql`${t.lineNo} BETWEEN 1 AND 100`),
    check(
      "ck_statement_entry_description",
      sql`char_length(btrim(${t.description})) BETWEEN 1 AND 2000`,
    ),
    check(
      "ck_statement_entry_reference",
      sql`${t.providerReference} IS NULL OR char_length(btrim(${t.providerReference})) BETWEEN 1 AND 2000`,
    ),
    check(
      "ck_statement_entry_link_evidence",
      sql`${t.actionRevisionId} IS NULL OR (${t.postingDate} IS NOT NULL AND ${t.amountMinor} IS NOT NULL)`,
    ),
  ],
);
