import { describe, expect, it } from "vitest";

import {
  createApiProblemResponse,
  isTrustedSameOriginRequest,
} from "@/platform/http/api-v1";

describe("API v1 HTTP boundary", () => {
  it("returns the documented problem shape with no-store and request correlation", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";

    const response = createApiProblemResponse({
      status: 422,

      code: "VALIDATION_FAILED",

      message: "The submitted values are invalid.",

      requestId,

      retryable: false,

      fieldErrors: {
        amountMinor: ["Amount is required."],
      },
    });

    expect(response.status).toBe(422);

    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(response.headers.get("x-request-id")).toBe(requestId);

    await expect(response.json()).resolves.toEqual({
      status: 422,

      code: "VALIDATION_FAILED",

      message: "The submitted values are invalid.",

      requestId,

      retryable: false,

      fieldErrors: {
        amountMinor: ["Amount is required."],
      },
    });
  });

  it("accepts an exact trusted Origin for state-changing routes", () => {
    const request = new Request("https://app.example.test/api/v1/example", {
      method: "POST",

      headers: {
        Origin: "https://app.example.test",
      },
    });

    expect(
      isTrustedSameOriginRequest(request, "https://app.example.test"),
    ).toBe(true);
  });

  it("rejects missing or foreign Origin headers", () => {
    const missingOrigin = new Request(
      "https://app.example.test/api/v1/example",
      {
        method: "POST",
      },
    );

    const foreignOrigin = new Request(
      "https://app.example.test/api/v1/example",
      {
        method: "POST",

        headers: {
          Origin: "https://evil.example.test",
        },
      },
    );

    expect(
      isTrustedSameOriginRequest(missingOrigin, "https://app.example.test"),
    ).toBe(false);

    expect(
      isTrustedSameOriginRequest(foreignOrigin, "https://app.example.test"),
    ).toBe(false);
  });
});
