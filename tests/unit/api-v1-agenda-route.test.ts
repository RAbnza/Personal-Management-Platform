import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  listAgendaItems: vi.fn(),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/time/services/list-agenda-items", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/modules/time/services/list-agenda-items")
    >();

  return {
    ...actual,

    listAgendaItems: mocks.listAgendaItems,
  };
});

import {
  AgendaWorkspaceUnavailableError,
  InvalidAgendaCursorError,
} from "@/modules/time/services/list-agenda-items";
import { GET } from "@/app/api/v1/agenda/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.listAgendaItems.mockReset();

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

describe("GET /api/v1/agenda", () => {
  it("passes the required date range while preserving service defaults", async () => {
    mocks.listAgendaItems.mockResolvedValue({
      workspaceTimezone: "Asia/Manila",
      today: "2026-10-07",
      items: [],
      nextCursor: null,
    });

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/agenda" +
          "?startDate=2026-10-01" +
          "&endDate=2026-10-31",
      ),
    );

    expect(response.status).toBe(200);

    expect(mocks.listAgendaItems).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
  });

  it("passes allowlisted modules and pagination values", async () => {
    mocks.listAgendaItems.mockResolvedValue({
      workspaceTimezone: "Asia/Manila",
      today: "2026-10-07",
      items: [],
      nextCursor: null,
    });

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/agenda" +
          "?startDate=2026-10-01" +
          "&endDate=2026-10-31" +
          "&modules=career,time" +
          "&pageSize=50" +
          "&cursor=test-cursor",
      ),
    );

    expect(response.status).toBe(200);

    expect(mocks.listAgendaItems).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      startDate: "2026-10-01",
      endDate: "2026-10-31",

      modules: ["career", "time"],

      pageSize: 50,
      cursor: "test-cursor",
    });
  });

  it("rejects malformed ranges, module filters and ownership fields", async () => {
    const reversedRange = await GET(
      new Request(
        "https://app.example.test/api/v1/agenda" +
          "?startDate=2026-10-31" +
          "&endDate=2026-10-01",
      ),
    );

    expect(reversedRange.status).toBe(400);

    const invalidModule = await GET(
      new Request(
        "https://app.example.test/api/v1/agenda" +
          "?startDate=2026-10-01" +
          "&endDate=2026-10-31" +
          "&modules=money",
      ),
    );

    expect(invalidModule.status).toBe(400);

    const ownershipField = await GET(
      new Request(
        "https://app.example.test/api/v1/agenda" +
          "?startDate=2026-10-01" +
          "&endDate=2026-10-31" +
          `&workspaceId=${WORKSPACE_ID}`,
      ),
    );

    expect(ownershipField.status).toBe(400);

    expect(mocks.listAgendaItems).not.toHaveBeenCalled();
  });

  it("maps an invalid cursor to 400", async () => {
    mocks.listAgendaItems.mockRejectedValue(new InvalidAgendaCursorError());

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/agenda" +
          "?startDate=2026-10-01" +
          "&endDate=2026-10-31" +
          "&cursor=invalid",
      ),
    );

    expect(response.status).toBe(400);
  });

  it("maps an unavailable workspace to 404", async () => {
    mocks.listAgendaItems.mockRejectedValue(
      new AgendaWorkspaceUnavailableError(),
    );

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/agenda" +
          "?startDate=2026-10-01" +
          "&endDate=2026-10-31",
      ),
    );

    expect(response.status).toBe(404);
  });
});
