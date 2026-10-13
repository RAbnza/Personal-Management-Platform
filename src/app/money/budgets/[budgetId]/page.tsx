import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/panel";
import { BudgetComparison } from "@/components/money/budget-comparison";
import {
  BudgetDefinitionForm,
  BudgetLifecycleForm,
} from "@/components/money/budget-forms";
import { getBudget } from "@/modules/planning/services/read-budgets";
import {
  budgetEndDate,
  BudgetUnavailableError,
} from "@/modules/planning/domain/budget";
import { listCategories } from "@/modules/core/services/list-categories";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../../debts/_workspace";
const query = z
  .object({
    historyCursor: z.uuid().optional(),
    contributionCursor: z.uuid().optional(),
  })
  .strict();
export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ budgetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { budgetId } = await params,
    q = query.safeParse(await searchParams);
  if (!z.uuid().safeParse(budgetId).success || !q.success) notFound();
  const { user, workspace } = await debtWorkspace(),
    scope = { userId: user.id, workspaceId: workspace.id };
  let data, categories;
  try {
    data = await getBudget({ ...scope, budgetId, ...q.data });
    categories = await listCategories({
      ...scope,
      kind: "expense",
      includeArchived: true,
    });
  } catch (e) {
    if (e instanceof BudgetUnavailableError) notFound();
    return (
      <div>
        <h1 className="text-2xl font-semibold">Budget unavailable</h1>
        <Link
          href={`/money/budgets/${budgetId}`}
          className="text-link underline"
        >
          Retry this budget
        </Link>
      </div>
    );
  }
  const b = data.budget,
    base = `/money/budgets/${budgetId}`,
    pages = (extra: Record<string, string>) =>
      `${base}?${new URLSearchParams(Object.entries({ ...q.data, ...extra }).filter((entry): entry is [string, string] => entry[1] !== undefined))}`;
  return (
    <div className="space-y-6">
      <Link
        href="/money/budgets"
        className="inline-flex min-h-11 items-center text-link underline"
      >
        All budgets
      </Link>
      <h1 className="text-2xl font-semibold">{b.categoryName} budget</h1>
      <Panel
        title="Actual versus budget"
        description="Derived from signed posted contributions. This comparison never reserves or moves funds."
      >
        <BudgetComparison budget={b} />
        {b.notes && <p className="mt-4">{b.notes}</p>}
      </Panel>
      <details className="space-y-4">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Change budget definition
        </summary>
        <BudgetDefinitionForm
          key={`${b.id}:${b.version}`}
          initial={b}
          categories={categories.items.map((c) => ({
            id: c.categoryId,
            name: c.name,
            archived: c.archived,
          }))}
          today={data.today}
        />
      </details>
      <details className="space-y-4">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          {b.archived_at ? "Restore budget" : "Archive budget"}
        </summary>
        <BudgetLifecycleForm
          key={`${b.id}:${b.version}`}
          budgetId={b.id}
          version={b.version}
          archived={b.archived_at !== null}
        />
      </details>
      <Panel
        title="Budget definition history"
        description="Prior definitions remain immutable evidence; current financial comparisons are derived again when read."
      >
        <ol className="space-y-4">
          {data.history.items.map((h) => (
            <li key={h.id}>
              <p className="font-semibold">
                Version {h.version} · {h.operation} · {h.createdAt}
              </p>
              <p>{h.reason ?? "Initial budget definition"}</p>
              <p>
                {h.after.start_date} through{" "}
                {budgetEndDate(h.after.end_date_exclusive)} ·{" "}
                {formatMoneyMinorUnits("PHP", h.after.limit_minor)} ·{" "}
                {h.after.basis}
                {h.after.archived_at ? " · Archived" : ""}
              </p>
              <p>
                Category:{" "}
                {categories.items.find(
                  (c) => c.categoryId === h.after.category_id,
                )?.name ?? "Previously recorded expense category"}
              </p>
              {h.after.notes && <p>{h.after.notes}</p>}
            </li>
          ))}
        </ol>
        {data.history.nextCursor && (
          <Link
            href={pages({ historyCursor: data.history.nextCursor })}
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Earlier budget history
          </Link>
        )}
      </Panel>
      <Panel
        title="Recognized spending evidence"
        description="Signed original, reversal and replacement contributions for this category and the complete budget period. Transfers and principal repayments are excluded."
      >
        <ul className="space-y-3">
          {data.contributions.items.map((p) => (
            <li key={p.postingId}>
              <Link
                href={`/money/actions/${p.actionId}`}
                className="text-link underline"
              >
                {p.description}
              </Link>
              <p>
                {p.effectiveDate} ·{" "}
                {formatMoneyMinorUnits("PHP", p.amountMinor)} · {p.expenseClass}{" "}
                · {p.journalRole}
              </p>
            </li>
          ))}
        </ul>
        {!data.contributions.items.length && (
          <p>No posted category spending in this budget period.</p>
        )}
        {data.contributions.nextCursor && (
          <Link
            href={pages({ contributionCursor: data.contributions.nextCursor })}
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Earlier spending evidence
          </Link>
        )}
      </Panel>
      <p className="text-xs text-muted-foreground">
        Generated {data.generatedAt} · revision {data.financialRevision} ·{" "}
        {data.definitionVersion} · {data.financialDefinitionVersion}
      </p>
    </div>
  );
}
