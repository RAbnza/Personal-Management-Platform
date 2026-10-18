"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FullCalendar, {
  type CalendarRef,
  type DatesSetInfo,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import listPlugin from "@fullcalendar/react/list";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/monarch";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { PersonalEventCreateForm } from "./personal-event-create-form";
import {
  agendaItemOnDay,
  calendarEvent,
  previousCivilDay,
} from "./calendar-model";
import type { ListAgendaItemsResult } from "@/modules/time/services/list-agenda-items";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "./calendar.css";

const plugins = [
  themePlugin,
  dayGridPlugin,
  timeGridPlugin,
  listPlugin,
  interactionPlugin,
];
const views = [
  { id: "dayGridMonth", label: "Month" },
  { id: "timeGridWeek", label: "Week" },
  { id: "timeGridDay", label: "Day" },
  { id: "listMonth", label: "Agenda" },
];
const sources = [
  { id: "all", label: "All sources" },
  { id: "time", label: "Personal" },
  { id: "career", label: "Career" },
  { id: "money", label: "Money" },
  { id: "trackers", label: "Trackers" },
];

export function CalendarWorkspace({
  today,
  timezone,
  timeEnabled,
  initialSource = "all",
  initialDate,
}: {
  today: string;
  timezone: string;
  timeEnabled: boolean;
  initialSource?: string;
  initialDate?: string | undefined;
}) {
  const calendar = useRef<CalendarRef>(null);
  const [range, setRange] = useState({
    start: "",
    end: "",
    title: "Your calendar",
  });
  const [view, setView] = useState("dayGridMonth");
  const [source, setSource] = useState(initialSource);
  const [selectedDay, setSelectedDay] = useState(initialDate ?? today);
  const [creationOpen, setCreationOpen] = useState(false);
  const [creationLocked, setCreationLocked] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [pages, setPages] = useState(5);
  const [result, setResult] = useState<{
    key: string;
    data: ListAgendaItemsResult;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = `${range.start}:${range.end}:${source}:${generation}`;
  const data = result?.key === key ? result.data : null;
  const handleDates = useCallback((info: DatesSetInfo) => {
    setRange({
      start: info.startStr.slice(0, 10),
      end: previousCivilDay(info.endStr),
      title: info.view.title,
    });
    setView(info.view.type);
    setSelectedDay((current) =>
      current >= info.startStr.slice(0, 10) &&
      current <= previousCivilDay(info.endStr)
        ? current
        : info.startStr.slice(0, 10),
    );
    setPages(5);
  }, []);

  useEffect(() => {
    if (!range.start) return;
    const controller = new AbortController();
    async function read() {
      setLoading(true);
      setError(null);
      try {
        let combined: ListAgendaItemsResult | null = null;
        let cursor: string | null = null;
        for (let page = 0; page < pages; page++) {
          const query = new URLSearchParams({
            startDate: range.start,
            endDate: range.end,
            pageSize: "200",
            overlap: "true",
          });
          if (source !== "all") query.set("modules", source);
          if (cursor) query.set("cursor", cursor);
          const response = await fetch(`/api/v1/agenda?${query}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok)
            throw new Error(
              "Calendar events could not be loaded. Retry to refresh this range.",
            );
          const next: ListAgendaItemsResult = await response.json();
          if (combined) {
            combined.items.push(...next.items);
            Object.assign(combined.sourceRoutes, next.sourceRoutes);
            combined.nextCursor = next.nextCursor;
          } else {
            combined = next;
          }
          cursor = next.nextCursor;
          if (!cursor) break;
        }
        if (!controller.signal.aborted && combined)
          setResult({ key, data: combined });
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Calendar unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void read();
    return () => controller.abort();
  }, [key, range.start, range.end, source, pages]);

  const events = useMemo(
    () =>
      data?.items.map((item) => calendarEvent(item, data.sourceRoutes)) ?? [],
    [data],
  );
  const dayItems =
    data?.items.filter((item) =>
      agendaItemOnDay(item, selectedDay, timezone),
    ) ?? [];

  return (
    <section
      className="calendar-workspace space-y-4"
      aria-label="Interactive calendar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Your time, in view</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {range.title}
          </h2>
        </div>
        <Dialog
          open={creationOpen}
          onOpenChange={(open) => {
            if (open || !creationLocked) setCreationOpen(open);
          }}
        >
          {timeEnabled ? (
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Add event
              </Button>
            </DialogTrigger>
          ) : (
            <Link className="action-link" href="/onboarding">
              Enable personal events
            </Link>
          )}
          <DialogContent
            title="Make time for something"
            description={`Personal event · ${timezone}`}
            className="max-w-2xl"
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <PersonalEventCreateForm
              onLockChange={setCreationLocked}
              initialDate={selectedDay}
              workspaceTimezone={timezone}
              onCreated={() => setGeneration((value) => value + 1)}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            aria-label="Previous calendar period"
            onClick={() => calendar.current?.getApi().prev()}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              calendar.current?.getApi().gotoDate(today);
              setSelectedDay(today);
            }}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            aria-label="Next calendar period"
            onClick={() => calendar.current?.getApi().next()}
          >
            <ChevronRight className="size-4" />
          </Button>
          <input
            aria-label="Go to date"
            type="date"
            value={selectedDay}
            onChange={(event) => {
              if (event.target.value) {
                setSelectedDay(event.target.value);
                calendar.current?.getApi().gotoDate(event.target.value);
              }
            }}
            className="min-h-11 min-w-0 rounded-control border border-input bg-surface px-2 text-sm"
          />
        </div>
        <div
          className="flex rounded-full bg-surface-subtle p-1"
          role="group"
          aria-label="Calendar view"
        >
          {views.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => calendar.current?.getApi().changeView(option.id)}
              className={`min-h-11 rounded-full px-3 text-sm font-medium ${view === option.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Calendar sources"
      >
        {sources.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={source === option.id}
            onClick={() => {
              setSource(option.id);
              setPages(5);
            }}
            className={`min-h-11 rounded-full border px-3 text-sm ${source === option.id ? "border-primary bg-accent font-semibold" : "border-border"}`}
          >
            <span
              aria-hidden="true"
              className={`source-dot calendar-source-${option.id}`}
            />
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Times in {timezone}
        </span>
      </div>
      <div aria-live="polite" className="text-sm text-muted-foreground">
        {loading ? (
          "Loading this calendar range…"
        ) : error ? (
          <span role="alert">
            {error}{" "}
            <button
              className="min-h-11 text-link underline"
              onClick={() => setGeneration((value) => value + 1)}
            >
              Retry
            </button>
          </span>
        ) : data?.nextCursor ? (
          <span className="font-medium text-warning">
            Partial calendar: {data.items.length} events loaded. Dates may have
            more events.{" "}
            <button
              className="min-h-11 underline"
              onClick={() => setPages((value) => value + 5)}
            >
              Load more events
            </button>
          </span>
        ) : data ? (
          `${data.items.length} scheduled events in the visible range`
        ) : (
          "Preparing calendar…"
        )}
      </div>
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div
          className="calendar-canvas min-w-0 overflow-hidden rounded-card border border-border bg-card p-2 sm:p-4"
          aria-busy={loading}
        >
          <FullCalendar
            ref={calendar}
            plugins={plugins}
            initialView="dayGridMonth"
            initialDate={initialDate ?? today}
            timeZone={timezone}
            headerToolbar={false}
            height={
              view === "dayGridMonth" || view === "listMonth" ? "auto" : 620
            }
            scrollTime="08:00:00"
            events={events}
            datesSet={handleDates}
            dateClick={(info) => setSelectedDay(info.dateStr.slice(0, 10))}
            navLinks
            navLinkDayClick={(date) => {
              const value = new Intl.DateTimeFormat("en-CA", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(date);
              setSelectedDay(value);
              calendar.current?.getApi().changeView("timeGridDay", value);
            }}
            editable={false}
            selectable={false}
            dayMaxEvents={2}
            nowIndicator
            eventDisplay="block"
          />
        </div>
        <aside
          className="rounded-card bg-(--blue-surface) p-5"
          aria-label="Selected day"
        >
          <p className="text-xs font-semibold uppercase tracking-wider">
            Selected day
          </p>
          <h3 className="mt-2 text-xl font-semibold">
            {new Intl.DateTimeFormat("en", {
              dateStyle: "full",
              timeZone: "UTC",
            }).format(new Date(`${selectedDay}T12:00:00Z`))}
          </h3>
          {timeEnabled ? (
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => setCreationOpen(true)}
            >
              <Plus className="size-4" />
              Add on this date
            </Button>
          ) : null}
          <ul className="mt-5 space-y-3">
            {dayItems.map((item) => (
              <li
                key={`${item.sourceKind}:${item.sourceId}:${item.occurrenceKey}`}
                className="rounded-control bg-card p-3"
              >
                <p className="text-xs font-medium capitalize">
                  <span
                    className={`source-dot calendar-source-${item.displayModule}`}
                  />
                  {item.displayModule === "time"
                    ? "Personal"
                    : item.displayModule}
                </p>
                <Link
                  href={
                    data!.sourceRoutes[`${item.sourceKind}:${item.sourceId}`] ??
                    "/calendar"
                  }
                  className="mt-1 inline-flex min-h-11 font-semibold text-link"
                >
                  {item.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {item.temporal.kind === "date"
                    ? `All day${item.temporal.endDateExclusive ? ` · ends before ${item.temporal.endDateExclusive}` : ""}`
                    : new Intl.DateTimeFormat("en", {
                        timeStyle: "short",
                        timeZone: timezone,
                      }).format(new Date(item.temporal.startsAt))}
                </p>
                {item.reminder ? (
                  <Link
                    className="mt-2 inline-flex min-h-11 text-xs text-link underline"
                    href={item.reminder.href}
                  >
                    {item.reminder.label}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          {!dayItems.length ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {loading || !data
                ? "This date has not finished loading."
                : data.nextCursor
                  ? "No events in the loaded portion. Load more to check this day."
                  : "No scheduled events on this date."}
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
