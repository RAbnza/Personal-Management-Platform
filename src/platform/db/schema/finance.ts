import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user as authUser } from "./auth.generated";
import { category, commandReceipt, tag, workspace } from "./core";
import { financeSchema } from "./namespaces";

export const ledgerAccount = financeSchema.table(
  "ledger_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    currency: text("currency").notNull(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_ledger_account_scope_id").on(table.workspaceId, table.id),
    unique("uq_ledger_account_code").on(table.workspaceId, table.code),
    unique("uq_ledger_account_scope_currency").on(
      table.workspaceId,
      table.id,
      table.currency,
    ),

    foreignKey({
      name: "fk_ledger_account_workspace_currency",
      columns: [table.workspaceId, table.currency],
      foreignColumns: [workspace.id, workspace.currency],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_ledger_account_kind").on(table.workspaceId, table.kind, table.id),

    check(
      "ck_ledger_account_kind",
      sql`
        ${table.kind}
        IN (
          'cash_asset',
          'expense',
          'income',
          'opening_equity',
          'adjustment_equity'
        )
      `,
    ),
    check("ck_ledger_account_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "ck_ledger_account_name",
      sql`
        char_length(${table.name}) BETWEEN 1 AND 200
      `,
    ),
    check("ck_ledger_account_version", sql`${table.version} > 0`),
  ],
);

export const financialAccount = financeSchema.table(
  "financial_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    ledgerAccountId: uuid("ledger_account_id").notNull(),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(),
    institutionName: text("institution_name"),
    currency: text("currency").notNull(),
    openingCutoffDate: date("opening_cutoff_date", {
      mode: "string",
    }).notNull(),

    /**
     * Nonzero opening balances are represented by a real financial action,
     * not by a mutable balance column.
     *
     * finance.financial_action is declared later in this module. The
     * workspace-scoped opening-action foreign key is deliberately installed
     * in the reviewed S1 integrity migration because it participates in the
     * financial action/account relationship and requires additional semantic
     * validation.
     */
    openingActionId: uuid("opening_action_id"),

    notes: text("notes"),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_financial_account_scope_id").on(table.workspaceId, table.id),
    unique("uq_financial_account_ledger").on(
      table.workspaceId,
      table.ledgerAccountId,
    ),
    unique("uq_financial_account_scope_currency").on(
      table.workspaceId,
      table.id,
      table.currency,
    ),

    foreignKey({
      name: "fk_financial_account_ledger",
      columns: [table.workspaceId, table.ledgerAccountId],
      foreignColumns: [ledgerAccount.workspaceId, ledgerAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_financial_account_workspace_currency",
      columns: [table.workspaceId, table.currency],
      foreignColumns: [workspace.id, workspace.currency],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_financial_account_active_name").on(
      table.workspaceId,
      table.archivedAt,
      table.name,
      table.id,
    ),

    check(
      "ck_financial_account_type",
      sql`
        ${table.accountType}
        IN ('cash', 'e_wallet', 'checking', 'savings')
      `,
    ),
    check(
      "ck_financial_account_currency",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "ck_financial_account_name",
      sql`
        char_length(${table.name}) BETWEEN 1 AND 200
      `,
    ),
    check(
      "ck_financial_account_institution_name",
      sql`
        ${table.institutionName} IS NULL
        OR char_length(${table.institutionName}) BETWEEN 1 AND 200
      `,
    ),
    check(
      "ck_financial_account_notes",
      sql`
        ${table.notes} IS NULL
        OR char_length(${table.notes}) <= 20000
      `,
    ),
    check("ck_financial_account_version", sql`${table.version} > 0`),
  ],
);

export const financialAction = financeSchema.table(
  "financial_action",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    originalCommandReceiptId: uuid("original_command_receipt_id").notNull(),

    /**
     * The current revision pointer participates in a circular relationship:
     *
     * financial_action.current_revision_id -> action_revision
     * action_revision.action_id -> financial_action
     *
     * The column is deliberately NOT NULL here. The DEFERRABLE composite
     * foreign key is installed in the reviewed S1 integrity migration after
     * both tables and their scoped unique targets exist.
     */
    currentRevisionId: uuid("current_revision_id").notNull(),

    description: text("description").notNull(),
    reference: text("reference"),
    notes: text("notes"),

    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_financial_action_scope_id").on(table.workspaceId, table.id),

    unique("uq_financial_action_original_command").on(
      table.workspaceId,
      table.originalCommandReceiptId,
    ),

    foreignKey({
      name: "fk_financial_action_original_command",
      columns: [table.workspaceId, table.originalCommandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_financial_action_created").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),

    check(
      "ck_financial_action_description",
      sql`
        char_length(${table.description}) BETWEEN 1 AND 2000
      `,
    ),
    check(
      "ck_financial_action_notes",
      sql`
        ${table.notes} IS NULL
        OR char_length(${table.notes}) <= 20000
      `,
    ),
    check(
      "ck_financial_action_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_financial_action_actor_user",
      sql`
        ${table.actorKind} <> 'user'
        OR ${table.recordedByUserId} IS NOT NULL
      `,
    ),
    check("ck_financial_action_version", sql`${table.version} > 0`),
  ],
);

export const actionRevision = financeSchema.table(
  "action_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    revisionNo: integer("revision_no").notNull(),

    /**
     * The same-action previous-revision foreign key is installed in the
     * reviewed S1 integrity migration because it references this same table
     * through the scoped action identity.
     */
    previousRevisionId: uuid("previous_revision_id"),

    commandReceiptId: uuid("command_receipt_id").notNull(),
    changeKind: text("change_kind").notNull(),
    actionKind: text("action_kind").notNull(),
    primaryEffectiveDate: date("primary_effective_date", {
      mode: "string",
    }).notNull(),
    currency: text("currency").notNull(),
    reason: text("reason"),
    state: text("state").default("building").notNull(),
    finalizedAt: timestamp("finalized_at", {
      withTimezone: true,
    }),

    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_action_revision_scope_id").on(table.workspaceId, table.id),
    unique("uq_action_revision_number").on(
      table.workspaceId,
      table.actionId,
      table.revisionNo,
    ),
    unique("uq_action_revision_action_id").on(
      table.workspaceId,
      table.actionId,
      table.id,
    ),
    unique("uq_action_revision_scope_currency").on(
      table.workspaceId,
      table.id,
      table.currency,
    ),
    unique("uq_action_revision_command").on(
      table.workspaceId,
      table.commandReceiptId,
    ),

    foreignKey({
      name: "fk_action_revision_action",
      columns: [table.workspaceId, table.actionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_action_revision_command",
      columns: [table.workspaceId, table.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_action_revision_workspace_currency",
      columns: [table.workspaceId, table.currency],
      foreignColumns: [workspace.id, workspace.currency],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_action_revision_effective_date").on(
      table.workspaceId,
      table.primaryEffectiveDate.desc(),
      table.id.desc(),
    ),

    check("ck_action_revision_positive_revision", sql`${table.revisionNo} > 0`),
    check(
      "ck_action_revision_change_kind",
      sql`
        ${table.changeKind}
        IN ('create', 'replace', 'void')
      `,
    ),
    check(
      "ck_action_revision_action_kind",
      sql`
        ${table.actionKind}
        IN (
          'opening_cash',
          'income',
          'expense',
          'transfer',
          'standalone_fee'
        )
      `,
    ),
    check("ck_action_revision_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "ck_action_revision_state",
      sql`${table.state} IN ('building', 'posted')`,
    ),
    check(
      "ck_action_revision_finalization",
      sql`
        (
          ${table.state} = 'building'
          AND ${table.finalizedAt} IS NULL
        )
        OR
        (
          ${table.state} = 'posted'
          AND ${table.finalizedAt} IS NOT NULL
        )
      `,
    ),
    check(
      "ck_action_revision_change_shape",
      sql`
        (
          ${table.changeKind} = 'create'
          AND ${table.revisionNo} = 1
          AND ${table.previousRevisionId} IS NULL
        )
        OR
        (
          ${table.changeKind} IN ('replace', 'void')
          AND ${table.revisionNo} > 1
          AND ${table.previousRevisionId} IS NOT NULL
          AND ${table.reason} IS NOT NULL
          AND char_length(btrim(${table.reason})) > 0
        )
      `,
    ),
    check(
      "ck_action_revision_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_action_revision_actor_user",
      sql`
        ${table.actorKind} <> 'user'
        OR ${table.recordedByUserId} IS NOT NULL
      `,
    ),
  ],
);

export const journal = financeSchema.table(
  "journal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    sequenceNo: smallint("sequence_no").notNull(),
    effectiveDate: date("effective_date", {
      mode: "string",
    }).notNull(),
    currency: text("currency").notNull(),
    role: text("role").notNull(),

    /**
     * The scoped reversal-parent foreign key is installed in the reviewed S1
     * integrity migration after all journal uniqueness targets exist.
     */
    reversesJournalId: uuid("reverses_journal_id"),

    state: text("state").default("building").notNull(),
    finalizedAt: timestamp("finalized_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_journal_scope_id").on(table.workspaceId, table.id),
    unique("uq_journal_revision_sequence").on(
      table.workspaceId,
      table.actionRevisionId,
      table.sequenceNo,
    ),
    unique("uq_journal_revision_id_currency").on(
      table.workspaceId,
      table.actionRevisionId,
      table.id,
      table.currency,
    ),

    uniqueIndex("uq_journal_reversal")
      .on(table.workspaceId, table.reversesJournalId)
      .where(sql`${table.reversesJournalId} IS NOT NULL`),

    foreignKey({
      name: "fk_journal_action_revision",
      columns: [table.workspaceId, table.actionId, table.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_journal_workspace_currency",
      columns: [table.workspaceId, table.currency],
      foreignColumns: [workspace.id, workspace.currency],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_journal_effective_date").on(
      table.workspaceId,
      table.effectiveDate.desc(),
      table.id.desc(),
    ),

    check("ck_journal_sequence", sql`${table.sequenceNo} > 0`),
    check("ck_journal_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("ck_journal_role", sql`${table.role} IN ('economic', 'reversal')`),
    check(
      "ck_journal_reversal_shape",
      sql`
        (
          ${table.role} = 'economic'
          AND ${table.reversesJournalId} IS NULL
        )
        OR
        (
          ${table.role} = 'reversal'
          AND ${table.reversesJournalId} IS NOT NULL
        )
      `,
    ),
    check("ck_journal_state", sql`${table.state} IN ('building', 'posted')`),
    check(
      "ck_journal_finalization",
      sql`
        (
          ${table.state} = 'building'
          AND ${table.finalizedAt} IS NULL
        )
        OR
        (
          ${table.state} = 'posted'
          AND ${table.finalizedAt} IS NOT NULL
        )
      `,
    ),
  ],
);

export const posting = financeSchema.table(
  "posting",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    journalId: uuid("journal_id").notNull(),
    ledgerAccountId: uuid("ledger_account_id").notNull(),
    currency: text("currency").notNull(),
    lineNo: smallint("line_no").notNull(),
    amountMinor: bigint("amount_minor", {
      mode: "bigint",
    }).notNull(),
    categoryId: uuid("category_id"),
    expenseClass: text("expense_class").default("none").notNull(),
    incomeClass: text("income_class").default("none").notNull(),
    cashFlowKind: text("cash_flow_kind").default("none").notNull(),
    cashFlowDirection: text("cash_flow_direction").default("none").notNull(),
    liabilityComponent: text("liability_component"),

    /**
     * Exact reversal correspondence is installed in the handwritten integrity
     * migration together with the immutable/finalized posting rules.
     */
    reversesPostingId: uuid("reverses_posting_id"),

    memo: text("memo"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_posting_scope_id").on(table.workspaceId, table.id),
    unique("uq_posting_journal_line").on(
      table.workspaceId,
      table.journalId,
      table.lineNo,
    ),
    unique("uq_posting_revision_id").on(
      table.workspaceId,
      table.actionRevisionId,
      table.id,
    ),

    uniqueIndex("uq_posting_reversal")
      .on(table.workspaceId, table.reversesPostingId)
      .where(sql`${table.reversesPostingId} IS NOT NULL`),

    foreignKey({
      name: "fk_posting_action_revision",
      columns: [table.workspaceId, table.actionId, table.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_posting_journal",
      columns: [
        table.workspaceId,
        table.actionRevisionId,
        table.journalId,
        table.currency,
      ],
      foreignColumns: [
        journal.workspaceId,
        journal.actionRevisionId,
        journal.id,
        journal.currency,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_posting_ledger_account",
      columns: [table.workspaceId, table.ledgerAccountId, table.currency],
      foreignColumns: [
        ledgerAccount.workspaceId,
        ledgerAccount.id,
        ledgerAccount.currency,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_posting_category",
      columns: [table.workspaceId, table.categoryId],
      foreignColumns: [category.workspaceId, category.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_posting_ledger").on(
      table.workspaceId,
      table.ledgerAccountId,
      table.journalId,
      table.id,
    ),

    index("ix_posting_category")
      .on(table.workspaceId, table.categoryId, table.journalId)
      .where(sql`${table.categoryId} IS NOT NULL`),

    check("ck_posting_line", sql`${table.lineNo} > 0`),
    check(
      "ck_posting_amount",
      sql`
        ${table.amountMinor} <> 0
        AND ${table.amountMinor}
          BETWEEN -100000000000 AND 100000000000
      `,
    ),
    check("ck_posting_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "ck_posting_expense_class",
      sql`
        ${table.expenseClass}
        IN (
          'none',
          'gross',
          'refund_offset',
          'rebate_offset',
          'waiver_offset'
        )
      `,
    ),
    check(
      "ck_posting_income_class",
      sql`
        ${table.incomeClass}
        IN ('none', 'earned', 'gift', 'reward', 'other')
      `,
    ),
    check(
      "ck_posting_cash_flow_kind",
      sql`
        ${table.cashFlowKind}
        IN (
          'none',
          'income',
          'purchase',
          'transfer',
          'fee',
          'interest',
          'penalty',
          'borrowing',
          'debt_payment',
          'refund',
          'reward',
          'opening',
          'adjustment',
          'clearing'
        )
      `,
    ),
    check(
      "ck_posting_cash_flow_direction",
      sql`
        ${table.cashFlowDirection}
        IN (
          'none',
          'in',
          'out',
          'internal',
          'baseline',
          'adjustment'
        )
      `,
    ),
    check(
      "ck_posting_liability_component",
      sql`
        ${table.liabilityComponent} IS NULL
        OR ${table.liabilityComponent}
          IN (
            'principal',
            'interest',
            'fee',
            'penalty',
            'unclassified'
          )
      `,
    ),
    check(
      "ck_posting_memo",
      sql`
        ${table.memo} IS NULL
        OR char_length(${table.memo}) <= 20000
      `,
    ),
  ],
);

export const receiptDetail = financeSchema.table(
  "receipt_detail",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    receivingAccountId: uuid("receiving_account_id").notNull(),
    actualReceivedMinor: bigint("actual_received_minor", {
      mode: "bigint",
    }).notNull(),
    senderName: text("sender_name"),
    sourceLabel: text("source_label"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "pk_receipt_detail",
      columns: [table.workspaceId, table.actionRevisionId],
    }),

    foreignKey({
      name: "fk_receipt_detail_action_revision",
      columns: [table.workspaceId, table.actionId, table.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_receipt_detail_account",
      columns: [table.workspaceId, table.receivingAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_receipt_detail_account").on(
      table.workspaceId,
      table.receivingAccountId,
    ),

    check(
      "ck_receipt_detail_amount",
      sql`
        ${table.actualReceivedMinor} > 0
        AND ${table.actualReceivedMinor} <= 100000000000
      `,
    ),
  ],
);

export const purchaseDetail = financeSchema.table(
  "purchase_detail",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    fundingLedgerAccountId: uuid("funding_ledger_account_id").notNull(),
    purchaseMinor: bigint("purchase_minor", {
      mode: "bigint",
    }).notNull(),
    merchantName: text("merchant_name"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "pk_purchase_detail",
      columns: [table.workspaceId, table.actionRevisionId],
    }),

    foreignKey({
      name: "fk_purchase_detail_action_revision",
      columns: [table.workspaceId, table.actionId, table.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_purchase_detail_funding_ledger",
      columns: [table.workspaceId, table.fundingLedgerAccountId],
      foreignColumns: [ledgerAccount.workspaceId, ledgerAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_purchase_detail_funding_ledger").on(
      table.workspaceId,
      table.fundingLedgerAccountId,
    ),

    check(
      "ck_purchase_detail_amount",
      sql`
        ${table.purchaseMinor} > 0
        AND ${table.purchaseMinor} <= 100000000000
      `,
    ),
  ],
);

export const transferDetail = financeSchema.table(
  "transfer_detail",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    sourceAccountId: uuid("source_account_id").notNull(),
    destinationAccountId: uuid("destination_account_id").notNull(),
    sourcePrincipalMinor: bigint("source_principal_minor", {
      mode: "bigint",
    }).notNull(),
    destinationPrincipalMinor: bigint("destination_principal_minor", {
      mode: "bigint",
    }).notNull(),
    withheldFeeMinor: bigint("withheld_fee_minor", {
      mode: "bigint",
    })
      .default(sql`0`)
      .notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "pk_transfer_detail",
      columns: [table.workspaceId, table.actionRevisionId],
    }),

    foreignKey({
      name: "fk_transfer_detail_action_revision",
      columns: [table.workspaceId, table.actionId, table.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_transfer_detail_source_account",
      columns: [table.workspaceId, table.sourceAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_transfer_detail_destination_account",
      columns: [table.workspaceId, table.destinationAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_transfer_detail_source").on(
      table.workspaceId,
      table.sourceAccountId,
    ),

    index("ix_transfer_detail_destination").on(
      table.workspaceId,
      table.destinationAccountId,
    ),

    check(
      "ck_transfer_detail_distinct_accounts",
      sql`${table.sourceAccountId} <> ${table.destinationAccountId}`,
    ),
    check(
      "ck_transfer_detail_source_amount",
      sql`
        ${table.sourcePrincipalMinor} > 0
        AND ${table.sourcePrincipalMinor} <= 100000000000
      `,
    ),
    check(
      "ck_transfer_detail_destination_amount",
      sql`
        ${table.destinationPrincipalMinor} > 0
        AND ${table.destinationPrincipalMinor} <= 100000000000
      `,
    ),
    check(
      "ck_transfer_detail_fee_amount",
      sql`
        ${table.withheldFeeMinor} >= 0
        AND ${table.withheldFeeMinor} <= 100000000000
      `,
    ),
    check(
      "ck_transfer_detail_principal",
      sql`
        ${table.sourcePrincipalMinor}
          = ${table.destinationPrincipalMinor}
            + ${table.withheldFeeMinor}
      `,
    ),
  ],
);

export const feeComponent = financeSchema.table(
  "fee_component",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    label: text("label").notNull(),
    amountMinor: bigint("amount_minor", {
      mode: "bigint",
    }).notNull(),
    effectiveDate: date("effective_date", {
      mode: "string",
    }).notNull(),
    bearingLedgerAccountId: uuid("bearing_ledger_account_id").notNull(),
    expensePostingId: uuid("expense_posting_id").notNull(),
    treatment: text("treatment").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_fee_component_scope_id").on(table.workspaceId, table.id),

    unique("uq_fee_component_expense_posting").on(
      table.workspaceId,
      table.expensePostingId,
    ),

    foreignKey({
      name: "fk_fee_component_action_revision",
      columns: [table.workspaceId, table.actionId, table.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_fee_component_bearing_ledger",
      columns: [table.workspaceId, table.bearingLedgerAccountId],
      foreignColumns: [ledgerAccount.workspaceId, ledgerAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_fee_component_expense_posting",
      columns: [
        table.workspaceId,
        table.actionRevisionId,
        table.expensePostingId,
      ],
      foreignColumns: [
        posting.workspaceId,
        posting.actionRevisionId,
        posting.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_fee_component_revision_bearer").on(
      table.workspaceId,
      table.actionRevisionId,
      table.bearingLedgerAccountId,
    ),

    check(
      "ck_fee_component_label",
      sql`
        char_length(${table.label}) BETWEEN 1 AND 200
      `,
    ),
    check(
      "ck_fee_component_amount",
      sql`
        ${table.amountMinor} > 0
        AND ${table.amountMinor} <= 100000000000
      `,
    ),
    check(
      "ck_fee_component_treatment",
      sql`
        ${table.treatment}
        IN (
          'separate',
          'source_additional',
          'withheld',
          'capitalized'
        )
      `,
    ),
  ],
);

export const actionTag = financeSchema.table(
  "action_tag",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "pk_action_tag",
      columns: [table.workspaceId, table.actionId, table.tagId],
    }),

    foreignKey({
      name: "fk_action_tag_action",
      columns: [table.workspaceId, table.actionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_action_tag_tag",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tag.workspaceId, tag.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_action_tag_tag").on(
      table.workspaceId,
      table.tagId,
      table.actionId,
    ),
  ],
);
