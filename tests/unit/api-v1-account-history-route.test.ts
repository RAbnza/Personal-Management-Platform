import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  getAccountHistory: vi.fn(),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock(
  "@/modules/finance/services/get-account-history",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/finance/services/get-account-history")
      >();

    return {
      ...actual,

      getAccountHistory: mocks.getAccountHistory,
    };
  },
);

import {
  FinancialAccountNotFoundError,
  InvalidAccountHistoryCursorError,
} from "@/modules/finance/services/get-account-history";
import { GET } from "@/app/api/v1/accounts/[accountId]/history/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

function createContext(accountId: string) {
  return {
    params: Promise.resolve({
      accountId,
    }),
  };
}

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.getAccountHistory.mockReset();

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

describe("GET /api/v1/accounts/:accountId/history", () => {
  it("returns account history using ActorContext ownership and pagination", async () => {
    mocks.getAccountHistory.mockResolvedValue({
      account: {
        accountId: ACCOUNT_ID,

        name: "BDO Savings",
        accountType: "savings",

        institutionName: "BDO",

        currency: "PHP",

        openingCutoffDate: "2026-07-01",

        archived: false,

        currentBalanceMinor: "1170000",
      },

      financialRevision: "3",

      entries: [
        {
          journalId: "55555555-5555-4555-8555-555555555555",

          actionId: "66666666-6666-4666-8666-666666666666",

          actionRevisionId: "77777777-7777-4777-8777-777777777777",

          effectiveDate: "2026-07-03",

          recordedAt: "2026-07-03T10:00:00.000Z",

          journalRole: "economic",

          changeKind: "create",

          actionKind: "expense",

          description: "Groceries",

          reference: null,

          signedAmountMinor: "-30000",

          balanceAfterMinor: "1170000",
        },
      ],

      nextCursor: "next-page-cursor",
    });

    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/accounts/${ACCOUNT_ID}/history` +
          "?pageSize=25&cursor=current-page-cursor",
      ),
      createContext(ACCOUNT_ID),
    );

    expect(response.status).toBe(200);

    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(mocks.getAccountHistory).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      accountId: ACCOUNT_ID,

      pageSize: 25,

      cursor: "current-page-cursor",
    });

    await expect(response.json()).resolves.toMatchObject({
      account: {
        accountId: ACCOUNT_ID,
        currentBalanceMinor: "1170000",
      },

      financialRevision: "3",

      nextCursor: "next-page-cursor",
    });
  });

  it("allows the service defaults when pagination parameters are omitted", async () => {
    mocks.getAccountHistory.mockResolvedValue({
      account: {
        accountId: ACCOUNT_ID,

        name: "Cash",

        accountType: "cash",

        institutionName: null,

        currency: "PHP",

        openingCutoffDate: "2026-10-01",

        archived: false,

        currentBalanceMinor: "0",
      },

      financialRevision: "0",

      entries: [],

      nextCursor: null,
    });

    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/accounts/${ACCOUNT_ID}/history`,
      ),
      createContext(ACCOUNT_ID),
    );

    expect(response.status).toBe(200);

    expect(mocks.getAccountHistory).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      accountId: ACCOUNT_ID,

      pageSize: undefined,

      cursor: undefined,
    });
  });

  it("rejects an invalid account UUID", async () => {
    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/accounts/not-a-uuid/history",
      ),
      createContext("not-a-uuid"),
    );

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(mocks.getAccountHistory).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination and client-supplied ownership parameters", async () => {
    const invalidPageSize = await GET(
      new Request(
        `https://app.example.test/api/v1/accounts/${ACCOUNT_ID}/history?pageSize=101`,
      ),
      createContext(ACCOUNT_ID),
    );

    expect(invalidPageSize.status).toBe(400);

    const ownershipInjection = await GET(
      new Request(
        `https://app.example.test/api/v1/accounts/${ACCOUNT_ID}/history` +
          `?workspaceId=${WORKSPACE_ID}`,
      ),
      createContext(ACCOUNT_ID),
    );

    expect(ownershipInjection.status).toBe(400);

    expect(mocks.getAccountHistory).not.toHaveBeenCalled();
  });

  it("maps malformed opaque cursors to 400", async () => {
    mocks.getAccountHistory.mockRejectedValue(
      new InvalidAccountHistoryCursorError(),
    );

    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/accounts/${ACCOUNT_ID}/history` +
          "?cursor=not-a-valid-service-cursor",
      ),
      createContext(ACCOUNT_ID),
    );

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      status: 400,

      code: "INVALID_CURSOR",

      retryable: false,
    });
  });

  it("returns the same 404 for a missing or nonowned financial account", async () => {
    mocks.getAccountHistory.mockRejectedValue(
      new FinancialAccountNotFoundError(),
    );

    const response = await GET(
      new Request(
        `https://app.example.test/api/v1/accounts/${ACCOUNT_ID}/history`,
      ),
      createContext(ACCOUNT_ID),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      status: 404,

      code: "FINANCIAL_ACCOUNT_UNAVAILABLE",

      retryable: false,
    });
  });
});
