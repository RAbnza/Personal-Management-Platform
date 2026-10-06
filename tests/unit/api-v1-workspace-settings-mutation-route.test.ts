import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
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
  "@/modules/core/services/update-workspace-settings",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/core/services/update-workspace-settings")
      >();

    return {
      ...actual,
      updateWorkspaceSettings: mocks.updateWorkspaceSettings,
    };
  },
);

import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import {
  WorkspaceCurrencyLockedError,
  WorkspaceSettingsVersionConflictError,
} from "@/modules/core/services/update-workspace-settings";
import { PATCH } from "@/app/api/v1/settings/workspace/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";

function createRequest(
  body: unknown,
  options?: {
    origin?: string | null;
    rawBody?: string;
    contentType?: string | null;
  },
): Request {
  const headers = new Headers();

  if (options?.origin !== null) {
    headers.set("Origin", options?.origin ?? "https://app.example.test");
  }

  if (options?.contentType !== null) {
    headers.set("Content-Type", options?.contentType ?? "application/json");
  }

  return new Request("https://app.example.test/api/v1/settings/workspace", {
    method: "PATCH",

    headers,

    body: options?.rawBody ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.updateWorkspaceSettings.mockReset();

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

describe("PATCH /api/v1/settings/workspace", () => {
  it("rejects a foreign origin before authentication or domain work", async () => {
    const response = await PATCH(
      createRequest(
        {},
        {
          origin: "https://foreign.example.test",
        },
      ),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("updates workspace settings using only ActorContext ownership", async () => {
    mocks.updateWorkspaceSettings.mockResolvedValue({
      currency: "PHP",
      timezone: "Asia/Manila",
      weekStart: 1,
      version: 2,
      currencyChangeAllowed: true,
    });

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedVersion: 1,

        currency: "PHP",
        timezone: "Asia/Manila",
        weekStart: 1,
      }),
    );

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      currency: "PHP",
      timezone: "Asia/Manila",
      weekStart: 1,
      version: 2,
      currencyChangeAllowed: true,
    });

    expect(mocks.updateWorkspaceSettings).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      expectedVersion: 1,

      currency: "PHP",
      timezone: "Asia/Manila",
      weekStart: 1,
    });
  });

  it("maps malformed JSON to 400", async () => {
    const response = await PATCH(
      createRequest(null, {
        rawBody: "{",
      }),
    );

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      code: "MALFORMED_JSON",
      retryable: false,
    });

    expect(mocks.updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("maps invalid command fields and ownership injection to 422", async () => {
    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedVersion: 0,

        currency: "php",
        timezone: "not-a-timezone",
        weekStart: 9,

        workspaceId: WORKSPACE_ID,
      }),
    );

    expect(response.status).toBe(422);

    const body = await response.json();

    expect(body).toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(body.fieldErrors).toBeDefined();

    expect(mocks.updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("maps command-ID payload reuse to 409", async () => {
    mocks.updateWorkspaceSettings.mockRejectedValue(
      new CommandReceiptConflictError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        currency: "PHP",
        timezone: "Asia/Manila",
        weekStart: 1,
      }),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
  });

  it("maps an optimistic-concurrency conflict to 409", async () => {
    mocks.updateWorkspaceSettings.mockRejectedValue(
      new WorkspaceSettingsVersionConflictError(1, 2),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        currency: "PHP",
        timezone: "Asia/Manila",
        weekStart: 1,
      }),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "STALE_VERSION",
      retryable: false,
    });
  });

  it("maps a locked workspace currency change to 422", async () => {
    mocks.updateWorkspaceSettings.mockRejectedValue(
      new WorkspaceCurrencyLockedError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        currency: "USD",
        timezone: "Asia/Manila",
        weekStart: 1,
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "WORKSPACE_CURRENCY_LOCKED",
      retryable: false,
    });
  });

  it("maps a workspace that disappears after actor resolution to 404", async () => {
    mocks.updateWorkspaceSettings.mockRejectedValue(
      new PrivateDomainWriteUnavailableError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        currency: "PHP",
        timezone: "Asia/Manila",
        weekStart: 1,
      }),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "WORKSPACE_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps unresolved command-receipt state to retryable 503", async () => {
    mocks.updateWorkspaceSettings.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",
        "Existing command receipt is incomplete.",
      ),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 1,
        currency: "PHP",
        timezone: "Asia/Manila",
        weekStart: 1,
      }),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",
      retryable: true,
    });
  });
});
