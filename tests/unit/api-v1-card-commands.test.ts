import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  record: vi.fn(),
  allocate: vi.fn(),
  reverse: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "https://app.example.test" }),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/record-card-command", () => ({
  recordCardCommand: mocks.record,
}));
vi.mock("@/modules/finance/services/card-allocations", () => ({
  recordCardAllocation: mocks.allocate,
  reverseCardAllocation: mocks.reverse,
}));
vi.mock("@/modules/finance/services/read-card-command-setup", () => ({
  getCardCommandSetup: mocks.read,
}));
import { GET, POST } from "@/app/api/v1/credit-cards/[cardId]/commands/route";
import { POST as allocate } from "@/app/api/v1/credit-cards/[cardId]/allocations/route";
import { POST as reverse } from "@/app/api/v1/credit-cards/[cardId]/allocations/reversals/route";
import {
  CardEvidenceUnavailableError,
  CardEvidenceConflictError,
} from "@/modules/finance/domain/card-command";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
const cardId = randomUUID(),
  userId = randomUUID(),
  workspaceId = randomUUID(),
  context = { params: Promise.resolve({ cardId }) };
const body = {
  clientCommandId: randomUUID(),
  actionKind: "card_fee",
  amountMinor: "10000",
  effectiveDate: "2026-10-10",
  postingDate: "2026-10-11",
  description: "Provider fee",
  confirmationSource: "Actual provider record",
  providerConfirmed: true,
};
const request = (data: unknown = body, origin = "https://app.example.test") =>
  new Request(
    `https://app.example.test/api/v1/credit-cards/${cardId}/commands`,
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(data),
    },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockImplementation((_r, requestId) => ({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId },
  }));
});
describe("private A4 HTTP boundary", () => {
  it("uses trusted path/actor scope and no-store", async () => {
    mocks.record.mockResolvedValue({ actionId: randomUUID() });
    const r = await POST(request(), context);
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId,
        userId,
        workspaceId,
        requestId: expect.any(String),
      }),
    );
  });
  it.each([
    { userId: randomUUID() },
    { workspaceId: randomUUID() },
    { cardId: randomUUID() },
    { liabilityMinor: "1" },
    { providerConfirmed: false },
    { actionKind: "card_adjustment" },
    { actionKind: "card_payment" },
  ])("rejects invalid/spoofed command %j", async (extra) => {
    expect((await POST(request({ ...body, ...extra }), context)).status).toBe(
      422,
    );
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("checks mutation origin before authentication for every A4 command", async () => {
    for (const route of [POST, allocate, reverse])
      expect(
        (await route(request(body, "https://evil.test"), context)).status,
      ).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("bounds request bodies", async () => {
    expect(
      (
        await POST(
          request({ ...body, description: "x".repeat(65536) }),
          context,
        )
      ).status,
    ).toBe(413);
  });
  it("validates allocation and reversal commands with trusted card identity", async () => {
    mocks.allocate.mockResolvedValue({ allocationId: randomUUID() });
    mocks.reverse.mockResolvedValue({ allocationId: randomUUID() });
    expect(
      (
        await allocate(
          request({
            clientCommandId: randomUUID(),
            statementRevisionId: randomUUID(),
            sourceActionRevisionId: randomUUID(),
            amountMinor: "1",
            confirmationKind: "provider",
            confirmationSource: "Provider applied payment",
            confirmedDate: "2026-11-01",
          }),
          context,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await reverse(
          request({
            clientCommandId: randomUUID(),
            allocationId: randomUUID(),
            reason: "Correction",
          }),
          context,
        )
      ).status,
    ).toBe(201);
    expect(mocks.allocate).toHaveBeenCalledWith(
      expect.objectContaining({ cardId, userId, workspaceId }),
    );
  });
  it.each([
    new CardEvidenceUnavailableError(),
    new CardEvidenceConflictError(),
    new FinancialCommandConflictError(),
    new RangeError("Invalid evidence"),
  ])("maps unavailable/conflicting/invalid evidence safely", async (e) => {
    mocks.record.mockRejectedValue(e);
    const r = await POST(request(), context);
    expect(r.status).toBe(
      e instanceof CardEvidenceUnavailableError
        ? 404
        : e instanceof RangeError
          ? 422
          : 409,
    );
    expect((await r.json()).retryable).toBe(false);
  });
  it("returns the same unavailable response for malformed/missing/foreign card paths", async () => {
    mocks.read.mockRejectedValue(new CardEvidenceUnavailableError());
    const a = await GET(new Request("https://app.example.test"), {
        params: Promise.resolve({ cardId: "bad" }),
      }),
      b = await GET(new Request("https://app.example.test"), context);
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect((await a.json()).message).toBe((await b.json()).message);
  });
  it("does not expose database errors and retains uncertain retry semantics", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.record.mockRejectedValue(new Error("SELECT secret FROM private"));
    const r = await POST(request(), context);
    expect(r.status).toBe(500);
    const p = await r.json();
    expect(p.retryable).toBe(true);
    expect(JSON.stringify(p)).not.toContain("SELECT");
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Card command outcome unconfirmed\. requestId=[\w-]+$/,
      ),
    );
  });
});
