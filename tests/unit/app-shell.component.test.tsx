import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppShell } from "@/components/shell/app-shell";

describe("AppShell", () => {
  it("provides primary navigation and a main-content skip target", () => {
    render(
      <AppShell pageTitle="Dashboard" activePath="/">
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", {
        name: "Skip to main content",
      }),
    ).toHaveAttribute("href", "#main-content");

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary",
    });

    const dashboardLink = within(primaryNavigation).getByRole("link", {
      name: "Dashboard",
    });

    expect(dashboardLink).toHaveAttribute("href", "/");
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
  });

  it("opens and closes the mobile navigation dialog accessibly", async () => {
    const user = userEvent.setup();

    render(
      <AppShell pageTitle="Dashboard" activePath="/">
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Menu",
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Navigation",
    });

    expect(dialog).toBeInTheDocument();

    expect(
      within(dialog).getByRole("navigation", {
        name: "Primary",
      }),
    ).toBeInTheDocument();

    expect(
      within(dialog).getByRole("link", {
        name: "Dashboard",
      }),
    ).toHaveAttribute("aria-current", "page");

    await user.click(
      within(dialog).getByRole("button", {
        name: "Close navigation",
      }),
    );

    expect(
      screen.queryByRole("dialog", {
        name: "Navigation",
      }),
    ).not.toBeInTheDocument();
  });

  it("closes mobile navigation after choosing a destination", async () => {
    const user = userEvent.setup();

    render(
      <AppShell pageTitle="Dashboard" activePath="/">
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Menu",
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Navigation",
    });

    await user.click(
      within(dialog).getByRole("link", {
        name: "Dashboard",
      }),
    );

    expect(
      screen.queryByRole("dialog", {
        name: "Navigation",
      }),
    ).not.toBeInTheDocument();
  });
});
