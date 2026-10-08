import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportLimitError } from "@/modules/reporting/domain/reports";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  financial: vi.fn(),
  career: vi.fn(),
  detail: vi.fn(),
  csv: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/reporting/services/get-reports", () => ({
  getFinancialReport: mocks.financial,
  getCareerReport: mocks.career,
  getFinancialDetail: mocks.detail,
}));
vi.mock("@/modules/reporting/services/export-csv", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/reporting/services/export-csv")
  >()),
  prepareCsvExport: mocks.csv,
}));
import { GET as report } from "@/app/api/v1/reports/[view]/route";
import { GET as csv } from "@/app/api/v1/exports/[filename]/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    kind: "actor",
    actor: { userId: "owner", workspaceId: "trusted" },
  });
  mocks.financial.mockResolvedValue({ metrics: { net: "123" } });
  mocks.career.mockResolvedValue({ summary: { submitted: 1 } });
  mocks.detail.mockResolvedValue({ amountMinor: "123" });
  mocks.csv.mockResolvedValue({
    buffer: Buffer.from(
      "record_type,amount_minor\r\nposting,-9007199254740993\r\n",
    ),
    filename: "pmp-report.csv",
    exportRunId: "export-id",
    rowCount: 1,
  });
});
const request = (query = "") =>
  new Request(`https://example.test/api/v1/reports/financial?${query}`);
describe("owner-scoped reports and bounded CSV API", () => {
  it.each(["financial", "career", "contributions"])(
    "resolves %s using only the trusted actor",
    async (view) => {
      const r = await report(
        request(
          view === "contributions"
            ? "period=quarter&anchorDate=2026-07-01&metric=net"
            : "period=quarter&anchorDate=2026-07-01",
        ),
        { params: Promise.resolve({ view }) },
      );
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toContain("no-store");
      const mock =
        view === "contributions"
          ? mocks.detail
          : view === "career"
            ? mocks.career
            : mocks.financial;
      expect(mock.mock.calls[0]![0]).toMatchObject({
        userId: "owner",
        workspaceId: "trusted",
        query: { period: "quarter", anchorDate: "2026-07-01" },
      });
    },
  );
  it.each([
    "workspaceId=foreign",
    "userId=foreign",
    "period=week&period=year",
    "period=year&anchorDate=invalid",
  ])("rejects unsupported or ambiguous filters %s", async (query) => {
    expect(
      (
        await report(request(query), {
          params: Promise.resolve({ view: "financial" }),
        })
      ).status,
    ).toBe(400);
    expect(mocks.financial).not.toHaveBeenCalled();
    expect(
      (
        await csv(request(query), {
          params: Promise.resolve({ filename: "transactions.csv" }),
        })
      ).status,
    ).toBe(400);
    expect(mocks.csv).not.toHaveBeenCalled();
  });
  it("does not read or generate exports without authentication", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response(null, { status: 401 }),
    });
    expect(
      (
        await report(request(), {
          params: Promise.resolve({ view: "financial" }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await csv(request(), {
          params: Promise.resolve({ filename: "report.csv" }),
        })
      ).status,
    ).toBe(401);
    expect(mocks.csv).not.toHaveBeenCalled();
    expect(mocks.financial).not.toHaveBeenCalled();
  });
  it("streams exact CSV with safe private attachment and provenance headers", async () => {
    const r = await csv(request("period=month&anchorDate=2026-10-01"), {
      params: Promise.resolve({ filename: "transactions.csv" }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-disposition")).toBe(
      'attachment; filename="pmp-report.csv"',
    );
    expect(r.headers.get("x-export-run-id")).toBe("export-id");
    expect(r.headers.get("x-export-row-count")).toBe("1");
    expect(await r.text()).toContain("-9007199254740993");
    expect(mocks.csv).toHaveBeenCalledWith({
      userId: "owner",
      workspaceId: "trusted",
      kind: "transactions",
      query: { period: "month", anchorDate: "2026-10-01" },
    });
  });
  it.each(["workspace.csv", "report", "../../transactions.csv"])(
    "rejects unavailable export %s",
    async (filename) => {
      expect(
        (await csv(request(), { params: Promise.resolve({ filename }) }))
          .status,
      ).toBe(404);
      expect(mocks.csv).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["limited", 413],
    ["private database detail", 503],
  ] as const)(
    "returns safe %s errors without success downloads",
    async (message, status) => {
      const error =
        message === "limited" ? new ReportLimitError() : new Error(message);
      mocks.csv.mockRejectedValue(error);
      mocks.financial.mockRejectedValue(error);
      for (const r of [
        await csv(request(), {
          params: Promise.resolve({ filename: "report.csv" }),
        }),
        await report(request(), {
          params: Promise.resolve({ view: "financial" }),
        }),
      ]) {
        expect(r.status).toBe(status);
        expect(r.headers.get("content-disposition")).toBeNull();
        expect(await r.text()).not.toContain("private database detail");
      }
    },
  );
});
