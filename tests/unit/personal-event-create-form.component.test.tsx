import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PersonalEventCreateForm } from "@/components/calendar/personal-event-create-form";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerMocks.refresh,
  }),
}));

const fetchMock = vi.fn();

function successResponse() {
  return new Response(
    JSON.stringify({
      eventId: "11111111-1111-4111-8111-111111111111",

      eventVersion: 1,

      notificationGeneration: 1,
    }),
    {
      status: 201,

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

describe("PersonalEventCreateForm", () => {
  it("creates a date-only personal event", async () => {
    fetchMock.mockResolvedValueOnce(successResponse());

    render(<PersonalEventCreateForm workspaceTimezone="Asia/Manila" />);

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Title"), "Submit documents");

    fireEvent.change(screen.getByLabelText("Date"), {
      target: {
        value: "2026-10-10",
      },
    });

    await user.type(
      screen.getByLabelText("Description"),
      "Prepare requirements.",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add personal event",
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

      title: "Submit documents",

      temporalKind: "date",

      eventDate: "2026-10-10",

      endDateExclusive: null,

      startsAt: null,

      endsAt: null,

      timezone: null,

      description: "Prepare requirements.",
    });

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("retries an unconfirmed creation with the identical command", async () => {
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
      .mockResolvedValueOnce(successResponse());

    render(<PersonalEventCreateForm workspaceTimezone="Asia/Manila" />);

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Title"), "Follow up documents");

    fireEvent.change(screen.getByLabelText("Date"), {
      target: {
        value: "2026-10-10",
      },
    });

    await user.click(
      screen.getByRole("button", {
        name: "Add personal event",
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
