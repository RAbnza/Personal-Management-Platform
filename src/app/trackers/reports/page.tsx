import { CountChart } from "@/components/reporting/count-chart";
import { WorkspaceViews } from "@/components/ui/workspace-views";
import Link from "next/link";
import { trackerActor } from "../_actor";
import {
  getTrackerReport,
  trackerReportQuery,
} from "@/modules/trackers/services/reports";
import { trackerControl as control } from "@/components/trackers/styles";
export default async function TrackerReports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await trackerActor(),
    raw = await searchParams;
  try {
    const q = trackerReportQuery.parse(raw),
      r = await getTrackerReport(actor, q),
      url = new URLSearchParams(
        Object.fromEntries(
          Object.entries(q).filter(([, v]) => v !== undefined) as [
            string,
            string,
          ][],
        ),
      );
    return reportContent(r, q, url);
  } catch {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Tracker reports</h1>
        <p role="alert">
          The report selection is invalid or unavailable. Custom ranges require
          valid start and end dates, in order, within 366 days.
        </p>
        <Link className="text-link underline" href="/trackers/reports">
          Reset report selection
        </Link>
      </div>
    );
  }
}

function reportContent(
  r: Awaited<ReturnType<typeof getTrackerReport>>,
  q: ReturnType<typeof trackerReportQuery.parse>,
  url: URLSearchParams,
) {
  return (
    <div className="min-w-0 space-y-6">
      <h1 className="text-2xl font-semibold">Tracker reports and statistics</h1>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2">
          Period
          <select className={control} name="period" defaultValue={q.period}>
            {["week", "month", "quarter", "year", "custom"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          Custom start
          <input
            className={control}
            type="date"
            name="startDate"
            defaultValue={q.startDate}
          />
        </label>
        <label className="grid gap-2">
          Custom end
          <input
            className={control}
            type="date"
            name="endDate"
            defaultValue={q.endDate}
          />
        </label>
        <label className="grid gap-2">
          Archived records
          <select className={control} name="archived" defaultValue={q.archived}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
        {q.trackerId && (
          <input type="hidden" name="trackerId" value={q.trackerId} />
        )}
        <button className={`${control} cursor-pointer`} type="submit">
          Apply report period
        </button>
      </form>
      <p>
        {r.period.startDate} through {r.period.endDate} · {r.context.timezone}
      </p>
      <p className="text-sm text-muted-foreground">{r.semantics}</p>
      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Tracker statistics"
      >
        {Object.entries(r.counts).map(([key, n]) => (
          <div className="rounded-card border border-border p-3" key={key}>
            <h2 className="text-sm">{key.replaceAll(/([A-Z])/g, " $1")}</h2>
            <p className="numeric-value text-2xl">{n}</p>
          </div>
        ))}
      </section>
      <WorkspaceViews
        label="Tracker analysis"
        views={[
          {
            label: "Current snapshot",
            content: (
              <>
                <h2 className="text-xl font-semibold">
                  Current status distribution
                </h2>
                <p className="text-sm">
                  Status labels group current records only, across the selected
                  trackers. This is not a reconstruction at the period end.
                </p>
                <CountChart
                  label="Current entries by status"
                  rows={Object.entries(
                    r.current.reduce<Record<string, number>>((counts, e) => {
                      counts[e.statusLabel] = (counts[e.statusLabel] ?? 0) + 1;
                      return counts;
                    }, {}),
                  ).map(([label, count]) => ({ label, count }))}
                />
              </>
            ),
          },
          {
            label: "Recorded activity",
            content: (
              <>
                <h2 className="text-xl font-semibold">
                  Recorded transitions during this period
                </h2>
                <CountChart
                  label="Recorded activity by kind"
                  rows={Object.entries(
                    r.events.reduce<Record<string, number>>((counts, e) => {
                      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
                      return counts;
                    }, {}),
                  ).map(([label, count]) => ({
                    label: label.replaceAll("_", " "),
                    count,
                  }))}
                />
                <p className="text-sm">
                  Creation, completion transitions and migration revisions are
                  distinct events. Entered completion dates are not recorded
                  transitions.
                </p>
              </>
            ),
          },
        ]}
      />
      <Link
        className="inline-flex min-h-11 items-center text-link underline"
        href={`/api/v1/trackers/reports?${url}&format=csv`}
      >
        Download tracker report CSV
      </Link>
      <p className="text-sm">
        CSV covers current selected entries and recorded period activity. It is
        not a complete workspace backup.
      </p>
      <section>
        <h2 className="text-xl font-semibold">Template-version coverage</h2>
        <ul>
          {r.coverage.map((v) => (
            <li key={v.versionId}>
              <Link
                className="text-link underline"
                href={`/trackers/versions/${v.versionId}`}
              >
                {v.name} version {v.versionNo}
              </Link>
              : {v.currentEntries} current entries;{" "}
              {v.completionMapped
                ? "completion mapped"
                : "no compatible completion mapping"}
            </li>
          ))}
        </ul>
      </section>
      <details className="space-y-3">
        <summary className="action-link">
          Inspect current entry evidence
        </summary>
        <h2 className="text-xl font-semibold">Current entries and status</h2>
        <ul className="space-y-2">
          {r.current.map((e) => (
            <li key={e.id}>
              <Link
                className="inline-flex min-h-11 items-center text-link underline"
                href={e.href}
              >
                {e.title}
              </Link>{" "}
              · {e.tracker_name} · {e.statusLabel}
              {e.archived ? " · Archived" : ""}
              {e.completed_at ? " · Completed" : ""}
            </li>
          ))}
        </ul>
        {!r.current.length && <p>No entries match this selection.</p>}
      </details>
      <details>
        <summary className="action-link">
          Inspect recorded activity evidence
        </summary>
        <h2 className="text-xl font-semibold">Recorded period activity</h2>
        <ul>
          {r.events.map((e) => (
            <li key={e.revisionId}>
              <Link
                className="inline-flex min-h-11 items-center text-link underline"
                href={`/trackers/entries/${e.entryId}`}
              >
                {e.title}
              </Link>{" "}
              · {e.kind.replaceAll("_", " ")} · {e.date}
            </li>
          ))}
        </ul>
        {!r.events.length && <p>No recorded activity in this period.</p>}
      </details>
    </div>
  );
}
