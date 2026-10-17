import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("PROOF_NOT_FOUND");
  },
}));
vi.mock("@/app/dev/design/proofs", () => ({ DesignProofs: () => null }));
import DesignReviewPage from "@/app/dev/design/page";
// Installed 16.3.8 exports the older helper name despite its proxy guide.
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { proxy, config } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());
describe("development design proof gate", () => {
  it.each(["production", "test"])(
    "refuses the route in %s even if a flag is set",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      vi.stubEnv("REDESIGN_PROOFS_ENABLED", "true");
      await expect(
        DesignReviewPage({ searchParams: Promise.resolve({}) }),
      ).rejects.toThrow("PROOF_NOT_FOUND");
    },
  );
  it("allows synthetic development proof composition", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(
      await DesignReviewPage({
        searchParams: Promise.resolve({ screen: "expense" }),
      }),
    ).toBeTruthy();
  });
  it("returns a real production 404 before the loading boundary can stream", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy().status).toBe(404);
    expect(proxy().headers.get("Cache-Control")).toBe("no-store");
  });
  it("passes through development and never matches supported app or API paths", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy().headers.get("x-middleware-next")).toBe("1");
    expect(
      unstable_doesProxyMatch({
        config,
        nextConfig: {},
        url: "/dev/design?screen=expense",
      }),
    ).toBe(true);
    for (const url of [
      "/",
      "/money/actions",
      "/api/v1/financial-actions",
      "/auth/sign-in",
      "/trackers",
      "/settings",
    ])
      expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(
        false,
      );
  });
});
