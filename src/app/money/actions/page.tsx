import Link from "next/link";
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
  let items;
  try {
    items = await listFinancialActions({
      userId: user.id,
      workspaceId: workspace.id,
      filters: financialActivityFiltersSchema.parse(
        reportSearchParams(await searchParams),
      ),
    });
  } catch {
    return (
      <p role="alert">
        Financial activity could not be loaded. Retry this page.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Financial activity</h1>
      <nav className="flex flex-wrap gap-4">
        <Link
          href="/money/transactions"
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Add Expense
        </Link>
        <Link
          href="/money/actions?fundingSource=card"
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Card purchases
        </Link>
        <Link
          href="/money/actions?fundingSource=cash"
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Cash expenses
        </Link>
        <Link
          href="/money/actions"
          className="inline-flex min-h-11 items-center text-link underline"
        >
          All activity
        </Link>
      </nav>
      <p>
        Latest 100 logical actions. Corrections appear as revisions of their
        original action. Account history retains every signed ledger entry.
      </p>
      <ol className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.actionId} className="py-3">
            <Link
              className="text-link underline"
              href={`/money/actions/${i.actionId}`}
            >
              {i.description}
            </Link>
            <p>
              {i.actionKind.replaceAll("_", " ")} · {i.effectiveDate} · Revision{" "}
              {i.revisionNo}
              {i.changeKind === "void" ? " · Reversed" : ""}
            </p>
            {i.fundingName && (
              <p>
                Paid with {i.fundingName}
                {i.postingDate ? ` · Provider posted ${i.postingDate}` : ""}
              </p>
            )}
          </li>
        ))}
      </ol>
      {items.length === 0 && <p>No financial actions yet.</p>}
    </div>
  );
}
