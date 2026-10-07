import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgendaList } from "@/components/calendar/agenda-list";
import type { ListAgendaItemsResult } from "@/modules/time/services/list-agenda-items";
import { parseCalendarDate } from "@/shared/calendar-date";

const agenda: ListAgendaItemsResult = {
  workspaceTimezone: "Asia/Manila",

  today: parseCalendarDate("2026-10-07"),

  items: [
    {
      sourceKind: "application_event",

      sourceId: "11111111-1111-4111-8111-111111111111",

      occurrenceKey: "single",

      title: "Technical interview",

      displayModule: "career",

      agendaDate: parseCalendarDate("2026-10-07"),

      timingState: "today",

      temporal: {
        kind: "timed",

        startsAt: "2026-10-07T01:00:00.000Z",

        endsAt: "2026-10-07T02:00:00.000Z",

        timezone: "Asia/Manila",
      },

      status: "scheduled",

      notificationGeneration: 1,

      reminderCapable: true,

      remindersEnabled: true,

      sourceVersion: 1,
    },

    {
      sourceKind: "personal_event",

      sourceId: "22222222-2222-4222-8222-222222222222",

      occurrenceKey: "single",

      title: "Submit documents",

      displayModule: "time",

      agendaDate: parseCalendarDate("2026-10-08"),

      timingState: "upcoming",

      temporal: {
        kind: "date",

        eventDate: parseCalendarDate("2026-10-08"),

        endDateExclusive: null,
      },

      status: "scheduled",

      notificationGeneration: 1,

      reminderCapable: true,

      remindersEnabled: false,

      sourceVersion: 1,
    },
  ],

  sourceRoutes: {
    "application_event:11111111-1111-4111-8111-111111111111":
      "/career/applications/33333333-3333-4333-8333-333333333333",

    "personal_event:22222222-2222-4222-8222-222222222222":
      "/calendar/events/22222222-2222-4222-8222-222222222222",
  },

  nextCursor: null,
};

describe("AgendaList", () => {
  it("renders source-driven Career and personal Calendar items with their source routes", () => {
    render(
      <AgendaList
        agenda={agenda}
        moduleEnabled={{
          career: true,
          time: true,
        }}
      />,
    );

    expect(screen.getByText("Technical interview")).toBeInTheDocument();

    expect(screen.getByText("Submit documents")).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Open application",
      }),
    ).toHaveAttribute(
      "href",
      "/career/applications/33333333-3333-4333-8333-333333333333",
    );

    expect(
      screen.getByRole("link", {
        name: "Open personal event",
      }),
    ).toHaveAttribute(
      "href",
      "/calendar/events/22222222-2222-4222-8222-222222222222",
    );

    expect(screen.getByText("Module reminders are off")).toBeInTheDocument();
  });

  it("shows a hidden-module cue and does not expose that source's navigation link", () => {
    render(
      <AgendaList
        agenda={agenda}
        moduleEnabled={{
          career: false,
          time: true,
        }}
      />,
    );

    expect(screen.getByText("Module hidden")).toBeInTheDocument();

    expect(
      screen.queryByRole("link", {
        name: "Open application",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Open personal event",
      }),
    ).toBeInTheDocument();
  });
});
