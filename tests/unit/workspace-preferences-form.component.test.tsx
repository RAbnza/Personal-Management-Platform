import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspacePreferencesForm } from "@/components/onboarding/workspace-preferences-form";
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

const modules: ModulePreferenceItem[] = [
  {
    moduleKey: "money",
    enabled: true,
    agendaVisible: true,
    remindersEnabled: true,
    version: 1,
  },

  {
    moduleKey: "career",
    enabled: true,
    agendaVisible: true,
    remindersEnabled: true,
    version: 2,
  },

  {
    moduleKey: "time",
    enabled: true,
    agendaVisible: true,
    remindersEnabled: true,
    version: 3,
  },
];

const workspace = {
  currency: "PHP",
  timezone: "Asia/Manila",
  weekStart: 1,
  version: 4,
  currencyChangeAllowed: true,
};

beforeEach(() => {
  routerMocks.refresh.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspacePreferencesForm", () => {
  it("confirms unchanged preferences without creating unnecessary settings mutations", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          guideVersion: 1,
          stepKey: "confirm-preferences",
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

    render(
      <WorkspacePreferencesForm
        workspace={workspace}
        modules={modules}
        stepState="pending"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save and continue",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/v1/onboarding/steps/confirm-preferences",
    );

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("saves workspace settings and reminder changes before completing onboarding", async () => {
    const user = userEvent.setup();

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            currency: "PHP",
            timezone: "Asia/Singapore",
            weekStart: 0,
            version: 5,
            currencyChangeAllowed: true,
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
            moduleKey: "money",
            enabled: true,
            agendaVisible: true,
            remindersEnabled: false,
            version: 2,
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
            stepKey: "confirm-preferences",
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

    render(
      <WorkspacePreferencesForm
        workspace={workspace}
        modules={modules}
        stepState="pending"
      />,
    );

    await user.clear(
      screen.getByRole("combobox", {
        name: "Timezone",
      }),
    );

    await user.type(
      screen.getByRole("combobox", {
        name: "Timezone",
      }),
      "Asia/Singapore",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Week starts on",
      }),
      "0",
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /Money reminders/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save and continue",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const [workspaceUrl, workspaceRequest] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(workspaceUrl).toBe("/api/v1/settings/workspace");

    expect(JSON.parse(workspaceRequest.body as string)).toEqual({
      clientCommandId: expect.any(String),

      expectedVersion: 4,

      currency: "PHP",
      timezone: "Asia/Singapore",
      weekStart: 0,
    });

    const [moduleUrl, moduleRequest] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];

    expect(moduleUrl).toBe("/api/v1/module-preferences/money");

    expect(JSON.parse(moduleRequest.body as string)).toEqual({
      clientCommandId: expect.any(String),

      expectedVersion: 1,

      enabled: true,
      agendaVisible: true,
      remindersEnabled: false,
    });

    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/v1/onboarding/steps/confirm-preferences",
    );

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not complete onboarding when workspace settings fail", async () => {
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

    render(
      <WorkspacePreferencesForm
        workspace={workspace}
        modules={modules}
        stepState="pending"
      />,
    );

    await user.clear(
      screen.getByRole("combobox", {
        name: "Timezone",
      }),
    );

    await user.type(
      screen.getByRole("combobox", {
        name: "Timezone",
      }),
      "Asia/Singapore",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save and continue",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some preferences could not be saved.",
    );

    expect(fetchMock).toHaveBeenCalledOnce();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/settings/workspace");

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not rewrite completed onboarding progress when preferences are edited later", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          currency: "PHP",
          timezone: "Asia/Manila",
          weekStart: 0,
          version: 5,
          currencyChangeAllowed: true,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(
      <WorkspacePreferencesForm
        workspace={workspace}
        modules={modules}
        stepState="completed"
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Week starts on",
      }),
      "0",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save preferences",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/settings/workspace");

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps currency readable but immutable when financial structure already exists", () => {
    render(
      <WorkspacePreferencesForm
        workspace={{
          ...workspace,
          currencyChangeAllowed: false,
        }}
        modules={modules}
        stepState="completed"
      />,
    );

    const currency = screen.getByRole("textbox", {
      name: "Currency",
    });

    expect(currency).toHaveValue("PHP");
    expect(currency).toHaveAttribute("readonly");

    expect(
      screen.getByText(
        "Currency is locked because financial account structure already exists.",
      ),
    ).toBeInTheDocument();
  });
});
