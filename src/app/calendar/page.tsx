import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { resolveOnboardingProgress } from "@/app/_lib/onboarding-progress";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { AgendaList } from "@/components/calendar/agenda-list";
import { PersonalEventCreateForm } from "@/components/calendar/personal-event-create-form";
import { ReminderControls } from "@/components/calendar/reminder-controls";
import {
  getReminder,
  getReminderAttention,
} from "@/modules/time/services/reminders";
import { reminderHref } from "@/modules/time/domain/reminder";
import type { ReminderView } from "@/modules/time/domain/reminder";
import { AgendaReviewButton } from "@/components/onboarding/agenda-review-button";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import {
  InvalidAgendaCursorError,
  listAgendaItems,
  type ListAgendaItemsResult,
} from "@/modules/time/services/list-agenda-items";
import {
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";

type CalendarPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type AgendaSourceFilter = "all" | "career" | "time" | "money";

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getWorkspaceToday(timezone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,

    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const byType = new Map(parts.map((part) => [part.type, part.value]));

  const year = byType.get("year");
  const month = byType.get("month");
  const day = byType.get("day");

  if (!year || !month || !day) {
    throw new Error("Workspace-local Calendar date could not be resolved.");
  }

  return parseCalendarDate(`${year}-${month}-${day}`);
}

function addCalendarDays(value: CalendarDate, amount: number): CalendarDate {
  /*
   * CalendarDate is already validated as fixed-width YYYY-MM-DD, so reading
   * its known character ranges avoids turning the components into
   * `number | undefined` under strict indexed-access checking.
   */
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + amount);

  const nextYear = String(date.getUTCFullYear()).padStart(4, "0");

  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");

  const nextDay = String(date.getUTCDate()).padStart(2, "0");

  return parseCalendarDate(`${nextYear}-${nextMonth}-${nextDay}`);
}

function normalizeSourceFilter(value: string | undefined): AgendaSourceFilter {
  if (value === "career" || value === "time" || value === "money") {
    return value;
  }

  return "all";
}

function createCalendarHref(input: {
  startDate: string;
  endDate: string;
  source: AgendaSourceFilter;
  cursor?: string;
}): string {
  const query = new URLSearchParams({
    startDate: input.startDate,
    endDate: input.endDate,
    source: input.source,
  });

  if (input.cursor) {
    query.set("cursor", input.cursor);
  }

  return `/calendar?${query.toString()}`;
}

const selectClassName = [
  "min-h-11 w-full rounded-control border border-input",
  "bg-surface px-3 py-2 text-base text-foreground",
  "transition-colors duration-(--motion-duration-fast) ease-state",
  "hover:border-ring",
  "aria-invalid:border-danger",
  "motion-reduce:transition-none",
].join(" ");

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());

  if (bootstrap.kind === "unauthorized") {
    redirect("/auth/sign-in");
  }

  if (bootstrap.kind === "unavailable") {
    return (
      <AuthCard
        eyebrow="Calendar"
        title="We couldn't prepare your workspace"
        description="Your private workspace couldn't be loaded safely. No Calendar information has been changed."
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
          Retry Calendar
        </Link>
      </AuthCard>
    );
  }

  const { user, workspace, preference, modules } = bootstrap;

  const timeModule = modules.find((module) => module.moduleKey === "time");

  const careerModule = modules.find((module) => module.moduleKey === "career");

  const timeEnabled = timeModule?.enabled === true;
  const careerEnabled = careerModule?.enabled === true;

  const progress = await resolveOnboardingProgress({
    userId: user.id,
    workspaceId: workspace.id,
  });

  const reviewAgendaStep = progress?.steps.find(
    (step) => step.stepKey === "review-agenda",
  );

  const query = await searchParams;

  const workspaceToday = getWorkspaceToday(workspace.timezone);

  const defaultStartDate = addCalendarDays(workspaceToday, -30);
  const defaultEndDate = addCalendarDays(workspaceToday, 60);

  const requestedStartDate = firstQueryValue(query.startDate);
  const requestedEndDate = firstQueryValue(query.endDate);

  let startDate =
    requestedStartDate && isCalendarDate(requestedStartDate)
      ? parseCalendarDate(requestedStartDate)
      : defaultStartDate;

  let endDate =
    requestedEndDate && isCalendarDate(requestedEndDate)
      ? parseCalendarDate(requestedEndDate)
      : defaultEndDate;

  let rangeAdjusted = false;

  if (startDate > endDate) {
    startDate = defaultStartDate;
    endDate = defaultEndDate;

    rangeAdjusted = true;
  }

  const sourceFilter = normalizeSourceFilter(firstQueryValue(query.source));

  const modulesFilter =
    sourceFilter === "all"
      ? (["career", "time", "money"] as const)
      : ([sourceFilter] as const);

  const rawCursor = firstQueryValue(query.cursor);

  const cursor = rawCursor && rawCursor.length <= 4096 ? rawCursor : undefined;

  let agenda: ListAgendaItemsResult | null = null;

  let cursorRecovered = false;

  try {
    agenda = await listAgendaItems({
      userId: user.id,
      workspaceId: workspace.id,

      startDate,
      endDate,

      modules: [...modulesFilter],

      pageSize: 50,

      ...(cursor ? { cursor } : {}),
    });
  } catch (error) {
    if (error instanceof InvalidAgendaCursorError && cursor) {
      cursorRecovered = true;

      try {
        agenda = await listAgendaItems({
          userId: user.id,
          workspaceId: workspace.id,

          startDate,
          endDate,

          modules: [...modulesFilter],

          pageSize: 50,
        });
      } catch {
        console.error("Agenda could not be loaded after cursor recovery.");
      }
    } else {
      console.error("Agenda could not be loaded.");
    }
  }

  let reminderDefaults: ReminderView[] | null = null;
  let reminderAttention: Awaited<
    ReturnType<typeof getReminderAttention>
  > | null = null;
  try {
    reminderAttention = await getReminderAttention({
      userId: user.id,
      workspaceId: workspace.id,
    });
  } catch {
    console.error("Reminder attention could not be loaded.");
  }
  try {
    reminderDefaults = await Promise.all(
      (["money", "career", "time"] as const).map((moduleKey) =>
        getReminder(
          { userId: user.id, workspaceId: workspace.id },
          { moduleKey },
        ),
      ),
    );
  } catch {
    console.error("Reminder defaults could not be loaded.");
  }
  return (
    <AppShell
      pageTitle="Calendar"
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
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to dashboard
          </Link>

          <p className="mt-3 text-sm font-medium text-link">
            Time and commitments
          </p>

          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Calendar
          </h1>

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Review upcoming and overdue commitments without creating duplicate
            editable copies. Career activities stay owned by Career; manual
            personal events are owned by Calendar.
          </p>

          <p className="mt-3 text-sm text-muted-foreground">
            Workspace timezone:{" "}
            <span className="font-medium text-foreground">
              {workspace.timezone}
            </span>
          </p>
        </header>
        <Panel
          title="In-app reminder attention"
          description="Due reminder labels appear on Agenda sources. Today and overdue describe the source date; dismissing a reminder preserves the source commitment."
        >
          <p className="text-sm leading-6">
            Open Reminder controls beside a source to dismiss, snooze, restore,
            or choose custom reminder times. Module defaults apply to sources
            using inherited reminders.
          </p>
          {reminderAttention ? (
            <div className="mt-4">
              <p role="status" className="font-medium">
                {reminderAttention.total === 0
                  ? "No in-app reminders due"
                  : `${reminderAttention.total} source${reminderAttention.total === 1 ? "" : "s"} with due in-app reminders`}
              </p>
              <ul className="mt-3 divide-y divide-border">
                {reminderAttention.items.map((view) =>
                  "sourceId" in view.target ? (
                    <li
                      key={`${view.target.sourceKind}:${view.target.sourceId}`}
                      className="py-3"
                    >
                      <Link
                        href={reminderHref(view.target)}
                        className="inline-flex min-h-11 items-center font-semibold text-link underline"
                      >
                        {view.title} · {view.dueDate ?? "Scheduled source"}
                      </Link>
                      {view.moduleHidden ? (
                        <span className="ml-2 text-sm">Module hidden</span>
                      ) : null}
                    </li>
                  ) : null,
                )}
              </ul>
              {reminderAttention.total > reminderAttention.items.length ? (
                <p className="text-sm text-muted-foreground">
                  Showing the first 25 due sources. Use Agenda source/date
                  filters to review further commitments.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4" role="alert">
              Due reminder attention is temporarily unavailable. Reload Calendar
              to retry.
            </p>
          )}
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
              Module reminder defaults
            </summary>
            <div className="mt-4 space-y-5">
              {reminderDefaults ? (
                reminderDefaults.map((view) => (
                  <ReminderControls
                    key={
                      "moduleKey" in view.target ? view.target.moduleKey : ""
                    }
                    initial={view}
                  />
                ))
              ) : (
                <p role="alert">
                  Reminder defaults are temporarily unavailable. Reload Calendar
                  to retry.
                </p>
              )}
            </div>
          </details>
        </Panel>

        <Panel
          title="Agenda range"
          description="Agenda reads are bounded by an explicit local calendar-date range and optional source filter."
        >
          <form
            method="GET"
            action="/calendar"
            className="grid gap-5 md:grid-cols-3"
          >
            <div>
              <label
                htmlFor="agenda-start-date"
                className="block text-sm font-medium text-foreground"
              >
                Start date
              </label>

              <input
                id="agenda-start-date"
                name="startDate"
                type="date"
                defaultValue={startDate}
                className="mt-2 min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground"
              />
            </div>

            <div>
              <label
                htmlFor="agenda-end-date"
                className="block text-sm font-medium text-foreground"
              >
                End date
              </label>

              <input
                id="agenda-end-date"
                name="endDate"
                type="date"
                defaultValue={endDate}
                className="mt-2 min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground"
              />
            </div>

            <div>
              <label
                htmlFor="agenda-source"
                className="block text-sm font-medium text-foreground"
              >
                Source
              </label>

              <select
                id="agenda-source"
                name="source"
                defaultValue={sourceFilter}
                className={`mt-2 ${selectClassName}`}
              >
                <option value="all">Money, Career and Calendar</option>
                <option value="money">Money only</option>

                <option value="career">Career only</option>

                <option value="time">Calendar only</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                className={[
                  "inline-flex min-h-11 items-center justify-center",
                  "rounded-button border border-primary-border",
                  "bg-primary px-4 py-2.5",
                  "text-sm font-semibold text-primary-foreground",
                  "transition-colors duration-(--motion-duration-fast) ease-state",
                  "hover:bg-primary-hover active:bg-primary-pressed",
                  "motion-reduce:transition-none",
                ].join(" ")}
              >
                Apply range
              </button>
            </div>
          </form>

          {rangeAdjusted ? (
            <p className="mt-4 rounded-control border border-warning bg-warning-surface px-4 py-3 text-sm leading-6 text-warning">
              The requested range was invalid, so Calendar restored its default
              bounded range.
            </p>
          ) : null}

          {cursorRecovered ? (
            <p className="mt-4 rounded-control border border-warning bg-warning-surface px-4 py-3 text-sm leading-6 text-warning">
              The previous pagination position was no longer valid. Calendar
              returned to the first page for this range.
            </p>
          ) : null}
        </Panel>

        {agenda ? (
          <>
            <AgendaList
              agenda={agenda}
              moduleEnabled={{
                career: careerEnabled,
                time: timeEnabled,
                money:
                  modules.find((module) => module.moduleKey === "money")
                    ?.enabled ?? false,
              }}
            />

            <nav
              aria-label="Agenda pagination"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              {cursor ? (
                <Link
                  href={createCalendarHref({
                    startDate,
                    endDate,
                    source: sourceFilter,
                  })}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                  Back to first page
                </Link>
              ) : (
                <span />
              )}

              {agenda.nextCursor ? (
                <Link
                  href={createCalendarHref({
                    startDate,
                    endDate,
                    source: sourceFilter,

                    cursor: agenda.nextCursor,
                  })}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                  Later items
                </Link>
              ) : agenda.items.length > 0 ? (
                <span className="text-sm text-muted-foreground">
                  End of this Agenda range
                </span>
              ) : null}
            </nav>

            {reviewAgendaStep?.applicable &&
            reviewAgendaStep.state !== "completed" ? (
              <Panel
                title="Finish the Agenda lesson"
                description="This onboarding step is guidance-only, so reviewing the Agenda requires an explicit confirmation rather than a hidden side effect of opening this page."
              >
                <AgendaReviewButton />
              </Panel>
            ) : null}

            {timeEnabled ? (
              <PersonalEventCreateForm workspaceTimezone={workspace.timezone} />
            ) : (
              <Panel
                title="Manual personal events are disabled"
                description="Calendar can still show agenda-visible source records while the Time module is hidden."
              >
                <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
                  Existing personal events remain preserved. Enable Time from
                  Getting Started before creating another manual Calendar event.
                </p>

                <Link
                  href="/onboarding"
                  className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                  Review Getting Started
                </Link>
              </Panel>
            )}
          </>
        ) : (
          <Panel
            title="Agenda temporarily unavailable"
            description="Calendar could not read the source-driven Agenda safely."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              No Calendar or Career data has been changed. Retry the Agenda read
              before creating a personal event from this screen.
            </p>

            <Link
              href={createCalendarHref({
                startDate,
                endDate,
                source: sourceFilter,
              })}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Retry Agenda
            </Link>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
