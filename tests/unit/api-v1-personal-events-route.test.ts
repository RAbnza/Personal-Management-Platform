import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveApiActorForRequest: vi.fn(),

  createPersonalEvent: vi.fn(),
}));

vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({
    BETTER_AUTH_URL: "https://app.example.test",
  }),
}));

vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.resolveApiActorForRequest,
}));

vi.mock("@/modules/time/services/create-personal-event", () => ({
  createPersonalEvent: mocks.createPersonalEvent,
}));

import { CommandReceiptStateError } from "@/modules/core/domain/command";
import { POST } from "@/app/api/v1/personal-events/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COMMAND_ID = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";

function createRequest(
  body: unknown,
  origin = "https://app.example.test",
): Request {
  return new Request("https://app.example.test/api/v1/personal-events", {
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
  mocks.createPersonalEvent.mockReset();

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

describe("POST /api/v1/personal-events", () => {
  it("creates a date-only personal event using ActorContext ownership", async () => {
    mocks.createPersonalEvent.mockResolvedValue({
      eventId: EVENT_ID,

      eventVersion: 1,

      notificationGeneration: 1,
    });

    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        title: "Submit documents",

        temporalKind: "date",

        eventDate: "2026-10-10",

        endDateExclusive: null,

        startsAt: null,

        endsAt: null,

        timezone: null,

        description: "Prepare the required documents.",

        location: null,

        referenceUrl: "https://example.test/reference",
      }),
    );

    expect(response.status).toBe(201);

    expect(mocks.createPersonalEvent).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,

      clientCommandId: COMMAND_ID,
      requestId: expect.any(String),

      title: "Submit documents",

      temporalKind: "date",

      eventDate: "2026-10-10",

      endDateExclusive: null,

      startsAt: null,

      endsAt: null,

      timezone: null,

      description: "Prepare the required documents.",

      location: null,

      referenceUrl: "https://example.test/reference",
    });
  });

  it("rejects ownership fields supplied by the browser", async () => {
    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        title: "Private task",

        temporalKind: "date",

        eventDate: "2026-10-10",

        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
      }),
    );

    expect(response.status).toBe(422);

    expect(mocks.createPersonalEvent).not.toHaveBeenCalled();
  });

  it("rejects a foreign origin before authentication", async () => {
    const response = await POST(
      createRequest(
        {
          clientCommandId: COMMAND_ID,

          title: "Private task",

          temporalKind: "date",

          eventDate: "2026-10-10",
        },

        "https://foreign.example.test",
      ),
    );

    expect(response.status).toBe(403);

    expect(mocks.resolveApiActorForRequest).not.toHaveBeenCalled();

    expect(mocks.createPersonalEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid timed temporal shape", async () => {
    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        title: "Appointment",

        temporalKind: "timed",

        eventDate: "2026-10-10",

        startsAt: "2026-10-10T01:00:00.000Z",

        timezone: "Asia/Manila",
      }),
    );

    expect(response.status).toBe(422);

    expect(mocks.createPersonalEvent).not.toHaveBeenCalled();
  });

  it("maps unresolved idempotent state to retryable 503", async () => {
    mocks.createPersonalEvent.mockRejectedValue(
      new CommandReceiptStateError(
        "existing_receipt_incomplete",
        "Receipt incomplete.",
      ),
    );

    const response = await POST(
      createRequest({
        clientCommandId: COMMAND_ID,

        title: "Private task",

        temporalKind: "date",

        eventDate: "2026-10-10",
      }),
    );

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toMatchObject({
      code: "TEMPORARY_UNAVAILABLE",

      retryable: true,
    });
  });
});
