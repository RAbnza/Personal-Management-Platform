import { describe, expect, it } from "vitest";
import {
  agendaItemOnDay,
  calendarEvent,
  previousCivilDay,
} from "@/components/calendar/calendar-model";
import type { AgendaItem } from "@/modules/time/services/list-agenda-items";
import { parseCalendarDate } from "@/shared/calendar-date";

const item: AgendaItem = {
  sourceKind: "personal_event",
  sourceId: "event",
  occurrenceKey: "once",
  title: "Trip",
  displayModule: "time",
  agendaDate: parseCalendarDate("2026-10-01"),
  timingState: "upcoming",
  temporal: {
    kind: "date",
    eventDate: parseCalendarDate("2026-10-01"),
    endDateExclusive: parseCalendarDate("2026-10-04"),
  },
  status: "scheduled",
  notificationGeneration: 1,
  reminderCapable: true,
  remindersEnabled: true,
  sourceVersion: 1,
};
describe("calendar temporal adapter", () => {
  it("keeps civil dates and exclusive multi-day boundaries without timezone conversion", () => {
    const event = calendarEvent(item, {
      "personal_event:event": "/calendar/events/event",
    });
    expect(event).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-04",
      allDay: true,
      url: "/calendar/events/event",
    });
    expect(agendaItemOnDay(item, "2026-10-03", "America/Los_Angeles")).toBe(
      true,
    );
    expect(agendaItemOnDay(item, "2026-10-04", "Pacific/Kiritimati")).toBe(
      false,
    );
    expect(previousCivilDay("2026-11-01T00:00:00-04:00")).toBe("2026-10-31");
  });
  it("uses actual instants and DST-aware day boundaries", () => {
    const timed: AgendaItem = {
      ...item,
      temporal: {
        kind: "timed",
        startsAt: "2026-11-01T03:30:00Z",
        endsAt: "2026-11-02T05:00:00Z",
        timezone: "America/New_York",
      },
    };
    expect(calendarEvent(timed, {})).toMatchObject({
      start: "2026-11-01T03:30:00Z",
      end: "2026-11-02T05:00:00Z",
      allDay: false,
    });
    expect(agendaItemOnDay(timed, "2026-10-31", "America/New_York")).toBe(true);
    expect(agendaItemOnDay(timed, "2026-11-01", "America/New_York")).toBe(true);
    expect(agendaItemOnDay(timed, "2026-11-02", "America/New_York")).toBe(
      false,
    );
  });
});
