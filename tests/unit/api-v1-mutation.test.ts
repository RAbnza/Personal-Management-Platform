import { describe, expect, it } from "vitest";

import {
  API_V1_JSON_BODY_MAX_BYTES,
  createMutationOriginProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";

describe("API v1 mutation transport boundary", () => {
  it("permits a bounded route-specific limit while retaining the default 64 KB boundary", async () => {
    const request = new Request("https://app.example.test/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(API_V1_JSON_BODY_MAX_BYTES) }),
    });
    await expect(readApiJsonBody(request.clone())).rejects.toMatchObject({
      reason: "body_too_large",
    });
    expect(await readApiJsonBody(request, 128 * 1024)).toEqual({
      value: "x".repeat(API_V1_JSON_BODY_MAX_BYTES),
    });
  });
  it("checks both actual and declared bytes against the server-owned override", async () => {
    const actual = new Request("https://app.example.test/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "too long" }),
    });
    await expect(readApiJsonBody(actual, 8)).rejects.toMatchObject({
      reason: "body_too_large",
    });
    const declared = new Request("https://app.example.test/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "100" },
      body: "{}",
    });
    await expect(readApiJsonBody(declared, 8)).rejects.toMatchObject({
      reason: "body_too_large",
    });
  });
  it("rejects invalid or unbounded server-owned overrides", async () => {
    for (const limit of [0, -1, NaN, 9 * 1024 * 1024, 1.5])
      await expect(
        readApiJsonBody(
          new Request("https://app.example.test/revision"),
          limit,
        ),
      ).rejects.toBeInstanceOf(TypeError);
  });
  it("accepts an exact trusted same-origin request", () => {
    const request = new Request(
      "https://app.example.test/api/v1/settings/workspace",
      {
        method: "PATCH",

        headers: {
          Origin: "https://app.example.test",
        },
      },
    );

    expect(
      createMutationOriginProblemResponse(
        request,
        "11111111-1111-4111-8111-111111111111",
        "https://app.example.test",
      ),
    ).toBeNull();
  });

  it("rejects a missing or foreign mutation origin", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";

    const missing = createMutationOriginProblemResponse(
      new Request("https://app.example.test/api/v1/settings/workspace", {
        method: "PATCH",
      }),
      requestId,
      "https://app.example.test",
    );

    expect(missing?.status).toBe(403);

    await expect(missing?.json()).resolves.toMatchObject({
      code: "FORBIDDEN_ORIGIN",
      requestId,
    });

    const foreign = createMutationOriginProblemResponse(
      new Request("https://app.example.test/api/v1/settings/workspace", {
        method: "PATCH",

        headers: {
          Origin: "https://foreign.example.test",
        },
      }),
      requestId,
      "https://app.example.test",
    );

    expect(foreign?.status).toBe(403);
  });

  it("parses an application/json body", async () => {
    const request = new Request(
      "https://app.example.test/api/v1/settings/workspace",
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          value: true,
        }),
      },
    );

    await expect(readApiJsonBody(request)).resolves.toEqual({
      value: true,
    });
  });

  it("rejects missing JSON media type", async () => {
    const request = new Request(
      "https://app.example.test/api/v1/settings/workspace",
      {
        method: "PATCH",

        body: "{}",
      },
    );

    await expect(readApiJsonBody(request)).rejects.toMatchObject({
      reason: "unsupported_media_type",
    });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request(
      "https://app.example.test/api/v1/settings/workspace",
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: "{",
      },
    );

    await expect(readApiJsonBody(request)).rejects.toMatchObject({
      reason: "malformed_json",
    });
  });

  it("rejects JSON command bodies above the configured limit", async () => {
    const request = new Request(
      "https://app.example.test/api/v1/settings/workspace",
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          value: "x".repeat(API_V1_JSON_BODY_MAX_BYTES),
        }),
      },
    );

    await expect(readApiJsonBody(request)).rejects.toMatchObject({
      reason: "body_too_large",
    });
  });
});
