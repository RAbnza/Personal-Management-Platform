import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), dashboard: vi.fn() }));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/dashboard/services/get-dashboard", () => ({
  getDashboard: mocks.dashboard,
}));
import { GET } from "@/app/api/v1/dashboard/route";
import { dashboardFixture } from "./helpers/dashboard";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    kind: "actor",
    actor: { userId: "owner", workspaceId: "trusted" },
  });
  mocks.dashboard.mockResolvedValue(dashboardFixture());
});
describe("private Dashboard read API", () => {
  it("uses only the server actor with no-store response", async () => {
    const response = await GET(
      new Request(
        "https://example.test/api/v1/dashboard?period=week&source=career",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.dashboard).toHaveBeenCalledWith({
      userId: "owner",
      workspaceId: "trusted",
      query: { period: "week", source: "career" },
    });
  });
  it.each(["workspaceId=foreign", "period=week&period=year", "source=reports"])(
    "rejects injected/ambiguous filters %s",
    async (query) => {
      expect(
        (
          await GET(
            new Request(`https://example.test/api/v1/dashboard?${query}`),
          )
        ).status,
      ).toBe(400);
      expect(mocks.dashboard).not.toHaveBeenCalled();
    },
  );
  it("preserves auth rejection without reading any private records", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response(null, { status: 401 }),
    });
    expect(
      (await GET(new Request("https://example.test/api/v1/dashboard"))).status,
    ).toBe(401);
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });
  it("returns a safe retryable error without leaking database detail", async () => {
    mocks.dashboard.mockRejectedValue(new Error("private sql connection"));
    const r = await GET(new Request("https://example.test/api/v1/dashboard"));
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private sql");
  });
});
