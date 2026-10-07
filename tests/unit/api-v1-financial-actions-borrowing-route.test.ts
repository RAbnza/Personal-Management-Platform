import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),

  recordBorrowing: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/finance/services/record-borrowing", () => ({
  recordBorrowing: mocks.recordBorrowing,
}));

import { POST } from "@/app/api/v1/financial-actions/route";
import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "@/modules/finance/domain/financial-command";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";

const COMMAND_ID = "44444444-4444-4444-8444-444444444444";

const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";

const CATEGORY_ID = "66666666-6666-4666-8666-666666666666";

function createValidBody() {
  return {
    actionKind: "borrowing",

    clientCommandId: COMMAND_ID,

    name: "Personal loan",

    lenderName: "Example lender",

    productName: "Example loan",

    debtType: "personal_loan",

    borrowingDate: "2026-10-08",

    receivingAccountId: ACCOUNT_ID,

    principalMinor: "1000000",

    actualReceivedMinor: "980000",

    fees: [
      {
        label: "Processing fee",

        amountMinor: "20000",

        treatment: "withheld",

        categoryId: CATEGORY_ID,
      },
    ],

    installments: [
      {
        dueDate: "2026-11-08",

        contractualMinor: "1000000",

        knownPrincipalMinor: "1000000",

        knownInterestMinor: "0",

        knownFeeMinor: "0",

        breakdownComplete: true,

        notes: null,
      },
    ],

    scheduleReason: "Provider supplied the initial schedule.",

    description: "Personal loan disbursement",

    reference: "LOAN-001",

    notes: "Borrowing route test",
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

  mocks.recordBorrowing.mockReset();

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

describe("POST /api/v1/financial-actions — borrowing", () => {
  it("rejects a foreign origin before authentication or Finance work", async () => {
    const response = await POST(
      createRequest(
        createValidBody(),

        "https://foreign.example.test",
      ),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();

    expect(mocks.recordBorrowing).not.toHaveBeenCalled();
  });

  it("records borrowing using only ActorContext ownership", async () => {
    mocks.recordBorrowing.mockResolvedValue({
      debtId: "77777777-7777-4777-8777-777777777777",

      actionId: "88888888-8888-4888-8888-888888888888",

      actionRevisionId: "99999999-9999-4999-8999-999999999999",

      scheduleVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

      financialRevision: "9",
    });

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(201);

    expect(mocks.recordBorrowing).toHaveBeenCalledWith({
      clientCommandId: COMMAND_ID,

      name: "Personal loan",

      lenderName: "Example lender",

      productName: "Example loan",

      debtType: "personal_loan",

      borrowingDate: "2026-10-08",

      receivingAccountId: ACCOUNT_ID,

      principalMinor: "1000000",

      actualReceivedMinor: "980000",

      fees: [
        {
          label: "Processing fee",

          amountMinor: "20000",

          treatment: "withheld",

          categoryId: CATEGORY_ID,
        },
      ],

      installments: [
        {
          dueDate: "2026-11-08",

          contractualMinor: "1000000",

          knownPrincipalMinor: "1000000",

          knownInterestMinor: "0",

          knownFeeMinor: "0",

          breakdownComplete: true,

          notes: null,
        },
      ],

      scheduleReason: "Provider supplied the initial schedule.",

      description: "Personal loan disbursement",

      reference: "LOAN-001",

      notes: "Borrowing route test",

      userId: USER_ID,

      workspaceId: WORKSPACE_ID,

      requestId: expect.any(String),
    });

    await expect(response.json()).resolves.toEqual({
      actionKind: "borrowing",

      debtId: "77777777-7777-4777-8777-777777777777",

      actionId: "88888888-8888-4888-8888-888888888888",

      actionRevisionId: "99999999-9999-4999-8999-999999999999",

      scheduleVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

      financialRevision: "9",
    });
  });

  it("rejects ownership injection rather than trusting browser scope", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",

        workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",

        requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",

      retryable: false,
    });

    expect(mocks.recordBorrowing).not.toHaveBeenCalled();
  });

  it("rejects borrowing when actual proceeds do not match principal minus withheld fees", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        actualReceivedMinor: "990000",
      }),
    );

    expect(response.status).toBe(422);

    const body = await response.json();

    expect(body).toMatchObject({
      code: "VALIDATION_FAILED",

      retryable: false,
    });

    expect(body.fieldErrors.actualReceivedMinor).toBeDefined();

    expect(mocks.recordBorrowing).not.toHaveBeenCalled();
  });

  it("rejects financed purchases through the cash-borrowing route", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        debtType: "financed_purchase",
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",

      retryable: false,
    });

    expect(mocks.recordBorrowing).not.toHaveBeenCalled();
  });

  it("maps an unavailable receiving account to 404", async () => {
    mocks.recordBorrowing.mockRejectedValue(
      new FinancialAccountReferenceUnavailableError("receiving"),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "FINANCIAL_ACCOUNT_UNAVAILABLE",

      retryable: false,
    });
  });

  it("maps an unavailable borrowing-fee category to 404", async () => {
    mocks.recordBorrowing.mockRejectedValue(
      new FinancialCategoryReferenceUnavailableError("expense"),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "FINANCIAL_CATEGORY_UNAVAILABLE",

      retryable: false,
    });
  });

  it("maps borrowing business-rule failures to 422", async () => {
    mocks.recordBorrowing.mockRejectedValue(
      new RangeError(
        "Borrowing activity must occur after the receiving account opening cutoff.",
      ),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",

      retryable: false,
    });
  });

  it("maps borrowing command ID reuse to 409", async () => {
    mocks.recordBorrowing.mockRejectedValue(
      new FinancialCommandConflictError(),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",

      retryable: false,
    });
  });

  it("maps unresolved borrowing command state to retryable 503", async () => {
    mocks.recordBorrowing.mockRejectedValue(
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
