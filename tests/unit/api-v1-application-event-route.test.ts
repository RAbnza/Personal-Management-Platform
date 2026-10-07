import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),

  createApplicationEvent: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/career/services/create-application-event", () => ({
  createApplicationEvent: mocks.createApplicationEvent,
}));

import {
  JobApplicationArchivedError,
  JobApplicationVersionConflictError,
} from "@/modules/career/domain/application";
import { CommandReceiptStateError } from "@/modules/core/domain/command";
import { POST } from "@/app/api/v1/applications/[applicationId]/events/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";

const APPLICATION_ID = "44444444-4444-4444-8444-444444444444";

const COMMAND_ID = "55555555-5555-4555-8555-555555555555";

const EVENT_ID = "66666666-6666-4666-8666-666666666666";

function createContext(applicationId = APPLICATION_ID) {
  return {
    params: Promise.resolve({
      applicationId,
    }),
  };
}

function createBody() {
  return {
    clientCommandId: COMMAND_ID,

    eventKind: "interview",

    title: "Technical interview",

    temporalKind: "timed",

    startsAt: "2026-10-10T01:00:00.000Z",

    endsAt: "2026-10-10T02:00:00.000Z",

    timezone: "Asia/Manila",

    location: "Video call",

    meetingUrl: "https://example.test/meeting",

    preparationNotes: "Review system design.",

    setAsNextAction: true,

    expectedApplicationVersion: 2,
  };
}

function createRequest(
  body: unknown,
  origin = "https://app.example.test",
): Request {
  return new Request(
    `https://app.example.test/api/v1/applications/${APPLICATION_ID}/events`,
    {
      method: "POST",

      headers: {
        Origin: origin,

        "Content-Type": "application/json",
      },

      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();

  mocks.createApplicationEvent.mockReset();

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

describe("POST /api/v1/applications/:applicationId/events", () => {
  it("creates an application event using ActorContext ownership", async () => {
    mocks.createApplicationEvent.mockResolvedValue({
      eventId: EVENT_ID,

      eventVersion: 1,

      notificationGeneration: 1,

      applicationVersion: 3,

      nextActionEventId: EVENT_ID,
    });

    const response = await POST(
      createRequest(createBody()),

      createContext(),
    );

    expect(response.status).toBe(201);

    expect(mocks.createApplicationEvent).toHaveBeenCalledWith({
      userId: USER_ID,

      workspaceId: WORKSPACE_ID,

      applicationId: APPLICATION_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      eventKind: "interview",

      title: "Technical interview",

      temporalKind: "timed",

      eventDate: undefined,

      startsAt: "2026-10-10T01:00:00.000Z",

      endsAt: "2026-10-10T02:00:00.000Z",

      timezone: "Asia/Manila",

      location: "Video call",

      meetingUrl: "https://example.test/meeting",

      preparationNotes: "Review system design.",

      setAsNextAction: true,

      expectedApplicationVersion: 2,
    });
  });

  it("rejects foreign origin before authentication", async () => {
    const response = await POST(
      createRequest(
        createBody(),

        "https://foreign.example.test",
      ),

      createContext(),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();

    expect(mocks.createApplicationEvent).not.toHaveBeenCalled();
  });

  it("rejects ownership injection and invalid temporal shape", async () => {
    const response = await POST(
      createRequest({
        ...createBody(),

        userId: USER_ID,

        workspaceId: WORKSPACE_ID,

        eventDate: "2026-10-10",
      }),

      createContext(),
    );

    expect(response.status).toBe(422);

    expect(mocks.createApplicationEvent).not.toHaveBeenCalled();
  });

  it("maps stale next-action version to 409", async () => {
    mocks.createApplicationEvent.mockRejectedValue(
      new JobApplicationVersionConflictError(2, 3),
    );

    const response = await POST(
      createRequest(createBody()),

      createContext(),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "STALE_VERSION",

      retryable: false,
    });
  });

  it("rejects event creation for an archived application", async () => {
    mocks.createApplicationEvent.mockRejectedValue(
      new JobApplicationArchivedError(),
    );

    const response = await POST(
      createRequest(createBody()),

      createContext(),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "APPLICATION_ARCHIVED",
    });
  });

  it("maps unresolved idempotent state to retryable 503", async () => {
    mocks.createApplicationEvent.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",

        "Receipt incomplete.",
      ),
    );

    const response = await POST(
      createRequest(createBody()),

      createContext(),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",

      retryable: true,
    });
  });
});
