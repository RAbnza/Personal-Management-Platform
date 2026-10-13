import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Panel } from "@/components/ui/panel";
import {
  RecurringDefinitionForm,
  RecurringDefinitionActions,
} from "@/components/money/recurring-forms";
import { getRecurringObligation } from "@/modules/planning/services/read-recurring";
import {
  PlanningUnavailableError,
  planningToday,
} from "@/modules/planning/domain/recurrence";
import { listFinancialAccounts } from "@/modules/finance/services/list-financial-accounts";
import { listCategories } from "@/modules/core/services/list-categories";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../../debts/_workspace";
export default async function RecurringDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ obligationId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { obligationId } = await params,
    q = await searchParams;
  if (
    !z.uuid().safeParse(obligationId).success ||
    (q.cursor && !z.uuid().safeParse(q.cursor).success)
  )
    notFound();
  const { user, workspace } = await debtWorkspace(),
    scope = { userId: user.id, workspaceId: workspace.id };
  let data, accounts, categories;
  try {
    data = await getRecurringObligation({
      ...scope,
      obligationId,
      ...(q.cursor ? { cursor: q.cursor } : {}),
    });
    accounts = await listFinancialAccounts({
      ...scope,
      includeArchived: false,
    });
    categories = await listCategories({ ...scope, includeArchived: false });
  } catch (e) {
    if (e instanceof PlanningUnavailableError) notFound();
    return (
      <Panel title="Recurring definition unavailable">
        <Link
          href={`/money/recurring/${obligationId}`}
          className="text-link underline"
        >
          Retry this definition
        </Link>
      </Panel>
    );
  }
  const current = data.versions.at(-1)!;
  return (
    <div className="space-y-6">
      <Link
        href="/money/recurring"
        className="inline-flex min-h-11 items-center text-link underline"
      >
        All recurring obligations
      </Link>
      <h1 className="text-2xl font-semibold">{data.root.name}</h1>
      <p>
        {data.root.kind} ·{" "}
        {formatMoneyMinorUnits("PHP", current.rule.expectedMinor)} expected ·{" "}
        {current.rule.timezone}
        {data.root.archived_at !== null ? " · Archived" : ""}
      </p>
      <p>
        Expected dates and amounts are plans, excluded from actual financial
        totals. Partially linked commitments stay under their original rule when
        future rules change.
      </p>
      <Panel title="Expected occurrences">
        <ul className="divide-y divide-border">
          {data.occurrences.items.map((o) => (
            <li key={o.id} className="py-3">
              <Link
                href={`/money/recurring/occurrences/${o.id}`}
                className="inline-flex min-h-11 items-center text-link underline"
              >
                {o.dueDate} · {o.state} ·{" "}
                {formatMoneyMinorUnits("PHP", o.expectedMinor)} expected
              </Link>
              <p>
                Linked {formatMoneyMinorUnits("PHP", o.linkedMinor)} · remaining{" "}
                {formatMoneyMinorUnits("PHP", o.remainingMinor)} · logical date{" "}
                {o.logicalDate}
                {o.overrideReason ? ` · Override: ${o.overrideReason}` : ""}
              </p>
            </li>
          ))}
        </ul>
        {!data.occurrences.items.length && (
          <p>
            No occurrences in recorded history. Generate a bounded window to
            extend this plan.
          </p>
        )}
        {data.occurrences.nextCursor && (
          <Link
            href={`/money/recurring/${obligationId}?cursor=${data.occurrences.nextCursor}`}
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Next occurrences
          </Link>
        )}
      </Panel>
      {data.root.archived_at === null && (
        <>
          <Panel title="Extend or archive the plan">
            <RecurringDefinitionActions
              key={data.root.version}
              obligationId={obligationId}
              version={data.root.version}
              today={planningToday(current.rule.timezone)}
            />
          </Panel>
          <details className="rounded-control border border-border p-4">
            <summary className="min-h-11 cursor-pointer font-medium">
              Change future recurrence
            </summary>
            <p className="my-3">
              Choose a future boundary. Completed, skipped, linked and past
              occurrences remain intact; only outstanding unlinked future plans
              are replaced.
            </p>
            <RecurringDefinitionForm
              key={data.root.version}
              timezone={current.rule.timezone}
              accounts={accounts.items.map((a) => ({
                id: a.accountId,
                name: a.name,
              }))}
              categories={categories.items.map((c) => ({
                id: c.categoryId,
                name: c.name,
                kind: c.kind,
              }))}
              initial={{
                id: obligationId,
                name: data.root.name,
                kind: data.root.kind,
                version: data.root.version,
                rule: current.rule,
              }}
            />
          </details>
        </>
      )}
      <details className="rounded-control border border-border p-4">
        <summary className="min-h-11 cursor-pointer font-medium">
          Immutable rule and definition history
        </summary>
        <ul className="space-y-3 pt-3">
          {data.versions.map((v) => (
            <li key={v.id}>
              Rule {v.versionNo}: effective {v.rule.effectiveFrom},{" "}
              {v.rule.frequency} every {v.rule.intervalCount},{" "}
              {formatMoneyMinorUnits("PHP", v.rule.expectedMinor)} ·{" "}
              {v.rule.timezone}
              {v.rule.weekdays
                ? ` · ISO weekdays ${v.rule.weekdays.join(", ")}`
                : ""}
              {v.rule.dayOfMonth
                ? ` · day ${v.rule.dayOfMonth} (${v.rule.shortMonthPolicy})`
                : ""}
              {v.rule.endsOn ? ` · ends ${v.rule.endsOn}` : ""}
              {v.rule.occurrenceLimit
                ? ` · maximum ${v.rule.occurrenceLimit} occurrences`
                : ""}
              {v.evidence.reason ? ` · ${String(v.evidence.reason)}` : ""}
            </li>
          ))}
        </ul>
        <ul className="space-y-2 pt-3">
          {data.history.map((h) => (
            <li key={h.id}>
              {h.createdAt} · {h.operation} · {h.reason ?? "Definition created"}
            </li>
          ))}
        </ul>
        {data.history.length === 50 && (
          <p>
            Showing the latest 50 definition changes; immutable rule versions
            remain listed above.
          </p>
        )}
      </details>
    </div>
  );
}
