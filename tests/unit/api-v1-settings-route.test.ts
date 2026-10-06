import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  getWorkspaceSettings: vi.fn(),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock(
  "@/modules/core/services/get-workspace-settings",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/core/services/get-workspace-settings")
      >();

    return {
      ...actual,

      getWorkspaceSettings: mocks.getWorkspaceSettings,
    };
  },
);

import { WorkspaceSettingsWorkspaceUnavailableError } from "@/modules/core/services/get-workspace-settings";
import { GET } from "@/app/api/v1/settings/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.getWorkspaceSettings.mockReset();

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

describe("GET /api/v1/settings", () => {
  it("returns settings using ActorContext ownership", async () => {
    mocks.getWorkspaceSettings.mockResolvedValue({
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
    });

    const response = await GET(
      new Request("https://app.example.test/api/v1/settings"),
    );

    expect(response.status).toBe(200);

    expect(mocks.getWorkspaceSettings).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    });
  });

  it("rejects client-supplied ownership query fields", async () => {
    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/settings?workspaceId=${WORKSPACE_ID}`,
      ),
    );

    expect(response.status).toBe(400);

    expect(mocks.getWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("returns 404 when settings scope becomes unavailable", async () => {
    mocks.getWorkspaceSettings.mockRejectedValue(
      new WorkspaceSettingsWorkspaceUnavailableError(),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/settings"),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      status: 404,
      code: "WORKSPACE_UNAVAILABLE",
      retryable: false,
    });
  });
});
