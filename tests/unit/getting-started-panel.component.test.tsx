import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { GettingStartedPanel } from "@/components/onboarding/getting-started-panel";
import type { ListOnboardingProgressResult } from "@/modules/core/services/list-onboarding-progress";

const progress: ListOnboardingProgressResult = {
  guideVersion: 1,

  steps: [
    {
      stepKey: "choose-goal",
      requiredModule: null,
      applicable: true,
      state: "completed",
      completedAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
    },

    {
      stepKey: "confirm-preferences",
      requiredModule: null,
      applicable: true,
      state: "pending",
      completedAt: null,
      updatedAt: null,
    },

    {
      stepKey: "add-first-account",
      requiredModule: "money",
      applicable: false,
      state: "pending",
      completedAt: null,
      updatedAt: null,
    },

    {
      stepKey: "add-job-application",
      requiredModule: "career",
      applicable: true,
      state: "skipped",
      completedAt: null,
      updatedAt: "2026-10-07T00:05:00.000Z",
    },
  ],

  applicableStepCount: 3,
  resolvedApplicableStepCount: 2,

  complete: false,
};

describe("GettingStartedPanel", () => {
  it("shows persisted progress for only currently applicable steps", () => {
    render(<GettingStartedPanel progress={progress} />);

    expect(
      screen.getByText("2 of 3 applicable steps resolved"),
    ).toBeInTheDocument();

    expect(screen.getByText("Choose a starting goal")).toBeInTheDocument();

    expect(
      screen.getByText("Confirm workspace preferences"),
    ).toBeInTheDocument();

    expect(screen.getByText("Add a job application")).toBeInTheDocument();

    expect(
      screen.queryByText("Add your first financial account"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Continue setup",
      }),
    ).toHaveAttribute("href", "/onboarding");
  });

  it("distinguishes completed, skipped, and pending states using text", () => {
    render(<GettingStartedPanel progress={progress} showGuideLink={false} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("To do")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Skip for now: Confirm workspace preferences",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resume: Add a job application" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Skip for now: Choose a starting goal",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("link", {
        name: "Continue setup",
      }),
    ).not.toBeInTheDocument();
  });
});
