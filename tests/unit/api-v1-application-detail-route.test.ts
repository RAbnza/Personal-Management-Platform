import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  getJobApplicationDetail: vi.fn(),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/career/services/get-job-application-detail", () => ({
  getJobApplicationDetail: mocks.getJobApplicationDetail,
}));

import { JobApplicationUnavailableError } from "@/modules/career/domain/application";
import { GET } from "@/app/api/v1/applications/[applicationId]/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const APPLICATION_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.getJobApplicationDetail.mockReset();

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

describe("GET /api/v1/applications/:applicationId", () => {
  it("uses ActorContext ownership and the validated application ID", async () => {
    mocks.getJobApplicationDetail.mockResolvedValue({
      application: {
        applicationId: APPLICATION_ID,
      },

      stageHistory: [],
      events: [],
    });

    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/applications/${APPLICATION_ID}`,
      ),
      {
        params: Promise.resolve({
          applicationId: APPLICATION_ID,
        }),
      },
    );

    expect(response.status).toBe(200);

    expect(mocks.getJobApplicationDetail).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      applicationId: APPLICATION_ID,
    });
  });

  it("rejects an invalid application UUID", async () => {
    const response = await GET(
      new Request("https://app.example.test/api/v1/applications/not-a-uuid"),
      {
        params: Promise.resolve({
          applicationId: "not-a-uuid",
        }),
      },
    );

    expect(response.status).toBe(400);

    expect(mocks.getJobApplicationDetail).not.toHaveBeenCalled();
  });

  it("rejects ownership fields supplied through the query string", async () => {
    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/applications/${APPLICATION_ID}` +
          `?workspaceId=${WORKSPACE_ID}`,
      ),
      {
        params: Promise.resolve({
          applicationId: APPLICATION_ID,
        }),
      },
    );

    expect(response.status).toBe(400);

    expect(mocks.getJobApplicationDetail).not.toHaveBeenCalled();
  });

  it("returns the same 404 for a missing or nonowned application", async () => {
    mocks.getJobApplicationDetail.mockRejectedValue(
      new JobApplicationUnavailableError(),
    );

    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/applications/${APPLICATION_ID}`,
      ),
      {
        params: Promise.resolve({
          applicationId: APPLICATION_ID,
        }),
      },
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      status: 404,
      code: "APPLICATION_UNAVAILABLE",
      retryable: false,
    });
  });
});
