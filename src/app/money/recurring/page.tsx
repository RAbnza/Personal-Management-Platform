import { ScreenHeader } from "@/components/patterns/work-area";
import {
  MoneyColumns,
  MoneyCreation,
} from "@/components/money/money-workspace";
import Link from "next/link";
import { z } from "zod";
import { Panel } from "@/components/ui/panel";
import { RecurringDefinitionForm } from "@/components/money/recurring-forms";
import { listRecurringObligations } from "@/modules/planning/services/read-recurring";
import { listFinancialAccounts } from "@/modules/finance/services/list-financial-accounts";
import { listCategories } from "@/modules/core/services/list-categories";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../debts/_workspace";
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { user, workspace } = await debtWorkspace(),
    q = await searchParams;
  if (q.cursor && !z.uuid().safeParse(q.cursor).success)
    return (
      <Panel title="Invalid recurring page">
        <Link href="/money/recurring" className="text-link underline">
          Return to recurring obligations
        </Link>
      </Panel>
    );
  const scope = { userId: user.id, workspaceId: workspace.id };
  let data, accounts, categories;
  try {
    data = await listRecurringObligations({
      ...scope,
      ...(q.cursor ? { cursor: q.cursor } : {}),
    });
    accounts = await listFinancialAccounts({
      ...scope,
      includeArchived: false,
    });
    categories = await listCategories({ ...scope, includeArchived: false });
  } catch {
    return (
      <Panel
        title="Recurring obligations unavailable"
        description="Your private plans could not be loaded safely."
      >
        <Link href="/money/recurring" className="text-link underline">
          Retry loading recurring obligations
        </Link>
      </Panel>
    );
  }
  return (
    <div className="space-y-6">
      <ScreenHeader scope="Money" title="Recurring obligations" />
      <p>
        Plan income, bills and subscriptions. Due dates never post money; actual
        balances and reports use recorded transactions only.
      </p>
      <MoneyColumns>
        <Panel title="Recorded definitions">
          <ul className="divide-y divide-border">
            {data.items.map((p) => (
              <li key={p.id} className="py-3">
                <Link
                  href={`/money/recurring/${p.id}`}
                  className="text-link underline"
                >
                  {p.name}
                </Link>
                <p>
                  {p.kind} · {p.rule.frequency} ·{" "}
                  {formatMoneyMinorUnits("PHP", p.rule.expectedMinor)} expected
                  {p.archived ? " · Archived" : ""}
                </p>
              </li>
            ))}
          </ul>
          {!data.items.length && <p>No recurring definitions yet.</p>}
          {data.nextCursor && (
            <Link
              href={`/money/recurring?cursor=${data.nextCursor}`}
              className="inline-flex min-h-11 items-center text-link underline"
            >
              Next definitions
            </Link>
          )}
        </Panel>
        <MoneyCreation title="Create recurring plan">
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Preview the next dates, then confirm a bounded schedule.
          </p>
          <RecurringDefinitionForm
            timezone={workspace.timezone}
            accounts={accounts.items.map((a) => ({
              id: a.accountId,
              name: a.name,
            }))}
            categories={categories.items.map((c) => ({
              id: c.categoryId,
              name: c.name,
              kind: c.kind,
            }))}
          />
        </MoneyCreation>
      </MoneyColumns>
    </div>
  );
}
