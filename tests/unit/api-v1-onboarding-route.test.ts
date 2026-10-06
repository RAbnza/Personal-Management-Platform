import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  listOnboardingProgress: vi.fn(),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock(
  "@/modules/core/services/list-onboarding-progress",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/core/services/list-onboarding-progress")
      >();

    return {
      ...actual,

      listOnboardingProgress: mocks.listOnboardingProgress,
    };
  },
);

import { OnboardingWorkspaceUnavailableError } from "@/modules/core/services/list-onboarding-progress";
import { GET } from "@/app/api/v1/onboarding/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.listOnboardingProgress.mockReset();

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

describe("GET /api/v1/onboarding", () => {
  it("returns the current guide using only ActorContext ownership", async () => {
    mocks.listOnboardingProgress.mockResolvedValue({
      guideVersion: 1,

      steps: [
        {
          stepKey: "choose-goal",

          requiredModule: null,

          applicable: true,

          state: "completed",

          completedAt: "2026-10-07T00:00:00.000Z",

          updatedAt: "2026-10-07T00:00:00.000Z",
        },
        {
          stepKey: "add-first-account",

          requiredModule: "money",

          applicable: true,

          state: "pending",

          completedAt: null,

          updatedAt: null,
        },
      ],

      applicableStepCount: 2,

      resolvedApplicableStepCount: 1,

      complete: false,
    });

    const response = await GET(
      new Request("https://app.example.test/api/v1/onboarding"),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(mocks.listOnboardingProgress).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    });

    await expect(response.json()).resolves.toMatchObject({
      guideVersion: 1,

      applicableStepCount: 2,

      resolvedApplicableStepCount: 1,

      complete: false,
    });
  });

  it("rejects client-supplied workspace or guide query parameters", async () => {
    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/onboarding?workspaceId=${WORKSPACE_ID}&guideVersion=1`,
      ),
    );

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(mocks.listOnboardingProgress).not.toHaveBeenCalled();
  });

  it("maps an unavailable private workspace to 404", async () => {
    mocks.listOnboardingProgress.mockRejectedValue(
      new OnboardingWorkspaceUnavailableError(),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/onboarding"),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      status: 404,

      code: "WORKSPACE_UNAVAILABLE",

      retryable: false,
    });
  });

  it("returns a sanitized 500 for unexpected onboarding failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mocks.listOnboardingProgress.mockRejectedValue(
      new Error("private onboarding database detail"),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/onboarding"),
    );

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body).toMatchObject({
      status: 500,

      code: "INTERNAL_ERROR",

      retryable: false,
    });

    expect(JSON.stringify(body)).not.toContain(
      "private onboarding database detail",
    );

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`requestId=${body.requestId}`),
    );

    consoleError.mockRestore();
  });
});
