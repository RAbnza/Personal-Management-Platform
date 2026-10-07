import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),

  mutateApplicationEvent: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/career/services/mutate-application-event", () => ({
  mutateApplicationEvent: mocks.mutateApplicationEvent,
}));

import {
  ApplicationEventStateError,
  ApplicationEventVersionConflictError,
} from "@/modules/career/domain/application-event";
import { JobApplicationVersionConflictError } from "@/modules/career/domain/application";
import { CommandReceiptStateError } from "@/modules/core/domain/command";
import { PATCH } from "@/app/api/v1/applications/[applicationId]/events/[eventId]/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

const APPLICATION_ID = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const COMMAND_ID = "66666666-6666-4666-8666-666666666666";

function createContext() {
  return {
    params: Promise.resolve({
      applicationId: APPLICATION_ID,
      eventId: EVENT_ID,
    }),
  };
}

function createRequest(
  body: unknown,
  origin = "https://app.example.test",
): Request {
  return new Request(
    `https://app.example.test/api/v1/applications/${APPLICATION_ID}/events/${EVENT_ID}`,
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

beforeEach(() => {
  mocks.resolveApiActorForRequest.mockReset();
  mocks.mutateApplicationEvent.mockReset();

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

describe("PATCH /api/v1/applications/:applicationId/events/:eventId", () => {
  it("reschedules a Career event using ActorContext ownership", async () => {
    mocks.mutateApplicationEvent.mockResolvedValue({
      applicationId: APPLICATION_ID,
      eventId: EVENT_ID,

      action: "reschedule",

      eventVersion: 2,
      notificationGeneration: 2,

      status: "scheduled",
      completedAt: null,

      applicationVersion: 3,
      nextActionEventId: EVENT_ID,
    });

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 1,

        action: "reschedule",

        temporalKind: "date",

        eventDate: "2026-10-15",

        reason: "Employer moved the interview.",
      }),

      createContext(),
    );

    expect(response.status).toBe(200);

    expect(mocks.mutateApplicationEvent).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      applicationId: APPLICATION_ID,
      eventId: EVENT_ID,

      clientCommandId: COMMAND_ID,
      requestId: expect.any(String),

      expectedEventVersion: 1,

      action: "reschedule",

      temporalKind: "date",

      eventDate: "2026-10-15",

      startsAt: undefined,
      endsAt: undefined,
      timezone: undefined,

      reason: "Employer moved the interview.",
    });
  });

  it("completes the current next action with an explicit replacement", async () => {
    const replacementEventId = "77777777-7777-4777-8777-777777777777";

    mocks.mutateApplicationEvent.mockResolvedValue({
      applicationId: APPLICATION_ID,
      eventId: EVENT_ID,

      action: "complete",

      eventVersion: 2,
      notificationGeneration: 2,

      status: "completed",
      completedAt: "2026-10-07T12:00:00.000Z",

      applicationVersion: 4,
      nextActionEventId: replacementEventId,
    });

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 1,

        action: "complete",

        outcomeNotes: "Completed technical interview.",

        expectedApplicationVersion: 3,

        replacementNextActionEventId: replacementEventId,

        reason: "Interview completed.",
      }),

      createContext(),
    );

    expect(response.status).toBe(200);

    expect(mocks.mutateApplicationEvent).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      applicationId: APPLICATION_ID,
      eventId: EVENT_ID,

      clientCommandId: COMMAND_ID,
      requestId: expect.any(String),

      expectedEventVersion: 1,

      action: "complete",

      outcomeNotes: "Completed technical interview.",

      expectedApplicationVersion: 3,

      replacementNextActionEventId: replacementEventId,

      reason: "Interview completed.",
    });
  });

  it("rejects a foreign origin before authentication", async () => {
    const response = await PATCH(
      createRequest(
        {
          clientCommandId: COMMAND_ID,
          expectedEventVersion: 1,
          action: "cancel",
        },

        "https://foreign.example.test",
      ),

      createContext(),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();

    expect(mocks.mutateApplicationEvent).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied ownership fields", async () => {
    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 1,

        action: "cancel",

        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
      }),

      createContext(),
    );

    expect(response.status).toBe(422);

    expect(mocks.mutateApplicationEvent).not.toHaveBeenCalled();
  });

  it("maps stale event versions to 409", async () => {
    mocks.mutateApplicationEvent.mockRejectedValue(
      new ApplicationEventVersionConflictError(1, 2),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 1,

        action: "cancel",
      }),

      createContext(),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "STALE_VERSION",
      retryable: false,
    });
  });

  it("maps stale application versions to 409", async () => {
    mocks.mutateApplicationEvent.mockRejectedValue(
      new JobApplicationVersionConflictError(3, 4),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 1,

        action: "complete",

        expectedApplicationVersion: 3,
      }),

      createContext(),
    );

    expect(response.status).toBe(409);

    await expect(response.json()).resolves.toMatchObject({
      code: "STALE_VERSION",
      retryable: false,
    });
  });

  it("rejects changes to a terminal Career event", async () => {
    mocks.mutateApplicationEvent.mockRejectedValue(
      new ApplicationEventStateError("completed"),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 2,

        action: "cancel",
      }),

      createContext(),
    );

    expect(response.status).toBe(422);

    await expect(response.json()).resolves.toMatchObject({
      code: "APPLICATION_EVENT_INVALID_STATE",
      retryable: false,
    });
  });

  it("maps unresolved idempotent state to retryable 503", async () => {
    mocks.mutateApplicationEvent.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",
        "Receipt incomplete.",
      ),
    );

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 1,

        action: "cancel",
      }),

      createContext(),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",
      retryable: true,
    });
  });
});
