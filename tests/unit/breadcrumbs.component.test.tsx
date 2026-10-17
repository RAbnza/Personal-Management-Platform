import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BreadcrumbRecords,
  PageLocationProvider,
} from "@/components/shell/breadcrumbs";

describe("page-owned breadcrumb context", () => {
  it("resolves a direct link and clears names when changing location or unloading record data", () => {
    const base = "/money/debts/11111111-1111-4111-8111-111111111111";
    const child = (
      <BreadcrumbRecords path={`${base}/pay`} labels={{ [base]: "GLoan" }} />
    );
    const view = render(
      <PageLocationProvider path={`${base}/pay`}>{child}</PageLocationProvider>,
    );
    const trail = () =>
      within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(trail().getByRole("link", { name: "GLoan" })).toHaveAttribute(
      "href",
      base,
    );
    expect(trail().getByText("Record payment")).toHaveAttribute(
      "aria-current",
      "page",
    );
    view.rerender(
      <PageLocationProvider path="/settings/files">
        {child}
      </PageLocationProvider>,
    );
    expect(trail().queryByText("GLoan")).not.toBeInTheDocument();
    expect(trail().getByText("Files")).toHaveAttribute("aria-current", "page");
    view.rerender(
      <PageLocationProvider path={`${base}/pay`}>{null}</PageLocationProvider>,
    );
    expect(trail().queryByText("GLoan")).not.toBeInTheDocument();
    expect(trail().getByRole("link", { name: "Debt" })).toBeVisible();
  });
});
