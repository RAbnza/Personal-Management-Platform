import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  record: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
vi.mock("@/modules/sharing/services/groups", () => ({
  recordGroupCommand: mocks.record,
}));
vi.mock("@/modules/sharing/services/read-groups", () => ({
  listGroups: mocks.list,
  getGroup: vi.fn(),
  getBill: vi.fn(),
}));
import { POST, GET } from "@/app/api/v1/sharing/route";
const id = "11111111-1111-4111-8111-111111111111",
  actor = { userId: id, workspaceId: id, sessionId: id, requestId: id };
const body = {
  kind: "create",
  clientCommandId: id,
  groupId: id,
  name: "Trip",
  displayName: "Me",
};
const request = (data: unknown = body, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/sharing", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PMP_DEPLOYMENT_ENV", "test");
  vi.stubEnv("SHARED_EXPENSES_PREVIEW_ENABLED", "true");
  mocks.actor.mockResolvedValue({ kind: "authenticated", actor });
  mocks.record.mockResolvedValue({ groupId: id, version: 1, subjectId: id });
  mocks.list.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
describe("sharing API boundary", () => {
  it("uses the verified server actor and disables caching", async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mocks.record).toHaveBeenCalledWith(actor, body);
  });
  it("rejects ownership spoofing and foreign origins before invoking a command", async () => {
    expect((await POST(request({ ...body, userId: id }))).status).toBe(422);
    expect((await POST(request(body, "https://foreign.test"))).status).toBe(
      403,
    );
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("fails closed in production even if the local preview flag is enabled", async () => {
    vi.stubEnv("PMP_DEPLOYMENT_ENV", "production");
    expect((await POST(request())).status).toBe(404);
    expect(
      (await GET(new Request("http://localhost:3000/api/v1/sharing"))).status,
    ).toBe(404);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("requires authentication and rejects duplicate read scope fields", async () => {
    mocks.actor.mockResolvedValueOnce({
      kind: "response",
      response: new Response(null, { status: 401 }),
    });
    expect((await POST(request())).status).toBe(401);
    expect(
      (
        await GET(
          new Request(
            `http://localhost:3000/api/v1/sharing?groupId=${id}&groupId=${id}`,
          ),
        )
      ).status,
    ).toBe(422);
  });
});
