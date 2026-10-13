import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { budgetEndDate } from "@/modules/planning/domain/budget";
import type { readBudgetComparisons } from "@/modules/planning/repositories/budget-repository";
type Page = Awaited<ReturnType<typeof readBudgetComparisons>>;
export function BudgetComparison({
  budget: b,
}: {
  budget: Page["items"][number];
}) {
  const money = (v: string) => formatMoneyMinorUnits("PHP", v),
    bp = b.progressBasisPoints === null ? null : BigInt(b.progressBasisPoints);
  return (
    <div className="space-y-3">
      <p>
        {b.start_date} through {budgetEndDate(b.end_date_exclusive)} · {b.basis}{" "}
        basis{b.archived_at ? " · Archived" : ""}
        {b.categoryArchived ? " · Category archived" : ""}
      </p>
      <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Budget limit", b.limit_minor],
          ["Gross recognized spending", b.grossMinor],
          ["Spending offsets", b.offsetsMinor],
          ["Net recognized spending", b.netMinor],
          ["Compared spending", b.spendingMinor],
          ["Remaining allowance", b.remainingMinor],
          ["Overspending", b.overspentMinor],
        ].map(([label, amount]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-semibold">{money(amount!)}</dd>
          </div>
        ))}
      </dl>
      <p
        className={
          b.status === "overspent"
            ? "font-semibold text-danger"
            : "font-semibold"
        }
      >
        {b.status === "overspent"
          ? "Over budget"
          : b.status === "at_limit"
            ? "At the limit"
            : "Within the limit"}
      </p>
      {bp === null ? (
        <p>Zero limit: percentage not applicable.</p>
      ) : (
        <>
          <progress
            className="h-3 w-full max-w-full"
            aria-label={`${b.categoryName} budget progress`}
            max={10000}
            value={Number(bp > 10000n ? 10000n : bp)}
          />
          <p>
            {bp / 100n}.{(bp % 100n).toString().padStart(2, "0")}% of the limit
            used
          </p>
        </>
      )}
    </div>
  );
}
export function BudgetSurfacePanel({
  data,
  period,
}: {
  data: Page;
  period?: { startDate: string; endDateExclusive: string };
}) {
  return (
    <Panel
      className="min-w-0 break-words"
      title="Category budgets"
      description="Each comparison covers its budget's complete labelled period, including actual-period refunds. Budgets never change balances."
    >
      <div className="space-y-5">
        {data.items.map((b) => (
          <section key={b.id} className="space-y-3 border-b border-border pb-4">
            <h3 className="font-semibold">
              <Link
                href={`/money/budgets/${b.id}`}
                aria-label={`${b.categoryName} budget ${b.start_date} through ${budgetEndDate(b.end_date_exclusive)}`}
                className="text-link underline"
              >
                {b.categoryName}
              </Link>
            </h3>
            <BudgetComparison budget={b} />
          </section>
        ))}
        {!data.items.length && (
          <p>No active category budgets intersect this period.</p>
        )}
        {data.nextCursor && (
          <p>Additional matching budgets are available in budget management.</p>
        )}
        <Link
          href={
            period
              ? `/money/budgets?${new URLSearchParams({ startDate: period.startDate, endDate: budgetEndDate(period.endDateExclusive) })}`
              : "/money/budgets"
          }
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Manage category budgets
        </Link>
        <p className="text-xs text-muted-foreground">
          {data.definitionVersion} · {data.financialDefinitionVersion}
        </p>
      </div>
    </Panel>
  );
}
