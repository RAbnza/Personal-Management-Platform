import Link from "next/link";
import { ScreenHeader } from "@/components/patterns/work-area";
import { ActivityList } from "@/components/money/activity-list";
import { ActivityFilters } from "@/components/money/activity-filters";
import {
  listFinancialActions,
  financialActivityFiltersSchema,
} from "@/modules/finance/services/list-financial-actions";
import { reportSearchParams } from "@/modules/reporting/domain/search-params";
import { debtWorkspace } from "../debts/_workspace";

export default async function FinancialActionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await debtWorkspace();
  let filters;
  try {
    filters = financialActivityFiltersSchema.parse(
      reportSearchParams(await searchParams),
    );
  } catch {
    return (
      <div className="space-y-4">
        <ScreenHeader title="Check activity filters" scope="Money" />
        <p role="alert">
          Use supported funding and valid transaction or provider dates.
        </p>
        <Link href="/money/actions" className="text-link underline">
          Reset filters
        </Link>
      </div>
    );
  }
  let items;
  try {
    items = await listFinancialActions({
      userId: user.id,
      workspaceId: workspace.id,
      filters,
    });
  } catch {
    return (
      <p role="alert">
        Financial activity could not be loaded.{" "}
        <Link href="/money/actions" className="text-link underline">
          Retry this page
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Financial activity"
        scope="Money"
        description="Actual recorded actions, with their current revision and original evidence."
        action={
          <>
            <Link
              href="/money/transactions?kind=expense"
              className="inline-flex min-h-11 items-center rounded-button bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Add expense
            </Link>
            <Link
              href="/money/transactions?kind=income"
              className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-link"
            >
              Add income
            </Link>
            <Link
              href="/money/transfers"
              className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-link"
            >
              Transfer money
            </Link>
          </>
        }
      />
      <ActivityFilters key={JSON.stringify(filters)} filters={filters} />
      <ActivityList items={items} />
      <p className="text-xs leading-6 text-muted-foreground">
        Latest 100 logical actions matching these filters. Corrections remain
        revisions of their original action. Open account history for paginated
        signed ledger entries and balances; this activity source has no
        continuation cursor.
      </p>
    </div>
  );
}
