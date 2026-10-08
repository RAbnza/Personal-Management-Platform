import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  lifecycleActor: vi.fn(),
  preview: vi.fn(),
  state: vi.fn(),
  request: vi.fn(),
  cancel: vi.fn(),
  profile: vi.fn(),
  update: vi.fn(),
  sessions: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/platform/auth/server", () => ({ auth: { api: {} } }));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/platform/auth/lifecycle-actor", () => ({
  resolveLifecycleActor: mocks.lifecycleActor,
}));
vi.mock("@/modules/core/services/workspace-lifecycle", async (original) => ({
  ...(await original<object>()),
  getDeletionPreview: mocks.preview,
  getLifecycleState: mocks.state,
  requestDeletion: mocks.request,
  cancelDeletion: mocks.cancel,
}));
vi.mock("@/modules/core/services/profile", async (original) => ({
  ...(await original<object>()),
  getIdentityProfile: mocks.profile,
  updateProfile: mocks.update,
}));
vi.mock("@/platform/auth/session-management", () => ({
  listOwnerSessions: mocks.sessions,
  revokeOwnerSessions: mocks.revoke,
}));
import { GET as preview } from "@/app/api/v1/lifecycle/preview/route";
import {
  GET as state,
  POST as remove,
  PATCH as cancel,
} from "@/app/api/v1/lifecycle/route";
import { PATCH as profile } from "@/app/api/v1/settings/profile/route";
import { GET as sessions, POST as revoke } from "@/app/api/v1/sessions/route";
import {
  LifecycleConflictError,
  RecentAuthenticationRequiredError,
} from "@/modules/core/services/workspace-lifecycle";
const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
};
const command = {
  clientCommandId: "44444444-4444-4444-8444-444444444444",
  expectedSnapshot: "a".repeat(64),
  confirmation: "DELETE MY WORKSPACE AND ACCOUNT",
};
const request = (
  body: unknown = command,
  method = "POST",
  origin = "http://localhost:3000",
) =>
  new Request("http://localhost:3000/api/v1/lifecycle", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ kind: "authenticated", actor });
  mocks.lifecycleActor.mockResolvedValue(actor);
  mocks.preview.mockResolvedValue({ snapshot: "a".repeat(64) });
  mocks.state.mockResolvedValue(null);
  mocks.request.mockResolvedValue({ requestId: actor.workspaceId });
  mocks.cancel.mockResolvedValue({ cancelled: true });
  mocks.sessions.mockResolvedValue([]);
  mocks.revoke.mockResolvedValue({ found: true, signedOut: false });
  mocks.update.mockResolvedValue({ displayName: "Name", version: 2 });
});
describe("settings, sessions and restricted lifecycle HTTP boundaries", () => {
  it("owner-scopes no-store preview and restricted lifecycle state", async () => {
    expect(
      (
        await preview(
          new Request("http://localhost:3000/api/v1/lifecycle/preview"),
        )
      ).headers.get("cache-control"),
    ).toContain("no-store");
    expect(mocks.preview).toHaveBeenCalledWith({
      userId: actor.userId,
      workspaceId: actor.workspaceId,
    });
    expect(
      (await state(new Request("http://localhost:3000/api/v1/lifecycle")))
        .status,
    ).toBe(200);
    expect(mocks.state).toHaveBeenCalledWith(actor.userId);
  });
  it("rejects malicious origins before authorization", async () => {
    expect(
      (await remove(request(command, "POST", "https://evil.example"))).status,
    ).toBe(403);
    expect(mocks.lifecycleActor).not.toHaveBeenCalled();
  });
  it("passes only server-derived identity and the reviewed command", async () => {
    expect((await remove(request())).status).toBe(200);
    expect(mocks.request).toHaveBeenCalledWith(
      actor,
      command,
      expect.any(Headers),
    );
  });
  it("requires exact destructive confirmation and rejects injected owners", async () => {
    expect(
      (await remove(request({ ...command, userId: actor.userId }))).status,
    ).toBe(422);
    expect(
      (await remove(request({ ...command, confirmation: "delete" }))).status,
    ).toBe(422);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("denies unauthenticated lifecycle reads and mutations", async () => {
    mocks.lifecycleActor.mockResolvedValue(null);
    expect((await state(new Request("http://localhost:3000"))).status).toBe(
      401,
    );
    expect((await remove(request())).status).toBe(401);
  });
  it("maps fresh-auth, stale preview and unknown outcome honestly", async () => {
    mocks.request.mockRejectedValueOnce(
      new RecentAuthenticationRequiredError(),
    );
    expect((await remove(request())).status).toBe(403);
    mocks.request.mockRejectedValueOnce(new LifecycleConflictError());
    expect((await remove(request())).status).toBe(409);
    mocks.request.mockRejectedValueOnce(new Error("sensitive details"));
    const r = await remove(request());
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("sensitive details");
  });
  it("accepts only the cancellation request ID", async () => {
    expect(
      (await cancel(request({ requestId: actor.workspaceId }, "PATCH"))).status,
    ).toBe(200);
    expect(
      (
        await cancel(
          request(
            { requestId: actor.workspaceId, workspaceId: actor.workspaceId },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(422);
  });
  it("scopes profile changes to the active actor", async () => {
    await profile(
      request(
        {
          clientCommandId: command.clientCommandId,
          expectedVersion: 1,
          displayName: "Name",
        },
        "PATCH",
      ),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      {
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        requestId: expect.any(String),
      },
      expect.objectContaining({ displayName: "Name" }),
    );
  });
  it("never accepts a session token or foreign-owner selector", async () => {
    expect(
      (await revoke(request({ kind: "one", token: "secret" }))).status,
    ).toBe(422);
    expect(
      (await revoke(request({ kind: "all", userId: actor.userId }))).status,
    ).toBe(422);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("returns 404 for a foreign session and no-store safe session list", async () => {
    mocks.revoke.mockResolvedValue({ found: false, signedOut: false });
    expect(
      (await revoke(request({ kind: "one", sessionId: actor.sessionId })))
        .status,
    ).toBe(404);
    expect(
      (await sessions(new Request("http://localhost:3000"))).headers.get(
        "cache-control",
      ),
    ).toContain("no-store");
  });
});
