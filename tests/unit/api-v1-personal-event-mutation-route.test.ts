import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),

  mutatePersonalEvent: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/time/services/mutate-personal-event", () => ({
  mutatePersonalEvent: mocks.mutatePersonalEvent,
}));

import { CommandReceiptStateError } from "@/modules/core/domain/command";
import {
  PersonalEventStateError,
  PersonalEventVersionConflictError,
} from "@/modules/time/domain/personal-event";
import { PATCH } from "@/app/api/v1/personal-events/[eventId]/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";

const EVENT_ID = "44444444-4444-4444-8444-444444444444";

const COMMAND_ID = "55555555-5555-4555-8555-555555555555";

function createContext() {
  return {
    params: Promise.resolve({
      eventId: EVENT_ID,
    }),
  };
}

function createRequest(
  body: unknown,
  origin = "https://app.example.test",
): Request {
  return new Request(
    `https://app.example.test/api/v1/personal-events/${EVENT_ID}`,
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

  mocks.mutatePersonalEvent.mockReset();

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

describe("PATCH /api/v1/personal-events/:eventId", () => {
  it("edits a personal event using ActorContext ownership", async () => {
    mocks.mutatePersonalEvent.mockResolvedValue({
      eventId: EVENT_ID,

      action: "edit",

      eventVersion: 2,

      notificationGeneration: 2,

      status: "scheduled",

      completedAt: null,
    });

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 1,

        action: "edit",

        title: "Updated task",

        temporalKind: "date",

        eventDate: "2026-10-12",

        endDateExclusive: null,

        startsAt: null,

        endsAt: null,

        timezone: null,

        description: "Updated details.",

        location: null,

        referenceUrl: null,

        reason: "Date changed.",
      }),

      createContext(),
    );

    expect(response.status).toBe(200);

    expect(mocks.mutatePersonalEvent).toHaveBeenCalledWith({
      userId: USER_ID,

      workspaceId: WORKSPACE_ID,

      eventId: EVENT_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      expectedEventVersion: 1,

      action: "edit",

      title: "Updated task",

      temporalKind: "date",

      eventDate: "2026-10-12",

      endDateExclusive: null,

      startsAt: null,

      endsAt: null,

      timezone: null,

      description: "Updated details.",

      location: null,

      referenceUrl: null,

      reason: "Date changed.",
    });
  });

  it("completes a personal event", async () => {
    mocks.mutatePersonalEvent.mockResolvedValue({
      eventId: EVENT_ID,

      action: "complete",

      eventVersion: 2,

      notificationGeneration: 2,

      status: "completed",

      completedAt: "2026-10-07T12:00:00.000Z",
    });

    const response = await PATCH(
      createRequest({
        clientCommandId: COMMAND_ID,

        expectedEventVersion: 1,

        action: "complete",

        reason: "Task finished.",
      }),

      createContext(),
    );

    expect(response.status).toBe(200);

    expect(mocks.mutatePersonalEvent).toHaveBeenCalledWith({
      userId: USER_ID,

      workspaceId: WORKSPACE_ID,

      eventId: EVENT_ID,

      clientCommandId: COMMAND_ID,

      requestId: expect.any(String),

      expectedEventVersion: 1,

      action: "complete",

      reason: "Task finished.",
    });
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

    expect(mocks.mutatePersonalEvent).not.toHaveBeenCalled();
  });

  it("maps stale versions to 409", async () => {
    mocks.mutatePersonalEvent.mockRejectedValue(
      new PersonalEventVersionConflictError(1, 2),
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

  it("rejects changes to a terminal event", async () => {
    mocks.mutatePersonalEvent.mockRejectedValue(
      new PersonalEventStateError("completed"),
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
      code: "PERSONAL_EVENT_INVALID_STATE",
    });
  });

  it("maps an unresolved idempotent command to retryable 503", async () => {
    mocks.mutatePersonalEvent.mockRejectedValue(
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
