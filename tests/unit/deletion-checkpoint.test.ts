import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publishDeletionCheckpoint } from "@/platform/lifecycle/publish-deletion-checkpoint";
describe("independent pre-purge checkpoint", () => {
  const record = {
    schemaVersion: 1 as const,
    requestId: randomUUID(),
    targetUserId: randomUUID(),
    targetWorkspaceId: randomUUID(),
    requestedAt: "2026-10-01T00:00:00.000Z",
    purgeAfter: "2026-10-08T00:00:00.000Z",
  };
  it("publishes stable minimal evidence and verifies readable content before purge can proceed", async () => {
    const objects = new Map<string, Buffer>();
    const store = {
      async putOnce(key: string, body: Buffer) {
        if (objects.has(key)) expect(objects.get(key)).toEqual(body);
        else objects.set(key, body);
      },
      async read(key: string) {
        return objects.get(key)!;
      },
    };
    await publishDeletionCheckpoint(record, store);
    await publishDeletionCheckpoint(record, store);
    expect(objects.size).toBe(1);
    expect([...objects.values()][0]!.toString()).toBe(JSON.stringify(record));
  });
  it("fails closed on publication failure, mismatched readback and unapproved private fields", async () => {
    await expect(
      publishDeletionCheckpoint(record, {
        async putOnce() {
          throw new Error("offline");
        },
        async read() {
          return Buffer.alloc(0);
        },
      }),
    ).rejects.toThrow("offline");
    await expect(
      publishDeletionCheckpoint(record, {
        async putOnce() {},
        async read() {
          return Buffer.alloc(0);
        },
      }),
    ).rejects.toThrow("verification failed");
    await expect(
      publishDeletionCheckpoint(
        { ...record, email: "private@example.test" } as typeof record,
        {
          async putOnce() {},
          async read() {
            return Buffer.alloc(0);
          },
        },
      ),
    ).rejects.toThrow();
  });
});
