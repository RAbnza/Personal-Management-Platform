import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/shell/app-shell";

vi.mock("@/components/theme/workspace-theme-select", () => ({
  WorkspaceThemeSelect: () => <div>Workspace theme control</div>,
}));

vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => null,
  useRouter: () => ({ push: navigation.push }),
}));
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
// JSDOM has no layout; give the floating panel a visible dock reference.
beforeEach(() => {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
    1024,
  );
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
    768,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 500, 384, 60),
  );
});
const shellProps = {
  modules: ["money", "career", "time", "trackers"].map((moduleKey) => ({
    moduleKey,
    enabled: true,
  })),
  pageTitle: "Dashboard",
  activePath: "/",

  userName: "Jane Example",
  userEmail: "jane@example.com",

  workspaceTheme: "system" as const,
  workspacePreferenceVersion: 1,
  gettingStartedDismissed: false,
};

describe("AppShell", () => {
  it("opens the account controls from the header and restores its trigger", async () => {
    const user = userEvent.setup();
    render(<AppShell {...shellProps}>Content</AppShell>);
    const account = screen.getByRole("button", { name: "Your account" });
    await user.click(account);
    expect(
      await screen.findByRole("dialog", { name: "Workspace and account" }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    expect(account).toHaveFocus();
  });
  it("provides primary navigation, identity, and a main-content skip target", async () => {
    render(
      <AppShell {...shellProps}>
        <h1>Dashboard content</h1>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", {
        name: "Skip to main content",
      }),
    ).toHaveAttribute("href", `#${screen.getByRole("main").id}`);

    expect(screen.getByRole("main").id).toMatch(/^main-content-/);

    await userEvent.setup().click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Jane Example")).toBeInTheDocument();

    expect(screen.getByText("jane@example.com")).toBeInTheDocument();

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary",
    });

    const dashboardLink = within(primaryNavigation).getByRole("link", {
      name: "Home",
    });

    expect(dashboardLink).toHaveAttribute("href", "/");
    expect(dashboardLink).toHaveAttribute("aria-current", "page");

    const retained = render(
      <>
        <div style={{ display: "none" }}>
          <AppShell {...shellProps} activePath="/money/debts">
            Retained debt page
          </AppShell>
        </div>
        <AppShell {...shellProps} activePath="/money/debts">
          Current debt page
        </AppShell>
      </>,
    );
    const mains = screen.getAllByRole("main", { hidden: true });
    expect(new Set(mains.map((main) => main.id)).size).toBe(mains.length);
    const currentMain = within(retained.container).getByRole("main");
    const skipNavigation = within(retained.container).getByRole("navigation", {
      name: "Skip navigation",
    });
    const currentSkip = within(skipNavigation).getByRole("link", {
      name: "Skip to main content",
    });
    expect(
      document.getElementById(currentSkip.getAttribute("href")!.slice(1)),
    ).toBe(currentMain);
    expect(currentMain).toHaveAttribute("tabindex", "-1");
  });

  it("opens Modules, focuses its first destination, switches to More and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<AppShell {...shellProps}>Content</AppShell>);
    const trigger = screen.getByRole("button", { name: "Modules" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Your modules" });
    expect(
      within(dialog).getByRole("link", { name: /Money Activity/ }),
    ).toHaveFocus();
    expect(
      within(dialog).getByRole("link", { name: /Trackers Private/ }),
    ).toHaveAttribute("href", "/trackers");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "More" }));
    const more = await screen.findByRole("dialog", {
      name: "Workspace and account",
    });
    expect(within(more).getByText("jane@example.com")).toBeInTheDocument();
    expect(
      within(more).getByText("Workspace theme control"),
    ).toBeInTheDocument();
    expect(
      within(more).getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    await user.click(
      within(more).getByRole("button", { name: "Close More menu" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
  });

  it("keeps unavailable modules out of discovery and closes after native navigation", async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        {...shellProps}
        modules={[{ moduleKey: "money", enabled: false }]}
      >
        Content
      </AppShell>,
    );
    await user.click(screen.getByRole("button", { name: "Modules" }));
    const dialog = await screen.findByRole("dialog", { name: "Your modules" });
    expect(
      within(dialog).queryByRole("link", { name: /Money Activity/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("link", { name: /Shared expenses/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /Manage modules/ }),
    ).toHaveAttribute("href", "/settings?section=modules");
    await user.click(
      within(dialog).getByRole("link", { name: /Reports Financial/ }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("searches static task names and navigates without issuing a financial command", async () => {
    const user = userEvent.setup();
    render(<AppShell {...shellProps}>Content</AppShell>);
    await user.click(screen.getByRole("button", { name: /Find a screen/ }));
    const dialog = screen.getByRole("dialog", { name: "Find a screen" });
    await user.type(within(dialog).getByRole("combobox"), "repay");
    await user.click(within(dialog).getByRole("option", { name: /Debts/ }));
    expect(navigation.push).toHaveBeenLastCalledWith("/money/debts");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Find a screen/ })).toHaveFocus();
  });
});
