import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  openFinancialAccount: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/finance/services/open-financial-account", () => ({
  openFinancialAccount: mocks.openFinancialAccount,
}));

import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { POST } from "@/app/api/v1/accounts/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";

function createRequest(
  body: unknown,
  origin = "https://app.example.test",
): Request {
  return new Request("https://app.example.test/api/v1/accounts", {
    method: "POST",

    headers: {
      Origin: origin,
      "Content-Type": "application/json",
    },

    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.openFinancialAccount.mockReset();

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

describe("POST /api/v1/accounts", () => {
  it("rejects a foreign origin before authentication or Finance work", async () => {
    const response = await POST(
      createRequest({}, "https://foreign.example.test"),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();
    expect(mocks.openFinancialAccount).not.toHaveBeenCalled();
  });

  it("creates an account using ActorContext ownership and request attribution", async () => {
    mocks.openFinancialAccount.mockResolvedValue({
      accountId: "55555555-5555-4555-8555-555555555555",

      ledgerAccountId: "66666666-6666-4666-8666-666666666666",

      openingActionId: null,

      financialRevision: "1",
    });

    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        name: "Cash Wallet",

        accountType: "cash",

        institutionName: null,

        openingCutoffDate: "2026-10-07",

        openingBalanceMinor: "0",

        notes: null,
      }),
    );

    expect(response.status).toBe(201);

    expect(mocks.openFinancialAccount).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      name: "Cash Wallet",

      accountType: "cash",

      institutionName: null,

      openingCutoffDate: "2026-10-07",

      openingBalanceMinor: "0",

      notes: null,
    });

    const command = mocks.openFinancialAccount.mock.calls[0]?.[0];

    expect(command.requestId).toBeDefined();

    await expect(response.json()).resolves.toMatchObject({
      financialRevision: "1",
      openingActionId: null,
    });
  });

  it("rejects invalid account data and client-supplied ownership fields", async () => {
    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        requestId: SESSION_ID,

        name: "",

        accountType: "credit_card",

        openingCutoffDate: "not-a-date",

        openingBalanceMinor: "-1",
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(mocks.openFinancialAccount).not.toHaveBeenCalled();
  });

  it("rejects an opening balance above the documented component limit", async () => {
    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        name: "Savings",

        accountType: "savings",

        openingCutoffDate: "2026-10-07",

        openingBalanceMinor: "100000000001",
      }),
    );

    expect(response.status).toBe(422);

    const body = await response.json();

    expect(body).toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(body.fieldErrors.openingBalanceMinor).toBeDefined();

    expect(mocks.openFinancialAccount).not.toHaveBeenCalled();
  });

  it("maps reused financial command IDs to 409", async () => {
    mocks.openFinancialAccount.mockRejectedValue(
      new FinancialCommandConflictError(),
    );

    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        name: "Cash Wallet",

        accountType: "cash",

        openingCutoffDate: "2026-10-07",

        openingBalanceMinor: "0",
      }),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
  });

  it("maps lifecycle workspace disappearance to 404", async () => {
    mocks.openFinancialAccount.mockRejectedValue(
      new FinancialWriteWorkspaceUnavailableError(),
    );

    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        name: "Cash Wallet",

        accountType: "cash",

        openingCutoffDate: "2026-10-07",

        openingBalanceMinor: "0",
      }),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "WORKSPACE_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps unresolved financial command state to retryable 503", async () => {
    mocks.openFinancialAccount.mockRejectedValue(
      new FinancialCommandStateError("Receipt is incomplete."),
    );

    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        name: "Cash Wallet",

        accountType: "cash",

        openingCutoffDate: "2026-10-07",

        openingBalanceMinor: "0",
      }),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",
      retryable: true,
    });
  });

  it("maps Finance business-rule failures to 422", async () => {
    mocks.openFinancialAccount.mockRejectedValue(
      new RangeError("Account setup violates a financial business rule."),
    );

    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        name: "Cash Wallet",

        accountType: "cash",

        openingCutoffDate: "2026-10-07",

        openingBalanceMinor: "0",
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      retryable: false,
    });
  });
});
