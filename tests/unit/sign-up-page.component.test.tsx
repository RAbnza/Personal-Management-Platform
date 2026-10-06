import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SignUpPage from "@/app/auth/sign-up/page";

const authMocks = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
}));

vi.mock("@/platform/auth/client", () => ({
  authClient: {
    signUp: {
      email: authMocks.signUpEmail,
    },
  },
}));

describe("SignUpPage", () => {
  beforeEach(() => {
    authMocks.signUpEmail.mockReset();
  });

  it("creates an account through Better Auth with normalized values", async () => {
    const user = userEvent.setup();

    authMocks.signUpEmail.mockResolvedValue({
      data: {},
      error: null,
    });

    render(<SignUpPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Name",
      }),
      "  Jane Example  ",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "  jane@example.com  ",
    );

    await user.type(
      screen.getByLabelText("Password"),
      "correct horse battery staple",
    );

    await user.type(
      screen.getByLabelText("Confirm password"),
      "correct horse battery staple",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Create account",
      }),
    );

    expect(authMocks.signUpEmail).toHaveBeenCalledOnce();

    expect(authMocks.signUpEmail).toHaveBeenCalledWith({
      name: "Jane Example",
      email: "jane@example.com",
      password: "correct horse battery staple",
    });

    expect(
      await screen.findByRole("heading", {
        name: "Continue from your inbox",
      }),
    ).toBeInTheDocument();
  });

  it("rejects passwords shorter than the configured minimum", async () => {
    const user = userEvent.setup();

    render(<SignUpPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Name",
      }),
      "Jane Example",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "jane@example.com",
    );

    await user.type(screen.getByLabelText("Password"), "short");

    await user.type(screen.getByLabelText("Confirm password"), "short");

    await user.click(
      screen.getByRole("button", {
        name: "Create account",
      }),
    );

    expect(
      await screen.findByText("Use at least 12 characters."),
    ).toBeInTheDocument();

    expect(authMocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects mismatched password confirmation locally", async () => {
    const user = userEvent.setup();

    render(<SignUpPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Name",
      }),
      "Jane Example",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "jane@example.com",
    );

    await user.type(
      screen.getByLabelText("Password"),
      "correct horse battery staple",
    );

    await user.type(
      screen.getByLabelText("Confirm password"),
      "different horse battery staple",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Create account",
      }),
    );

    expect(
      await screen.findByText("The passwords do not match."),
    ).toBeInTheDocument();

    expect(authMocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("shows a generic registration error without exposing account state", async () => {
    const user = userEvent.setup();

    authMocks.signUpEmail.mockResolvedValue({
      data: null,
      error: {
        status: 422,
      },
    });

    render(<SignUpPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Name",
      }),
      "Jane Example",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "jane@example.com",
    );

    await user.type(
      screen.getByLabelText("Password"),
      "correct horse battery staple",
    );

    await user.type(
      screen.getByLabelText("Confirm password"),
      "correct horse battery staple",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Create account",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't complete registration right now.",
    );
  });
});
