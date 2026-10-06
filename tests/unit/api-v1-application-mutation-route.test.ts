import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),
  createJobApplication: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/career/services/create-job-application", () => ({
  createJobApplication: mocks.createJobApplication,
}));

import { PossibleDuplicateJobApplicationError } from "@/modules/career/domain/application";
import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import { POST } from "@/app/api/v1/applications/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";
const APPLICATION_ID = "55555555-5555-4555-8555-555555555555";
const HISTORY_ID = "66666666-6666-4666-8666-666666666666";

function createValidBody() {
  return {
    clientCommandId: COMMAND_ID,

    companyName: "Example Technologies",

    roleTitle: "Full Stack Developer",

    postingUrl: "https://example.test/jobs/full-stack",

    sourceName: "Company Careers",

    location: "Metro Manila",

    workArrangement: "hybrid",

    salaryMinMinor: "3500000",

    salaryMaxMinor: "4500000",

    salaryCurrency: "PHP",

    salaryPeriod: "month",

    technologyTags: ["TypeScript", "React", "PostgreSQL"],

    contactName: "Hiring Team",

    contactEmail: "hiring@example.test",

    initialStage: "saved",

    initialStageEffectiveDate: "2026-10-07",

    notes: "Interesting role to review.",
  };
}

function createRequest(
  body: unknown,
  origin = "https://app.example.test",
): Request {
  return new Request("https://app.example.test/api/v1/applications", {
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
  mocks.createJobApplication.mockReset();

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

describe("POST /api/v1/applications", () => {
  it("rejects a foreign origin before authentication or Career work", async () => {
    const response = await POST(
      createRequest(createValidBody(), "https://foreign.example.test"),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();

    expect(mocks.createJobApplication).not.toHaveBeenCalled();
  });

  it("creates an application using ActorContext ownership and request attribution", async () => {
    mocks.createJobApplication.mockResolvedValue({
      applicationId: APPLICATION_ID,

      initialHistoryId: HISTORY_ID,

      version: 1,
    });

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(201);

    expect(mocks.createJobApplication).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      companyName: "Example Technologies",

      roleTitle: "Full Stack Developer",

      postingUrl: "https://example.test/jobs/full-stack",

      sourceName: "Company Careers",

      roleDescriptionSnapshot: undefined,

      location: "Metro Manila",

      workArrangement: "hybrid",

      salaryMinMinor: "3500000",

      salaryMaxMinor: "4500000",

      salaryCurrency: "PHP",

      salaryPeriod: "month",

      technologyTags: ["TypeScript", "React", "PostgreSQL"],

      contactName: "Hiring Team",

      contactEmail: "hiring@example.test",

      contactPhone: undefined,

      resumeVersionId: undefined,

      appliedDate: undefined,

      initialStage: "saved",

      initialOutcome: undefined,

      initialStageEffectiveDate: "2026-10-07",

      initialStageReason: undefined,

      notes: "Interesting role to review.",

      allowPossibleDuplicate: false,
    });

    await expect(response.json()).resolves.toEqual({
      applicationId: APPLICATION_ID,

      initialHistoryId: HISTORY_ID,

      version: 1,
    });
  });

  it("rejects client-supplied ownership fields and malformed application data", async () => {
    const response = await POST(
      createRequest({
        ...createValidBody(),

        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        requestId: SESSION_ID,

        companyName: "",
      }),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",

      retryable: false,
    });

    expect(mocks.createJobApplication).not.toHaveBeenCalled();
  });

  it("returns a 409 warning for a possible duplicate application", async () => {
    mocks.createJobApplication.mockRejectedValue(
      new PossibleDuplicateJobApplicationError([
        {
          applicationId: APPLICATION_ID,

          archived: false,
        },
      ]),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(409);

    const body = await response.json();

    expect(body).toMatchObject({
      code: "POSSIBLE_DUPLICATE_APPLICATION",

      retryable: false,
    });

    expect(body.fieldErrors.companyName).toBeDefined();

    expect(body.fieldErrors.roleTitle).toBeDefined();

    expect(JSON.stringify(body)).not.toContain(APPLICATION_ID);
  });

  it("allows an explicitly confirmed separate duplicate attempt", async () => {
    mocks.createJobApplication.mockResolvedValue({
      applicationId: APPLICATION_ID,

      initialHistoryId: HISTORY_ID,

      version: 1,
    });

    const response = await POST(
      createRequest({
        ...createValidBody(),

        allowPossibleDuplicate: true,
      }),
    );

    expect(response.status).toBe(201);

    expect(mocks.createJobApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        allowPossibleDuplicate: true,
      }),
    );
  });

  it("maps command-ID payload reuse to 409", async () => {
    mocks.createJobApplication.mockRejectedValue(
      new CommandReceiptConflictError(),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",

      retryable: false,
    });
  });

  it("maps workspace lifecycle disappearance to 404", async () => {
    mocks.createJobApplication.mockRejectedValue(
      new PrivateDomainWriteUnavailableError(),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toMatchObject({
      code: "WORKSPACE_UNAVAILABLE",

      retryable: false,
    });
  });

  it("maps Career business-rule failures to 422", async () => {
    mocks.createJobApplication.mockRejectedValue(
      new RangeError(
        "The selected resume version does not exist in this workspace.",
      ),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",

      retryable: false,
    });
  });

  it("maps unresolved command state to retryable 503", async () => {
    mocks.createJobApplication.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",

        "Receipt incomplete.",
      ),
    );

    const response = await POST(createRequest(createValidBody()));

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",

      retryable: true,
    });
  });
});
