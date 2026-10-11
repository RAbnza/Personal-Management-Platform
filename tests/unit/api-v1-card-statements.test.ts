import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  record: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/card-statements", () => ({
  recordCardStatement: mocks.record,
}));
vi.mock("@/modules/finance/services/read-card-statements", () => ({
  listCardStatements: mocks.list,
  getCardStatement: mocks.detail,
}));
import { GET, POST } from "@/app/api/v1/credit-cards/[cardId]/statements/route";
import { GET as detail } from "@/app/api/v1/credit-cards/[cardId]/statements/[statementId]/route";
import { POST as revise } from "@/app/api/v1/credit-cards/[cardId]/statements/[statementId]/revisions/route";
import {
  StatementUnavailableError,
  StatementConflictError,
} from "@/modules/finance/domain/card-statement";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
const userId = randomUUID(),
  workspaceId = randomUUID(),
  cardId = randomUUID(),
  statementId = randomUUID(),
  context = { params: Promise.resolve({ cardId }) },
  revisionContext = { params: Promise.resolve({ cardId, statementId }) };
const body = {
  clientCommandId: randomUUID(),
  cycleStart: "2026-10-01",
  cycleEnd: "2026-10-31",
  statementDate: "2026-11-01",
  dueDate: "2026-11-20",
  balanceMinor: "100",
  minimumDueMinor: "0",
  verifiedDate: "2026-11-02",
  verificationSource: "Provider statement",
  entries: [],
};
const request = (value: unknown = body, origin = "https://app.example.test") =>
  new Request(
    `https://app.example.test/api/v1/credit-cards/${cardId}/statements`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(value),
    },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockImplementation((_r, requestId) => ({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId },
  }));
});
describe("statement HTTP boundary", () => {
  it("accepts 100 bounded provider lines beyond the ordinary request limit", async () => {
    const entries = Array.from({ length: 100 }, () => ({
      description: "P".repeat(2000),
      providerReference: "R".repeat(2000),
      postingDate: null,
      amountMinor: null,
      actionRevisionId: null,
    }));
    mocks.record.mockResolvedValue({ statementId });
    expect((await POST(request({ ...body, entries }), context)).status).toBe(
      201,
    );
    expect(mocks.record.mock.calls[0]?.[0].entries).toHaveLength(100);
  });
  it("retains a bounded statement request limit", async () => {
    expect(
      (
        await POST(
          request({ ...body, verificationSource: "P".repeat(3 * 1024 * 1024) }),
          context,
        )
      ).status,
    ).toBe(413);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("uses trusted scope, strict path identity and no-store responses", async () => {
    mocks.record.mockResolvedValue({
      statementId,
      revisionId: randomUUID(),
      version: 1,
      financialRevision: "1",
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        workspaceId,
        cardId,
        requestId: expect.any(String),
        balanceMinor: "100",
      }),
    );
  });
  it("rejects origins before auth", async () => {
    expect(
      (await POST(request(body, "https://foreign.example.test"), context))
        .status,
    ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it.each([
    "userId",
    "workspaceId",
    "requestId",
    "cardId",
    "statementId",
    "remainingDueMinor",
    "currency",
    "currentRevisionId",
  ])("rejects injected %s", async (key) => {
    expect(
      (await POST(request({ ...body, [key]: userId }), context)).status,
    ).toBe(422);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("requires a reason and optimistic version for corrections", async () => {
    expect((await revise(request(body), revisionContext)).status).toBe(422);
    mocks.record.mockResolvedValue({ statementId });
    expect(
      (
        await revise(
          request({
            ...body,
            expectedVersion: 1,
            reason: "Provider correction",
          }),
          revisionContext,
        )
      ).status,
    ).toBe(201);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        statementId,
        expectedVersion: 1,
        reason: "Provider correction",
      }),
    );
  });
  it.each([new StatementConflictError(), new FinancialCommandConflictError()])(
    "maps definite conflicts safely",
    async (error) => {
      mocks.record.mockRejectedValue(error);
      expect((await POST(request(), context)).status).toBe(409);
    },
  );
  it("maps missing and foreign resources to the same private response", async () => {
    mocks.detail.mockRejectedValue(new StatementUnavailableError());
    const response = await detail(
      new Request("https://app.example.test/statement"),
      revisionContext,
    );
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain(statementId);
  });
  it("rejects unauthenticated list, detail, create and correction", async () => {
    mocks.actor.mockResolvedValue({
      kind: "response",
      response: new Response("{}", { status: 401 }),
    });
    for (const response of [
      await GET(new Request("https://app.example.test/list"), context),
      await detail(
        new Request("https://app.example.test/detail"),
        revisionContext,
      ),
      await POST(request(), context),
      await revise(request(), revisionContext),
    ])
      expect(response.status).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
