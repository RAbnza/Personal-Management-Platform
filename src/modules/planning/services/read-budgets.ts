import { z } from "zod";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import { planningId } from "../domain/recurrence";
import {
  budgetDate,
  budgetEndDate,
  BudgetUnavailableError,
} from "../domain/budget";
import {
  readBudgetComparisons,
  type BudgetEvidence,
} from "../repositories/budget-repository";
import { readReportContext } from "@/modules/reporting/repositories/report-context-repository";
import { readSpendingContributions } from "@/modules/reporting/repositories/financial-report-repository";
const scope = z
  .object({ userId: planningId, workspaceId: planningId })
  .strict();
export const budgetListQuerySchema = z
  .object({
    categoryId: planningId.optional(),
    cursor: planningId.optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    includeArchived: z.enum(["true", "false"]).default("false"),
    startDate: budgetDate.optional(),
    endDate: budgetDate.optional(),
  })
  .strict()
  .refine(
    (q) =>
      (q.startDate === undefined) === (q.endDate === undefined) &&
      (!q.startDate || q.endDate! >= q.startDate),
    "Use both ordered intersection dates.",
  );
export async function listBudgets(
  input: z.input<typeof scope> & z.input<typeof budgetListQuerySchema>,
) {
  const { userId, workspaceId, ...raw } = input,
    s = scope.parse({ userId, workspaceId }),
    q = budgetListQuerySchema.parse(raw);
  return withDomainTransaction(
    s,
    async (t) => {
      const context = await readReportContext(t, s.workspaceId);
      const { includeArchived, endDate, ...selection } = q;
      return {
        ...context,
        ...(await readBudgetComparisons(t, s.workspaceId, {
          ...selection,
          includeArchived: includeArchived === "true",
          ...(endDate
            ? {
                endDateExclusive: new Date(
                  Date.parse(endDate + "T00:00:00Z") + 86400000,
                )
                  .toISOString()
                  .slice(0, 10),
              }
            : {}),
        })),
      };
    },
    { readOnlySnapshot: true },
  );
}
const detail = scope
  .extend({
    budgetId: planningId,
    historyCursor: planningId.optional(),
    contributionCursor: planningId.optional(),
  })
  .strict();
export async function getBudget(input: z.input<typeof detail>) {
  const p = detail.parse(input);
  return withDomainTransaction(
    p,
    async (t) => {
      const context = await readReportContext(t, p.workspaceId),
        page = await readBudgetComparisons(t, p.workspaceId, {
          budgetId: p.budgetId,
          includeArchived: true,
          pageSize: 1,
        }),
        b = page.items[0];
      if (!b) throw new BudgetUnavailableError();
      const history = await t.db.execute<{
        id: string;
        version: number;
        operation: string;
        reason: string | null;
        createdAt: string;
        before: BudgetEvidence | null;
        after: BudgetEvidence;
      }>(
        sql`SELECT id,subject_version version,operation,reason,created_at::text AS "createdAt",before_json AS before,after_json AS after FROM audit.private_revision WHERE workspace_id=${p.workspaceId}::uuid AND subject_kind='budget' AND subject_id=${p.budgetId}::uuid ${p.historyCursor ? sql`AND subject_version<(SELECT subject_version FROM audit.private_revision WHERE workspace_id=${p.workspaceId}::uuid AND subject_kind='budget' AND subject_id=${p.budgetId}::uuid AND id=${p.historyCursor}::uuid)` : sql``} ORDER BY subject_version DESC,id LIMIT 51`,
      );
      const contributions = await readSpendingContributions(t, {
        workspaceId: p.workspaceId,
        categoryId: b.category_id,
        period: {
          kind: "budget",
          startDate: b.start_date,
          endDate: budgetEndDate(b.end_date_exclusive),
          endDateExclusive: b.end_date_exclusive,
        },
        ...(p.contributionCursor ? { after: p.contributionCursor } : {}),
      });
      return {
        ...context,
        definitionVersion: page.definitionVersion,
        financialDefinitionVersion: page.financialDefinitionVersion,
        budget: b,
        history: {
          items: history.rows.slice(0, 50),
          nextCursor: history.rows.length > 50 ? history.rows[49]!.id : null,
        },
        contributions,
      };
    },
    { readOnlySnapshot: true },
  );
}
