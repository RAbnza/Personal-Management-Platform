import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobApplicationList } from "@/components/career/job-application-list";
import type { ListJobApplicationsResult } from "@/modules/career/services/list-job-applications";
import { parseCalendarDate } from "@/shared/calendar-date";

const applications: ListJobApplicationsResult = {
  items: [
    {
      applicationId: "11111111-1111-4111-8111-111111111111",

      companyName: "Example Technologies",
      roleTitle: "Full Stack Developer",

      location: "Metro Manila",
      workArrangement: "hybrid",

      appliedDate: parseCalendarDate("2026-10-05"),

      currentStage: "screening",
      currentOutcome: null,

      archived: false,

      version: 2,

      nextAction: {
        eventId: "22222222-2222-4222-8222-222222222222",

        eventKind: "follow_up",

        title: "Send follow-up",

        temporalKind: "date",

        eventDate: parseCalendarDate("2026-10-10"),

        startsAt: null,
        endsAt: null,
        timezone: null,
      },
    },
  ],

  nextCursor: "cursor-token",
};

describe("JobApplicationList", () => {
  it("shows the current application stage and next Career action", () => {
    render(
      <JobApplicationList applications={applications} search="" stage={null} />,
    );

    expect(screen.getByText("Example Technologies")).toBeInTheDocument();

    expect(screen.getByText("Full Stack Developer")).toBeInTheDocument();

    expect(screen.getByText("Screening")).toBeInTheDocument();

    expect(screen.getByText("2026-10-05")).toBeInTheDocument();

    expect(screen.getByText("Follow-up · 2026-10-10")).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Add application",
      }),
    ).toHaveAttribute("href", "/career/applications/new");
  });

  it("preserves active filters in cursor pagination without inventing a total count", () => {
    render(
      <JobApplicationList
        applications={applications}
        search="engineer"
        stage="screening"
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "Older applications",
      }),
    ).toHaveAttribute(
      "href",
      "/career/applications?search=engineer&stage=screening&cursor=cursor-token",
    );

    expect(screen.queryByText(/total applications/i)).not.toBeInTheDocument();
  });

  it("offers a return to the first page while viewing a cursor page", () => {
    render(
      <JobApplicationList
        applications={{
          ...applications,
          nextCursor: null,
        }}
        search="engineer"
        stage="screening"
        paginatedView
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "Back to first page",
      }),
    ).toHaveAttribute(
      "href",
      "/career/applications?search=engineer&stage=screening",
    );

    expect(
      screen.getByText("End of matching applications"),
    ).toBeInTheDocument();
  });
});
