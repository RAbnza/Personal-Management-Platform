import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type FinancialAccountListQueryRow = {
  financial_revision: string;

  account_id: string | null;
  name: string | null;
  account_type: string | null;
  institution_name: string | null;
  currency: string | null;
  opening_cutoff_date: string | null;
  notes: string | null;
  archived: boolean;
  current_balance_minor: string;
  version: number | null;
};

export async function readFinancialAccountList(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    includeArchived: boolean;
  },
): Promise<FinancialAccountListQueryRow[]> {
  const result = await transaction.db.execute<FinancialAccountListQueryRow>(sql`
      WITH "workspace_header" AS (
        SELECT
          workspace."id"
            AS "workspace_id",

          workspace."financial_revision"::text
            AS "financial_revision"

        FROM core."workspace"
          AS workspace

        INNER JOIN core."user_profile"
          AS profile
          ON profile."user_id" =
            workspace."owner_user_id"

        WHERE
          workspace."id" =
            ${input.workspaceId}::uuid

          AND workspace."state" =
            'active'

          AND profile."lifecycle" =
            'active'
      ),

      /*
       * Account balance is derived only from finalized ledger effects.
       *
       * This intentionally matches the account-history read model:
       * posted journal + posted action revision + signed postings.
       * There is no mutable balance column.
       */
      "account_balances" AS (
        SELECT
          posting."ledger_account_id",

          sum(
            posting."amount_minor"::numeric
          )::text
            AS "current_balance_minor"

        FROM finance."posting"
          AS posting

        INNER JOIN finance."journal"
          AS journal
          ON journal."workspace_id" =
            posting."workspace_id"

          AND journal."action_revision_id" =
            posting."action_revision_id"

          AND journal."id" =
            posting."journal_id"

        INNER JOIN finance."action_revision"
          AS revision
          ON revision."workspace_id" =
            posting."workspace_id"

          AND revision."id" =
            posting."action_revision_id"

        WHERE
          posting."workspace_id" =
            ${input.workspaceId}::uuid

          AND journal."state" =
            'posted'

          AND revision."state" =
            'posted'

        GROUP BY
          posting."ledger_account_id"
      )

      SELECT
        header."financial_revision",

        account."id"
          AS "account_id",

        account."name",

        account."account_type",

        account."institution_name",

        account."currency",

        account."opening_cutoff_date"::text
          AS "opening_cutoff_date",

        account."notes",

        (
          account."archived_at"
          IS NOT NULL
        )
          AS "archived",

        COALESCE(
          balance."current_balance_minor",
          '0'
        )
          AS "current_balance_minor",

        account."version"

      FROM "workspace_header"
        AS header

      LEFT JOIN finance."financial_account"
        AS account
        ON account."workspace_id" =
          header."workspace_id"

        AND (
          ${input.includeArchived}
          OR account."archived_at"
            IS NULL
        )

      LEFT JOIN "account_balances"
        AS balance
        ON balance."ledger_account_id" =
          account."ledger_account_id"

      ORDER BY
        (
          account."archived_at"
          IS NOT NULL
        ) ASC,

        lower(account."name")
          ASC NULLS LAST,

        account."id"
          ASC NULLS LAST
    `);

  return result.rows;
}
