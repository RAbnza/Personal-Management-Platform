import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  bootstrap: vi.fn(),
  dashboard: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  redirect: mocks.redirect,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/app/_lib/private-app-bootstrap", () => ({
  resolvePrivateAppBootstrap: mocks.bootstrap,
}));
vi.mock("@/app/_lib/onboarding-progress", () => ({
  resolveOnboardingProgress: async () => null,
}));
vi.mock("@/modules/dashboard/services/get-dashboard", () => ({
  getDashboard: mocks.dashboard,
}));
vi.mock("@/components/shell/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import DashboardLoading from "@/app/loading";
import DashboardError from "@/app/error";
import Home from "@/app/page";
import { dashboardFixture } from "./helpers/dashboard";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bootstrap.mockResolvedValue({
    kind: "ready",
    user: { id: "owner", name: "Owner", email: "owner@example.test" },
    workspace: { id: "workspace", currency: "PHP", timezone: "Asia/Manila" },
    preference: {
      theme: "system",
      version: 1,
      gettingStartedDismissedAt: null,
    },
    modules: [],
  });
  mocks.dashboard.mockResolvedValue(dashboardFixture());
});
describe("Dashboard critical states and navigation", () => {
  it("prioritizes attention and keeps unsupported coverage visibly unknown", () => {
    render(
      <DashboardView
        data={dashboardFixture()}
        moduleEnabled={{ money: false, career: false, time: false }}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(
      "What needs your attention?",
    );
    expect(screen.getByText("Coverage not established")).toBeInTheDocument();
    expect(screen.getByText("No accounts tracked")).toBeInTheDocument();
    expect(
      screen.getByText(/Money is hidden in navigation/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Add expense" }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("link", { name: "Net recognized spending: PHP 0.00" })
        .getAttribute("href"),
    ).toContain("startDate=2026-10-01&endDate=2026-10-08");
  });
  it("shows uncertainty without client calculation and links each attention record", () => {
    const d = dashboardFixture();
    d.coverage.incompleteLiabilities = true;
    d.coverage.periodBeforeCutoff = true;
    d.finance.clearingMinor = "1000";
    d.attention = [
      {
        key: "clearing",
        title: "Resolve clearing",
        detail: "Unclassified payment",
        href: "/money/debts/owned",
      },
    ];
    render(
      <DashboardView
        data={d}
        moduleEnabled={{ money: true, career: true, time: true }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Resolve clearing" }),
    ).toHaveAttribute("href", "/money/debts/owned");
    expect(
      screen.getByText(/Excluded payment clearing: PHP 10.00/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/spending coverage is incomplete/),
    ).toBeInTheDocument();
  });
  it("supports keyboard-friendly period/source selection and removes irrelevant custom dates", async () => {
    const user = userEvent.setup();
    render(
      <DashboardFilters
        period="custom"
        startDate="2026-10-01"
        endDate="2026-10-08"
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Agenda sources" }),
      "career",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/?period=custom&startDate=2026-10-01&endDate=2026-10-08&source=career",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Expense period" }),
      "year",
    );
    expect(screen.queryByLabelText("Start date")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/?period=year&source=career");
  });
  it("exposes loading and actionable retry states accessibly", async () => {
    const { unmount } = render(<DashboardLoading />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    unmount();
    const reset = vi.fn();
    render(<DashboardError reset={reset} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Retry Dashboard" }));
    expect(reset).toHaveBeenCalledOnce();
  });
  it("does not replace a failed server snapshot with zero totals", async () => {
    mocks.dashboard.mockRejectedValue(new Error("database unavailable"));
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "source records could not be loaded",
    );
    expect(
      screen.queryByText("Net recognized spending"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Retry Dashboard" }),
    ).toHaveAttribute("href", "/");
  });
  it("rejects invalid filters before reading and redirects unauthenticated users", async () => {
    render(
      await Home({ searchParams: Promise.resolve({ workspaceId: "foreign" }) }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("valid ordered dates");
    expect(mocks.dashboard).not.toHaveBeenCalled();
    mocks.bootstrap.mockResolvedValue({ kind: "unauthorized" });
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/sign-in");
  });
});
