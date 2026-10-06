import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  transitionJobApplicationStage: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/career/services/transition-job-application-stage", () => ({
  transitionJobApplicationStage: mocks.transitionJobApplicationStage,
}));

import {
  JobApplicationArchivedError,
  JobApplicationUnavailableError,
  JobApplicationVersionConflictError,
} from "@/modules/career/domain/application";
import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import { PATCH } from "@/app/api/v1/applications/[applicationId]/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";
const APPLICATION_ID = "55555555-5555-4555-8555-555555555555";
const HISTORY_ID = "66666666-6666-4666-8666-666666666666";

function createValidBody() {
  return {
    clientCommandId: COMMAND_ID,

    expectedVersion: 1,

    stage: "applied",

    effectiveDate: "2026-10-07",

    appliedDate: "2026-10-07",
  };
}

function createRequest(
  body: unknown,
  origin = "https://app.example.test",
): Request {
  return new Request(
    `https://app.example.test/api/v1/applications/${APPLICATION_ID}`,
    {
      method: "PATCH",

      headers: {
        Origin: origin,
        "Content-Type": "application/json",
      },

      body: JSON.stringify(body),
    },
  );
}

function createContext(applicationId = APPLICATION_ID) {
  return {
    params: Promise.resolve({
      applicationId,
    }),
  };
}

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();

  mocks.transitionJobApplicationStage.mockReset();

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

describe("PATCH /api/v1/applications/:applicationId", () => {
  it("rejects a foreign origin before authentication or Career work", async () => {
    const response = await PATCH(
      createRequest(
        createValidBody(),

        "https://foreign.example.test",
      ),
      createContext(),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();

    expect(mocks.transitionJobApplicationStage).not.toHaveBeenCalled();
  });

  it("transitions an application using ActorContext ownership and optimistic versioning", async () => {
    mocks.transitionJobApplicationStage.mockResolvedValue({
      applicationId: APPLICATION_ID,

      historyId: HISTORY_ID,

      historySequenceNo: 2,

      historyEffectiveOrder: 0,

      version: 2,

      currentHistoryId: HISTORY_ID,

      currentStage: "applied",

      currentOutcome: null,

      appliedDate: "2026-10-07",
    });

    const response = await PATCH(
      createRequest(createValidBody()),

      createContext(),
    );

    expect(response.status).toBe(200);

    expect(mocks.transitionJobApplicationStage).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      applicationId: APPLICATION_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      expectedVersion: 1,

      stage: "applied",

      outcome: undefined,

      effectiveDate: "2026-10-07",

      effectiveOrder: undefined,

      appliedDate: "2026-10-07",

      reason: undefined,
    });

    await expect(response.json()).resolves.toMatchObject({
      applicationId: APPLICATION_ID,

      version: 2,

      currentStage: "applied",

      appliedDate: "2026-10-07",
    });
  });

  it("rejects an invalid application ID and ownership injection", async () => {
    const invalidIdResponse = await PATCH(
      createRequest(createValidBody()),

      createContext("not-a-uuid"),
    );

    expect(invalidIdResponse.status).toBe(422);

    const ownershipResponse = await PATCH(
      createRequest({
        ...createValidBody(),

        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        requestId: SESSION_ID,
      }),

      createContext(),
    );

    expect(ownershipResponse.status).toBe(422);

    expect(mocks.transitionJobApplicationStage).not.toHaveBeenCalled();
  });

  it("maps stale optimistic versions to 409 with the current version", async () => {
    mocks.transitionJobApplicationStage.mockRejectedValue(
      new JobApplicationVersionConflictError(1, 2),
    );

    const response = await PATCH(
      createRequest(createValidBody()),

      createContext(),
    );

    expect(response.status).toBe(409);

    const body = await response.json();

    expect(body).toMatchObject({
      code: "STALE_VERSION",

      retryable: false,
    });

    expect(body.fieldErrors.expectedVersion).toEqual([
      expect.stringContaining("current application version is 2"),
    ]);
  });

  it("returns the same 404 for a missing or nonowned application", async () => {
    mocks.transitionJobApplicationStage.mockRejectedValue(
      new JobApplicationUnavailableError(),
    );

    const response = await PATCH(
      createRequest(createValidBody()),

      createContext(),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "APPLICATION_UNAVAILABLE",

      retryable: false,
    });
  });

  it("maps workspace lifecycle disappearance to 404", async () => {
    mocks.transitionJobApplicationStage.mockRejectedValue(
      new PrivateDomainWriteUnavailableError(),
    );

    const response = await PATCH(
      createRequest(createValidBody()),

      createContext(),
    );

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "WORKSPACE_UNAVAILABLE",

      retryable: false,
    });
  });

  it("rejects new history on an archived application", async () => {
    mocks.transitionJobApplicationStage.mockRejectedValue(
      new JobApplicationArchivedError(),
    );

    const response = await PATCH(
      createRequest(createValidBody()),

      createContext(),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "APPLICATION_ARCHIVED",

      retryable: false,
    });
  });

  it("maps stage business-rule failures to 422", async () => {
    mocks.transitionJobApplicationStage.mockRejectedValue(
      new RangeError(
        "The first submitted application stage requires an explicit applied date.",
      ),
    );

    const response = await PATCH(
      createRequest(createValidBody()),

      createContext(),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",

      retryable: false,
    });
  });

  it("maps command-ID payload reuse to 409", async () => {
    mocks.transitionJobApplicationStage.mockRejectedValue(
      new CommandReceiptConflictError(),
    );

    const response = await PATCH(
      createRequest(createValidBody()),

      createContext(),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",

      retryable: false,
    });
  });

  it("maps unresolved command state to retryable 503", async () => {
    mocks.transitionJobApplicationStage.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",

        "Receipt incomplete.",
      ),
    );

    const response = await PATCH(
      createRequest(createValidBody()),

      createContext(),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",

      retryable: true,
    });
  });
});
