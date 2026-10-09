import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { z } from "zod";
export interface BackupObjectStore {
  putOnce(key: string, body: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
}
/** Dedicated operator identity, separate from web/auth/domain credentials.
 * Bucket privacy, independent provider, retention and key recovery are verified
 * deployment gates, not guarantees inferred from a successful PutObject. */
export function createBackupObjectStore(): BackupObjectStore {
  const env = z
    .object({
      BACKUP_S3_BUCKET: z.string().min(3),
      BACKUP_S3_REGION: z.string().min(1),
      BACKUP_S3_KMS_KEY_ID: z.string().min(1),
    })
    .parse(process.env);
  const client = new S3Client({
    region: env.BACKUP_S3_REGION,
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
  });
  async function read(key: string) {
    const result = await client.send(
      new GetObjectCommand({ Bucket: env.BACKUP_S3_BUCKET, Key: key }),
      { abortSignal: AbortSignal.timeout(60000) },
    );
    if (
      result.ServerSideEncryption !== "aws:kms" ||
      !result.Body ||
      !Number.isSafeInteger(result.ContentLength) ||
      result.ContentLength! < 1 ||
      result.ContentLength! > 257 * 1024 * 1024
    )
      throw new Error("Encrypted independent object unavailable.");
    return Buffer.from(await result.Body.transformToByteArray());
  }
  return {
    read,
    async putOnce(key, body) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.BACKUP_S3_BUCKET,
            Key: key,
            Body: body,
            IfNoneMatch: "*",
            ServerSideEncryption: "aws:kms",
            SSEKMSKeyId: env.BACKUP_S3_KMS_KEY_ID,
            ChecksumSHA256: createHash("sha256").update(body).digest("base64"),
          }),
          { abortSignal: AbortSignal.timeout(60000) },
        );
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode !== 412
        )
          throw new Error("Independent checkpoint publication failed.");
      }
      const persisted = await read(key);
      if (!persisted.equals(body))
        throw new Error("Independent checkpoint content mismatch.");
    },
  };
}
