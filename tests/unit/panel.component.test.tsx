import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Panel } from "@/components/ui/panel";

describe("Panel", () => {
  it("associates its heading and description with the section", () => {
    render(
      <Panel
        title="Upcoming agenda"
        description="Items that may need your attention."
      >
        <p>No upcoming items.</p>
      </Panel>,
    );

    const panel = screen.getByRole("region", {
      name: "Upcoming agenda",
    });

    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAccessibleDescription(
      "Items that may need your attention.",
    );

    expect(screen.getByText("No upcoming items.")).toBeInTheDocument();
  });
});
