import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type AccountHistoryCursorPosition = {
  effectiveDate: string;
  journalId: string;
};

export type AccountHistoryQueryRow = {
  account_id: string;
  account_name: string;
  account_type: string;
  institution_name: string | null;
  currency: string;
  opening_cutoff_date: string;
  archived: boolean;
  financial_revision: string;
  current_balance_minor: string;

  journal_id: string | null;
  action_id: string | null;
  action_revision_id: string | null;
  entry_effective_date: string | null;
  recorded_at: string | null;
  journal_role: string | null;
  change_kind: string | null;
  action_kind: string | null;
  description: string | null;
  reference: string | null;
  signed_amount_minor: string | null;
  balance_after_minor: string | null;
};

export async function readAccountHistoryPage(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    accountId: string;
    limit: number;
    cursor: AccountHistoryCursorPosition | null;
  },
): Promise<AccountHistoryQueryRow[]> {
  const cursorPredicate =
    input.cursor === null
      ? sql`TRUE`
      : sql`
          (
            "effective_date" < ${input.cursor.effectiveDate}::date
            OR (
              "effective_date" = ${input.cursor.effectiveDate}::date
              AND "journal_id" < ${input.cursor.journalId}::uuid
            )
          )
        `;

  const result = await transaction.db.execute<AccountHistoryQueryRow>(sql`
      WITH "target_account" AS (
        SELECT
          account."id" AS "account_id",
          account."ledger_account_id",
          account."name" AS "account_name",
          account."account_type",
          account."institution_name",
          account."currency",
          account."opening_cutoff_date",
          (account."archived_at" IS NOT NULL)
            AS "archived",
          workspace."financial_revision"::text
            AS "financial_revision"
        FROM "finance"."financial_account" AS account
        INNER JOIN "core"."workspace" AS workspace
          ON workspace."id" = account."workspace_id"
        WHERE
          account."workspace_id" = ${input.workspaceId}::uuid
          AND account."id" = ${input.accountId}::uuid
      ),

      "account_entries" AS (
        SELECT
          journal."id" AS "journal_id",
          journal."action_id",
          journal."action_revision_id",
          journal."effective_date",
          journal."role" AS "journal_role",

          revision."change_kind",
          revision."action_kind",

          to_char(
            revision."created_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) AS "recorded_at",

          action."description",
          action."reference",

          sum(
            posting."amount_minor"::numeric
          ) AS "signed_amount_minor"

        FROM "target_account" AS target

        INNER JOIN "finance"."posting" AS posting
          ON posting."workspace_id" = ${input.workspaceId}::uuid
          AND posting."ledger_account_id" =
            target."ledger_account_id"

        INNER JOIN "finance"."journal" AS journal
          ON journal."workspace_id" =
            posting."workspace_id"
          AND journal."action_revision_id" =
            posting."action_revision_id"
          AND journal."id" =
            posting."journal_id"

        INNER JOIN "finance"."action_revision" AS revision
          ON revision."workspace_id" =
            journal."workspace_id"
          AND revision."id" =
            journal."action_revision_id"

        INNER JOIN "finance"."financial_action" AS action
          ON action."workspace_id" =
            journal."workspace_id"
          AND action."id" =
            journal."action_id"

        WHERE
          journal."state" = 'posted'
          AND revision."state" = 'posted'

        GROUP BY
          journal."id",
          journal."action_id",
          journal."action_revision_id",
          journal."effective_date",
          journal."role",
          revision."change_kind",
          revision."action_kind",
          revision."created_at",
          action."description",
          action."reference"
      ),

      "running_entries" AS (
        SELECT
          entry.*,

          sum(
            entry."signed_amount_minor"
          ) OVER (
            ORDER BY
              entry."effective_date" ASC,
              entry."journal_id" ASC
            ROWS BETWEEN
              UNBOUNDED PRECEDING
              AND CURRENT ROW
          ) AS "balance_after_minor"

        FROM "account_entries" AS entry
      ),

      "paged_entries" AS (
        SELECT *
        FROM "running_entries"
        WHERE ${cursorPredicate}
        ORDER BY
          "effective_date" DESC,
          "journal_id" DESC
        LIMIT ${input.limit}
      ),

      "account_balance" AS (
        SELECT
          COALESCE(
            sum("signed_amount_minor"),
            0
          )::text AS "current_balance_minor"
        FROM "account_entries"
      )

      SELECT
        target."account_id",
        target."account_name",
        target."account_type",
        target."institution_name",
        target."currency",
        target."opening_cutoff_date"::text
          AS "opening_cutoff_date",
        target."archived",
        target."financial_revision",

        balance."current_balance_minor",

        entry."journal_id",
        entry."action_id",
        entry."action_revision_id",
        entry."effective_date"::text
          AS "entry_effective_date",
        entry."recorded_at",
        entry."journal_role",
        entry."change_kind",
        entry."action_kind",
        entry."description",
        entry."reference",
        entry."signed_amount_minor"::text
          AS "signed_amount_minor",
        entry."balance_after_minor"::text
          AS "balance_after_minor"

      FROM "target_account" AS target

      CROSS JOIN "account_balance" AS balance

      LEFT JOIN "paged_entries" AS entry
        ON TRUE

      ORDER BY
        entry."effective_date" DESC NULLS LAST,
        entry."journal_id" DESC NULLS LAST
    `);

  return result.rows;
}
