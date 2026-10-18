import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, MessageSquare } from "lucide-react";
import type { GetJobApplicationDetailResult } from "@/modules/career/services/get-job-application-detail";

export function ApplicationTimeline({
  detail,
  timezone,
}: {
  detail: GetJobApplicationDetailResult;
  timezone: string;
}) {
  const items = [
    ...detail.stageHistory.map((history) => ({
      id: `stage-${history.historyId}`,
      date: history.effectiveDate,
      recorded: history.recordedAt,
      title: history.stage.replaceAll("_", " "),
      kind: "stage",
      note: history.reason,
      status: [
        history.outcome?.replaceAll("_", " "),
        history.isCurrent ? "Current" : "",
        history.supersededByHistoryId ? "Superseded" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      href: null,
    })),
    ...detail.events.map((event) => ({
      id: event.eventId,
      date:
        event.eventDate ??
        (event.startsAt
          ? new Intl.DateTimeFormat("en-CA", {
              timeZone: timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(event.startsAt))
          : ""),
      recorded: event.createdAt,
      title: event.title,
      kind: event.eventKind,
      note: event.outcomeNotes ?? event.preparationNotes,
      status: event.status,
      href: `#event-${event.eventId}`,
    })),
  ].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.recorded.localeCompare(a.recorded),
  );
  const next = detail.events.find(
    (event) => event.isNextAction && event.status === "scheduled",
  );
  return (
    <section className="space-y-5" aria-labelledby="application-timeline-title">
      <div className="rounded-card bg-(--blue-surface) p-5">
        <p className="text-xs font-semibold uppercase tracking-wider">
          Next action
        </p>
        {next ? (
          <>
            <Link
              className="mt-2 inline-flex min-h-11 text-lg font-semibold text-link"
              href={`#event-${next.eventId}`}
            >
              {next.title}
            </Link>
            <p className="text-sm">
              {next.eventDate ??
                (next.startsAt
                  ? new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: timezone,
                    }).format(new Date(next.startsAt))
                  : "")}{" "}
              {next.temporalKind === "timed" ? `· ${timezone}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-2 text-lg font-medium">No next action scheduled</p>
        )}
      </div>
      <h2 id="application-timeline-title" className="text-xl font-semibold">
        Your application timeline
      </h2>
      <p className="text-sm text-muted-foreground">
        Latest effective dates first. Recorded dates remain separate; scheduled
        activities are plans.
      </p>
      <ol className="ml-4 border-l-2 border-border">
        {items.map((item) => {
          const Icon =
            item.kind === "stage"
              ? BriefcaseBusiness
              : ["interview", "assessment", "follow_up"].includes(item.kind)
                ? CalendarClock
                : MessageSquare;
          return (
            <li key={item.id} className="relative pb-7 pl-7">
              <span className="absolute -left-[17px] flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <div className="rounded-control bg-surface-subtle p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    <time>{item.date}</time> · {item.kind.replaceAll("_", " ")}
                  </p>
                  <span className="text-xs capitalize">{item.status}</span>
                </div>
                <p className="mt-1 font-semibold capitalize">
                  {item.href ? (
                    <Link
                      className="text-link underline-offset-4 hover:underline"
                      href={item.href}
                    >
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </p>
                {item.note ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {item.note}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  Recorded{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: timezone,
                  }).format(new Date(item.recorded))}{" "}
                  · {timezone}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
