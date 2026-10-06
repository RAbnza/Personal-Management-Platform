import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  index,
  integer,
  jsonb,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user as authUser } from "./auth.generated";
import { coreSchema } from "./namespaces";

const bytea = customType<{
  data: Buffer;
  driverData: Buffer;
}>({
  dataType() {
    return "bytea";
  },
});

export const userProfile = coreSchema.table(
  "user_profile",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUser.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    displayName: text("display_name").notNull(),
    lifecycle: text("lifecycle").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
    deletionRequestedAt: timestamp("deletion_requested_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    check(
      "user_profile_lifecycle_check",
      sql`${table.lifecycle} IN ('active', 'deletion_pending', 'purging')`,
    ),
    check(
      "user_profile_deletion_request_coherence_check",
      sql`
        (
          ${table.lifecycle} = 'active'
          AND ${table.deletionRequestedAt} IS NULL
        )
        OR
        (
          ${table.lifecycle} IN ('deletion_pending', 'purging')
          AND ${table.deletionRequestedAt} IS NOT NULL
        )
      `,
    ),
    check("user_profile_version_check", sql`${table.version} > 0`),
  ],
);

export const workspace = coreSchema.table(
  "workspace",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userProfile.userId, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    kind: text("kind").default("personal").notNull(),
    currency: text("currency").default("PHP").notNull(),
    timezone: text("timezone").default("Asia/Manila").notNull(),
    weekStart: smallint("week_start").default(1).notNull(),
    state: text("state").default("active").notNull(),
    financialRevision: bigint("financial_revision", { mode: "bigint" })
      .default(sql`0`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("workspace_personal_owner_unique")
      .on(table.ownerUserId)
      .where(sql`${table.kind} = 'personal'`),
    unique("workspace_id_currency_unique").on(table.id, table.currency),
    check("workspace_kind_check", sql`${table.kind} = 'personal'`),
    check(
      "workspace_week_start_check",
      sql`${table.weekStart} BETWEEN 0 AND 6`,
    ),
    check(
      "workspace_state_check",
      sql`
        ${table.state}
        IN ('active', 'deletion_pending', 'purging', 'restoring')
      `,
    ),
    check(
      "workspace_financial_revision_check",
      sql`${table.financialRevision} >= 0`,
    ),
    check("workspace_version_check", sql`${table.version} > 0`),
  ],
);

export const workspacePreference = coreSchema.table(
  "workspace_preference",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    locale: text("locale").default("en-PH").notNull(),
    theme: text("theme").default("system").notNull(),

    /**
     * finance.financial_account is introduced in S1.
     *
     * The column was created with the S0 ownership root, but its scoped foreign
     * key is deliberately added in the reviewed S1 integrity migration after
     * the target finance table exists. Application code must not write an
     * arbitrary value here before that constraint is installed.
     */
    defaultSalaryAccountId: uuid("default_salary_account_id"),

    gettingStartedDismissedAt: timestamp("getting_started_dismissed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    check(
      "workspace_preference_theme_check",
      sql`${table.theme} IN ('system', 'light', 'dark')`,
    ),
    check("workspace_preference_version_check", sql`${table.version} > 0`),
  ],
);

export const category = coreSchema.table(
  "category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    kind: text("kind").notNull(),
    code: text("code"),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
    }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_category_scope_id").on(table.workspaceId, table.id),

    uniqueIndex("uq_category_seed_code")
      .on(table.workspaceId, table.kind, table.code)
      .where(sql`${table.code} IS NOT NULL`),

    uniqueIndex("uq_category_active_name")
      .on(table.workspaceId, table.kind, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} IS NULL`),

    check("ck_category_kind", sql`${table.kind} IN ('income', 'expense')`),
    check(
      "ck_category_name",
      sql`
        char_length(${table.name}) BETWEEN 1 AND 200
      `,
    ),
    check("ck_category_version", sql`${table.version} > 0`),
  ],
);

export const tag = coreSchema.table(
  "tag",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    name: text("name").notNull(),
    color: text("color"),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_tag_scope_id").on(table.workspaceId, table.id),

    uniqueIndex("uq_tag_active_name")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} IS NULL`),

    check(
      "ck_tag_name",
      sql`
        char_length(${table.name}) BETWEEN 1 AND 200
      `,
    ),
    check("ck_tag_version", sql`${table.version} > 0`),
  ],
);

export const commandReceipt = coreSchema.table(
  "command_receipt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    clientCommandId: uuid("client_command_id").notNull(),
    commandType: text("command_type").notNull(),
    payloadHash: bytea("payload_hash").notNull(),
    hashVersion: integer("hash_version").default(1).notNull(),
    state: text("state").default("claimed").notNull(),
    resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),
    retainUntil: timestamp("retain_until", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_command_receipt_scope_id").on(table.workspaceId, table.id),
    unique("uq_command_receipt_client_command").on(
      table.workspaceId,
      table.clientCommandId,
    ),

    index("ix_command_receipt_expiry")
      .on(table.workspaceId, table.retainUntil)
      .where(sql`${table.retainUntil} IS NOT NULL`),

    check(
      "ck_command_receipt_hash_length",
      sql`octet_length(${table.payloadHash}) = 32`,
    ),
    check("ck_command_receipt_hash_version", sql`${table.hashVersion} > 0`),
    check(
      "ck_command_receipt_state",
      sql`${table.state} IN ('claimed', 'completed')`,
    ),
    check(
      "ck_command_receipt_completion",
      sql`
        (
          ${table.state} = 'claimed'
          AND ${table.resultJson} IS NULL
          AND ${table.completedAt} IS NULL
        )
        OR
        (
          ${table.state} = 'completed'
          AND ${table.resultJson} IS NOT NULL
          AND jsonb_typeof(${table.resultJson}) = 'object'
          AND ${table.completedAt} IS NOT NULL
        )
      `,
    ),
  ],
);
