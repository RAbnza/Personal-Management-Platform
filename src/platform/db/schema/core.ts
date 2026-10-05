import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user as authUser } from "./auth.generated";
import { coreSchema } from "./namespaces";

export const userProfile = coreSchema.table(
  "user_profile",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUser.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    lifecycle: text("lifecycle").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
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
  ],
);

export const workspace = coreSchema.table(
  "workspace",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userProfile.userId, { onDelete: "restrict" }),
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
  ],
);

export const workspacePreference = coreSchema.table(
  "workspace_preference",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspace.id, { onDelete: "cascade" }),
    locale: text("locale").default("en-PH").notNull(),
    theme: text("theme").default("system").notNull(),

    /**
     * The target finance.financial_account table belongs to S1 and does not
     * exist yet. The column is introduced now as documented, but its scoped
     * foreign key is intentionally added with the financial-account schema.
     *
     * No application write path should set this field before that migration.
     */
    defaultSalaryAccountId: uuid("default_salary_account_id"),

    gettingStartedDismissedAt: timestamp("getting_started_dismissed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "workspace_preference_theme_check",
      sql`${table.theme} IN ('system', 'light', 'dark')`,
    ),
  ],
);
