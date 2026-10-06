import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  updateModulePreference: vi.fn(),
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
  "@/modules/core/services/update-module-preference",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/core/services/update-module-preference")
      >();

    return {
      ...actual,

      updateModulePreference: mocks.updateModulePreference,
    };
  },
);

import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import { ModulePreferenceVersionConflictError } from "@/modules/core/services/update-module-preference";
import { PATCH } from "@/app/api/v1/module-preferences/[moduleKey]/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";

function createRequest(body: unknown) {
  return new Request(
    "https://app.example.test/api/v1/module-preferences/money",
    {
      method: "PATCH",

      headers: {
        Origin: "https://app.example.test",
        "Content-Type": "application/json",
      },

      body: JSON.stringify(body),
    },
  );
}

function createContext(moduleKey: string) {
  return {
    params: Promise.resolve({
      moduleKey,
    }),
  };
}

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.updateModulePreference.mockReset();

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

describe("PATCH /api/v1/module-preferences/:moduleKey", () => {
  it("materializes a virtual-default module preference", async () => {
    mocks.updateModulePreference.mockResolvedValue({
      moduleKey: "money",

      enabled: true,
      agendaVisible: true,
      remindersEnabled: false,

      version: 1,
    });

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedVersion: 0,

        enabled: true,
        agendaVisible: true,
        remindersEnabled: false,
      }),
      createContext("money"),
    );

    expect(response.status).toBe(200);

    expect(mocks.updateModulePreference).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      moduleKey: "money",

      expectedVersion: 0,

      enabled: true,
      agendaVisible: true,
      remindersEnabled: false,
    });
  });

  it("rejects unsupported module keys", async () => {
    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedVersion: 0,

        enabled: true,
        agendaVisible: true,
        remindersEnabled: true,
      }),
      createContext("reports"),
    );

    expect(response.status).toBe(422);

    expect(mocks.updateModulePreference).not.toHaveBeenCalled();
  });

  it("rejects ownership fields in the command body", async () => {
    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedVersion: 0,

        enabled: true,
        agendaVisible: true,
        remindersEnabled: true,

        workspaceId: WORKSPACE_ID,
      }),
      createContext("money"),
    );

    expect(response.status).toBe(422);

    expect(mocks.updateModulePreference).not.toHaveBeenCalled();
  });

  it("maps module preference version conflicts to 409", async () => {
    mocks.updateModulePreference.mockRejectedValue(
      new ModulePreferenceVersionConflictError("career", 1, 2),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedVersion: 1,

        enabled: true,
        agendaVisible: true,
        remindersEnabled: true,
      }),
      createContext("career"),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "STALE_VERSION",
    });
  });

  it("maps command-ID payload conflicts to 409", async () => {
    mocks.updateModulePreference.mockRejectedValue(
      new CommandReceiptConflictError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 0,
        enabled: true,
        agendaVisible: true,
        remindersEnabled: true,
      }),
      createContext("time"),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("maps unavailable workspace state to 404", async () => {
    mocks.updateModulePreference.mockRejectedValue(
      new PrivateDomainWriteUnavailableError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 0,
        enabled: true,
        agendaVisible: true,
        remindersEnabled: true,
      }),
      createContext("time"),
    );

    expect(response.status).toBe(404);
  });

  it("maps unresolved command receipt state to retryable 503", async () => {
    mocks.updateModulePreference.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",
        "Receipt incomplete.",
      ),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        expectedVersion: 0,
        enabled: true,
        agendaVisible: true,
        remindersEnabled: true,
      }),
      createContext("time"),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      retryable: true,
    });
  });
});
