import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  recordExpense: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/finance/services/record-expense", () => ({
  recordExpense: mocks.recordExpense,
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
const FOOD_CATEGORY_ID = "66666666-6666-4666-8666-666666666666";
const OTHER_CATEGORY_ID = "77777777-7777-4777-8777-777777777777";

function createValidBody() {
  return {
    actionKind: "expense",

    clientCommandId: COMMAND_ID,

    fundingAccountId: ACCOUNT_ID,

    effectiveDate: "2026-10-07",

    purchaseMinor: "100000",

    splits: [
      {
        amountMinor: "70000",

        categoryId: FOOD_CATEGORY_ID,

        memo: "Groceries",
      },
      {
        amountMinor: "30000",

        categoryId: OTHER_CATEGORY_ID,

        memo: "Household supplies",
      },
    ],

    merchantName: "Example Store",

    description: "Household purchase",
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
  mocks.recordExpense.mockReset();

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

describe("POST /api/v1/financial-actions — expense", () => {
  it("rejects a foreign origin before authentication or Finance work", async () => {
    const response = await POST(
      createRequest(createValidBody(), "https://foreign.example.test"),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();
    expect(mocks.recordExpense).not.toHaveBeenCalled();
  });

  it("records a split expense using ActorContext ownership", async () => {
    mocks.recordExpense.mockResolvedValue({
      actionId: "88888888-8888-4888-8888-888888888888",

      actionRevisionId: "99999999-9999-4999-8999-999999999999",

      financialRevision: "5",
    });

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(201);

    expect(mocks.recordExpense).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      fundingAccountId: ACCOUNT_ID,

      effectiveDate: "2026-10-07",

      purchaseMinor: "100000",

      splits: [
        {
          amountMinor: "70000",

          categoryId: FOOD_CATEGORY_ID,

          memo: "Groceries",
        },
        {
          amountMinor: "30000",

          categoryId: OTHER_CATEGORY_ID,

          memo: "Household supplies",
        },
      ],

      merchantName: "Example Store",

      description: "Household purchase",

      reference: undefined,

      notes: undefined,
    });

    await expect(response.json()).resolves.toEqual({
      actionKind: "expense",

      actionId: "88888888-8888-4888-8888-888888888888",

      actionRevisionId: "99999999-9999-4999-8999-999999999999",

      financialRevision: "5",
    });
  });

  it("rejects malformed splits and client-supplied ownership fields", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        requestId: SESSION_ID,

        splits: [],
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(mocks.recordExpense).not.toHaveBeenCalled();
  });

  it("rejects purchase or split components above the supported component limit", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        purchaseMinor: "100000000001",

        splits: [
          {
            amountMinor: "100000000001",
          },
        ],
      }),
    );

    expect(response.status).toBe(422);

    const body = await response.json();

    expect(body).toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(body.fieldErrors.purchaseMinor).toBeDefined();
    expect(body.fieldErrors["splits.0.amountMinor"]).toBeDefined();

    expect(mocks.recordExpense).not.toHaveBeenCalled();
  });

  it("maps split-total business-rule failures to 422", async () => {
    mocks.recordExpense.mockRejectedValue(
      new RangeError(
        "Expense category portions must sum exactly to the purchase amount.",
      ),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      retryable: false,
    });
  });

  it("maps an unavailable funding account to 404", async () => {
    mocks.recordExpense.mockRejectedValue(
      new FinancialAccountReferenceUnavailableError("funding"),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "FINANCIAL_ACCOUNT_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps an unavailable expense category to 404", async () => {
    mocks.recordExpense.mockRejectedValue(
      new FinancialCategoryReferenceUnavailableError("expense"),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "FINANCIAL_CATEGORY_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps financial command ID reuse to 409", async () => {
    mocks.recordExpense.mockRejectedValue(new FinancialCommandConflictError());

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
  });

  it("maps workspace lifecycle disappearance to 404", async () => {
    mocks.recordExpense.mockRejectedValue(
      new FinancialWriteWorkspaceUnavailableError(),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "WORKSPACE_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps unresolved financial command state to retryable 503", async () => {
    mocks.recordExpense.mockRejectedValue(
      new FinancialCommandStateError("Receipt is incomplete."),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",
      retryable: true,
    });
  });
});
