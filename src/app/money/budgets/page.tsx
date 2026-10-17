import { ScreenHeader } from "@/components/patterns/work-area";
import {
  MoneyColumns,
  MoneyCreation,
} from "@/components/money/money-workspace";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { BudgetDefinitionForm } from "@/components/money/budget-forms";
import { BudgetComparison } from "@/components/money/budget-comparison";
import {
  listBudgets,
  budgetListQuerySchema,
} from "@/modules/planning/services/read-budgets";
import { listCategories } from "@/modules/core/services/list-categories";
import { debtWorkspace } from "../debts/_workspace";
export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await debtWorkspace(),
    scope = { userId: user.id, workspaceId: workspace.id },
    raw = await searchParams;
  const q = budgetListQuerySchema.safeParse(raw);
  if (!q.success)
    return (
      <div>
        <ScreenHeader scope="Money" title="Check budget filters" />
        <Link href="/money/budgets" className="text-link underline">
          Return to budgets
        </Link>
      </div>
    );
  let data, categories;
  try {
    data = await listBudgets({ ...scope, ...q.data });
    categories = await listCategories({ ...scope, kind: "expense" });
  } catch {
    return (
      <div>
        <ScreenHeader scope="Money" title="Budgets unavailable" />
        <Link href="/money/budgets" className="text-link underline">
          Retry private budgets
        </Link>
      </div>
    );
  }
  const pageParams = new URLSearchParams(
    Object.entries(q.data).map(([k, v]) => [k, String(v)]),
  );
  return (
    <div className="space-y-6">
      <ScreenHeader scope="Money" title="Category budgets" />
      <p>
        Spending limits compare with posted financial evidence. Expected
        recurring plans never enter actual spending.
      </p>
      <MoneyColumns>
        <Panel
          title="Recorded budgets"
          description="Every comparison covers its own full labelled period, including actual-period offsets."
        >
          <div className="space-y-5">
            {data.items.map((b) => (
              <section
                key={b.id}
                className="space-y-3 border-b border-border pb-4"
              >
                <h2 className="text-xl font-semibold">
                  <Link
                    href={`/money/budgets/${b.id}`}
                    aria-label={`${b.categoryName} budget ${b.start_date} through ${b.end_date_exclusive} exclusive`}
                    className="text-link underline"
                  >
                    {b.categoryName}
                  </Link>
                </h2>
                <BudgetComparison budget={b} />
              </section>
            ))}
            {!data.items.length && (
              <p>
                No matching budgets. Create an explicit category limit below.
              </p>
            )}
            {data.nextCursor && (
              <Link
                href={`/money/budgets?${new URLSearchParams({ ...Object.fromEntries(pageParams), cursor: data.nextCursor })}`}
                className="inline-flex min-h-11 items-center text-link underline"
              >
                Next budgets
              </Link>
            )}
            <Link
              href={
                q.data.includeArchived === "true"
                  ? "/money/budgets"
                  : "/money/budgets?includeArchived=true"
              }
              className="inline-flex min-h-11 items-center text-link underline"
            >
              {q.data.includeArchived === "true"
                ? "Show active budgets"
                : "Include archived budgets"}
            </Link>
          </div>
        </Panel>
        <MoneyCreation title="Create category budget">
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Review the category, dates and exact amount before confirming.
            Overlapping category periods are rejected.
          </p>
          <BudgetDefinitionForm
            categories={categories.items.map((c) => ({
              id: c.categoryId,
              name: c.name,
              archived: c.archived,
            }))}
            today={data.today}
          />
          {!categories.items.length && (
            <p>No active expense category is available for a new budget.</p>
          )}
        </MoneyCreation>
      </MoneyColumns>
      <p className="text-xs text-muted-foreground">
        Generated {data.generatedAt} · revision {data.financialRevision} ·{" "}
        {data.definitionVersion} · {data.financialDefinitionVersion}
      </p>
    </div>
  );
}
