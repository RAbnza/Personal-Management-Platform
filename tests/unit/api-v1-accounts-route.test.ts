import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  listFinancialAccounts: vi.fn(),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock(
  "@/modules/finance/services/list-financial-accounts",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/finance/services/list-financial-accounts")
      >();

    return {
      ...actual,

      listFinancialAccounts: mocks.listFinancialAccounts,
    };
  },
);

import { FinancialAccountWorkspaceUnavailableError } from "@/modules/finance/services/list-financial-accounts";
import { GET } from "@/app/api/v1/accounts/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.listFinancialAccounts.mockReset();

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

describe("GET /api/v1/accounts", () => {
  it("lists active financial accounts by default using only ActorContext ownership", async () => {
    mocks.listFinancialAccounts.mockResolvedValue({
      financialRevision: "7",

      items: [
        {
          accountId: "44444444-4444-4444-8444-444444444444",

          name: "Cash Wallet",
          accountType: "cash",

          institutionName: null,

          currency: "PHP",

          openingCutoffDate: "2026-10-01",

          notes: null,

          archived: false,

          currentBalanceMinor: "125000",

          version: 1,
        },
      ],
    });

    const response = await GET(
      new Request("https://app.example.test/api/v1/accounts"),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("cache-control")).toBe("no-store");

    await expect(response.json()).resolves.toMatchObject({
      financialRevision: "7",

      items: [
        {
          name: "Cash Wallet",
          currentBalanceMinor: "125000",
        },
      ],
    });

    expect(mocks.listFinancialAccounts).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      includeArchived: false,
    });
  });

  it("passes the explicit archived-account filter to the service", async () => {
    mocks.listFinancialAccounts.mockResolvedValue({
      financialRevision: "0",
      items: [],
    });

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/accounts?includeArchived=true",
      ),
    );

    expect(response.status).toBe(200);

    expect(mocks.listFinancialAccounts).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      includeArchived: true,
    });
  });

  it("rejects unsupported or malformed query parameters", async () => {
    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/accounts?workspaceId=22222222-2222-4222-8222-222222222222",
      ),
    );

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(mocks.listFinancialAccounts).not.toHaveBeenCalled();
  });

  it("returns 404 if the workspace becomes unavailable after actor resolution", async () => {
    mocks.listFinancialAccounts.mockRejectedValue(
      new FinancialAccountWorkspaceUnavailableError(),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/accounts"),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      status: 404,
      code: "WORKSPACE_UNAVAILABLE",
      retryable: false,
    });
  });

  it("returns a sanitized 500 for unexpected account-list failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mocks.listFinancialAccounts.mockRejectedValue(
      new Error("private account database detail"),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/accounts"),
    );

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body).toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      retryable: false,
    });

    expect(JSON.stringify(body)).not.toContain(
      "private account database detail",
    );

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`requestId=${body.requestId}`),
    );
  });
});
