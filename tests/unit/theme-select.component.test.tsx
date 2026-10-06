import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeSelect } from "@/components/theme/theme-select";

const themeMock = vi.hoisted(() => ({
  theme: "system" as string | undefined,
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: themeMock.theme,
    setTheme: themeMock.setTheme,
  }),
}));

describe("ThemeSelect", () => {
  beforeEach(() => {
    themeMock.theme = "system";
    themeMock.setTheme.mockReset();
  });

  it("exposes System, Light, and Dark theme choices", async () => {
    render(<ThemeSelect />);

    const select = await screen.findByRole("combobox", {
      name: "Theme",
    });

    expect(select).toHaveValue("system");

    expect(
      screen.getByRole("option", {
        name: "System",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("option", {
        name: "Light",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("option", {
        name: "Dark",
      }),
    ).toBeInTheDocument();
  });

  it("updates the device theme when the user chooses another option", async () => {
    const user = userEvent.setup();

    render(<ThemeSelect />);

    const select = await screen.findByRole("combobox", {
      name: "Theme",
    });

    await user.selectOptions(select, "dark");

    expect(themeMock.setTheme).toHaveBeenCalledOnce();
    expect(themeMock.setTheme).toHaveBeenCalledWith("dark");
  });

  it("falls back to System when no client theme has been resolved", async () => {
    themeMock.theme = undefined;

    render(<ThemeSelect />);

    expect(
      await screen.findByRole("combobox", {
        name: "Theme",
      }),
    ).toHaveValue("system");
  });
});
