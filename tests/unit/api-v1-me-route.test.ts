import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActorContext: vi.fn(),

  getCurrentUserOverview: vi.fn(),
}));

vi.mock("@/platform/auth/actor-context", () => ({
  resolveActorContext: mocks.resolveActorContext,
}));

vi.mock(
  "@/modules/core/services/get-current-user-overview",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/core/services/get-current-user-overview")
      >();

    return {
      ...actual,

      getCurrentUserOverview: mocks.getCurrentUserOverview,
    };
  },
);

import { CurrentUserOverviewUnavailableError } from "@/modules/core/services/get-current-user-overview";
import { GET } from "@/app/api/v1/me/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";

function createRequest(): Request {
  return new Request("https://app.example.test/api/v1/me", {
    method: "GET",
  });
}

beforeEach(() => {
  mocks.resolveActorContext.mockReset();

  mocks.getCurrentUserOverview.mockReset();
});

describe("GET /api/v1/me", () => {
  it("returns 401 when no verified authenticated session is available", async () => {
    mocks.resolveActorContext.mockImplementation(
      (_headers: Headers, requestId: string) => ({
        kind: "unauthorized",

        requestId,
      }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(401);

    const body = await response.json();

    expect(body).toMatchObject({
      status: 401,

      code: "UNAUTHORIZED",

      message: "Authentication is required.",

      retryable: false,
    });

    expect(body.requestId).toBe(response.headers.get("x-request-id"));

    expect(mocks.getCurrentUserOverview).not.toHaveBeenCalled();
  });

  it("returns a recoverable workspace-state problem when provisioning is unavailable", async () => {
    mocks.resolveActorContext.mockImplementation(
      (_headers: Headers, requestId: string) => ({
        kind: "workspace_unavailable",

        requestId,
      }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      status: 409,

      code: "WORKSPACE_UNAVAILABLE",

      retryable: false,
    });

    expect(mocks.getCurrentUserOverview).not.toHaveBeenCalled();
  });

  it("returns the authenticated workspace bootstrap payload without exposing session credentials", async () => {
    mocks.resolveActorContext.mockImplementation(
      (_headers: Headers, requestId: string) => ({
        kind: "authenticated",

        actor: {
          userId: USER_ID,

          workspaceId: WORKSPACE_ID,

          sessionId: SESSION_ID,

          requestId,
        },
      }),
    );

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

    const response = await GET(createRequest());

    expect(response.status).toBe(200);

    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();

    expect(body).toEqual({
      user: {
        id: USER_ID,
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

    expect(body).not.toHaveProperty("session");

    expect(JSON.stringify(body)).not.toContain(SESSION_ID);

    expect(mocks.getCurrentUserOverview).toHaveBeenCalledWith({
      userId: USER_ID,

      workspaceId: WORKSPACE_ID,
    });
  });

  it("returns 404 if the private workspace becomes unavailable after actor resolution", async () => {
    mocks.resolveActorContext.mockImplementation(
      (_headers: Headers, requestId: string) => ({
        kind: "authenticated",

        actor: {
          userId: USER_ID,

          workspaceId: WORKSPACE_ID,

          sessionId: SESSION_ID,

          requestId,
        },
      }),
    );

    mocks.getCurrentUserOverview.mockRejectedValue(
      new CurrentUserOverviewUnavailableError(),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      status: 404,

      code: "WORKSPACE_UNAVAILABLE",

      retryable: false,
    });
  });

  it("returns a sanitized request-correlated 500 for unexpected failures", async () => {
    const consoleError = vi.spyOn(console, "error");

    consoleError.mockImplementation(() => undefined);

    mocks.resolveActorContext.mockRejectedValue(
      new Error("private database detail"),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body).toMatchObject({
      status: 500,

      code: "INTERNAL_ERROR",

      message:
        "The request could not be completed because of an unexpected server error.",

      retryable: false,
    });

    expect(JSON.stringify(body)).not.toContain("private database detail");

    expect(body.requestId).toBe(response.headers.get("x-request-id"));

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`requestId=${body.requestId}`),
    );
  });
});
