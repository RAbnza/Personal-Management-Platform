import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  listJobApplications: vi.fn(),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock(
  "@/modules/career/services/list-job-applications",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/career/services/list-job-applications")
      >();

    return {
      ...actual,

      listJobApplications: mocks.listJobApplications,
    };
  },
);

import {
  InvalidJobApplicationListCursorError,
  JobApplicationListWorkspaceUnavailableError,
} from "@/modules/career/services/list-job-applications";
import { GET } from "@/app/api/v1/applications/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.listJobApplications.mockReset();

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

describe("GET /api/v1/applications", () => {
  it("uses service defaults when no list filters are supplied", async () => {
    mocks.listJobApplications.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const response = await GET(
      new Request("https://app.example.test/api/v1/applications"),
    );

    expect(response.status).toBe(200);

    expect(mocks.listJobApplications).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
    });
  });

  it("passes allowlisted filters and pagination values", async () => {
    mocks.listJobApplications.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/applications" +
          "?archive=all" +
          "&stage=screening" +
          "&search=engineer" +
          "&pageSize=50" +
          "&cursor=test-cursor",
      ),
    );

    expect(response.status).toBe(200);

    expect(mocks.listJobApplications).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      archive: "all",
      stage: "screening",
      search: "engineer",

      pageSize: 50,
      cursor: "test-cursor",
    });
  });

  it("rejects malformed filters and ownership injection", async () => {
    const invalidStage = await GET(
      new Request("https://app.example.test/api/v1/applications?stage=unknown"),
    );

    expect(invalidStage.status).toBe(400);

    const ownershipField = await GET(
      new Request(
        `https://app.example.test/api/v1/applications?workspaceId=${WORKSPACE_ID}`,
      ),
    );

    expect(ownershipField.status).toBe(400);

    expect(mocks.listJobApplications).not.toHaveBeenCalled();
  });

  it("maps a filter-mismatched cursor to 400", async () => {
    mocks.listJobApplications.mockRejectedValue(
      new InvalidJobApplicationListCursorError(),
    );

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/applications?cursor=invalid",
      ),
    );

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
      retryable: false,
    });
  });

  it("maps an unavailable workspace to 404", async () => {
    mocks.listJobApplications.mockRejectedValue(
      new JobApplicationListWorkspaceUnavailableError(),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/applications"),
    );

    expect(response.status).toBe(404);
  });
});
