import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  listCategories: vi.fn(),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/core/services/list-categories", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/modules/core/services/list-categories")
    >();

  return {
    ...actual,

    listCategories: mocks.listCategories,
  };
});

import { CategoryWorkspaceUnavailableError } from "@/modules/core/services/list-categories";
import { GET } from "@/app/api/v1/categories/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.listCategories.mockReset();

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

describe("GET /api/v1/categories", () => {
  it("lists active categories with no kind filter by default", async () => {
    mocks.listCategories.mockResolvedValue({
      items: [
        {
          categoryId: "44444444-4444-4444-8444-444444444444",

          kind: "income",

          code: "salary",
          name: "Salary",

          archivedAt: null,
          archived: false,

          sortOrder: 10,
          version: 1,
        },
      ],
    });

    const response = await GET(
      new Request("https://app.example.test/api/v1/categories"),
    );

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          kind: "income",
          code: "salary",
          name: "Salary",
        },
      ],
    });

    expect(mocks.listCategories).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      includeArchived: false,
    });
  });

  it("passes allowlisted kind and archived filters", async () => {
    mocks.listCategories.mockResolvedValue({
      items: [],
    });

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/categories?kind=expense&includeArchived=true",
      ),
    );

    expect(response.status).toBe(200);

    expect(mocks.listCategories).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      kind: "expense",

      includeArchived: true,
    });
  });

  it("rejects invalid kinds and client-supplied ownership fields", async () => {
    const invalidKind = await GET(
      new Request("https://app.example.test/api/v1/categories?kind=asset"),
    );

    expect(invalidKind.status).toBe(400);

    const suppliedWorkspace = await GET(
      new Request(
        "https://app.example.test/api/v1/categories?workspaceId=22222222-2222-4222-8222-222222222222",
      ),
    );

    expect(suppliedWorkspace.status).toBe(400);

    expect(mocks.listCategories).not.toHaveBeenCalled();
  });

  it("returns 404 if category scope disappears after actor resolution", async () => {
    mocks.listCategories.mockRejectedValue(
      new CategoryWorkspaceUnavailableError(),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/categories"),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      status: 404,
      code: "WORKSPACE_UNAVAILABLE",
      retryable: false,
    });
  });

  it("returns a sanitized 500 for unexpected category-list failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mocks.listCategories.mockRejectedValue(
      new Error("private category database detail"),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/categories"),
    );

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body).toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      retryable: false,
    });

    expect(JSON.stringify(body)).not.toContain(
      "private category database detail",
    );

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`requestId=${body.requestId}`),
    );
  });
});
