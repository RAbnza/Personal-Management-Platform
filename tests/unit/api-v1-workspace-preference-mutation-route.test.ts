import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  updateWorkspacePreference: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock(
  "@/modules/core/services/update-workspace-preference",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/core/services/update-workspace-preference")
      >();

    return {
      ...actual,

      updateWorkspacePreference: mocks.updateWorkspacePreference,
    };
  },
);

import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import { WorkspacePreferenceVersionConflictError } from "@/modules/core/services/update-workspace-preference";
import { PATCH } from "@/app/api/v1/settings/preference/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";

function createRequest(body: unknown, origin = "https://app.example.test") {
  return new Request("https://app.example.test/api/v1/settings/preference", {
    method: "PATCH",

    headers: {
      Origin: origin,
      "Content-Type": "application/json",
    },

    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.updateWorkspacePreference.mockReset();

  mocks.resolveApiActorForRequest.mockImplementation(
    (_request: Request, requestId: string) => ({
      kind: "authenticated",

      actor: {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        sessionId: SESSION_ID,
        requestId,
      },
    }),
  );
});

describe("PATCH /api/v1/settings/preference", () => {
  it("rejects foreign origins before authentication", async () => {
    const response = await PATCH(
      createRequest({}, "https://foreign.example.test"),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();
    expect(mocks.updateWorkspacePreference).not.toHaveBeenCalled();
  });

  it("updates presentation preferences using ActorContext ownership", async () => {
    mocks.updateWorkspacePreference.mockResolvedValue({
      theme: "dark",

      gettingStartedDismissedAt: "2026-10-07T00:00:00.000Z",

      version: 2,
    });

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedVersion: 1,

        theme: "dark",

        gettingStartedDismissed: true,
      }),
    );

    expect(response.status).toBe(200);

    expect(mocks.updateWorkspacePreference).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      expectedVersion: 1,

      theme: "dark",

      gettingStartedDismissed: true,
    });
  });

  it("rejects ownership injection and invalid preference values", async () => {
    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedVersion: 0,

        theme: "purple",

        gettingStartedDismissed: true,

        workspaceId: WORKSPACE_ID,
      }),
    );

    expect(response.status).toBe(422);

    expect(mocks.updateWorkspacePreference).not.toHaveBeenCalled();
  });

  it("maps stale preference state to 409", async () => {
    mocks.updateWorkspacePreference.mockRejectedValue(
      new WorkspacePreferenceVersionConflictError(1, 2),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        theme: "system",
        gettingStartedDismissed: false,
      }),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "STALE_VERSION",
      retryable: false,
    });
  });

  it("maps command-ID reuse to the idempotency conflict contract", async () => {
    mocks.updateWorkspacePreference.mockRejectedValue(
      new CommandReceiptConflictError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        theme: "system",
        gettingStartedDismissed: false,
      }),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("maps an unavailable workspace to 404", async () => {
    mocks.updateWorkspacePreference.mockRejectedValue(
      new PrivateDomainWriteUnavailableError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        theme: "system",
        gettingStartedDismissed: false,
      }),
    );

    expect(response.status).toBe(404);
  });

  it("maps unresolved receipt state to retryable 503", async () => {
    mocks.updateWorkspacePreference.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",
        "Receipt incomplete.",
      ),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        theme: "system",
        gettingStartedDismissed: false,
      }),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",
      retryable: true,
    });
  });
});
