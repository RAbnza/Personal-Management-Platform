import { describe, expect, it } from "vitest";

describe("unit testing foundation", () => {
  it("runs TypeScript unit tests in the Node.js environment", () => {
    expect(typeof window).toBe("undefined");
  });
});
