import { beforeEach, expect, it, vi } from "vitest";
const { send, constructors } = vi.hoisted(() => ({
  send: vi.fn(),
  constructors: vi.fn(),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(input: unknown) {
      constructors(input);
    }
    send = send;
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
import { createBackupObjectStore } from "@/platform/backup/object-store";
beforeEach(() => {
  send.mockReset();
  constructors.mockClear();
  vi.stubEnv("BACKUP_S3_BUCKET", "synthetic-private-backup");
  vi.stubEnv("BACKUP_S3_REGION", "ap-southeast-1");
  vi.stubEnv("BACKUP_S3_KMS_KEY_ID", "synthetic-independent-key");
});
const object = (body: Buffer) => ({
  ServerSideEncryption: "aws:kms",
  ContentLength: body.length,
  Body: { transformToByteArray: async () => body },
});
it("publishes conditionally with exact SHA256 and verifies encrypted readback", async () => {
  const body = Buffer.from("synthetic checkpoint");
  send.mockResolvedValueOnce({}).mockResolvedValueOnce(object(body));
  await createBackupObjectStore().putOnce(
    "v1-deletion-register/synthetic.json",
    body,
  );
  expect(constructors).toHaveBeenCalledWith(
    expect.objectContaining({
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
    }),
  );
  expect(send.mock.calls[0]![0].input).toMatchObject({
    IfNoneMatch: "*",
    ServerSideEncryption: "aws:kms",
    SSEKMSKeyId: "synthetic-independent-key",
    Body: body,
    ChecksumSHA256: "2U8VKRKJSwgL16N30sHBzFNb1dGTGwCC87Zoq2CKii4=",
  });
  expect(send.mock.calls[0]![1].abortSignal).toBeInstanceOf(AbortSignal);
});
it("a preexisting object must exactly match; a conflict cannot authorize purge", async () => {
  send
    .mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 } })
    .mockResolvedValueOnce(object(Buffer.from("changed checkpoint")));
  await expect(
    createBackupObjectStore().putOnce(
      "synthetic",
      Buffer.from("original checkpoint"),
    ),
  ).rejects.toThrow("content mismatch");
});
it.each([
  { ServerSideEncryption: "AES256", ContentLength: 1 },
  { ServerSideEncryption: "aws:kms", ContentLength: 258 * 1024 * 1024 },
  { ServerSideEncryption: "aws:kms", ContentLength: undefined },
])(
  "rejects unavailable encryption or unbounded readback before allocating bytes: %j",
  async (metadata) => {
    const read = vi.fn();
    send.mockResolvedValueOnce({
      ...metadata,
      Body: { transformToByteArray: read },
    });
    await expect(createBackupObjectStore().read("synthetic")).rejects.toThrow(
      "unavailable",
    );
    expect(read).not.toHaveBeenCalled();
  },
);
