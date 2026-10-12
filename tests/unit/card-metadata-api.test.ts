import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/modules/finance/services/credit-cards", () => ({
  createCreditCard: mocks.create,
  updateCreditCard: mocks.update,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
import { PATCH } from "@/app/api/v1/credit-cards/route";
import {
  CreditCardVersionConflictError,
  CreditCardUnavailableError,
} from "@/modules/finance/domain/credit-card";
const id = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222",
  workspaceId = "33333333-3333-4333-8333-333333333333";
const body = {
  clientCommandId: id,
  cardId: id,
  expectedVersion: 1,
  name: "Private Visa",
  issuerName: "Provider",
  archived: true,
  creditLimitMinor: "9007199254740993",
  limitVerifiedDate: "2026-10-12",
  notes: null,
};
const request = (data: unknown = body, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/credit-cards", {
    method: "PATCH",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockImplementation((_: Request, requestId: string) => ({
    kind: "authenticated",
    actor: { userId, workspaceId, requestId, sessionId: id },
  }));
  mocks.update.mockResolvedValue({
    cardId: id,
    liabilityLedgerAccountId: id,
    version: 2,
    financialRevision: "12",
  });
});
describe("scoped card metadata updates", () => {
  it("preserves exact limit evidence and replay IDs, derives scope and hides internal ledger identity", async () => {
    const r = await PATCH(request());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      cardId: id,
      version: 2,
      financialRevision: "12",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      ...body,
      userId,
      workspaceId,
      requestId: expect.any(String),
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects forged scope and mutation origin before dispatch", async () => {
    expect((await PATCH(request({ ...body, workspaceId }))).status).toBe(422);
    expect((await PATCH(request(body, "https://foreign.test"))).status).toBe(
      403,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("uses conflict and private-unavailable responses without exposing source records", async () => {
    mocks.update.mockRejectedValueOnce(new CreditCardVersionConflictError());
    expect((await PATCH(request())).status).toBe(409);
    mocks.update.mockRejectedValueOnce(new CreditCardUnavailableError());
    expect((await PATCH(request())).status).toBe(404);
  });
  it("accepts both typed card reminder targets with trusted API scope", async () => {
    const { reminderSourceSchema } =
      await import("@/modules/time/domain/reminder");
    for (const sourceKind of ["card_statement", "card_installment"])
      expect(reminderSourceSchema.parse({ sourceKind, sourceId: id })).toEqual({
        sourceKind,
        sourceId: id,
      });
    expect(() =>
      reminderSourceSchema.parse({
        sourceKind: "card_statement",
        sourceId: id,
        workspaceId,
      }),
    ).toThrow();
    expect(
      reminderSourceSchema.parse({
        sourceKind: "card_statement",
        sourceId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      }).sourceId,
    ).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });
});
