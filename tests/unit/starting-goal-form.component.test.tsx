import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StartingGoalForm } from "@/components/onboarding/starting-goal-form";
import type { ModulePreferenceItem } from "@/modules/core/services/list-module-preferences";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerMocks.refresh,
  }),
}));

const fetchMock = vi.fn();

const defaultModules: ModulePreferenceItem[] = [
  {
    moduleKey: "money",
    enabled: true,
    agendaVisible: true,
    remindersEnabled: true,
    version: 0,
  },
  {
    moduleKey: "career",
    enabled: true,
    agendaVisible: true,
    remindersEnabled: true,
    version: 0,
  },
  {
    moduleKey: "time",
    enabled: true,
    agendaVisible: true,
    remindersEnabled: true,
    version: 0,
  },
];

beforeEach(() => {
  routerMocks.refresh.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StartingGoalForm", () => {
  it("disables Money for a Career-only goal before completing onboarding", async () => {
    const user = userEvent.setup();

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            moduleKey: "money",
            enabled: false,
            agendaVisible: true,
            remindersEnabled: true,
            version: 1,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            guideVersion: 1,
            stepKey: "choose-goal",
            state: "completed",
            completedAt: "2026-10-07T00:00:00.000Z",
            updatedAt: "2026-10-07T00:00:00.000Z",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    render(<StartingGoalForm modules={defaultModules} stepState="pending" />);

    await user.click(
      screen.getByRole("radio", {
        name: /Organize job applications/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save and continue",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [moduleUrl, moduleRequest] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(moduleUrl).toBe("/api/v1/module-preferences/money");

    expect(JSON.parse(moduleRequest.body as string)).toEqual({
      clientCommandId: expect.any(String),

      expectedVersion: 0,

      enabled: false,
      agendaVisible: true,
      remindersEnabled: true,
    });

    const [onboardingUrl, onboardingRequest] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];

    expect(onboardingUrl).toBe("/api/v1/onboarding/steps/choose-goal");

    expect(JSON.parse(onboardingRequest.body as string)).toEqual({
      clientCommandId: expect.any(String),
      state: "completed",
    });

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("can confirm the default Both goal without materializing unchanged module preferences", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          guideVersion: 1,
          stepKey: "choose-goal",
          state: "completed",
          completedAt: "2026-10-07T00:00:00.000Z",
          updatedAt: "2026-10-07T00:00:00.000Z",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<StartingGoalForm modules={defaultModules} stepState="pending" />);

    expect(
      screen.getByRole("radio", {
        name: /Use both/i,
      }),
    ).toBeChecked();

    await user.click(
      screen.getByRole("button", {
        name: "Save and continue",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/v1/onboarding/steps/choose-goal",
    );

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not mark onboarding complete when a module preference mutation fails", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "STALE_VERSION",
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<StartingGoalForm modules={defaultModules} stepState="pending" />);

    await user.click(
      screen.getByRole("radio", {
        name: /Track money/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save and continue",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your starting goal couldn't be saved completely.",
    );

    expect(fetchMock).toHaveBeenCalledOnce();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/v1/module-preferences/career",
    );

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not rewrite completed onboarding progress when changing an existing goal", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          moduleKey: "career",
          enabled: false,
          agendaVisible: true,
          remindersEnabled: true,
          version: 1,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<StartingGoalForm modules={defaultModules} stepState="completed" />);

    await user.click(
      screen.getByRole("radio", {
        name: /Track money/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save goal",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/v1/module-preferences/career",
    );

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });
});
