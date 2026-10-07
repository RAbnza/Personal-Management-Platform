import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOnboardingProgress: vi.fn(),
}));

vi.mock("@/modules/core/services/list-onboarding-progress", () => ({
  listOnboardingProgress: mocks.listOnboardingProgress,
}));

import { resolveOnboardingProgress } from "@/app/_lib/onboarding-progress";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.listOnboardingProgress.mockReset();
});

describe("onboarding progress rendering boundary", () => {
  it("loads onboarding progress only for the trusted server scope", async () => {
    const progress = {
      guideVersion: 1 as const,

      steps: [],

      applicableStepCount: 0,
      resolvedApplicableStepCount: 0,

      complete: false,
    };

    mocks.listOnboardingProgress.mockResolvedValue(progress);

    await expect(
      resolveOnboardingProgress({
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
      }),
    ).resolves.toEqual(progress);

    expect(mocks.listOnboardingProgress).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    });
  });

  it("fails open for guidance without exposing private failure details", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mocks.listOnboardingProgress.mockRejectedValue(
      new Error("private onboarding database detail"),
    );

    await expect(
      resolveOnboardingProgress({
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
      }),
    ).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalledWith(
      "Onboarding progress could not be loaded.",
    );

    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "private onboarding database detail",
    );

    consoleError.mockRestore();
  });
});
