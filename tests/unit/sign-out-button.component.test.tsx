import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignOutButton } from "@/components/auth/sign-out-button";

const authMocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/platform/auth/client", () => ({
  authClient: {
    signOut: authMocks.signOut,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: routerMocks.replace,
    refresh: routerMocks.refresh,
  }),
}));

beforeEach(() => {
  authMocks.signOut.mockReset();
  routerMocks.replace.mockReset();
  routerMocks.refresh.mockReset();
});

describe("SignOutButton", () => {
  it("revokes the current session and returns to sign in", async () => {
    const user = userEvent.setup();

    authMocks.signOut.mockResolvedValue({
      data: {
        success: true,
      },
      error: null,
    });

    render(<SignOutButton />);

    await user.click(
      screen.getByRole("button", {
        name: "Sign out",
      }),
    );

    expect(authMocks.signOut).toHaveBeenCalledOnce();

    expect(routerMocks.replace).toHaveBeenCalledWith("/auth/sign-in");

    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the user in place when sign-out fails", async () => {
    const user = userEvent.setup();

    authMocks.signOut.mockResolvedValue({
      data: null,
      error: {
        status: 500,
      },
    });

    render(<SignOutButton />);

    await user.click(
      screen.getByRole("button", {
        name: "Sign out",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you out right now.",
    );

    expect(routerMocks.replace).not.toHaveBeenCalled();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });
});
