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

import { user as authUser } from "./auth.generated";
import { workspace } from "./core";
import { actionRevision, ledgerAccount } from "./finance";
import { financeSchema } from "./namespaces";

export const creditCard = financeSchema.table(
  "credit_card",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    name: text("name").notNull(),
    issuerName: text("issuer_name").notNull(),
    liabilityLedgerAccountId: uuid("liability_ledger_account_id").notNull(),
    currency: text("currency").notNull(),
    creditLimitMinor: bigint("credit_limit_minor", { mode: "bigint" }),
    limitVerifiedDate: date("limit_verified_date", { mode: "string" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_credit_card_scope_id").on(table.workspaceId, table.id),
    unique("uq_credit_card_ledger").on(
      table.workspaceId,
      table.liabilityLedgerAccountId,
    ),
    foreignKey({
      name: "fk_credit_card_ledger_currency",
      columns: [
        table.workspaceId,
        table.liabilityLedgerAccountId,
        table.currency,
      ],
      foreignColumns: [
        ledgerAccount.workspaceId,
        ledgerAccount.id,
        ledgerAccount.currency,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_credit_card_workspace_currency",
      columns: [table.workspaceId, table.currency],
      foreignColumns: [workspace.id, workspace.currency],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_credit_card_active_name").on(
      table.workspaceId,
      table.archivedAt,
      table.name,
      table.id,
    ),
    index("ix_credit_card_recorded_by").on(table.recordedByUserId),
    check(
      "ck_credit_card_name",
      sql`char_length(btrim(${table.name})) BETWEEN 1 AND 200`,
    ),
    check(
      "ck_credit_card_issuer_name",
      sql`char_length(btrim(${table.issuerName})) BETWEEN 1 AND 200`,
    ),
    check("ck_credit_card_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "ck_credit_card_limit",
      sql`${table.creditLimitMinor} IS NULL OR ${table.creditLimitMinor} >= 0`,
    ),
    check(
      "ck_credit_card_notes",
      sql`${table.notes} IS NULL OR char_length(${table.notes}) <= 20000`,
    ),
    check("ck_credit_card_version", sql`${table.version} > 0`),
    check(
      "ck_credit_card_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_credit_card_actor_user",
      sql`${table.actorKind} <> 'user' OR ${table.recordedByUserId} IS NOT NULL`,
    ),
  ],
);

/** Reserved revision evidence. A1 grants only reads and rejects all inserts;
 * A2 must replace the gate with the complete purchase recipe and evidence guards.
 */
export const cardActivity = financeSchema.table(
  "card_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    cardId: uuid("card_id").notNull(),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    activityKind: text("activity_kind").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    postingDate: date("posting_date", { mode: "string" }).notNull(),
    providerReference: text("provider_reference"),
    signedLiabilityMinor: bigint("signed_liability_minor", {
      mode: "bigint",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_card_activity_scope_id").on(table.workspaceId, table.id),
    unique("uq_card_activity_revision_card").on(
      table.workspaceId,
      table.actionRevisionId,
      table.cardId,
    ),
    unique("uq_card_activity_card_id").on(
      table.workspaceId,
      table.cardId,
      table.id,
    ),
    foreignKey({
      name: "fk_card_activity_card",
      columns: [table.workspaceId, table.cardId],
      foreignColumns: [creditCard.workspaceId, creditCard.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_card_activity_revision",
      columns: [table.workspaceId, table.actionId, table.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_card_activity_posted").on(
      table.workspaceId,
      table.cardId,
      table.postingDate,
      table.id,
    ),
    index("ix_card_activity_action_revision").on(
      table.workspaceId,
      table.actionId,
      table.actionRevisionId,
    ),
    check(
      "ck_card_activity_kind",
      sql`${table.activityKind} IN ('purchase', 'payment', 'fee', 'interest', 'refund', 'opening', 'adjustment')`,
    ),
    check("ck_card_activity_nonzero", sql`${table.signedLiabilityMinor} <> 0`),
    check(
      "ck_card_activity_reference",
      sql`${table.providerReference} IS NULL OR char_length(${table.providerReference}) BETWEEN 1 AND 2000`,
    ),
  ],
);
