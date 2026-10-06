import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVerifiedAuthenticatedSession: vi.fn(),
  provisionPersonalWorkspace: vi.fn(),
  getCurrentUserOverview: vi.fn(),
}));

vi.mock("@/platform/auth/session-boundary", () => ({
  getVerifiedAuthenticatedSession: mocks.getVerifiedAuthenticatedSession,
}));

vi.mock("@/modules/core/services/provision-personal-workspace", () => ({
  provisionPersonalWorkspace: mocks.provisionPersonalWorkspace,
}));

vi.mock("@/modules/core/services/get-current-user-overview", () => ({
  getCurrentUserOverview: mocks.getCurrentUserOverview,
}));

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

function createHeaders(): Headers {
  return new Headers({
    cookie: "session=opaque-session-cookie",
  });
}

beforeEach(() => {
  mocks.getVerifiedAuthenticatedSession.mockReset();
  mocks.provisionPersonalWorkspace.mockReset();
  mocks.getCurrentUserOverview.mockReset();
});

describe("private application bootstrap", () => {
  it("rejects access when no verified authenticated session is available", async () => {
    mocks.getVerifiedAuthenticatedSession.mockResolvedValue(null);

    const result = await resolvePrivateAppBootstrap(createHeaders());

    expect(result).toEqual({
      kind: "unauthorized",
    });

    expect(mocks.provisionPersonalWorkspace).not.toHaveBeenCalled();
    expect(mocks.getCurrentUserOverview).not.toHaveBeenCalled();
  });

  it("provisions the authenticated user's workspace and returns its scoped overview", async () => {
    mocks.getVerifiedAuthenticatedSession.mockResolvedValue({
      user: {
        id: USER_ID,
        name: "Jane Example",
        email: "jane@example.com",
        emailVerified: true,
      },

      session: {
        id: "33333333-3333-4333-8333-333333333333",
        token: "private-session-token",
      },
    });

    mocks.provisionPersonalWorkspace.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      created: true,
    });

    mocks.getCurrentUserOverview.mockResolvedValue({
      workspace: {
        currency: "PHP",
        timezone: "Asia/Manila",
        weekStart: 1,
        version: 1,
        currencyChangeAllowed: true,
      },

      preference: {
        locale: "en-PH",
        theme: "system",
        defaultSalaryAccountId: null,
        gettingStartedDismissedAt: null,
        version: 1,
      },

      modules: [
        {
          moduleKey: "money",
          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,
          version: 0,
        },
        {
          moduleKey: "career",
          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,
          version: 0,
        },
        {
          moduleKey: "time",
          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,
          version: 0,
        },
      ],
    });

    const result = await resolvePrivateAppBootstrap(createHeaders());

    expect(mocks.provisionPersonalWorkspace).toHaveBeenCalledWith({
      userId: USER_ID,
      displayName: "Jane Example",
    });

    expect(mocks.getCurrentUserOverview).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(result).toEqual({
      kind: "ready",

      user: {
        id: USER_ID,
        name: "Jane Example",
        email: "jane@example.com",
      },

      workspace: {
        id: WORKSPACE_ID,
        currency: "PHP",
        timezone: "Asia/Manila",
        weekStart: 1,
        version: 1,
        currencyChangeAllowed: true,
      },

      preference: {
        locale: "en-PH",
        theme: "system",
        defaultSalaryAccountId: null,
        gettingStartedDismissedAt: null,
        version: 1,
      },

      modules: [
        {
          moduleKey: "money",
          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,
          version: 0,
        },
        {
          moduleKey: "career",
          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,
          version: 0,
        },
        {
          moduleKey: "time",
          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,
          version: 0,
        },
      ],
    });

    expect(JSON.stringify(result)).not.toContain("private-session-token");
    expect(result).not.toHaveProperty("session");
  });

  it("returns a safe unavailable state when bootstrap services fail", async () => {
    const consoleError = vi.spyOn(console, "error");

    consoleError.mockImplementation(() => undefined);

    mocks.getVerifiedAuthenticatedSession.mockResolvedValue({
      user: {
        id: USER_ID,
        name: "Jane Example",
        email: "jane@example.com",
        emailVerified: true,
      },

      session: {
        id: "33333333-3333-4333-8333-333333333333",
        token: "private-session-token",
      },
    });

    mocks.provisionPersonalWorkspace.mockRejectedValue(
      new Error("private database detail"),
    );

    const result = await resolvePrivateAppBootstrap(createHeaders());

    expect(result).toEqual({
      kind: "unavailable",
    });

    expect(consoleError).toHaveBeenCalledWith(
      "Private application bootstrap failed unexpectedly.",
    );

    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "private database detail",
    );

    expect(mocks.getCurrentUserOverview).not.toHaveBeenCalled();
  });
});
