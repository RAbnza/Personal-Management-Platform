import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  recordIncome: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/finance/services/record-income", () => ({
  recordIncome: mocks.recordIncome,
}));

import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "@/modules/finance/domain/financial-command";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { POST } from "@/app/api/v1/financial-actions/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";
const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
const CATEGORY_ID = "66666666-6666-4666-8666-666666666666";

function createValidBody() {
  return {
    actionKind: "income",

    clientCommandId: COMMAND_ID,

    receivingAccountId: ACCOUNT_ID,

    effectiveDate: "2026-10-07",

    amountMinor: "500000",

    incomeClass: "earned",

    categoryId: CATEGORY_ID,

    sourceLabel: "Employer",

    description: "Salary",
  };
}

function createRequest(
  body: unknown,
  origin = "https://app.example.test",
): Request {
  return new Request("https://app.example.test/api/v1/financial-actions", {
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
  mocks.recordIncome.mockReset();

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

describe("POST /api/v1/financial-actions — income", () => {
  it("rejects a foreign origin before authentication or Finance work", async () => {
    const response = await POST(
      createRequest(createValidBody(), "https://foreign.example.test"),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();
    expect(mocks.recordIncome).not.toHaveBeenCalled();
  });

  it("records income using ActorContext ownership and request attribution", async () => {
    mocks.recordIncome.mockResolvedValue({
      actionId: "77777777-7777-4777-8777-777777777777",
      actionRevisionId: "88888888-8888-4888-8888-888888888888",
      financialRevision: "4",
    });

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(201);

    expect(mocks.recordIncome).toHaveBeenCalledWith({
      acknowledgeNegativeBalance: false,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      receivingAccountId: ACCOUNT_ID,

      effectiveDate: "2026-10-07",

      amountMinor: "500000",

      incomeClass: "earned",

      categoryId: CATEGORY_ID,

      senderName: undefined,

      sourceLabel: "Employer",

      description: "Salary",

      reference: undefined,

      notes: undefined,
    });

    const command = mocks.recordIncome.mock.calls[0]?.[0];

    expect(command.requestId).toBeDefined();

    await expect(response.json()).resolves.toEqual({
      actionKind: "income",

      actionId: "77777777-7777-4777-8777-777777777777",
      actionRevisionId: "88888888-8888-4888-8888-888888888888",
      financialRevision: "4",
    });
  });

  it("rejects unsupported action kinds and client-supplied ownership fields", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        actionKind: "expense",

        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        requestId: SESSION_ID,
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(mocks.recordIncome).not.toHaveBeenCalled();
  });

  it("rejects amounts above the supported financial component limit", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        amountMinor: "100000000001",
      }),
    );

    expect(response.status).toBe(422);

    const body = await response.json();

    expect(body).toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(body.fieldErrors.amountMinor).toBeDefined();

    expect(mocks.recordIncome).not.toHaveBeenCalled();
  });

  it("maps financial command ID reuse to 409", async () => {
    mocks.recordIncome.mockRejectedValue(new FinancialCommandConflictError());

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
  });

  it("maps an unavailable receiving account to 404", async () => {
    mocks.recordIncome.mockRejectedValue(
      new FinancialAccountReferenceUnavailableError("receiving"),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "FINANCIAL_ACCOUNT_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps an unavailable income category to 404", async () => {
    mocks.recordIncome.mockRejectedValue(
      new FinancialCategoryReferenceUnavailableError("income"),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "FINANCIAL_CATEGORY_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps workspace lifecycle disappearance to 404", async () => {
    mocks.recordIncome.mockRejectedValue(
      new FinancialWriteWorkspaceUnavailableError(),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "WORKSPACE_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps income business-rule failures to 422", async () => {
    mocks.recordIncome.mockRejectedValue(
      new RangeError(
        "Income effective date must be after the receiving account opening cutoff.",
      ),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      retryable: false,
    });
  });

  it("maps unresolved financial command state to retryable 503", async () => {
    mocks.recordIncome.mockRejectedValue(
      new FinancialCommandStateError("Receipt is incomplete."),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",
      retryable: true,
    });
  });

  it("sanitizes unexpected Finance failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mocks.recordIncome.mockRejectedValue(
      new Error("private shared-ledger integrity detail"),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body).toMatchObject({
      code: "INTERNAL_ERROR",
      retryable: false,
    });

    expect(JSON.stringify(body)).not.toContain(
      "private shared-ledger integrity detail",
    );

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`requestId=${body.requestId}`),
    );

    consoleError.mockRestore();
  });
});
