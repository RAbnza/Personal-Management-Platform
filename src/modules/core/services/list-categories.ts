import { z } from "zod";

import { readCategoryList } from "@/modules/core/repositories/category-read-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const CATEGORY_KINDS = ["income", "expense"] as const;

const categoryKindSchema = z.enum(CATEGORY_KINDS);

const listCategoriesInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    kind: categoryKindSchema.optional(),

    includeArchived: z.boolean().default(false),
  })
  .strict();

export type ListCategoriesInput = z.input<typeof listCategoriesInputSchema>;

export type CategoryListItem = {
  categoryId: string;

  kind: z.infer<typeof categoryKindSchema>;

  code: string | null;

  name: string;

  archivedAt: string | null;

  archived: boolean;

  sortOrder: number;

  version: number;
};

export type ListCategoriesResult = {
  items: CategoryListItem[];
};

export class CategoryWorkspaceUnavailableError extends Error {
  readonly code = "CATEGORY_WORKSPACE_UNAVAILABLE";

  constructor() {
    super("The active workspace could not be resolved for categories.");

    this.name = "CategoryWorkspaceUnavailableError";
  }
}

type NormalizedListCategoriesInput = {
  userId: string;
  workspaceId: string;

  kind: "income" | "expense" | null;

  includeArchived: boolean;
};

function normalizeInput(
  input: ListCategoriesInput,
): NormalizedListCategoriesInput {
  const parsed = listCategoriesInputSchema.parse(input);

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    kind: parsed.kind ?? null,

    includeArchived: parsed.includeArchived,
  };
}

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

async function executeListCategories(
  transaction: ScopedTransaction,
  input: NormalizedListCategoriesInput,
): Promise<ListCategoriesResult> {
  const rows = await readCategoryList(transaction, {
    workspaceId: input.workspaceId,

    kind: input.kind,

    includeArchived: input.includeArchived,
  });

  const firstRow = rows[0];

  if (!firstRow) {
    throw new CategoryWorkspaceUnavailableError();
  }

  const items = rows.flatMap((row): CategoryListItem[] => {
    /*
     * The workspace-header LEFT JOIN intentionally produces one row for a
     * valid workspace even if the requested category filter has no matches.
     */
    if (row.category_id === null) {
      return [];
    }

    if (
      row.kind === null ||
      row.name === null ||
      row.sort_order === null ||
      row.version === null
    ) {
      throw new Error("Category list query returned an incomplete category.");
    }

    const kind = categoryKindSchema.parse(row.kind);

    const archivedAt = normalizeInstant(row.archived_at);

    return [
      {
        categoryId: row.category_id,

        kind,

        code: row.code,

        name: row.name,

        archivedAt,

        archived: archivedAt !== null,

        sortOrder: row.sort_order,

        version: row.version,
      },
    ];
  });

  return {
    items,
  };
}

export async function listCategoriesInTransaction(
  transaction: ScopedTransaction,
  input: ListCategoriesInput,
): Promise<ListCategoriesResult> {
  return executeListCategories(transaction, normalizeInput(input));
}

export async function listCategories(
  input: ListCategoriesInput,
): Promise<ListCategoriesResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,
      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeListCategories(transaction, normalized),
  );
}
