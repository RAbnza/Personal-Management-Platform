import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PersonalEventActions } from "@/components/calendar/personal-event-actions";
import type { GetPersonalEventDetailResult } from "@/modules/time/services/get-personal-event-detail";
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

const event: GetPersonalEventDetailResult = {
  eventId: "11111111-1111-4111-8111-111111111111",

  title: "Submit documents",

  temporalKind: "date",

  eventDate: parseCalendarDate("2026-10-10"),

  endDateExclusive: null,

  startsAt: null,
  endsAt: null,
  timezone: null,

  status: "scheduled",

  description: "Prepare requirements.",

  location: "Home",

  referenceUrl: "https://example.test/reference",

  completedAt: null,

  notificationGeneration: 1,

  createdAt: "2026-10-07T01:00:00.000Z",

  updatedAt: "2026-10-07T01:00:00.000Z",

  version: 1,
};

function successResponse(action: "edit" | "complete" | "cancel") {
  return new Response(
    JSON.stringify({
      eventId: event.eventId,

      action,

      eventVersion: 2,

      notificationGeneration: 2,

      status:
        action === "edit"
          ? "scheduled"
          : action === "complete"
            ? "completed"
            : "cancelled",

      completedAt: action === "complete" ? "2026-10-07T12:00:00.000Z" : null,
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

describe("PersonalEventActions", () => {
  it("edits a date-only personal event", async () => {
    fetchMock.mockResolvedValueOnce(successResponse("edit"));

    render(
      <PersonalEventActions event={event} workspaceTimezone="Asia/Manila" />,
    );

    const user = userEvent.setup();

    const title = screen.getByLabelText("Title");

    await user.clear(title);

    await user.type(title, "Submit updated documents");

    fireEvent.change(screen.getByLabelText("Date"), {
      target: {
        value: "2026-10-12",
      },
    });

    await user.type(
      screen.getByLabelText("Change reason"),
      "Deadline changed.",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save event changes",
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

      action: "edit",

      title: "Submit updated documents",

      temporalKind: "date",

      eventDate: "2026-10-12",

      startsAt: null,

      endsAt: null,

      timezone: null,

      reason: "Deadline changed.",
    });

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("completes a personal event", async () => {
    fetchMock.mockResolvedValueOnce(successResponse("complete"));

    render(
      <PersonalEventActions event={event} workspaceTimezone="Asia/Manila" />,
    );

    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Action"), "complete");

    await user.type(screen.getByLabelText("Change reason"), "Finished.");

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
      expectedEventVersion: 1,

      action: "complete",

      reason: "Finished.",
    });
  });

  it("retries an unconfirmed mutation using the identical command", async () => {
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
      <PersonalEventActions event={event} workspaceTimezone="Asia/Manila" />,
    );

    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Action"), "cancel");

    await user.click(
      screen.getByRole("button", {
        name: "Cancel event",
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
