import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SignInPage from "@/app/auth/sign-in/page";

const authMocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  notifySessionChanged: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/platform/auth/client", () => ({
  authClient: {
    signIn: {
      email: authMocks.signInEmail,
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: routerMocks.replace,
    refresh: routerMocks.refresh,
  }),
}));
vi.mock("@/platform/auth/session-notice", () => ({
  notifySessionChanged: authMocks.notifySessionChanged,
}));

describe("SignInPage", () => {
  beforeEach(() => {
    authMocks.signInEmail.mockReset();
    authMocks.notifySessionChanged.mockReset();
    routerMocks.replace.mockReset();
    routerMocks.refresh.mockReset();
  });

  it("submits valid credentials through Better Auth", async () => {
    const user = userEvent.setup();

    authMocks.signInEmail.mockResolvedValue({
      data: {},
      error: null,
    });

    render(<SignInPage />);
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await user.click(screen.getByRole("button", { name: "Hide password" }));

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "  person@example.com  ",
    );

    await user.type(
      screen.getByLabelText("Password"),
      "correct horse battery staple",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign in",
      }),
    );

    expect(authMocks.signInEmail).toHaveBeenCalledOnce();
    expect(authMocks.signInEmail).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "correct horse battery staple",
    });

    expect(routerMocks.replace).toHaveBeenCalledWith("/");
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
    expect(authMocks.notifySessionChanged).toHaveBeenCalledOnce();
  });

  it("shows local validation errors without calling the authentication API", async () => {
    const user = userEvent.setup();

    render(<SignInPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "not-an-email",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Sign in",
      }),
    );

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();

    expect(screen.getByText("Enter your password.")).toBeInTheDocument();

    expect(authMocks.signInEmail).not.toHaveBeenCalled();
  });

  it("shows a safe authentication failure without exposing account state", async () => {
    const user = userEvent.setup();

    authMocks.signInEmail.mockResolvedValue({
      data: null,
      error: {
        status: 401,
      },
    });

    render(<SignInPage />);

    await user.type(
      screen.getByRole("textbox", {
        name: "Email address",
      }),
      "person@example.com",
    );

    await user.type(screen.getByLabelText("Password"), "incorrect password");

    await user.click(
      screen.getByRole("button", {
        name: "Sign in",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you in with those credentials.",
    );

    expect(routerMocks.replace).not.toHaveBeenCalled();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });
});
