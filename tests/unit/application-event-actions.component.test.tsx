import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationEventActions } from "@/components/career/application-event-actions";
import type { JobApplicationDetailEvent } from "@/modules/career/services/get-job-application-detail";
import { parseCalendarDate } from "@/shared/calendar-date";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerMocks.refresh,
  }),
}));

const fetchMock = vi.fn();

const event: JobApplicationDetailEvent = {
  eventId: "11111111-1111-4111-8111-111111111111",

  eventKind: "interview",

  title: "Technical interview",

  temporalKind: "date",

  eventDate: parseCalendarDate("2026-10-10"),

  startsAt: null,
  endsAt: null,
  timezone: null,

  status: "scheduled",

  location: "Video call",

  meetingUrl: null,

  preparationNotes: "Review system design.",

  outcomeNotes: null,

  completedAt: null,

  notificationGeneration: 1,

  createdAt: "2026-10-07T01:00:00.000Z",
  updatedAt: "2026-10-07T01:00:00.000Z",

  version: 1,

  isNextAction: true,
};

function successResponse(action: "reschedule" | "complete" | "cancel") {
  return new Response(
    JSON.stringify({
      applicationId: "22222222-2222-4222-8222-222222222222",

      eventId: event.eventId,

      action,

      eventVersion: 2,

      notificationGeneration: 2,

      status:
        action === "reschedule"
          ? "scheduled"
          : action === "complete"
            ? "completed"
            : "cancelled",

      completedAt: action === "complete" ? "2026-10-07T12:00:00.000Z" : null,

      applicationVersion: 4,

      nextActionEventId: null,
    }),
    {
      status: 200,

      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

beforeEach(() => {
  routerMocks.refresh.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApplicationEventActions", () => {
  it("reschedules a date-only Career event", async () => {
    fetchMock.mockResolvedValueOnce(successResponse("reschedule"));

    render(
      <ApplicationEventActions
        applicationId="22222222-2222-4222-8222-222222222222"
        applicationVersion={3}
        event={event}
        workspaceTimezone="Asia/Manila"
        replacementEvents={[]}
      />,
    );

    const user = userEvent.setup();

    await user.click(screen.getByText("Manage activity"));

    const date = screen.getByLabelText("Date");

    await user.clear(date);

    await user.type(date, "2026-10-15");

    await user.type(
      screen.getByLabelText("Change reason"),
      "Employer moved the interview.",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save new schedule",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    expect(body).toMatchObject({
      clientCommandId: expect.any(String),

      expectedEventVersion: 1,

      action: "reschedule",

      temporalKind: "date",

      eventDate: "2026-10-15",

      startsAt: null,
      endsAt: null,
      timezone: null,

      reason: "Employer moved the interview.",
    });

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("moves the next-action pointer when completing its current event", async () => {
    fetchMock.mockResolvedValueOnce(successResponse("complete"));

    const replacementEventId = "33333333-3333-4333-8333-333333333333";

    render(
      <ApplicationEventActions
        applicationId="22222222-2222-4222-8222-222222222222"
        applicationVersion={3}
        event={event}
        workspaceTimezone="Asia/Manila"
        replacementEvents={[
          {
            eventId: replacementEventId,
            title: "Send recruiter follow-up",
          },
        ]}
      />,
    );

    const user = userEvent.setup();

    await user.click(screen.getByText("Manage activity"));

    await user.selectOptions(screen.getByLabelText("Action"), "complete");

    await user.type(
      screen.getByLabelText("Outcome notes"),
      "Interview completed.",
    );

    await user.selectOptions(
      screen.getByLabelText("Replacement next action"),
      replacementEventId,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Mark complete",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    expect(body).toMatchObject({
      clientCommandId: expect.any(String),

      expectedEventVersion: 1,

      action: "complete",

      outcomeNotes: "Interview completed.",

      expectedApplicationVersion: 3,

      replacementNextActionEventId: replacementEventId,
    });
  });

  it("retries an unconfirmed lifecycle change with the identical command", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "TEMPORARY_UNAVAILABLE",
            retryable: true,
          }),
          {
            status: 503,

            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(successResponse("cancel"));

    render(
      <ApplicationEventActions
        applicationId="22222222-2222-4222-8222-222222222222"
        applicationVersion={3}
        event={event}
        workspaceTimezone="Asia/Manila"
        replacementEvents={[]}
      />,
    );

    const user = userEvent.setup();

    await user.click(screen.getByText("Manage activity"));

    await user.selectOptions(screen.getByLabelText("Action"), "cancel");

    await user.click(
      screen.getByRole("button", {
        name: "Cancel activity",
      }),
    );

    expect(
      await screen.findByText("Save outcome unconfirmed"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Retry same save",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );

    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
    );

    expect(secondBody).toEqual(firstBody);
  });
});
