import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { AgendaList } from "@/components/calendar/agenda-list";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { spendingHref } from "@/modules/reporting/domain/period";
import type { DashboardResult } from "@/modules/dashboard/services/get-dashboard";
import { DashboardFilters } from "./dashboard-filters";

const linkClass =
  "inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline";
export function DashboardView({
  data,
  moduleEnabled,
}: {
  data: DashboardResult;
  moduleEnabled: { money: boolean; career: boolean; time: boolean };
}) {
  const f = data.finance,
    money = (v: string) => formatMoneyMinorUnits(data.currency, v);
  const calendar = `/calendar?${new URLSearchParams({ startDate: data.today, endDate: data.horizon, source: data.filters.source })}`;
  return (
    <div className="space-y-6">
      <Panel
        title="What needs your attention?"
        description="Overdue commitments, upcoming Career activity and incomplete financial records."
      >
        {data.attention.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No attention items in your tracked records. Unrecorded obligations
            remain unknown.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.attention.map((item) => (
              <li key={item.key} className="py-3">
                <Link href={item.href} className={linkClass}>
                  {item.title}
                </Link>
                <p className="text-sm leading-6 text-muted-foreground">
                  {item.detail}
                </p>
              </li>
            ))}
          </ul>
        )}
        {data.overdueHasMore && (
          <Link
            className={linkClass}
            href={`/calendar?startDate=0001-01-01&endDate=${data.today}`}
          >
            Review all overdue Agenda sources
          </Link>
        )}
      </Panel>
      <DashboardFilters
        key={`${data.period.kind}:${data.period.startDate}:${data.filters.source}`}
        period={data.period.kind}
        startDate={data.period.startDate}
        endDate={data.period.endDate}
        source={data.filters.source}
      />
      <Panel
        title="Financial snapshot"
        description={`Current tracked balances; recognized spending from ${data.period.startDate} through ${data.period.endDate}.`}
      >
        {!moduleEnabled.money && (
          <p className="mb-4 text-sm text-muted-foreground">
            Money is hidden in navigation. Its owned records remain included.{" "}
            <Link className="text-link underline" href="/onboarding">
              Review module settings
            </Link>
            .
          </p>
        )}
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric
            title="Tracked liquid funds"
            value={
              data.coverage.noAccounts
                ? "No accounts tracked"
                : money(f.liquidMinor)
            }
            href="#tracked-accounts"
            note="All tracked cash accounts, including archived and negative balances."
          />
          <Metric
            title="Outstanding recognized liabilities"
            value={
              data.coverage.noDebts
                ? "No debts tracked"
                : money(f.liabilitiesMinor)
            }
            href="#tracked-debts"
            note="Posted liability balances. Available credit is never cash."
          />
          <Metric
            title="Net recognized spending"
            value={money(f.spending.netMinor)}
            href={spendingHref(data.period)}
            note={`Gross ${money(f.spending.grossMinor)} less offsets ${money(f.spending.offsetsMinor)}. Transfers and principal repayments excluded.`}
          />
          <Metric
            title="Tracked net position"
            value={
              data.coverage.noAccounts && data.coverage.noDebts
                ? "Coverage not established"
                : money(f.trackedNetMinor)
            }
            href="#financial-coverage"
            note="Liquid funds plus recognized debt credits less recognized liabilities; limited coverage."
          />
          <Metric
            title="Upcoming contractual payments"
            value={`${money(f.upcomingMinor)}${data.coverage.unknownSchedules ? " + unknown dues" : ""}`}
            href="#tracked-debts"
            note={`${data.today} through ${data.horizon}. Current due allocations, separate from recognized liability.`}
          />
          <Metric
            title="Remaining scheduled payable"
            value={`${money(f.scheduledMinor)}${data.coverage.unknownSchedules ? " + unknown dues" : ""}`}
            href="#tracked-debts"
            note={
              data.coverage.unknownSchedules
                ? `${data.coverage.unknownSchedules} debt schedule(s) unknown; total covers supplied schedules only.`
                : "Supplied active schedules after opening, direct and mapped satisfaction."
            }
          />
        </dl>
        <div
          id="financial-coverage"
          className="mt-5 space-y-2 rounded-control border border-border bg-muted p-4 text-sm leading-6"
        >
          <h3 className="font-semibold">Coverage and uncertainty</h3>
          <p>{data.coverage.scope}</p>
          <p>
            Excluded payment clearing: {money(f.clearingMinor)}. Recognized debt
            credit balances: {money(f.liabilityCreditMinor)}.
          </p>
          {data.coverage.incompleteLiabilities && (
            <p className="font-medium text-warning">
              Liability information is incomplete. Unknown principal breakdown
              and unresolved clearing are shown in attention items; this is not
              a complete net worth.
            </p>
          )}
          {data.coverage.periodBeforeCutoff && (
            <p className="font-medium text-warning">
              This period reaches an opening cutoff. Earlier activity is not
              supplied; spending coverage is incomplete.
            </p>
          )}
          {f.spending.baselineMinor !== "0" && (
            <p>
              Opening baseline additions in this period:{" "}
              {money(f.spending.baselineMinor)}; excluded from income and
              spending.
            </p>
          )}
          <p>
            Opening/import cutoffs are listed with each record below. A debt
            with no import cutoff was tracked from origination.
          </p>
        </div>
        <details id="tracked-accounts" className="mt-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Supporting cash accounts
          </summary>
          {f.accounts.length === 0 ? (
            <p>No cash accounts tracked. Add an account when you are ready.</p>
          ) : (
            <ul className="divide-y divide-border">
              {f.accounts.map((a) => (
                <li key={a.account_id} className="py-2">
                  <Link
                    className={linkClass}
                    href={`/money/accounts/${a.account_id}/history`}
                  >
                    {a.name}: {money(a.current_balance_minor)}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    Opening cutoff {a.opening_cutoff_date}
                    {a.archived ? " · Archived" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </details>
        <details id="tracked-debts" className="mt-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Supporting debt liabilities and schedules
          </summary>
          {f.debts.length === 0 ? (
            <p>No debt records tracked. Other liabilities remain unknown.</p>
          ) : (
            <ul className="divide-y divide-border">
              {f.debts.map((d) => (
                <li key={d.debtId} className="py-2">
                  <Link className={linkClass} href={`/money/debts/${d.debtId}`}>
                    {d.name}
                  </Link>
                  <p className="text-sm leading-6">
                    Recognized balance {money(d.liabilityMinor)} · Remaining
                    schedule{" "}
                    {d.scheduledMinor === null
                      ? "Not supplied / no active dues"
                      : money(d.scheduledMinor)}{" "}
                    · Upcoming {money(d.upcomingMinor)} · Overdue{" "}
                    {money(d.overdueMinor)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {d.cutoffDate
                      ? `Import cutoff ${d.cutoffDate}`
                      : "Tracked from origination"}{" "}
                    · Breakdown {d.breakdownStatus}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </details>
      </Panel>
      <Panel
        title="Career snapshot"
        description={`Open, unarchived attempts and scheduled events from ${data.today} through ${data.horizon}. Event counts are separate from application counts.`}
      >
        {!moduleEnabled.career && (
          <p className="mb-3 text-sm text-muted-foreground">
            Career is hidden in navigation. Preserved source records can still
            be reviewed.
          </p>
        )}
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            title="Active applications"
            value={String(data.career.activeCount)}
            href="#active-applications"
            note="Submitted/open attempts; saved and terminal outcomes excluded."
          />
          <Metric
            title="Interviews"
            value={String(data.career.interviews)}
            href="#career-events"
            note="Scheduled interview events."
          />
          <Metric
            title="Assessments"
            value={String(data.career.assessments)}
            href="#career-events"
            note="Scheduled assessment events."
          />
          <Metric
            title="Follow-ups"
            value={String(data.career.followUps)}
            href="#career-events"
            note="Scheduled follow-up events."
          />
        </dl>
        <details id="active-applications" className="mt-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Supporting applications ({data.career.activeCount} active,{" "}
            {data.career.savedCount} saved)
          </summary>
          {data.career.applications.length === 0 ? (
            <p>No open applications yet.</p>
          ) : (
            <ul>
              {data.career.applications.map((a) => (
                <li key={a.applicationId}>
                  <Link
                    href={`/career/applications/${a.applicationId}`}
                    className={linkClass}
                  >
                    {a.company} · {a.role} · {a.stage.replaceAll("_", " ")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </details>
        <details id="career-events" className="mt-3">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Supporting interviews, assessments and follow-ups
          </summary>
          {data.career.events.length === 0 ? (
            <p>No scheduled Career events in this range.</p>
          ) : (
            <ul>
              {data.career.events.map((e) => (
                <li key={e.eventId}>
                  <Link
                    className={linkClass}
                    href={`/career/applications/${e.applicationId}`}
                  >
                    {e.date} · {e.title} · {e.kind.replaceAll("_", " ")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </details>
      </Panel>
      <div>
        <AgendaList agenda={data.agenda} moduleEnabled={moduleEnabled} />
        <Link className={linkClass} href={calendar}>
          {data.agenda.nextCursor
            ? "View all commitments in this range"
            : "Open Calendar in this range"}
        </Link>
      </div>
      <Panel
        title="Recent activity"
        description="Latest changes to logical financial actions and Career/Calendar source records. Correction revisions do not create duplicate financial actions."
      >
        {data.activity.length === 0 ? (
          <p>No recorded activity yet.</p>
        ) : (
          <ol className="divide-y divide-border">
            {data.activity.map((a) => (
              <li key={a.key} className="py-2">
                <Link className={linkClass} href={a.href}>
                  {a.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {a.detail} ·{" "}
                  {new Intl.DateTimeFormat("en-PH", {
                    timeZone: data.timezone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(a.recordedAt))}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel title="Quick actions">
        <nav
          aria-label="Dashboard quick actions"
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {moduleEnabled.money && (
            <>
              <Link
                className={linkClass}
                href="/money/transactions?kind=expense"
              >
                Add expense
              </Link>
              <Link className={linkClass} href="/money/transfers">
                Transfer money
              </Link>
              <Link className={linkClass} href="/money/debts">
                Choose debt to record payment
              </Link>
              <Link className={linkClass} href="/money/accounts">
                Review accounts / reconciliation
              </Link>
            </>
          )}
          {moduleEnabled.career && (
            <Link className={linkClass} href="/career/applications/new">
              Add application
            </Link>
          )}
          <Link className={linkClass} href="/calendar">
            {moduleEnabled.time
              ? "Create event / open Calendar"
              : "Open Calendar"}
          </Link>
          <Link className={linkClass} href="/onboarding">
            Getting Started / module settings
          </Link>
        </nav>
      </Panel>
      <p className="text-xs leading-5 text-muted-foreground">
        {data.currency} · {data.timezone} · Generated {data.generatedAt} ·
        Financial revision {data.financialRevision} · Definition{" "}
        {data.definitionVersion}. Live queries include backdated corrections.
      </p>
    </div>
  );
}
function Metric({
  title,
  value,
  href,
  note,
}: {
  title: string;
  value: string;
  href: string;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-control border border-border p-4">
      <dt className="text-sm text-muted-foreground">{title}</dt>
      <dd>
        <Link
          href={href}
          aria-label={`${title}: ${value}`}
          className="inline-flex min-h-11 items-center break-words text-xl font-semibold text-link underline-offset-4 hover:underline"
        >
          {value}
        </Link>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{note}</p>
      </dd>
    </div>
  );
}
