import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceThemeSelect } from "@/components/theme/workspace-theme-select";

const themeMocks = vi.hoisted(() => ({
  theme: "dark" as string | undefined,
  setTheme: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: themeMocks.theme,
    setTheme: themeMocks.setTheme,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerMocks.refresh,
  }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  themeMocks.theme = "dark";
  themeMocks.setTheme.mockReset();

  routerMocks.refresh.mockReset();

  fetchMock.mockReset();

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspaceThemeSelect", () => {
  it("reconciles the browser theme to the server workspace preference", async () => {
    render(
      <WorkspaceThemeSelect
        theme="dark"
        version={3}
        gettingStartedDismissed={false}
      />,
    );

    await waitFor(() => {
      expect(themeMocks.setTheme).toHaveBeenCalledWith("dark");
    });
  });

  it("persists a new theme using the workspace preference mutation", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          theme: "light",
          gettingStartedDismissedAt: null,
          version: 4,
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
      <WorkspaceThemeSelect
        theme="dark"
        version={3}
        gettingStartedDismissed={false}
      />,
    );

    const select = await screen.findByRole("combobox", {
      name: "Theme",
    });

    await user.selectOptions(select, "light");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/api/v1/settings/preference");
    expect(request.method).toBe("PATCH");

    expect(JSON.parse(request.body as string)).toEqual({
      clientCommandId: expect.any(String),
      expectedVersion: 3,
      theme: "light",
      gettingStartedDismissed: false,
    });

    expect(themeMocks.setTheme).toHaveBeenCalledWith("light");

    await waitFor(() => {
      expect(routerMocks.refresh).toHaveBeenCalledOnce();
    });
  });

  it("restores the server theme when persistence fails", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue(
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
      <WorkspaceThemeSelect
        theme="dark"
        version={3}
        gettingStartedDismissed={false}
      />,
    );

    const select = await screen.findByRole("combobox", {
      name: "Theme",
    });

    await user.selectOptions(select, "system");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The previous workspace theme has been restored.",
    );

    expect(themeMocks.setTheme).toHaveBeenLastCalledWith("dark");

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });
});
