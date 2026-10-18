// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { WorkspaceViews } from "@/components/ui/workspace-views";
function Draft() {
  const [value, setValue] = useState("");
  return (
    <input
      aria-label="Pending draft"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
afterEach(() => {
  history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});
it("retains drafts while switching views and reveals anchored evidence", async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  render(
    <WorkspaceViews
      label="Analysis"
      views={[
        { label: "Draft", content: <Draft /> },
        {
          label: "Evidence",
          content: <p id="exact-source">Exact source evidence</p>,
        },
      ]}
    />,
  );
  fireEvent.change(screen.getByLabelText("Pending draft"), {
    target: { value: "Unconfirmed command" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
  fireEvent.click(screen.getByRole("button", { name: "Draft" }));
  expect(screen.getByLabelText("Pending draft")).toHaveValue(
    "Unconfirmed command",
  );
  window.location.hash = "exact-source";
  await waitFor(() =>
    expect(screen.getByText("Exact source evidence")).toBeVisible(),
  );
  expect(screen.getByRole("button", { name: "Evidence" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
