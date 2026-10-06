import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type CategoryListQueryRow = {
  category_id: string | null;
  kind: string | null;
  code: string | null;
  name: string | null;
  archived_at: string | null;
  sort_order: number | null;
  version: number | null;
};

export async function readCategoryList(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    kind: "income" | "expense" | null;
    includeArchived: boolean;
  },
): Promise<CategoryListQueryRow[]> {
  const kindPredicate =
    input.kind === null ? sql`TRUE` : sql`category."kind" = ${input.kind}`;

  const result = await transaction.db.execute<CategoryListQueryRow>(sql`
      WITH "workspace_header" AS (
        SELECT
          workspace."id"
            AS "workspace_id"

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
      )

      SELECT
        category."id"
          AS "category_id",

        category."kind",

        category."code",

        category."name",

        category."archived_at"::text
          AS "archived_at",

        category."sort_order",

        category."version"

      FROM "workspace_header"
        AS header

      LEFT JOIN core."category"
        AS category
        ON category."workspace_id" =
          header."workspace_id"

        AND ${kindPredicate}

        AND (
          ${input.includeArchived}
          OR category."archived_at"
            IS NULL
        )

      ORDER BY
        CASE category."kind"
          WHEN 'income' THEN 0
          WHEN 'expense' THEN 1
          ELSE 2
        END,

        category."sort_order"
          ASC NULLS LAST,

        lower(category."name")
          ASC NULLS LAST,

        category."id"
          ASC NULLS LAST
    `);

  return result.rows;
}
