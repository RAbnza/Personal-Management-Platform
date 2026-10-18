"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { WorkspaceViews } from "@/components/ui/workspace-views";
import { CountChart } from "./count-chart";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import type { CareerReport } from "@/modules/reporting/services/get-reports";

type Rate = { numerator: number; denominator: number } | null;
const rateText = (r: Rate) =>
  r
    ? `${r.numerator} / ${r.denominator} (${((100 * r.numerator) / r.denominator).toFixed(1)}%)`
    : "Not applicable (empty denominator)";
const sourceLabel = (source: string | null) =>
  source === null
    ? "Unspecified source"
    : source === "Unspecified source"
      ? `${source} (recorded label)`
      : source;
function EvidencePage<T>({
  items,
  label,
  render,
}: {
  items: T[];
  label: string;
  render: (item: T) => ReactNode;
}) {
  const [page, setPage] = useState(0),
    size = 50;
  const count = Math.ceil(items.length / size);
  return (
    <div className="min-w-0">
      {items.length ? (
        <ul className="space-y-2">
          {items.slice(page * size, (page + 1) * size).map((item, index) => (
            <li key={page * size + index} className="min-w-0 break-words">
              {render(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p>No matching supplied evidence.</p>
      )}
      {count > 1 && (
        <div
          className="mt-3 flex flex-wrap items-center gap-3"
          aria-label={`${label} pages`}
        >
          <Button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            aria-label={`Previous ${label} page`}
          >
            Previous
          </Button>
          <p role="status">
            Page {page + 1} of {count} · {items.length} total records
          </p>
          <Button
            disabled={page + 1 === count}
            onClick={() => setPage(page + 1)}
            aria-label={`Next ${label} page`}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
type Summary = CareerReport["summary"];
function SummaryLine({
  data,
}: {
  data: Pick<
    Summary,
    | "submitted"
    | "responded"
    | "interviewed"
    | "offered"
    | "accepted"
    | "responseRate"
    | "interviewRate"
    | "offerRate"
    | "followUpTiming"
  >;
}) {
  return (
    <div className="space-y-1 text-sm">
      <p>
        {data.submitted} attempts · {data.responded} responses ·{" "}
        {data.interviewed} reached interview · {data.offered} reached offer ·{" "}
        {data.accepted} accepted
      </p>
      <p>
        Response {rateText(data.responseRate)} · Interview{" "}
        {rateText(data.interviewRate)} · Offer {rateText(data.offerRate)}
      </p>
      <p>
        Median follow-up through cutoff:{" "}
        {data.followUpTiming.medianDays ?? "Not available"} days ·{" "}
        {data.followUpTiming.samples} attempts
      </p>
    </div>
  );
}
export function CareerReportView({ data }: { data: CareerReport }) {
  const metrics = [
    ["Submitted attempts", data.summary.submitted, "submitted"],
    ["Explicit responses", data.summary.responded, "responded"],
    [
      "Applications reaching interview",
      data.summary.interviewed,
      "interviewed",
    ],
    ["Applications reaching assessment", data.summary.assessed, "assessed"],
    ["Applications reaching offer", data.summary.offered, "offered"],
    ["Rejected as of cutoff", data.summary.rejected, "rejected"],
    ["Accepted as of cutoff", data.summary.accepted, "accepted"],
    ["Withdrawn as of cutoff", data.summary.withdrawn, "withdrawn"],
  ] as const;
  const rates = [
    ["Interview / submitted", data.summary.interviewRate],
    ["Offer / submitted", data.summary.offerRate],
    ["Accepted / submitted", data.summary.acceptedRate],
    [
      "Interview among responded applications",
      data.summary.responseToInterviewRate,
    ],
    ["Offer among interviewed applications", data.summary.interviewToOfferRate],
  ] as const;
  const applicationById = new Map(
    data.applications.map((a) => [a.applicationId, a]),
  );
  const attemptLink = (a: CareerReport["applications"][number]) => (
    <Link
      className="inline-block min-h-11 max-w-full break-words text-link underline"
      href={`/career/applications/${a.applicationId}`}
    >
      {a.company} · {a.role} · submitted {a.appliedDate} ·{" "}
      {a.stage ?? "Unknown stage at cutoff"}
      {a.outcome ? ` / ${a.outcome}` : ""}
      {a.archived ? " · archived" : ""}
    </Link>
  );
  return (
    <div className="min-w-0 space-y-6 break-words">
      <details className="rounded-card bg-surface-subtle p-4">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Cohort definition and coverage: {data.period.startDate} through{" "}
          {data.period.endDate}; observed through {data.asOfDate}
        </summary>
        <Panel title="Cohort definition and coverage">
          <p>{data.coverage.note}</p>
          <p className="mt-2">
            Submission cohort: {data.period.startDate} through{" "}
            {data.period.endDate}. Effective observation cutoff: {data.asOfDate}
            . Same-company attempts are separate applications. Saved
            opportunities are excluded; archived submitted attempts are
            included.
          </p>
          <p className="mt-2 text-sm">
            Milestones require recorded evidence after submission. Scheduled
            interviews/assessments do not prove completed progression. Accepted
            alone does not invent an offer. Missing responses are not
            rejections. Current corrected dates, source labels and cancellations
            apply; earlier database knowledge is not reconstructed.
          </p>
          <p className="mt-2 text-sm">
            {data.analytics.preSubmissionEvidence} pre-submission observations
            excluded from milestone/timing calculations ·{" "}
            {data.analytics.missingStageEvidence} attempts without effective
            stage evidence · {data.summary.explicitNoResponse} attempts with
            explicit no-response evidence.
          </p>
          <p className="mt-2 text-xs">
            Calculation {data.analytics.calculationVersion} ·{" "}
            {data.coverage.evidenceRows} evidence rows · Career snapshot
            fingerprint{" "}
            <span className="break-all">{data.coverage.sourceRevision}</span>.
            This is a content fingerprint, not a financial revision or monotonic
            Career counter.
          </p>
        </Panel>
      </details>
      <WorkspaceViews
        label="Career analysis views"
        views={[
          {
            label: "Milestone reach",
            content: (
              <>
                {" "}
                <Panel title="Submitted-date cohort">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {metrics.map(([label, value, metric]) => (
                      <Link
                        className="rounded-card bg-surface-subtle p-4 text-link"
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
                      className="rounded-card bg-surface-subtle p-4 text-link"
                    >
                      <p className="text-sm">
                        Response conversion (same cohort)
                      </p>
                      <p className="mt-1 font-semibold">
                        {data.summary.responseRate
                          ? `${data.summary.responseRate.numerator} / ${data.summary.responseRate.denominator}`
                          : "Not applicable (empty denominator)"}
                      </p>
                    </Link>
                  </div>
                </Panel>
                <Panel
                  title="Conversion reach"
                  description="Independent milestones in the same submitted cohort. Stages may be skipped; bars do not imply an ordered hiring pipeline."
                >
                  <CountChart
                    label="Independent milestone counts within the submitted cohort"
                    rows={[
                      { label: "Responses", count: data.summary.responded },
                      { label: "Interview", count: data.summary.interviewed },
                      { label: "Assessment", count: data.summary.assessed },
                      { label: "Offer", count: data.summary.offered },
                      { label: "Accepted", count: data.summary.accepted },
                    ]}
                  />
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    {rates.map(([label, rate]) => (
                      <div key={label}>
                        <dt className="text-sm font-medium">{label}</dt>
                        <dd className="text-sm tabular-nums">
                          {rateText(rate)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-sm">
                    Conditional numerators require both milestones on the same
                    attempt. {data.summary.open} open outcomes ·{" "}
                    {data.summary.unknownStage} unknown stages at cutoff ·{" "}
                    {data.summary.archived} archived attempts.
                  </p>
                </Panel>
              </>
            ),
          },
          {
            label: "Timing, cohorts and sources",
            content: (
              <>
                {" "}
                <Panel
                  title="Response and progression timing"
                  description="Full calendar days from submission to earliest supported milestone. Missing evidence is excluded from medians, not replaced with zero."
                >
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {[
                      ["First response", data.summary.responseTiming],
                      ["First interview", data.summary.interviewTiming],
                      ["First offer", data.summary.offerTiming],
                      [
                        "Follow-up age through cutoff",
                        data.summary.followUpTiming,
                      ],
                    ].map(([label, timing]) => {
                      const t = timing as Summary["responseTiming"];
                      return (
                        <div key={String(label)}>
                          <dt className="font-medium">{String(label)}</dt>
                          <dd className="text-sm">
                            Median {t.medianDays ?? "Not available"} days ·
                            range {t.minimumDays ?? "Unknown"}–
                            {t.maximumDays ?? "Unknown"} · {t.samples} samples ·{" "}
                            {t.missing} without evidence
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                  <details className="mt-4">
                    <summary className="min-h-11 cursor-pointer font-medium">
                      Timing evidence by attempt
                    </summary>
                    <EvidencePage
                      items={data.applications}
                      label="timing evidence"
                      render={(a) => (
                        <>
                          {attemptLink(a)}
                          <p className="text-sm">
                            Response {a.firstResponseDate ?? "Unknown"} (
                            {a.responseDays ?? "Unknown"} days) · Interview{" "}
                            {a.firstInterviewDate ?? "Unknown"} · Offer{" "}
                            {a.firstOfferDate ?? "Unknown"} · {a.followUpDays}{" "}
                            days observed
                          </p>
                        </>
                      )}
                    />
                  </details>
                </Panel>
                <Panel
                  title="Submission-cohort trends"
                  description={`${data.cohortInterval} buckets, clipped to the selected range, with the same effective cutoff. Recent cohorts have less follow-up; no hiring prediction is implied.`}
                >
                  <EvidencePage
                    items={data.analytics.cohorts}
                    label="cohort trends"
                    render={(c) => (
                      <div className="rounded-control border border-border p-3">
                        <h3 className="font-medium">
                          {c.startDate} through {c.endDate}
                        </h3>
                        <SummaryLine data={c} />
                        <p className="text-sm">
                          {c.fullyObserved
                            ? "Submission window fully observed"
                            : "Submission window extends beyond cutoff"}
                        </p>
                      </div>
                    )}
                  />
                </Panel>
                {data.comparison && (
                  <Panel
                    title="Previous submission-cohort comparison"
                    description={data.coverage.comparisonNote}
                  >
                    <p className="font-medium">
                      {data.comparison.period.startDate} through{" "}
                      {data.comparison.period.endDate} · observed through{" "}
                      {data.asOfDate}
                    </p>
                    <SummaryLine data={data.comparison.summary} />
                    <p className="mt-2 text-sm">
                      Current cohort response{" "}
                      {rateText(data.summary.responseRate)}; previous response{" "}
                      {rateText(data.comparison.summary.responseRate)}. Compare
                      recorded sample sizes and follow-up ages before
                      interpreting rates.
                    </p>
                    <details className="mt-3">
                      <summary className="min-h-11 cursor-pointer font-medium">
                        Previous cohort supporting attempts
                      </summary>
                      <EvidencePage
                        items={data.comparison.applications}
                        label="comparison attempts"
                        render={attemptLink}
                      />
                    </details>
                  </Panel>
                )}
                <Panel
                  title="Results by application source"
                  description="Exact current source labels, same submitted cohort and cutoff. Rates use each source's submitted attempts."
                >
                  <EvidencePage
                    items={data.analytics.sources}
                    label="source effectiveness"
                    render={(s) => (
                      <div className="rounded-control border border-border p-3">
                        <h3 className="font-medium">{sourceLabel(s.source)}</h3>
                        <SummaryLine data={s} />
                        <Link
                          className="inline-flex min-h-11 text-link underline"
                          href={`/reports/career?${new URLSearchParams({ period: "custom", startDate: data.period.startDate, endDate: data.period.endDate, asOfDate: data.asOfDate, cohortInterval: data.cohortInterval, ...(s.source === null ? { sourceMissing: "true" } : { sourceName: s.source }), ...(data.filters.compare ? { compare: "previous" } : {}) })}`}
                        >
                          Filter to this source
                        </Link>
                      </div>
                    )}
                  />
                </Panel>
              </>
            ),
          },
          {
            label: "Supporting attempts",
            content: (
              <>
                {" "}
                {metrics.map(([label, , metric]) => {
                  const apps = data.applications.filter(
                    (a) =>
                      metric === "submitted" ||
                      (["rejected", "accepted", "withdrawn"].includes(metric)
                        ? a.outcome === metric
                        : Boolean(
                            a[
                              metric as
                                | "responded"
                                | "interviewed"
                                | "assessed"
                                | "offered"
                            ],
                          )),
                  );
                  return (
                    <section
                      key={metric}
                      id={`${metric}-records`}
                      className="scroll-mt-20"
                    >
                      <Panel title={`${label} · supporting attempts`}>
                        <EvidencePage
                          items={apps}
                          label={`${metric} attempts`}
                          render={attemptLink}
                        />
                      </Panel>
                    </section>
                  );
                })}
              </>
            ),
          },
          {
            label: "Outcomes and activity",
            content: (
              <>
                {" "}
                <Panel
                  title="Other outcomes and reopened history"
                  description="Current outcomes are separate from any earlier reached outcome. Earlier terminal evidence can coexist with an open reopened attempt."
                >
                  <p className="text-sm">
                    Current: {data.summary.offer_declined} offer declined ·{" "}
                    {data.summary.offer_expired} offer expired ·{" "}
                    {data.summary.employer_cancelled} employer cancelled.
                  </p>
                  <EvidencePage
                    items={data.analytics.reachedOutcomes}
                    label="reached outcomes"
                    render={(o) => (
                      <p>
                        {o.outcome.replaceAll("_", " ")}: {o.applications}{" "}
                        distinct attempts ever reaching this recorded outcome
                        through cutoff
                      </p>
                    )}
                  />
                </Panel>
                <Panel
                  title="Dated event activity"
                  description="Selected event-date period across all attempts, independent of the submission cohort. Completed through cutoff, scheduled, cancelled and after-cutoff activity remain separate."
                >
                  <p>
                    Interview events: {data.summary.interviewEvents} ·
                    Assessment events: {data.summary.assessmentEvents} ·
                    Upcoming actions in this period: {data.summary.upcoming}.
                    These noncancelled event counts are not distinct
                    applications or proof of completion.
                  </p>
                  <EvidencePage
                    items={data.analytics.eventSummary}
                    label="event summaries"
                    render={(e) => (
                      <p>
                        {e.kind.replaceAll("_", " ")}: {e.completed} completed
                        through cutoff · {e.scheduled} scheduled · {e.cancelled}{" "}
                        cancelled · {e.afterCutoff} completed after cutoff
                      </p>
                    )}
                  />
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer font-medium">
                      Supporting dated events
                    </summary>
                    <EvidencePage
                      items={data.events}
                      label="dated events"
                      render={(e) => (
                        <Link
                          className="inline-block min-h-11 max-w-full text-link underline"
                          href={`/career/applications/${e.applicationId}`}
                        >
                          {e.title} · {e.date} · {e.status} ·{" "}
                          {e.inCohort
                            ? "same submission cohort"
                            : "other submission cohort"}
                          {e.date > data.asOfDate
                            ? " · after observation cutoff"
                            : ""}
                        </Link>
                      )}
                    />
                  </details>
                </Panel>
                <Panel
                  title="Time in stage · supporting history"
                  description={`Resolved cohort observations through ${data.asOfDate}; repeated visits and same-day ordering are retained. Open visits are censored; terminal and saved stages have no active-stage aggregate.`}
                >
                  <EvidencePage
                    items={data.analytics.stageTiming}
                    label="stage summaries"
                    render={(s) => (
                      <p>
                        {s.stage.replaceAll("_", " ")}: {s.visits} visits /{" "}
                        {s.applications} applications · completed visits{" "}
                        {s.closed.samples}, median{" "}
                        {s.closed.medianDays ?? "Not available"} days · open
                        visits {s.open.samples}, median observed{" "}
                        {s.open.medianDays ?? "Not available"} days
                      </p>
                    )}
                  />
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer font-medium">
                      Resolved stage evidence
                    </summary>
                    <EvidencePage
                      items={data.stages}
                      label="stage history"
                      render={(s) => (
                        <>
                          <Link
                            className="inline-block min-h-11 max-w-full text-link underline"
                            href={`/career/applications/${s.applicationId}`}
                          >
                            {applicationById.get(s.applicationId)?.company ??
                              "Application"}{" "}
                            · {s.stage}
                          </Link>
                          <p className="text-sm">
                            {s.effectiveDate} through {s.endDate} ·{" "}
                            {s.elapsedDays} full days ·{" "}
                            {s.outcome ??
                              (s.open
                                ? "Open at cutoff"
                                : "Completed stage visit")}{" "}
                            · sequence {s.sequenceNo}, effective order{" "}
                            {s.effectiveOrder}
                          </p>
                        </>
                      )}
                    />
                  </details>
                </Panel>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
