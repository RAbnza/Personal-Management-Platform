import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  recordTransfer: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/finance/services/record-transfer", () => ({
  recordTransfer: mocks.recordTransfer,
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
const SOURCE_ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
const DESTINATION_ACCOUNT_ID = "66666666-6666-4666-8666-666666666666";
const FEE_ACCOUNT_ID = "77777777-7777-4777-8777-777777777777";
const FEE_CATEGORY_ID = "88888888-8888-4888-8888-888888888888";

function createValidBody() {
  return {
    actionKind: "transfer",

    clientCommandId: COMMAND_ID,

    sourceAccountId: SOURCE_ACCOUNT_ID,

    destinationAccountId: DESTINATION_ACCOUNT_ID,

    effectiveDate: "2026-10-07",

    destinationPrincipalMinor: "100000",

    fees: [
      {
        label: "Source processing fee",

        amountMinor: "500",

        treatment: "source_additional",

        categoryId: FEE_CATEGORY_ID,
      },
      {
        label: "Separate service fee",

        amountMinor: "700",

        effectiveDate: "2026-10-08",

        bearingAccountId: FEE_ACCOUNT_ID,

        treatment: "separate",

        categoryId: FEE_CATEGORY_ID,
      },
    ],

    description: "Transfer between accounts",
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
  mocks.recordTransfer.mockReset();

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

describe("POST /api/v1/financial-actions — transfer", () => {
  it("rejects a foreign origin before authentication or Finance work", async () => {
    const response = await POST(
      createRequest(createValidBody(), "https://foreign.example.test"),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();
    expect(mocks.recordTransfer).not.toHaveBeenCalled();
  });

  it("records a transfer with multiple fee treatments using ActorContext ownership", async () => {
    mocks.recordTransfer.mockResolvedValue({
      actionId: "99999999-9999-4999-8999-999999999999",

      actionRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

      financialRevision: "6",
    });

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(201);

    expect(mocks.recordTransfer).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      sourceAccountId: SOURCE_ACCOUNT_ID,

      destinationAccountId: DESTINATION_ACCOUNT_ID,

      effectiveDate: "2026-10-07",

      destinationPrincipalMinor: "100000",

      fees: [
        {
          label: "Source processing fee",

          amountMinor: "500",

          treatment: "source_additional",

          categoryId: FEE_CATEGORY_ID,
        },
        {
          label: "Separate service fee",

          amountMinor: "700",

          effectiveDate: "2026-10-08",

          bearingAccountId: FEE_ACCOUNT_ID,

          treatment: "separate",

          categoryId: FEE_CATEGORY_ID,
        },
      ],

      description: "Transfer between accounts",

      reference: undefined,

      notes: undefined,
    });

    await expect(response.json()).resolves.toEqual({
      actionKind: "transfer",

      actionId: "99999999-9999-4999-8999-999999999999",

      actionRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

      financialRevision: "6",
    });
  });

  it("allows a fee-free transfer", async () => {
    mocks.recordTransfer.mockResolvedValue({
      actionId: "99999999-9999-4999-8999-999999999999",

      actionRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",

      financialRevision: "6",
    });

    const body = {
      ...createValidBody(),

      fees: undefined,
    };

    const response = await POST(createRequest(body));

    expect(response.status).toBe(201);

    expect(mocks.recordTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        fees: [],
      }),
    );
  });

  it("rejects malformed fee components and ownership injection", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        requestId: SESSION_ID,

        fees: [
          {
            label: "",

            amountMinor: "0",

            treatment: "unknown",
          },
        ],
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",
      retryable: false,
    });

    expect(mocks.recordTransfer).not.toHaveBeenCalled();
  });

  it("rejects transfer or fee components above the financial component limit", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        destinationPrincipalMinor: "100000000001",

        fees: [
          {
            label: "Oversized fee",

            amountMinor: "100000000001",

            treatment: "withheld",
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

    expect(body.fieldErrors.destinationPrincipalMinor).toBeDefined();

    expect(body.fieldErrors["fees.0.amountMinor"]).toBeDefined();

    expect(mocks.recordTransfer).not.toHaveBeenCalled();
  });

  it("maps transfer-treatment business-rule failures to 422", async () => {
    mocks.recordTransfer.mockRejectedValue(
      new RangeError(
        "A separate transfer fee requires a bearing financial account.",
      ),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      retryable: false,
    });
  });

  it("maps unavailable transfer accounts to 404", async () => {
    mocks.recordTransfer.mockRejectedValue(
      new FinancialAccountReferenceUnavailableError("transfer"),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "FINANCIAL_ACCOUNT_UNAVAILABLE",
      retryable: false,
    });
  });

  it("maps an unavailable fee category to 404", async () => {
    mocks.recordTransfer.mockRejectedValue(
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
    mocks.recordTransfer.mockRejectedValue(new FinancialCommandConflictError());

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
  });

  it("maps workspace lifecycle disappearance to 404", async () => {
    mocks.recordTransfer.mockRejectedValue(
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
    mocks.recordTransfer.mockRejectedValue(
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
