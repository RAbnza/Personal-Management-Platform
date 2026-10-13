import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), get: vi.fn() }));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/planning/services/get-forecast", () => ({
  getForecast: mocks.get,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
import { GET, POST } from "@/app/api/v1/forecasts/route";
const userId = "11111111-1111-4111-8111-111111111111",
  workspaceId = "22222222-2222-4222-8222-222222222222";
const request = (body: unknown = {}, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/forecasts", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockImplementation((_: Request, requestId: string) => ({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId },
  }));
  mocks.get.mockResolvedValue({
    totals: { openingActualMinor: "1000", closingProjectedMinor: "-10" },
  });
});
describe("private read-only forecast API", () => {
  it("uses server ownership and returns exact noncacheable derived values", async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect((await r.json()).totals.closingProjectedMinor).toBe("-10");
    expect(mocks.get.mock.calls[0]![0]).toMatchObject({ userId, workspaceId });
    expect(
      (
        await GET(
          new Request(
            "http://localhost:3000/api/v1/forecasts?endDate=2026-11-01",
          ),
        )
      ).status,
    ).toBe(200);
  });
  it("rejects spoofed scope, repeated queries, bad scenarios and foreign origin", async () => {
    expect((await POST(request({ workspaceId }))).status).toBe(422);
    expect(
      (
        await GET(
          new Request(
            "http://localhost:3000/api/v1/forecasts?startDate=2026-10-15&startDate=2026-10-16",
          ),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await POST(
          request({
            adjustments: [
              {
                label: "Unknown",
                date: "2026-10-15",
                direction: "inflow",
                amountMinor: 1,
              },
            ],
          }),
        )
      ).status,
    ).toBe(422);
    expect((await POST(request({}, "https://foreign.example"))).status).toBe(
      403,
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated GET and POST", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response(null, { status: 401 }),
    });
    expect(
      (await GET(new Request("http://localhost:3000/api/v1/forecasts"))).status,
    ).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("returns safe inventory/range errors and hides internal SQL details", async () => {
    mocks.get.mockRejectedValueOnce(
      new RangeError("Choose current owned sources."),
    );
    expect((await POST(request())).status).toBe(422);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.get.mockRejectedValueOnce(new Error("Private SQL credential"));
    const r = await GET(new Request("http://localhost:3000/api/v1/forecasts"));
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("credential");
    expect(String(log.mock.calls)).not.toContain("credential");
    log.mockRestore();
  });
});
