import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Panel } from "@/components/ui/panel";
import { RecurringOccurrenceForm } from "@/components/money/recurring-forms";
import { getRecurringOccurrence } from "@/modules/planning/services/read-recurring";
import { PlanningUnavailableError } from "@/modules/planning/domain/recurrence";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../../../debts/_workspace";
export default async function OccurrencePage({
  params,
  searchParams,
}: {
  params: Promise<{ occurrenceId: string }>;
  searchParams: Promise<{ actualCursor?: string; preferredActionId?: string }>;
}) {
  const { occurrenceId } = await params,
    q = await searchParams;
  if (
    !z.uuid().safeParse(occurrenceId).success ||
    (q.actualCursor && !z.uuid().safeParse(q.actualCursor).success) ||
    (q.preferredActionId && !z.uuid().safeParse(q.preferredActionId).success)
  )
    notFound();
  const { user, workspace } = await debtWorkspace();
  let data;
  try {
    data = await getRecurringOccurrence({
      userId: user.id,
      workspaceId: workspace.id,
      occurrenceId,
      ...(q.actualCursor ? { actualCursor: q.actualCursor } : {}),
      ...(q.preferredActionId
        ? { preferredActionId: q.preferredActionId }
        : {}),
    });
  } catch (e) {
    if (e instanceof PlanningUnavailableError) notFound();
    return (
      <Panel title="Recurring occurrence unavailable">
        <Link
          href={`/money/recurring/occurrences/${occurrenceId}`}
          className="action-link"
        >
          Retry this occurrence
        </Link>
      </Panel>
    );
  }
  const o = data.occurrence,
    editable = o.state === "planned" || o.state === "linked";
  return (
    <div className="space-y-6">
      <Link href={`/money/recurring/${data.root.id}`} className="action-link">
        Back to {data.root.name}
      </Link>
      <ScreenHeader
        scope="Money / Recurring"
        title={`${data.root.name} · ${o.due_date}`}
      />
      <Panel
        title="Planned occurrence"
        description="Expected evidence does not move money."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt>State</dt>
            <dd className="font-semibold">{o.state}</dd>
          </div>
          <div>
            <dt>Expected amount</dt>
            <dd>{formatMoneyMinorUnits("PHP", o.expected_minor)}</dd>
          </div>
          <div>
            <dt>Linked actual amount</dt>
            <dd>{formatMoneyMinorUnits("PHP", data.linkedMinor)}</dd>
          </div>
          <div>
            <dt>
              {o.state === "cancelled" || o.state === "skipped"
                ? "Historical unlinked expectation"
                : "Planned amount remaining"}
            </dt>
            <dd>{formatMoneyMinorUnits("PHP", data.remainingMinor)}</dd>
          </div>
          <div>
            <dt>Original logical date</dt>
            <dd>{o.logical_date}</dd>
          </div>
          <div>
            <dt>Definition timezone</dt>
            <dd>{data.rule.timezone}</dd>
          </div>
        </dl>
        {o.override_reason !== null && (
          <p className="mt-3">Override: {String(o.override_reason)}</p>
        )}
      </Panel>
      {editable && (
        <p>
          Choose an eligible existing actual transaction below, or{" "}
          <Link
            href={`/money/transactions?recurringOccurrenceId=${occurrenceId}`}
            className="action-link"
          >
            Record actual payment or receipt
          </Link>
          . Review the actual transaction first, then explicitly link its
          recorded evidence here. If linking is interrupted, select the existing
          transaction; do not record it again.
        </p>
      )}
      <p>
        <Link
          href={`/calendar/reminders/expected_occurrence/${occurrenceId}`}
          className="action-link"
        >
          Manage occurrence reminders
        </Link>
      </p>
      <Panel title="Occurrence management">
        <RecurringOccurrenceForm
          key={`${o.id}:${o.version}:${q.actualCursor ?? ""}:${q.preferredActionId ?? ""}`}
          data={data}
        />
        {data.nextActualCursor && (
          <Link
            href={`/money/recurring/occurrences/${occurrenceId}?actualCursor=${data.nextActualCursor}${q.preferredActionId ? `&preferredActionId=${q.preferredActionId}` : ""}`}
            className="action-link"
          >
            Next eligible actual transactions
          </Link>
        )}
      </Panel>
      <details className="rounded-control border border-border p-4">
        <summary className="min-h-11 cursor-pointer font-medium">
          Actual link and occurrence history
        </summary>
        <ul className="space-y-3 pt-3">
          {data.links.map((l) => (
            <li key={l.id}>
              {l.recordedAt} · {formatMoneyMinorUnits("PHP", l.linkedMinor)} ·{" "}
              {l.reversesLinkId
                ? "Exact reversal"
                : l.effective
                  ? "Effective confirmation"
                  : "Reversed confirmation"}{" "}
              ·{" "}
              <Link
                href={`/money/actions/${l.actionId}`}
                className="action-link"
              >
                Actual transaction history
              </Link>
              {l.reason ? ` · ${l.reason}` : ""}
            </li>
          ))}
        </ul>
        <ul className="space-y-2 pt-3">
          {data.history.map((h) => (
            <li key={h.id}>
              {h.recordedAt} · {String(h.after.state)} ·{" "}
              {h.reason ?? "Supported evidence recorded"}
            </li>
          ))}
        </ul>
        {data.history.length === 50 && (
          <p>Showing the latest 50 occurrence changes.</p>
        )}
      </details>
    </div>
  );
}
