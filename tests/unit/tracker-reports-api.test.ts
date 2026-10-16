import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), report: vi.fn() }));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/trackers/services/reports", async (original) => ({
  ...(await original<typeof import("@/modules/trackers/services/reports")>()),
  getTrackerReport: mocks.report,
}));
import { GET } from "@/app/api/v1/trackers/reports/route";
const request = (q = "") =>
  new Request("http://localhost:3000/api/v1/trackers/reports" + q);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    kind: "authenticated",
    actor: { userId: crypto.randomUUID(), workspaceId: crypto.randomUUID() },
  });
  mocks.report.mockResolvedValue({
    definitionVersion: "v3",
    context: { generatedAt: "2026-10-16T00:00:00Z", timezone: "Asia/Manila" },
    period: { startDate: "2026-10-01", endDate: "2026-10-31" },
    filters: { archived: "all" },
    current: [
      {
        id: "entry",
        tracker_id: "tracker",
        title: "=HYPERLINK(secret)",
        template_version_id: "version",
        statusLabel: "Completed",
        deadline_date: "2026-10-16",
        completed_at: null,
        archived: false,
      },
    ],
    events: [
      {
        entryId: "entry",
        trackerId: "tracker",
        title: "Recorded",
        versionId: "old-version",
        date: "2026-10-15",
        kind: "completed",
        recordedAt: "2026-10-15T23:00:00Z",
      },
    ],
  });
});
it("exports distinct current and immutable activity rows with formula-safe CSV and civil metadata", async () => {
  const r = await GET(request("?format=csv&archived=all"));
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  const csv = await r.text();
  expect(csv).toContain("current_entry");
  expect(csv).toContain("activity_completed");
  expect(csv).toContain("'=HYPERLINK(secret)");
  expect(csv).toContain("old-version");
  expect(csv).toContain("Asia/Manila");
});
it("rejects repeated filters and unsupported formats before report reads", async () => {
  expect((await GET(request("?period=week&period=month"))).status).toBe(422);
  expect((await GET(request("?format=sql"))).status).toBe(422);
  expect(mocks.report).not.toHaveBeenCalled();
});
it("preserves authentication rejection", async () => {
  mocks.actor.mockResolvedValue({
    kind: "response",
    response: new Response(null, { status: 401 }),
  });
  expect((await GET(request())).status).toBe(401);
  expect(mocks.report).not.toHaveBeenCalled();
});

it("rejects inconsistent portable tracker graphs as a non-retryable client error", async () => {
  const { hProblem } = await import("@/platform/http/portability-problem"),
    { TrackerError } = await import("@/modules/trackers/domain/tracker");
  const r = hProblem(
    new TrackerError(422, "Inconsistent private data"),
    crypto.randomUUID(),
  );
  expect(r.status).toBe(422);
  expect(await r.json()).toMatchObject({
    code: "PORTABLE_TRACKER_GRAPH_INVALID",
    retryable: false,
  });
});
