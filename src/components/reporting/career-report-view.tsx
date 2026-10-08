import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import type { CareerReport } from "@/modules/reporting/services/get-reports";
export function CareerReportView({ data }: { data: CareerReport }) {
  const metrics = [
    ["Submitted attempts", data.summary.submitted, "submitted"],
    ["Explicit responses", data.summary.responded, "responded"],
    [
      "Applications reaching interview",
      data.summary.interviewed,
      "interviewed",
    ],
    ["Applications reaching offer", data.summary.offered, "offered"],
    ["Rejected as of cutoff", data.summary.rejected, "rejected"],
  ] as const;
  const groups = Object.entries(
    Object.groupBy(data.applications, (a) => a.source ?? "Unspecified source"),
  );
  return (
    <div className="space-y-6">
      <Panel title="Cohort definition and coverage">
        <p>{data.coverage.note}</p>
        <p className="mt-2">
          Submission cohort: {data.period.startDate} through{" "}
          {data.period.endDate}. Effective observation cutoff: {data.asOfDate}.
          Same-company attempts are separate applications. Saved opportunities
          are excluded; archived submitted attempts are included.
        </p>
        <p className="mt-2 text-sm">
          Stage durations use full calendar-day differences, retain repeated
          stages and include open stages through the cutoff. Superseded
          observations are excluded from calculations and preserved in
          application history / CSV. Terminal stages have no active-stage
          elapsed time. Unknown response history is not proof that a provider
          never responded.
        </p>
      </Panel>
      <Panel title="Submitted-date cohort">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map(([label, value, metric]) => (
            <Link
              className="rounded-control border border-border p-4 text-link"
              href={`#${metric}-records`}
              key={metric}
            >
              <p className="text-sm">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {value}
              </p>
            </Link>
          ))}
          <Link
            href="#responded-records"
            className="rounded-control border border-border p-4 text-link"
          >
            <p className="text-sm">Response conversion (same cohort)</p>
            <p className="mt-1 font-semibold">
              {data.summary.responseRate
                ? `${data.summary.responseRate.numerator} / ${data.summary.responseRate.denominator}`
                : "Not applicable (empty denominator)"}
            </p>
          </Link>
        </div>
      </Panel>
      {metrics.map(([label, , metric]) => {
        const apps = data.applications.filter(
          (a) =>
            metric === "submitted" ||
            (metric === "rejected" && a.outcome === "rejected") ||
            (metric !== "rejected" && a[metric]),
        );
        return (
          <section
            key={metric}
            id={`${metric}-records`}
            className="scroll-mt-20"
          >
            <Panel title={`${label} · supporting attempts`}>
              {apps.length ? (
                <ul>
                  {apps.map((a) => (
                    <li key={a.applicationId}>
                      <Link
                        className="inline-flex min-h-11 items-center text-link underline"
                        href={`/career/applications/${a.applicationId}`}
                      >
                        {a.company} · {a.role} · submitted {a.appliedDate} ·{" "}
                        {a.stage}
                        {a.outcome ? ` / ${a.outcome}` : ""}
                        {a.archived ? " · archived" : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No matching attempts with supplied evidence.</p>
              )}
            </Panel>
          </section>
        );
      })}
      <Panel
        title="Results by application source"
        description="Distinct attempts in this same submitted-date cohort, grouped once per source."
      >
        <ul>
          {groups.map(([source, apps]) => (
            <li key={source} className="mb-3">
              <p className="font-medium">
                {source}: {apps!.length} attempts
              </p>
              {apps!.map((a) => (
                <Link
                  key={a.applicationId}
                  className="mr-3 inline-flex min-h-11 items-center text-link underline"
                  href={`/career/applications/${a.applicationId}`}
                >
                  {a.company} · {a.role}
                </Link>
              ))}
            </li>
          ))}
        </ul>
        {!groups.length && <p>No submitted attempts in this cohort.</p>}
      </Panel>
      <Panel
        title="Dated event activity"
        description="Event-date period across all attempts; independent of the submission cohort. Counts exclude cancelled events."
      >
        <p>
          <a
            href="#interview-events"
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Interview events: {data.summary.interviewEvents}
          </a>{" "}
          ·{" "}
          <a
            href="#assessment-events"
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Assessment events: {data.summary.assessmentEvents}
          </a>{" "}
          ·{" "}
          <a
            href="#upcoming-events"
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Upcoming actions in this period: {data.summary.upcoming}
          </a>
        </p>
        {(
          ["interview", "assessment", "upcoming", "other", "cancelled"] as const
        ).map((kind) => {
          const events = data.events.filter((e) =>
            kind === "upcoming"
              ? e.status === "scheduled" &&
                e.date >= data.today &&
                ["interview", "assessment", "follow_up"].includes(e.kind)
              : kind === "cancelled"
                ? e.status === "cancelled"
                : kind === "other"
                  ? !["interview", "assessment"].includes(e.kind) &&
                    e.status !== "cancelled"
                  : e.kind === kind && e.status !== "cancelled",
          );
          return (
            <section
              id={`${kind}-events`}
              key={kind}
              className="mt-3 scroll-mt-20"
            >
              <h3 className="font-semibold capitalize">{kind}</h3>
              {events.length ? (
                <ul>
                  {events.map((e) => (
                    <li key={e.eventId}>
                      <Link
                        className="inline-flex min-h-11 items-center text-link underline"
                        href={`/career/applications/${e.applicationId}`}
                      >
                        {e.title} · {e.date} · {e.status} ·{" "}
                        {e.inCohort
                          ? "same submission cohort"
                          : "other submission cohort"}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">No matching dated events.</p>
              )}
            </section>
          );
        })}
      </Panel>
      <Panel
        title="Time in stage · supporting history"
        description={`Resolved observations for the submitted cohort through ${data.asOfDate}; repeated stages remain separate visits.`}
      >
        {data.stages.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Application / stage",
                    "Entered",
                    "Until",
                    "Elapsed full days",
                    "State",
                  ].map((h) => (
                    <th scope="col" key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.stages.map((s) => (
                  <tr key={s.historyId} className="border-t border-border">
                    <th scope="row" className="p-3">
                      <Link
                        href={`/career/applications/${s.applicationId}`}
                        className="inline-flex min-h-11 items-center text-link underline"
                      >
                        {data.applications.find(
                          (a) => a.applicationId === s.applicationId,
                        )?.company ?? "Application"}{" "}
                        · {s.stage}
                      </Link>
                    </th>
                    <td className="p-3">{s.effectiveDate}</td>
                    <td className="p-3">{s.endDate}</td>
                    <td className="p-3 tabular-nums">{s.elapsedDays}</td>
                    <td className="p-3">
                      {s.outcome ??
                        (s.open ? "Open at cutoff" : "Completed stage visit")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No supplied stage history for this cohort.</p>
        )}
      </Panel>
    </div>
  );
}
