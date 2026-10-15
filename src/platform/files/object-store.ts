import { localTestEvidenceStore } from "./local-test-adapters";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  GetBucketVersioningCommand,
  GetPublicAccessBlockCommand,
  GetBucketPolicyStatusCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import {
  FILE_LIMIT_BYTES,
  FileBoundaryError,
  readBoundedBody,
  sha256,
} from "@/modules/files/domain/supporting-file";

export interface PrivateEvidenceStore {
  readonly namespace?: string;
  putOnce(key: string, body: Buffer, signal?: AbortSignal): Promise<void>;
  read(key: string, signal?: AbortSignal): Promise<Buffer>;
  delete(key: string, signal?: AbortSignal): Promise<void>;
}
const keySchema = z.string().regex(/^evidence\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/);
export const evidenceStoreConfigSchema = z.object({
  FILES_STORAGE_ENABLED: z.literal("true"),
  FILES_S3_BUCKET: z.string().min(3).max(63),
  FILES_S3_REGION: z.string().min(1),
  FILES_S3_ENDPOINT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.url({ protocol: /^https$/ }).optional(),
  ),
  FILES_S3_ACCESS_KEY_ID: z.string().min(1),
  FILES_S3_SECRET_ACCESS_KEY: z.string().min(1),
});

/** A dedicated identity only: never fall back to default/backup credentials.
 * Bucket privacy and immutable conditional writes remain operational gates.
 * No public URLs, browser-provided keys, ACLs or signed URLs are returned. */
export function createPrivateEvidenceStore(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PrivateEvidenceStore {
  if (env.FILES_TEST_ADAPTER_DIR) {
    if (env.PMP_DEPLOYMENT_ENV !== "local")
      throw new FileBoundaryError("FILE_TEST_ADAPTER_FORBIDDEN");
    return localTestEvidenceStore();
  }
  const parsed = evidenceStoreConfigSchema.safeParse(env);
  if (!parsed.success) throw new FileBoundaryError("FILE_STORAGE_UNAVAILABLE");
  const c = parsed.data;
  if (
    c.FILES_S3_BUCKET === env.BACKUP_S3_BUCKET ||
    c.FILES_S3_ACCESS_KEY_ID === env.BACKUP_S3_ACCESS_KEY_ID ||
    c.FILES_S3_ACCESS_KEY_ID === env.AWS_ACCESS_KEY_ID
  )
    throw new FileBoundaryError("FILE_STORAGE_IDENTITY_NOT_SEPARATE");
  const client = new S3Client({
    region: c.FILES_S3_REGION,
    ...(c.FILES_S3_ENDPOINT ? { endpoint: c.FILES_S3_ENDPOINT } : {}),
    credentials: {
      accessKeyId: c.FILES_S3_ACCESS_KEY_ID,
      secretAccessKey: c.FILES_S3_SECRET_ACCESS_KEY,
    },
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30_000 },
  });
  const deadline = (signal?: AbortSignal) => ({
    abortSignal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });
  async function verifyBucket(signal?: AbortSignal) {
    try {
      const [versioning, access, policy] = await Promise.all([
        client.send(
          new GetBucketVersioningCommand({ Bucket: c.FILES_S3_BUCKET }),
          deadline(signal),
        ),
        client.send(
          new GetPublicAccessBlockCommand({ Bucket: c.FILES_S3_BUCKET }),
          deadline(signal),
        ),
        client.send(
          new GetBucketPolicyStatusCommand({ Bucket: c.FILES_S3_BUCKET }),
          deadline(signal),
        ),
      ]);
      const p = access.PublicAccessBlockConfiguration;
      // Versioned cleanup needs a separate inventory/deletion contract. Do
      // not mistake DeleteObject's marker for actual erasure.
      if (
        versioning.Status ||
        !p?.BlockPublicAcls ||
        !p.IgnorePublicAcls ||
        !p.BlockPublicPolicy ||
        !p.RestrictPublicBuckets ||
        policy.PolicyStatus?.IsPublic !== false
      )
        throw new Error("Unavailable private bucket contract.");
    } catch {
      throw new FileBoundaryError("FILE_STORAGE_POLICY_UNVERIFIED");
    }
  }
  return {
    namespace: sha256(
      Buffer.from(
        JSON.stringify([
          c.FILES_S3_BUCKET,
          c.FILES_S3_REGION,
          c.FILES_S3_ENDPOINT ?? "",
        ]),
      ),
    ),
    async putOnce(key, body, signal) {
      keySchema.parse(key);
      if (body.length < 1 || body.length > FILE_LIMIT_BYTES)
        throw new FileBoundaryError("FILE_TOO_LARGE");
      await verifyBucket(signal);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: c.FILES_S3_BUCKET,
            Key: key,
            Body: body,
            IfNoneMatch: "*",
            ContentType: "application/octet-stream",
            ServerSideEncryption: "AES256",
            ChecksumSHA256: Buffer.from(sha256(body), "hex").toString("base64"),
          }),
          deadline(signal),
        );
      } catch {
        // A lost receipt/412 is not assumed successful; the caller must read
        // and compare exact bytes before accepting any retry.
        throw new FileBoundaryError("FILE_STORAGE_WRITE_UNCONFIRMED");
      }
    },
    async read(key, signal) {
      keySchema.parse(key);
      await verifyBucket(signal);
      try {
        const r = await client.send(
          new GetObjectCommand({
            Bucket: c.FILES_S3_BUCKET,
            Key: key,
            ChecksumMode: "ENABLED",
          }),
          deadline(signal),
        );
        if (
          !r.Body ||
          !Number.isSafeInteger(r.ContentLength) ||
          r.ContentLength! < 1 ||
          r.ContentLength! > FILE_LIMIT_BYTES ||
          !["AES256", "aws:kms", "aws:kms:dsse"].includes(
            r.ServerSideEncryption ?? "",
          ) ||
          !r.ChecksumSHA256
        )
          throw new FileBoundaryError("FILE_STORAGE_READ_INVALID");
        const body = await readBoundedBody(
          r.Body.transformToWebStream(),
          r.ContentLength!,
          signal
            ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
            : AbortSignal.timeout(30_000),
        );
        if (
          body.length !== r.ContentLength ||
          Buffer.from(sha256(body), "hex").toString("base64") !==
            r.ChecksumSHA256
        )
          throw new FileBoundaryError("FILE_SIZE_MISMATCH");
        return body;
      } catch {
        throw new FileBoundaryError("FILE_STORAGE_READ_UNCONFIRMED");
      }
    },
    async delete(key, signal) {
      keySchema.parse(key);
      await verifyBucket(signal);
      try {
        // Release configuration must prohibit bucket versioning or inventory
        // every version. A delete marker is not proof that bytes were erased.
        await client.send(
          new DeleteObjectCommand({ Bucket: c.FILES_S3_BUCKET, Key: key }),
          deadline(signal),
        );
      } catch {
        throw new FileBoundaryError("FILE_STORAGE_DELETE_UNCONFIRMED");
      }
    },
  };
}
