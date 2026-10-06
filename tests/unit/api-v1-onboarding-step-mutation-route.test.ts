import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  setOnboardingStepState: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/core/services/set-onboarding-step-state", () => ({
  setOnboardingStepState: mocks.setOnboardingStepState,
}));

import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import { PATCH } from "@/app/api/v1/onboarding/steps/[stepKey]/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";

function createRequest(body: unknown) {
  return new Request(
    "https://app.example.test/api/v1/onboarding/steps/choose-goal",
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

function createContext(stepKey: string) {
  return {
    params: Promise.resolve({
      stepKey,
    }),
  };
}

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.setOnboardingStepState.mockReset();

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

describe("PATCH /api/v1/onboarding/steps/:stepKey", () => {
  it("sets onboarding progress using the current documented guide", async () => {
    mocks.setOnboardingStepState.mockResolvedValue({
      guideVersion: 1,

      stepKey: "choose-goal",

      state: "completed",

      completedAt: "2026-10-07T00:00:00.000Z",

      updatedAt: "2026-10-07T00:00:00.000Z",
    });

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        state: "completed",
      }),
      createContext("choose-goal"),
    );

    expect(response.status).toBe(200);

    expect(mocks.setOnboardingStepState).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      stepKey: "choose-goal",

      state: "completed",
    });
  });

  it("rejects unknown onboarding steps", async () => {
    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        state: "completed",
      }),
      createContext("unknown-step"),
    );

    expect(response.status).toBe(422);

    expect(mocks.setOnboardingStepState).not.toHaveBeenCalled();
  });

  it("rejects unsupported onboarding states and ownership injection", async () => {
    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        state: "done",

        workspaceId: WORKSPACE_ID,
      }),
      createContext("choose-goal"),
    );

    expect(response.status).toBe(422);

    expect(mocks.setOnboardingStepState).not.toHaveBeenCalled();
  });

  it("maps command-ID payload conflicts to 409", async () => {
    mocks.setOnboardingStepState.mockRejectedValue(
      new CommandReceiptConflictError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        state: "completed",
      }),
      createContext("choose-goal"),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("maps unavailable workspace state to 404", async () => {
    mocks.setOnboardingStepState.mockRejectedValue(
      new PrivateDomainWriteUnavailableError(),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        state: "completed",
      }),
      createContext("choose-goal"),
    );

    expect(response.status).toBe(404);
  });

  it("maps unresolved receipt state to retryable 503", async () => {
    mocks.setOnboardingStepState.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",
        "Receipt incomplete.",
      ),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,
        state: "completed",
      }),
      createContext("choose-goal"),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",
      retryable: true,
    });
  });
});
