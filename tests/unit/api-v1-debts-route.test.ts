import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  importDebt: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/import-existing-debt", () => ({
  importExistingDebt: mocks.importDebt,
}));
vi.mock("@/modules/finance/services/read-debts", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listDebts: mocks.list,
  getDebtDetail: mocks.detail,
}));
import { GET, POST } from "@/app/api/v1/debts/route";
import { GET as detail } from "@/app/api/v1/debts/[debtId]/route";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
const userId = "11111111-1111-4111-8111-111111111111",
  workspaceId = "22222222-2222-4222-8222-222222222222",
  debtId = "33333333-3333-4333-8333-333333333333";
const body = {
  clientCommandId: debtId,
  name: "Loan",
  lenderName: "Provider",
  debtType: "personal_loan",
  startDate: "2026-01-01",
  openingCutoffDate: "2026-10-06",
  openingLiabilityMinor: "640000",
  openingComponents: [{ kind: "unclassified", amountMinor: "640000" }],
  scheduleReason: "Unknown history",
};
const request = (value: unknown = body, origin = "https://app.example.test") =>
  new Request("https://app.example.test/api/v1/debts", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockImplementation((_r: Request, requestId: string) => ({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId },
  }));
});
describe("debt HTTP boundary", () => {
  it("uses only trusted ownership and disables caching", async () => {
    mocks.importDebt.mockResolvedValue({ debtId });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.importDebt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        workspaceId,
        requestId: expect.any(String),
        openingLiabilityMinor: "640000",
      }),
    );
  });
  it("rejects foreign origins before doing work", async () => {
    expect(
      (await POST(request(body, "https://foreign.example.test"))).status,
    ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.importDebt).not.toHaveBeenCalled();
  });
  it.each([
    "userId",
    "workspaceId",
    "requestId",
    "currency",
    "liabilityLedgerAccountId",
  ])("rejects injected %s", async (field) => {
    expect((await POST(request({ ...body, [field]: userId }))).status).toBe(
      422,
    );
    expect(mocks.importDebt).not.toHaveBeenCalled();
  });
  it("propagates unauthorized read and mutation responses", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response("{}", { status: 401 }),
    });
    expect((await POST(request())).status).toBe(401);
    expect(
      (await GET(new Request("https://app.example.test/api/v1/debts"))).status,
    ).toBe(401);
    expect(mocks.importDebt).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns a safe conflict for changed retries", async () => {
    mocks.importDebt.mockRejectedValue(new FinancialCommandConflictError());
    expect((await POST(request())).status).toBe(409);
  });
  it("keeps missing and foreign detail responses private", async () => {
    mocks.detail.mockRejectedValue(new DebtUnavailableError());
    const response = await detail(
      new Request(`https://app.example.test/api/v1/debts/${debtId}`),
      { params: Promise.resolve({ debtId }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.detail).toHaveBeenCalledWith({ userId, workspaceId, debtId });
  });
});
