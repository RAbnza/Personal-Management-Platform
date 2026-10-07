import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  MapPin,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { PersonalEventActions } from "@/components/calendar/personal-event-actions";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import { PersonalEventUnavailableError } from "@/modules/time/domain/personal-event";
import {
  getPersonalEventDetail,
  type GetPersonalEventDetailResult,
} from "@/modules/time/services/get-personal-event-detail";

type PersonalEventDetailPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

const statusLabels = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

function formatInstant(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatSchedule(event: GetPersonalEventDetailResult): string {
  if (event.temporalKind === "date") {
    if (event.endDateExclusive) {
      return `${event.eventDate} · ends before ${event.endDateExclusive}`;
    }

    return event.eventDate ?? "Date unavailable";
  }

  if (!event.startsAt || !event.timezone) {
    return "Schedule unavailable";
  }

  const start = formatInstant(event.startsAt, event.timezone);

  if (!event.endsAt) {
    return `${start} · ${event.timezone}`;
  }

  const end = formatInstant(event.endsAt, event.timezone);

  return `${start} – ${end} · ${event.timezone}`;
}

export default async function PersonalEventDetailPage({
  params,
}: PersonalEventDetailPageProps) {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());

  if (bootstrap.kind === "unauthorized") {
    redirect("/auth/sign-in");
  }

  if (bootstrap.kind === "unavailable") {
    return (
      <AuthCard
        eyebrow="Calendar"
        title="We couldn't prepare your workspace"
        description="Your private workspace couldn't be loaded safely. No personal-event information has been changed."
      >
        <Link
          href="/calendar"
          className={[
            "inline-flex min-h-11 w-full items-center justify-center gap-2",
            "rounded-button border border-primary-border",
            "bg-primary px-4 py-2.5",
            "text-sm font-semibold text-primary-foreground",
            "transition-colors duration-(--motion-duration-fast) ease-state",
            "hover:bg-primary-hover active:bg-primary-pressed",
            "motion-reduce:transition-none",
          ].join(" ")}
        >
          <RotateCcw aria-hidden="true" className="size-5" strokeWidth={1.9} />
          Return to Calendar
        </Link>
      </AuthCard>
    );
  }

  const { user, workspace, preference, modules } = bootstrap;

  const timeEnabled =
    modules.find((module) => module.moduleKey === "time")?.enabled === true;

  const { eventId } = await params;

  let event: GetPersonalEventDetailResult | null = null;

  try {
    event = await getPersonalEventDetail({
      userId: user.id,
      workspaceId: workspace.id,
      eventId,
    });
  } catch (error) {
    if (!(error instanceof PersonalEventUnavailableError)) {
      console.error("Personal event detail could not be loaded.");
    }
  }

  if (!event) {
    return (
      <AppShell
        pageTitle="Personal event"
        activePath="/calendar"
        userName={user.name}
        userEmail={user.email}
        workspaceTheme={preference.theme}
        workspacePreferenceVersion={preference.version}
        gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
      >
        <div className="space-y-8">
          <Link
            href="/calendar"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to Calendar
          </Link>

          <Panel
            title="Personal event unavailable"
            description="The requested personal event could not be read in this private workspace."
          >
            <p className="text-sm leading-6 text-muted-foreground">
              It may no longer be available, or the Time service may be
              temporarily unavailable. No Calendar information has been changed.
            </p>
          </Panel>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle={event.title}
      activePath="/calendar"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        <header>
          <Link
            href="/calendar"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to Calendar
          </Link>

          <p className="mt-3 text-sm font-medium text-link">Calendar</p>

          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            {event.title}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-semibold text-foreground">
              {statusLabels[event.status]}
            </span>

            {!timeEnabled ? (
              <span className="inline-flex rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-semibold text-muted-foreground">
                Time module hidden
              </span>
            ) : null}
          </div>
        </header>

        <Panel
          title="Event details"
          description="This is the authoritative Calendar source record for the personal event."
        >
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Schedule
              </dt>

              <dd className="mt-1 text-sm font-semibold leading-6 text-foreground">
                {formatSchedule(event)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Schedule type
              </dt>

              <dd className="mt-1 text-sm font-semibold text-foreground">
                {event.temporalKind === "date" ? "Date only" : "Specific time"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Version
              </dt>

              <dd className="numeric-value mt-1 text-sm font-semibold text-foreground">
                {event.version}
              </dd>
            </div>
          </dl>

          {event.location ? (
            <div className="mt-5 flex gap-2 border-t border-border pt-5 text-sm text-foreground">
              <MapPin
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.9}
              />

              <span>{event.location}</span>
            </div>
          ) : null}

          {event.description ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-xs font-medium text-muted-foreground">
                Description
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {event.description}
              </p>
            </div>
          ) : null}

          {event.referenceUrl ? (
            <a
              href={event.referenceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              Open reference
              <ExternalLink
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
            </a>
          ) : null}
        </Panel>

        {event.status === "completed" ? (
          <Panel
            title="Completed event"
            description="Completed personal events are terminal historical records and no longer appear in the active Agenda."
          >
            <div className="flex gap-3">
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-success"
                strokeWidth={1.9}
              />

              <div>
                <p className="text-sm font-medium text-foreground">Completed</p>

                {event.completedAt ? (
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {formatInstant(event.completedAt, workspace.timezone)} ·{" "}
                    {workspace.timezone}
                  </p>
                ) : null}
              </div>
            </div>
          </Panel>
        ) : event.status === "cancelled" ? (
          <Panel
            title="Cancelled event"
            description="Cancelled personal events are terminal historical records and no longer appear in the active Agenda."
          >
            <div className="flex gap-3">
              <XCircle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                strokeWidth={1.9}
              />

              <p className="text-sm leading-6 text-muted-foreground">
                This event remains readable for history but cannot be reopened
                by the current V1 lifecycle.
              </p>
            </div>
          </Panel>
        ) : !timeEnabled ? (
          <Panel
            title="Event is read-only while Time is hidden"
            description="Disabling a module preserves its data and Agenda visibility without deleting source records."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Re-enable Time from Getting Started before editing, completing, or
              cancelling this personal event.
            </p>

            <Link
              href="/onboarding"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              Review module settings
            </Link>
          </Panel>
        ) : (
          <PersonalEventActions
            key={`${event.eventId}:${event.version}`}
            event={event}
            workspaceTimezone={workspace.timezone}
          />
        )}

        <Panel
          title="Record metadata"
          description="These timestamps describe the source record itself, not a duplicated Agenda item."
        >
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Created
              </dt>

              <dd className="mt-1 text-sm text-foreground">
                {formatInstant(event.createdAt, workspace.timezone)} ·{" "}
                {workspace.timezone}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Last updated
              </dt>

              <dd className="mt-1 text-sm text-foreground">
                {formatInstant(event.updatedAt, workspace.timezone)} ·{" "}
                {workspace.timezone}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </AppShell>
  );
}
