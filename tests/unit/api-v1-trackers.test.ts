import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  command: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
vi.mock("@/modules/trackers/services/commands", () => ({
  recordTrackerCommand: mocks.command,
}));
vi.mock("@/modules/trackers/services/reads", async (original) => ({
  ...(await original<typeof import("@/modules/trackers/services/reads")>()),
  readTrackers: mocks.read,
}));
import { GET, POST } from "@/app/api/v1/trackers/route";
const userId = "11111111-1111-4111-8111-111111111111",
  workspaceId = "22222222-2222-4222-8222-222222222222";
const request = (body: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/trackers", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const body = () => ({
  operation: "preset",
  clientCommandId: crypto.randomUUID(),
  preset: "books",
  name: "Books",
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId: crypto.randomUUID() },
  });
  mocks.command.mockResolvedValue({ trackerId: userId });
  mocks.read.mockResolvedValue({ view: "overview", trackers: [] });
});
describe("tracker API boundaries", () => {
  it("rejects foreign origins before resolving a session or command", async () => {
    expect((await POST(request(body(), "https://foreign.test"))).status).toBe(
      403,
    );
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("uses the server session scope and no-store response", async () => {
    const r = await POST(request(body()));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mocks.command.mock.calls[0]![0]).toMatchObject({
      userId,
      workspaceId,
    });
  });
  it("rejects client ownership and unknown command content", async () => {
    const r = await POST(request({ ...body(), workspaceId }));
    expect(r.status).toBe(422);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("returns authentication rejection without executing reads or writes", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response("unauthorized", { status: 401 }),
    });
    expect((await POST(request(body()))).status).toBe(401);
    expect(
      (await GET(new Request("http://localhost:3000/api/v1/trackers"))).status,
    ).toBe(401);
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON, oversized bodies and repeated queries", async () => {
    const malformed = new Request("http://localhost:3000/api/v1/trackers", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: "{",
    });
    expect((await POST(malformed)).status).toBe(400);
    expect(
      (await POST(request({ ...body(), name: "x".repeat(65536) }))).status,
    ).toBe(413);
    expect(
      (
        await GET(
          new Request(
            `http://localhost:3000/api/v1/trackers?view=entry&id=${userId}&id=${workspaceId}`,
          ),
        )
      ).status,
    ).toBe(422);
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
