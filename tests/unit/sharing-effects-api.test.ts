import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  preview: vi.fn(),
  adopt: vi.fn(),
  export: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/platform/http/api-v1-auth", () => ({
  resolveApiActorForRequest: mocks.actor,
}));
vi.mock("@/platform/env/server", () => ({
  getServerEnvironment: () => ({ BETTER_AUTH_URL: "http://localhost:3000" }),
}));
vi.mock("@/modules/finance/services/adopt-group-effect", async (original) => ({
  ...(await original<
    typeof import("@/modules/finance/services/adopt-group-effect")
  >()),
  getGroupEffectPreview: mocks.preview,
  adoptGroupEffect: mocks.adopt,
}));
vi.mock("@/modules/sharing/services/export-group", () => ({
  exportGroup: mocks.export,
}));
vi.mock("@/modules/finance/services/review-group-source", async (original) => ({
  ...(await original<
    typeof import("@/modules/finance/services/review-group-source")
  >()),
  reviewGroupSource: mocks.review,
}));
import { GET, POST } from "@/app/api/v1/sharing/effects/route";
import { GET as exportGET } from "@/app/api/v1/sharing/export/route";
import { POST as reviewPOST } from "@/app/api/v1/sharing/reviews/route";
const id = "11111111-1111-4111-8111-111111111111",
  actor = { userId: id, workspaceId: id, sessionId: id },
  ref = { groupId: id, sourceKind: "settlement", sourceId: id },
  body = {
    ...ref,
    clientCommandId: id,
    expectedSourceHash: "ab".repeat(32),
    expectedFinancialRevision: "1",
    approved: true,
    funding: { kind: "keep" },
  };
const request = (data: unknown = body, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/v1/sharing/effects", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SHARED_EXPENSES_ENABLED", "true");
  mocks.actor.mockResolvedValue({ kind: "authenticated", actor });
  mocks.preview.mockResolvedValue({});
  mocks.adopt.mockResolvedValue({});
  mocks.export.mockResolvedValue({ privateFundingIncluded: false });
  mocks.review.mockResolvedValue({ reviewId: id, linkId: id });
});
afterEach(() => vi.unstubAllEnvs());
describe("private group integration HTTP authority", () => {
  it("retains only server-derived private source evidence with same-origin verified ownership", async () => {
    const review = {
      clientCommandId: id,
      groupId: id,
      linkId: id,
      expectedLinkRevisionId: id,
      expectedSourceHash: "ab".repeat(32),
      expectedFinancialRevision: "1",
      approved: true,
      reason: "Keep verified private amounts",
    };
    expect(
      (
        await reviewPOST(
          request({ ...review, reviewedSourceJson: { paidMinor: "1" } }),
        )
      ).status,
    ).toBe(422);
    expect(
      (await reviewPOST(request({ ...review, workspaceId: id }))).status,
    ).toBe(422);
    expect(
      (await reviewPOST(request(review, "https://foreign.test"))).status,
    ).toBe(403);
    expect(mocks.review).not.toHaveBeenCalled();
    expect((await reviewPOST(request(review))).status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith(actor, review);
  });
  it("binds approvals to the server actor, exact source and current private revision", async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mocks.adopt).toHaveBeenCalledWith(actor, {
      ...body,
      categoryId: null,
      acknowledgeNegativeBalance: false,
    });
  });
  it("rejects spoofed scopes and cross-origin approval before reaching a financial command", async () => {
    expect((await POST(request({ ...body, workspaceId: id }))).status).toBe(
      422,
    );
    expect((await POST(request(body, "https://foreign.test"))).status).toBe(
      403,
    );
    expect(mocks.adopt).not.toHaveBeenCalled();
  });
  it("reauthorizes previews and group exports and rejects repeated/unknown query scopes", async () => {
    mocks.actor.mockResolvedValueOnce({
      kind: "response",
      response: new Response(null, { status: 401 }),
    });
    expect(
      (
        await GET(
          new Request(
            `http://localhost:3000/api/v1/sharing/effects?${new URLSearchParams(ref)}`,
          ),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await exportGET(
          new Request(
            `http://localhost:3000/api/v1/sharing/export?groupId=${id}&groupId=${id}`,
          ),
        )
      ).status,
    ).toBe(422);
    const r = await exportGET(
      new Request(`http://localhost:3000/api/v1/sharing/export?groupId=${id}`),
    );
    expect(r.headers.get("content-disposition")).toContain("attachment");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(mocks.export).toHaveBeenCalledWith(actor, id);
  });
});
