import Link from "next/link";
import { BellOff, BriefcaseBusiness, CalendarDays, Clock3 } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import type {
  AgendaItem,
  ListAgendaItemsResult,
} from "@/modules/time/services/list-agenda-items";

const timingLabels = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
} as const;

const moduleLabels = {
  career: "Career",
  time: "Calendar",
  money: "Money",
} as const;

function formatInstant(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatTemporal(item: AgendaItem, workspaceTimezone: string): string {
  if (item.temporal.kind === "date") {
    if (item.temporal.endDateExclusive) {
      return `${item.temporal.eventDate} · ends before ${item.temporal.endDateExclusive}`;
    }

    return item.temporal.eventDate;
  }

  const start = formatInstant(item.temporal.startsAt, workspaceTimezone);

  if (!item.temporal.endsAt) {
    return `${start} · ${workspaceTimezone}`;
  }

  const end = formatInstant(item.temporal.endsAt, workspaceTimezone);

  return `${start} – ${end} · ${workspaceTimezone}`;
}

export interface AgendaListProps {
  agenda: ListAgendaItemsResult;

  moduleEnabled: {
    career: boolean;
    time: boolean;
    money?: boolean;
  };
}

export function AgendaList({ agenda, moduleEnabled }: AgendaListProps) {
  const grouped = new Map<string, AgendaItem[]>();

  for (const item of agenda.items) {
    const existing = grouped.get(item.agendaDate);

    if (existing) {
      existing.push(item);
    } else {
      grouped.set(item.agendaDate, [item]);
    }
  }

  return (
    <Panel
      title="Agenda"
      description="Upcoming commitments come from their Money, Career and Calendar source records. Open a source to review or change it."
    >
      {agenda.items.length === 0 ? (
        <div className="flex gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
            <CalendarDays
              aria-hidden="true"
              className="size-5"
              strokeWidth={1.9}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">
              Nothing in this range
            </p>

            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Adjust the date or source filters, create a personal event, or
              schedule an actionable Career event.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          {[...grouped.entries()].map(([agendaDate, items]) => (
            <section
              key={agendaDate}
              aria-labelledby={`agenda-date-${agendaDate}`}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
                <h3
                  id={`agenda-date-${agendaDate}`}
                  className="text-sm font-semibold text-foreground"
                >
                  {agendaDate}
                </h3>

                {agendaDate === agenda.today ? (
                  <span className="rounded-full border border-border bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                    Today
                  </span>
                ) : null}
              </div>

              <ol className="divide-y divide-border">
                {items.map((item) => {
                  const route =
                    agenda.sourceRoutes[
                      `${item.sourceKind}:${item.sourceId}`
                    ] ?? null;

                  const hidden = !moduleEnabled[item.displayModule];

                  const actionLabel =
                    item.sourceKind === "application_event"
                      ? "Open application"
                      : item.sourceKind === "debt_installment"
                        ? "Open debt"
                        : "Open personal event";

                  return (
                    <li
                      key={`${item.sourceKind}:${item.sourceId}:${item.occurrenceKey}`}
                      className="py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.displayModule === "career" ? (
                              <BriefcaseBusiness
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                                strokeWidth={1.9}
                              />
                            ) : (
                              <CalendarDays
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                                strokeWidth={1.9}
                              />
                            )}

                            <p className="text-sm font-semibold text-foreground">
                              {item.title}
                            </p>

                            <span className="text-xs font-medium text-muted-foreground">
                              {moduleLabels[item.displayModule]}
                            </span>

                            {hidden ? (
                              <span className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                Module hidden
                              </span>
                            ) : null}

                            <span className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-foreground">
                              {timingLabels[item.timingState]}
                            </span>
                          </div>

                          <div className="mt-2 flex gap-2 text-sm leading-6 text-muted-foreground">
                            <Clock3
                              aria-hidden="true"
                              className="mt-0.5 size-4 shrink-0"
                              strokeWidth={1.9}
                            />

                            <span>
                              {formatTemporal(item, agenda.workspaceTimezone)}
                            </span>
                          </div>

                          {!item.remindersEnabled ? (
                            <div className="mt-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <BellOff
                                aria-hidden="true"
                                className="size-4"
                                strokeWidth={1.9}
                              />
                              Module reminders are off
                            </div>
                          ) : null}

                          {route ? (
                            <Link
                              href={route}
                              className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                            >
                              {actionLabel}
                            </Link>
                          ) : null}
                          {item.reminder ? (
                            <div className="mt-2 text-sm">
                              <p className="font-medium">
                                {item.reminder.label}
                              </p>
                              {item.reminder.remainingMinor !== null ? (
                                <p className="text-muted-foreground">
                                  Contractual amount remaining:{" "}
                                  {formatMoneyMinorUnits(
                                    "PHP",
                                    item.reminder.remainingMinor,
                                  )}
                                </p>
                              ) : null}
                              <Link
                                href={item.reminder.href}
                                className="inline-flex min-h-11 items-center font-semibold text-link underline-offset-4 hover:underline"
                              >
                                Reminder controls
                              </Link>
                            </div>
                          ) : null}
                        </div>

                        <span className="numeric-value text-xs text-muted-foreground">
                          v{item.sourceVersion}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
