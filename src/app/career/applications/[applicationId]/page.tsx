import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  MapPin,
  RotateCcw,
} from "lucide-react";

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { ApplicationEventActions } from "@/components/career/application-event-actions";
import { ApplicationEventCreateForm } from "@/components/career/application-event-create-form";
import { CareerObservationForm } from "@/components/career/career-observation-form";
import { ApplicationStageTransitionForm } from "@/components/career/application-stage-transition-form";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import {
  CAREER_ACTIONABLE_EVENT_KINDS,
  type ApplicationEventKind,
  type ApplicationEventStatus,
  type CareerActionableEventKind,
} from "@/modules/career/domain/application-event";
import {
  JobApplicationUnavailableError,
  type CareerApplicationOutcome,
  type CareerApplicationStage,
  type CareerSalaryPeriod,
  type CareerWorkArrangement,
} from "@/modules/career/domain/application";
import {
  getJobApplicationDetail,
  type GetJobApplicationDetailResult,
} from "@/modules/career/services/get-job-application-detail";
import { formatMoneyMinorUnits } from "@/shared/money-display";

type JobApplicationDetailPageProps = {
  params: Promise<{
    applicationId: string;
  }>;
};

const stageLabels: Record<CareerApplicationStage, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  technical_assessment: "Technical assessment",
  final_interview: "Final interview",
  offer: "Offer",
  accepted: "Accepted",
};

const outcomeLabels: Record<CareerApplicationOutcome, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  offer_declined: "Offer declined",
  offer_expired: "Offer expired",
  employer_cancelled: "Employer cancelled",
};

const arrangementLabels: Record<CareerWorkArrangement, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  unspecified: "Unspecified",
};

const salaryPeriodLabels: Record<CareerSalaryPeriod, string> = {
  hour: "hour",
  month: "month",
  year: "year",
};

const eventKindLabels: Record<ApplicationEventKind, string> = {
  interview: "Interview",
  assessment: "Assessment",
  follow_up: "Follow-up",
  submission: "Submission",
  response: "Response",
  offer: "Offer",
  no_response: "No response",
  note: "Note",
};

const eventStatusLabels: Record<ApplicationEventStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

function isCareerActionableEventKind(
  value: ApplicationEventKind,
): value is CareerActionableEventKind {
  return (
    CAREER_ACTIONABLE_EVENT_KINDS as readonly ApplicationEventKind[]
  ).includes(value);
}

function formatInstant(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatSalary(detail: GetJobApplicationDetailResult): string | null {
  const { salaryMinMinor, salaryMaxMinor, salaryCurrency, salaryPeriod } =
    detail.application;

  if (
    salaryCurrency === null ||
    salaryPeriod === null ||
    (salaryMinMinor === null && salaryMaxMinor === null)
  ) {
    return null;
  }

  const period = salaryPeriodLabels[salaryPeriod];

  if (salaryMinMinor !== null && salaryMaxMinor !== null) {
    return `${formatMoneyMinorUnits(
      salaryCurrency,
      salaryMinMinor,
    )} – ${formatMoneyMinorUnits(salaryCurrency, salaryMaxMinor)} / ${period}`;
  }

  if (salaryMinMinor !== null) {
    return `From ${formatMoneyMinorUnits(
      salaryCurrency,
      salaryMinMinor,
    )} / ${period}`;
  }

  return `Up to ${formatMoneyMinorUnits(
    salaryCurrency,
    salaryMaxMinor ?? "0",
  )} / ${period}`;
}

export default async function JobApplicationDetailPage({
  params,
}: JobApplicationDetailPageProps) {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());

  if (bootstrap.kind === "unauthorized") {
    redirect("/auth/sign-in");
  }

  if (bootstrap.kind === "unavailable") {
    return (
      <AuthCard
        eyebrow="Career"
        title="We couldn't prepare your workspace"
        description="Your private workspace couldn't be loaded safely. No Career information has been changed."
      >
        <Link
          href="/career/applications"
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
          Return to applications
        </Link>
      </AuthCard>
    );
  }

  const { user, workspace, preference, modules } = bootstrap;

  const careerEnabled =
    modules.find((module) => module.moduleKey === "career")?.enabled === true;

  const { applicationId } = await params;

  let detail: GetJobApplicationDetailResult | null = null;

  try {
    detail = await getJobApplicationDetail({
      userId: user.id,
      workspaceId: workspace.id,
      applicationId,
    });
  } catch (error) {
    if (!(error instanceof JobApplicationUnavailableError)) {
      console.error("Job application detail could not be loaded.");
    }
  }

  if (!detail) {
    return (
      <AppShell
        pageTitle="Application"
        activePath="/career/applications"
        userName={user.name}
        userEmail={user.email}
        workspaceTheme={preference.theme}
        workspacePreferenceVersion={preference.version}
        gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
      >
        <div className="space-y-8">
          <Link
            href="/career/applications"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to applications
          </Link>

          <Panel
            title="Application unavailable"
            description="The requested application could not be read in this private workspace."
          >
            <p className="text-sm leading-6 text-muted-foreground">
              It may no longer be available, or the Career service may be
              temporarily unavailable. No Career information has been changed.
            </p>
          </Panel>
        </div>
      </AppShell>
    );
  }

  const { application } = detail;

  const salary = formatSalary(detail);

  return (
    <AppShell
      pageTitle={application.roleTitle}
      activePath="/career/applications"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        {!careerEnabled && (
          <p
            role="status"
            className="rounded-md border border-border p-3 text-sm"
          >
            Career module hidden. This authorized Agenda source remains
            available.
          </p>
        )}
        <header>
          <Link
            href="/career/applications"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to applications
          </Link>

          <p className="mt-3 text-sm font-medium text-link">Career</p>

          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            {application.roleTitle}
          </h1>

          <p className="mt-2 text-base font-medium text-muted-foreground">
            {application.companyName}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-semibold text-foreground">
              {stageLabels[application.currentStage]}
            </span>

            {application.currentOutcome ? (
              <span className="inline-flex rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-semibold text-foreground">
                {outcomeLabels[application.currentOutcome]}
              </span>
            ) : null}

            {application.archived ? (
              <span className="inline-flex rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-semibold text-muted-foreground">
                Archived
              </span>
            ) : null}
          </div>
        </header>

        <Panel
          title="Application details"
          description="This record represents one application attempt. Dates and stage history preserve what actually happened."
        >
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Applied date
              </dt>

              <dd className="mt-1 text-sm font-semibold text-foreground">
                {application.appliedDate ?? "Not submitted"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Location
              </dt>

              <dd className="mt-1 flex gap-2 text-sm text-foreground">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.9}
                />

                <span>{application.location ?? "Not recorded"}</span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Work arrangement
              </dt>

              <dd className="mt-1 text-sm font-semibold text-foreground">
                {application.workArrangement
                  ? arrangementLabels[application.workArrangement]
                  : "Not recorded"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Source
              </dt>

              <dd className="mt-1 text-sm font-semibold text-foreground">
                {application.sourceName ?? "Not recorded"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Salary
              </dt>

              <dd className="mt-1 text-sm font-semibold text-foreground">
                {salary ?? "Not recorded"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Version
              </dt>

              <dd className="numeric-value mt-1 text-sm font-semibold text-foreground">
                {application.version}
              </dd>
            </div>
          </dl>

          {application.postingUrl ? (
            <a
              href={application.postingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              Open original posting
              <ExternalLink
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
            </a>
          ) : null}

          {application.technologyTags.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs font-medium text-muted-foreground">
                Technologies
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {application.technologyTags.map((technology) => (
                  <span
                    key={technology}
                    className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {technology}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {application.roleDescriptionSnapshot ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-xs font-medium text-muted-foreground">
                Role description snapshot
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {application.roleDescriptionSnapshot}
              </p>
            </div>
          ) : null}

          {application.notes ? (
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-xs font-medium text-muted-foreground">Notes</p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {application.notes}
              </p>
            </div>
          ) : null}
        </Panel>

        {application.archived ? (
          <Panel
            title="Archived application"
            description="History remains readable, but archived applications cannot receive new stage history or Career events."
          >
            <p className="text-sm leading-6 text-muted-foreground">
              This application is read-only until a separately designed archive
              lifecycle workflow supports restoration.
            </p>
          </Panel>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <ApplicationStageTransitionForm
              key={`stage:${application.version}:${application.currentHistoryId}`}
              applicationId={application.applicationId}
              applicationVersion={application.version}
              currentStage={application.currentStage}
              currentOutcome={application.currentOutcome}
              appliedDate={application.appliedDate}
            />

            <ApplicationEventCreateForm
              key={`event:${application.version}:${application.nextActionEventId ?? "none"}`}
              applicationId={application.applicationId}
              applicationVersion={application.version}
              workspaceTimezone={workspace.timezone}
            />
            <CareerObservationForm
              applicationId={application.applicationId}
              applicationVersion={application.version}
            />
          </div>
        )}

        <Panel
          title="Stage history"
          description="History records the effective date separately from the time it was entered."
        >
          <ol className="divide-y divide-border">
            {detail.stageHistory.map((history) => (
              <li key={history.historyId} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {stageLabels[history.stage]}
                      </p>

                      {history.outcome ? (
                        <span className="text-xs font-medium text-muted-foreground">
                          {outcomeLabels[history.outcome]}
                        </span>
                      ) : null}

                      {history.isCurrent ? (
                        <span className="rounded-full border border-border bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                          Current
                        </span>
                      ) : null}

                      {history.supersededByHistoryId ? (
                        <span className="text-xs font-medium text-muted-foreground">
                          Superseded
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Effective{" "}
                      <time dateTime={history.effectiveDate}>
                        {history.effectiveDate}
                      </time>
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Recorded{" "}
                      {formatInstant(history.recordedAt, workspace.timezone)} ·{" "}
                      {workspace.timezone}
                    </p>

                    {history.reason ? (
                      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-foreground">
                        {history.reason}
                      </p>
                    ) : null}
                  </div>

                  <span className="numeric-value text-xs text-muted-foreground">
                    #{history.sequenceNo}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel
          title="Career activity"
          description="Scheduled Career activities are source records. Their lifecycle changes remain attached to this application."
        >
          {detail.events.length === 0 ? (
            <div className="flex gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <CalendarClock
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={1.9}
                />
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">
                  No Career activity recorded
                </p>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Schedule an interview, assessment, or follow-up above.
                </p>
              </div>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {detail.events.map((event) => {
                const replacementEvents = detail.events
                  .filter(
                    (candidate) =>
                      candidate.eventId !== event.eventId &&
                      candidate.status === "scheduled" &&
                      isCareerActionableEventKind(candidate.eventKind),
                  )
                  .map((candidate) => ({
                    eventId: candidate.eventId,
                    title: candidate.title,
                  }));

                return (
                  <li key={event.eventId} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {event.title}
                          </p>

                          <span className="text-xs font-medium text-muted-foreground">
                            {eventKindLabels[event.eventKind]}
                          </span>

                          {event.isNextAction ? (
                            <span className="rounded-full border border-border bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                              Next action
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {eventStatusLabels[event.status]}
                        </p>

                        <p className="mt-2 text-sm text-foreground">
                          {event.temporalKind === "date"
                            ? event.eventDate
                            : event.startsAt && event.timezone
                              ? `${formatInstant(
                                  event.startsAt,
                                  event.timezone,
                                )} · ${event.timezone}`
                              : "Schedule unavailable"}
                        </p>

                        {event.temporalKind === "timed" &&
                        event.endsAt &&
                        event.timezone ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Ends {formatInstant(event.endsAt, event.timezone)}
                          </p>
                        ) : null}

                        {["interview", "assessment", "follow_up"].includes(
                          event.eventKind,
                        ) ? (
                          <Link
                            href={`/calendar/reminders/application_event/${event.eventId}`}
                            className="inline-flex min-h-11 items-center font-semibold text-link underline"
                          >
                            Reminder controls and history
                          </Link>
                        ) : null}
                        {event.location ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {event.location}
                          </p>
                        ) : null}

                        {event.preparationNotes ? (
                          <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                            {event.preparationNotes}
                          </p>
                        ) : null}

                        {event.outcomeNotes ? (
                          <div className="mt-3 rounded-control border border-border bg-surface-subtle px-3 py-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Outcome notes
                            </p>

                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
                              {event.outcomeNotes}
                            </p>
                          </div>
                        ) : null}

                        {event.completedAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Completed{" "}
                            {formatInstant(
                              event.completedAt,
                              workspace.timezone,
                            )}{" "}
                            · {workspace.timezone}
                          </p>
                        ) : null}

                        {event.meetingUrl ? (
                          <a
                            href={event.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
                          >
                            Open meeting link
                            <ExternalLink
                              aria-hidden="true"
                              className="size-4"
                              strokeWidth={1.9}
                            />
                          </a>
                        ) : null}

                        {!application.archived &&
                        event.status === "scheduled" &&
                        isCareerActionableEventKind(event.eventKind) ? (
                          <ApplicationEventActions
                            key={`${event.eventId}:${event.version}:${application.version}`}
                            applicationId={application.applicationId}
                            applicationVersion={application.version}
                            event={event}
                            workspaceTimezone={workspace.timezone}
                            replacementEvents={replacementEvents}
                          />
                        ) : null}
                      </div>

                      <span className="numeric-value text-xs text-muted-foreground">
                        v{event.version}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
