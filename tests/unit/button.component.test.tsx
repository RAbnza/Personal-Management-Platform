import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders an accessible action button and handles activation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Save application</Button>);

    const button = screen.getByRole("button", {
      name: "Save application",
    });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toBeEnabled();

    await user.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not submit a surrounding form unless explicitly configured", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={onSubmit}>
        <Button>Cancel</Button>
      </form>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("supports explicit form submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Save application</Button>
      </form>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save application",
      }),
    );

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("prevents repeat activation and exposes progress while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button loading loadingLabel="Saving application…" onClick={onClick}>
        Save application
      </Button>,
    );

    const button = screen.getByRole("button", {
      name: "Saving application…",
    });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("respects the native disabled state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button disabled onClick={onClick}>
        Delete record
      </Button>,
    );

    const button = screen.getByRole("button", {
      name: "Delete record",
    });

    expect(button).toBeDisabled();

    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
