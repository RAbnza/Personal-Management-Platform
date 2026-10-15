import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { sha256 } from "@/modules/files/domain/supporting-file";
import { createClamScanner } from "@/platform/files/malware-scanner";
const { send, constructed } = vi.hoisted(() => ({
  send: vi.fn(),
  constructed: vi.fn(),
}));
vi.mock("@aws-sdk/client-s3", async (original) => {
  const actual = await original<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      constructor(config: unknown) {
        constructed(config);
      }
      send = send;
    },
  };
});
import { createPrivateEvidenceStore } from "@/platform/files/object-store";
afterEach(() => {
  send.mockReset();
  constructed.mockReset();
});
const config = {
  FILES_STORAGE_ENABLED: "true",
  FILES_S3_BUCKET: "private-test-evidence",
  FILES_S3_REGION: "test-region",
  FILES_S3_ACCESS_KEY_ID: "test-evidence-key",
  FILES_S3_SECRET_ACCESS_KEY: "synthetic-secret",
};
const key = `evidence/${randomUUID()}/${randomUUID()}`;
function privateResponses() {
  send.mockImplementation(
    async (command: { constructor: { name: string } }) => {
      switch (command.constructor.name) {
        case "GetBucketVersioningCommand":
          return {};
        case "GetPublicAccessBlockCommand":
          return {
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              IgnorePublicAcls: true,
              BlockPublicPolicy: true,
              RestrictPublicBuckets: true,
            },
          };
        case "GetBucketPolicyStatusCommand":
          return { PolicyStatus: { IsPublic: false } };
        default:
          return {};
      }
    },
  );
}
it("does not fall back to default/backup credentials or accept insecure endpoints", () => {
  expect(() => createPrivateEvidenceStore({})).toThrow(
    "FILE_STORAGE_UNAVAILABLE",
  );
  expect(() =>
    createPrivateEvidenceStore({
      ...config,
      BACKUP_S3_BUCKET: config.FILES_S3_BUCKET,
    }),
  ).toThrow("FILE_STORAGE_IDENTITY_NOT_SEPARATE");
  expect(() =>
    createPrivateEvidenceStore({
      ...config,
      BACKUP_S3_ACCESS_KEY_ID: config.FILES_S3_ACCESS_KEY_ID,
    }),
  ).toThrow("FILE_STORAGE_IDENTITY_NOT_SEPARATE");
  expect(() =>
    createPrivateEvidenceStore({
      ...config,
      FILES_S3_ENDPOINT: "http://public.test",
    }),
  ).toThrow("FILE_STORAGE_UNAVAILABLE");
  expect(constructed).not.toHaveBeenCalled();
});
it("rejects reuse of the default AWS identity used by the independent backup adapter", () => {
  expect(() =>
    createPrivateEvidenceStore({
      ...config,
      AWS_ACCESS_KEY_ID: config.FILES_S3_ACCESS_KEY_ID,
    }),
  ).toThrow("FILE_STORAGE_IDENTITY_NOT_SEPARATE");
  expect(constructed).not.toHaveBeenCalled();
});
it("uses opaque keys, immutable conditional writes, encryption and exact checksums", async () => {
  privateResponses();
  const store = createPrivateEvidenceStore(config),
    bytes = Buffer.from("test");
  await store.putOnce(key, bytes);
  const call = send.mock.calls.find(
    (c) => c[0]!.constructor.name === "PutObjectCommand",
  )![0]!;
  expect(call.input).toMatchObject({
    Key: key,
    Bucket: config.FILES_S3_BUCKET,
    Body: bytes,
    IfNoneMatch: "*",
    ServerSideEncryption: "AES256",
    ChecksumSHA256: Buffer.from(sha256(bytes), "hex").toString("base64"),
  });
  expect(call.input.ACL).toBeUndefined();
  expect(constructed.mock.calls[0]![0]!.credentials).toEqual({
    accessKeyId: config.FILES_S3_ACCESS_KEY_ID,
    secretAccessKey: config.FILES_S3_SECRET_ACCESS_KEY,
  });
  await expect(store.read("../../private")).rejects.toThrow();
});
it.each(["Enabled", "Suspended"])(
  "refuses %s versioning rather than mistaking a deletion marker for cleanup",
  async (Status) => {
    privateResponses();
    const old = send.getMockImplementation()!;
    send.mockImplementation(async (c) =>
      c.constructor.name === "GetBucketVersioningCommand" ? { Status } : old(c),
    );
    await expect(
      createPrivateEvidenceStore(config).delete(key),
    ).rejects.toThrow("FILE_STORAGE_POLICY_UNVERIFIED");
    expect(
      send.mock.calls.some(
        (c) => c[0]!.constructor.name === "DeleteObjectCommand",
      ),
    ).toBe(false);
  },
);
it("fails closed for missing/private-policy errors and hides provider diagnostics", async () => {
  send.mockRejectedValue(new Error("sensitive provider details"));
  await expect(
    createPrivateEvidenceStore(config).putOnce(key, Buffer.from("test")),
  ).rejects.toThrow("FILE_STORAGE_POLICY_UNVERIFIED");
  privateResponses();
  const old = send.getMockImplementation()!;
  send.mockImplementation(async (c) =>
    c.constructor.name === "GetBucketPolicyStatusCommand"
      ? { PolicyStatus: { IsPublic: true } }
      : old(c),
  );
  await expect(createPrivateEvidenceStore(config).read(key)).rejects.toThrow(
    "FILE_STORAGE_POLICY_UNVERIFIED",
  );
});
it("bounds actual S3 stream bytes and does not infer successful writes from conflicts", async () => {
  privateResponses();
  const old = send.getMockImplementation()!;
  send.mockImplementation(async (c) => {
    if (c.constructor.name === "GetObjectCommand")
      return {
        ContentLength: 1,
        ServerSideEncryption: "AES256",
        Body: { transformToWebStream: () => new Blob(["longer"]).stream() },
      };
    if (c.constructor.name === "PutObjectCommand")
      throw {
        $metadata: { httpStatusCode: 412 },
        message: "private provider detail",
      };
    return old(c);
  });
  const store = createPrivateEvidenceStore(config);
  await expect(store.read(key)).rejects.toThrow(
    "FILE_STORAGE_READ_UNCONFIRMED",
  );
  await expect(store.putOnce(key, Buffer.from("test"))).rejects.toThrow(
    "FILE_STORAGE_WRITE_UNCONFIRMED",
  );
});
it("accepts an encrypted exact-byte read and rejects a stored checksum mismatch", async () => {
  privateResponses();
  const old = send.getMockImplementation()!;
  const body = Buffer.from("bounded evidence");
  let checksum = Buffer.from(sha256(body), "hex").toString("base64");
  send.mockImplementation(async (c) =>
    c.constructor.name === "GetObjectCommand"
      ? {
          ContentLength: body.length,
          ServerSideEncryption: "AES256",
          ChecksumSHA256: checksum,
          Body: { transformToWebStream: () => new Blob([body]).stream() },
        }
      : old(c),
  );
  const store = createPrivateEvidenceStore({
    ...config,
    FILES_S3_ENDPOINT: "",
  });
  expect(await store.read(key)).toEqual(body);
  checksum = Buffer.alloc(32).toString("base64");
  await expect(store.read(key)).rejects.toThrow(
    "FILE_STORAGE_READ_UNCONFIRMED",
  );
});

async function withScanner(
  version: string,
  result: string,
  fn: (port: number, bodies: Buffer[]) => Promise<void>,
) {
  const bodies: Buffer[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0),
      command: string | null = null;
    const parts: Buffer[] = [];
    socket.on("data", (bytes) => {
      buffer = Buffer.concat([buffer, bytes]);
      if (command === null) {
        const end = buffer.indexOf(0);
        if (end < 0) return;
        command = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 1);
        if (command === "zVERSION") {
          socket.end(Buffer.from(version + "\0"));
          return;
        }
      }
      if (command !== "zINSTREAM") return;
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE();
        if (buffer.length < 4 + length) break;
        if (length === 0) {
          bodies.push(Buffer.concat(parts));
          socket.end(Buffer.from(result + "\0"));
          return;
        }
        parts.push(Buffer.from(buffer.subarray(4, 4 + length)));
        buffer = buffer.subarray(4 + length);
      }
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as import("node:net").AddressInfo).port;
  try {
    await fn(port, bodies);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((ok, fail) =>
      server.close((e) => (e ? fail(e) : ok())),
    );
  }
}
const scanner = (port: number) =>
  createClamScanner({
    FILES_SCAN_ENABLED: "true",
    FILES_CLAMD_HOST: "127.0.0.1",
    FILES_CLAMD_PORT: String(port),
    FILES_CLAMD_TIMEZONE: "UTC",
  });
it("fails closed without scanner configuration", () => {
  expect(() => createClamScanner({})).toThrow("FILE_SCANNER_UNAVAILABLE");
  expect(() =>
    createClamScanner({
      FILES_SCAN_ENABLED: "false",
      FILES_CLAMD_HOST: "127.0.0.1",
      FILES_CLAMD_PORT: "3310",
    }),
  ).toThrow();
});
it("streams exact bytes over bounded INSTREAM frames and records scan evidence", async () => {
  const body = Buffer.alloc(130_000, 17);
  await withScanner(
    `ClamAV 1.4.3/27999/${new Date().toUTCString()}`,
    "stream: OK",
    async (port, bodies) => {
      expect(await scanner(port).scan(body)).toMatchObject({
        result: "passed",
        engineVersion: "ClamAV 1.4.3",
        checksumSha256: sha256(body),
      });
      expect(bodies).toEqual([body]);
    },
  );
});
it("reports infected content without storing provider signature text", async () => {
  await withScanner(
    `ClamAV 1.4.3/27999/${new Date().toUTCString()}`,
    "stream: Synthetic.Signature FOUND",
    async (port) => {
      const result = await scanner(port).scan(
        Buffer.from("synthetic-infected"),
      );
      expect(result.result).toBe("infected");
      expect(JSON.stringify(result)).not.toContain("Synthetic.Signature");
    },
  );
});
it.each(["stale", "unknown", "oversized"])(
  "rejects %s scanner evidence",
  async (kind) => {
    const version =
      kind === "stale"
        ? "ClamAV 1.4.3/27999/Thu, 01 Jan 2026 00:00:00 GMT"
        : kind === "oversized"
          ? "x".repeat(1100)
          : "unknown";
    await withScanner(version, "stream: OK", async (port, bodies) => {
      await expect(scanner(port).scan(Buffer.from("test"))).rejects.toThrow();
      expect(bodies).toHaveLength(0);
    });
  },
);
it("rejects scanner errors instead of assuming clean", async () => {
  await withScanner(
    `ClamAV 1.4.3/27999/${new Date().toUTCString()}`,
    "stream: size limit exceeded ERROR",
    async (port) => {
      await expect(scanner(port).scan(Buffer.from("test"))).rejects.toThrow(
        "FILE_SCANNER_RESULT_INVALID",
      );
    },
  );
});
