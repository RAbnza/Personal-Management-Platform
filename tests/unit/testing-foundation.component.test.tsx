import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

function TestButton({ onActivate }: { onActivate: () => void }) {
  return (
    <button type="button" onClick={onActivate}>
      Activate
    </button>
  );
}

describe("component testing foundation", () => {
  it("renders accessible UI and handles user interaction", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();

    render(<TestButton onActivate={onActivate} />);

    const button = screen.getByRole("button", {
      name: "Activate",
    });

    expect(button).toBeInTheDocument();

    await user.click(button);

    expect(onActivate).toHaveBeenCalledOnce();
  });
});
