import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveActorContext: vi.fn(),
}));

vi.mock("@/platform/auth/actor-context", () => ({
  resolveActorContext: mocks.resolveActorContext,
}));

import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

const USER_ID = "22222222-2222-4222-8222-222222222222";

const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";

const SESSION_ID = "44444444-4444-4444-8444-444444444444";

function createRequest(): Request {
  return new Request("https://app.example.test/api/v1/example");
}

beforeEach(() => {
  mocks.resolveActorContext.mockReset();
});

describe("API v1 authenticated actor boundary", () => {
  it("maps an unavailable session to the standard 401 problem", async () => {
    mocks.resolveActorContext.mockResolvedValue({
      kind: "unauthorized",
      requestId: REQUEST_ID,
    });

    const result = await resolveApiActorForRequest(createRequest(), REQUEST_ID);

    expect(result.kind).toBe("response");

    if (result.kind !== "response") {
      throw new Error("Expected an API response.");
    }

    expect(result.response.status).toBe(401);

    await expect(result.response.json()).resolves.toEqual({
      status: 401,

      code: "UNAUTHORIZED",
      message: "Authentication is required.",

      requestId: REQUEST_ID,

      retryable: false,
    });
  });

  it("maps missing application provisioning to the standard workspace problem", async () => {
    mocks.resolveActorContext.mockResolvedValue({
      kind: "workspace_unavailable",
      requestId: REQUEST_ID,
    });

    const result = await resolveApiActorForRequest(createRequest(), REQUEST_ID);

    expect(result.kind).toBe("response");

    if (result.kind !== "response") {
      throw new Error("Expected an API response.");
    }

    expect(result.response.status).toBe(409);

    await expect(result.response.json()).resolves.toMatchObject({
      status: 409,
      code: "WORKSPACE_UNAVAILABLE",
      requestId: REQUEST_ID,
      retryable: false,
    });
  });

  it("returns the trusted ActorContext without changing its ownership scope", async () => {
    mocks.resolveActorContext.mockResolvedValue({
      kind: "authenticated",

      actor: {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,

        sessionId: SESSION_ID,
        requestId: REQUEST_ID,
      },
    });

    const result = await resolveApiActorForRequest(createRequest(), REQUEST_ID);

    expect(result).toEqual({
      kind: "authenticated",

      actor: {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,

        sessionId: SESSION_ID,
        requestId: REQUEST_ID,
      },
    });

    expect(mocks.resolveActorContext).toHaveBeenCalledWith(
      expect.any(Headers),
      REQUEST_ID,
    );
  });
});
