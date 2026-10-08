import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "@/app/auth/forgot-password/page";

const authMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock("@/platform/auth/client", () => ({
  authClient: {
    requestPasswordReset: authMocks.requestPasswordReset,
  },
}));

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    authMocks.requestPasswordReset.mockReset();
  });

  it("requests password recovery without supplying a redirect URL", async () => {
    const user = userEvent.setup();

    authMocks.requestPasswordReset.mockResolvedValue({
      data: {},
      error: null,
    });

    render(<ForgotPasswordPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "  person@example.com  ",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Send reset instructions",
      }),
    );

    expect(authMocks.requestPasswordReset).toHaveBeenCalledOnce();

    expect(authMocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "person@example.com",
    });

    expect(
      await screen.findByRole("heading", {
        name: "Check your email",
      }),
    ).toBeInTheDocument();
  });

  it("validates the email address before making a recovery request", async () => {
    const user = userEvent.setup();

    render(<ForgotPasswordPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "invalid-email",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Send reset instructions",
      }),
    );

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();

    expect(authMocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("does not expose account existence from a resolved auth error", async () => {
    const user = userEvent.setup();

    authMocks.requestPasswordReset.mockResolvedValue({
      data: null,
      error: {
        status: 404,
      },
    });

    render(<ForgotPasswordPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "unknown@example.com",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Send reset instructions",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Check your email",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/does not confirm whether an account exists/i),
    ).toBeInTheDocument();
  });

  it("shows a temporary error when the request cannot be completed", async () => {
    const user = userEvent.setup();

    authMocks.requestPasswordReset.mockRejectedValue(
      new Error("Network unavailable"),
    );

    render(<ForgotPasswordPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "person@example.com",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Send reset instructions",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A temporary problem prevented the request.",
    );
  });
  it.each([429, 500])(
    "does not claim an accepted request after an operational %s error",
    async (status) => {
      authMocks.requestPasswordReset.mockResolvedValue({
        data: null,
        error: { status },
      });
      const user = userEvent.setup();
      render(<ForgotPasswordPage />);
      await user.type(
        screen.getByRole("textbox", { name: "Email address" }),
        "person@example.com",
      );
      await user.click(
        screen.getByRole("button", { name: "Send reset instructions" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "A temporary problem prevented the request.",
      );
      expect(
        screen.queryByRole("heading", { name: "Check your email" }),
      ).not.toBeInTheDocument();
    },
  );
});
