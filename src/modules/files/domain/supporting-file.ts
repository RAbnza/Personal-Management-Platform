import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";

export const FILE_LIMIT_BYTES = 10 * 1024 * 1024;
export const WORKSPACE_FILE_QUOTA_BYTES = 1024 * 1024 * 1024;
export const supportingSourceSchema = z.enum([
  "financial_action",
  "debt",
  "debt_settlement",
  "reconciliation",
  "card_statement_revision",
  "job_application",
  "application_event",
  "resume_version",
]);
export const supportingMimeSchema = z.enum([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
export const supportingUploadSchema = z
  .object({
    clientCommandId: z.uuid(),
    sourceKind: supportingSourceSchema,
    sourceId: z.uuid(),
    originalFilename: z
      .string()
      .min(1)
      .max(200)
      .refine((s) => !/[\x00-\x1f\x7f/\\]/.test(s)),
    declaredMime: supportingMimeSchema,
    declaredBytes: z.number().int().min(1).max(FILE_LIMIT_BYTES),
  })
  .strict();
export type SupportingUpload = z.infer<typeof supportingUploadSchema>;
export type FileStatus =
  | "pending_upload"
  | "quarantined"
  | "available"
  | "rejected"
  | "deleting"
  | "deleted";
export class FileBoundaryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "FileBoundaryError";
  }
}
export const sha256 = (body: Uint8Array) =>
  createHash("sha256").update(body).digest("hex");

/** Caller must serialize this reservation under a workspace lock. This does
 * not reserve capacity or authorize a source by itself. */
export function assertFileQuota(reservedBytes: bigint, declaredBytes: number) {
  z.number().int().min(1).max(FILE_LIMIT_BYTES).parse(declaredBytes);
  if (
    reservedBytes < 0n ||
    reservedBytes + BigInt(declaredBytes) > BigInt(WORKSPACE_FILE_QUOTA_BYTES)
  )
    throw new FileBoundaryError("FILE_QUOTA_EXCEEDED");
}

/** Bound while reading, including bodies whose Content-Length is absent or
 * false. Cancellation avoids continuing to consume an oversized request. */
export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > FILE_LIMIT_BYTES ||
    !body
  )
    throw new FileBoundaryError("FILE_BODY_INVALID");
  const reader = body.getReader();
  const parts: Buffer[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = await reader.read();
      signal?.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new FileBoundaryError("FILE_TOO_LARGE");
      parts.push(Buffer.from(next.value));
    }
    if (size === 0) throw new FileBoundaryError("FILE_EMPTY");
    return Buffer.concat(parts, size);
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function verifySupportingContent(
  body: Buffer,
  declaredBytes: number,
  declaredMime: string,
) {
  z.number().int().min(1).max(FILE_LIMIT_BYTES).parse(declaredBytes);
  supportingMimeSchema.parse(declaredMime);
  if (body.byteLength !== declaredBytes)
    throw new FileBoundaryError("FILE_SIZE_MISMATCH");
  // Detection only needs a bounded prefix; it is not a safety verdict.
  let detected;
  try {
    detected = await fileTypeFromBuffer(body.subarray(0, 8192));
  } catch {
    throw new FileBoundaryError("FILE_TYPE_INVALID");
  }
  if (
    !detected ||
    !supportingMimeSchema.safeParse(detected.mime).success ||
    detected.mime !== declaredMime
  )
    throw new FileBoundaryError("FILE_TYPE_MISMATCH");
  return {
    actualBytes: body.byteLength,
    verifiedMime: detected.mime,
    checksumSha256: sha256(body),
  };
}

export const scanEvidenceSchema = z
  .object({
    engineVersion: z.string().regex(/^ClamAV [0-9.]{3,30}$/),
    signaturesUpdatedAt: z.iso.datetime(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    result: z.enum(["passed", "infected"]),
  })
  .strict();
export type ScanEvidence = z.infer<typeof scanEvidenceSchema>;

/** No default "clean" result; fresh, exact-byte scan evidence is mandatory.
 * This is a validation boundary, not a database availability command. */
export function assertScannedContent(
  checksum: string,
  evidence: ScanEvidence,
  now = new Date(),
) {
  const parsed = scanEvidenceSchema.parse(evidence);
  const age = now.getTime() - Date.parse(parsed.signaturesUpdatedAt);
  if (age < -5 * 60_000 || age > 48 * 60 * 60_000 || !Number.isFinite(age))
    throw new FileBoundaryError("FILE_SCANNER_STALE");
  if (parsed.checksumSha256 !== checksum)
    throw new FileBoundaryError("FILE_SCAN_CHECKSUM_MISMATCH");
  if (parsed.result !== "passed")
    throw new FileBoundaryError("FILE_SCAN_REJECTED");
}

export function fileDownloadHeaders(mime: string) {
  supportingMimeSchema.parse(mime);
  return {
    "Content-Type": mime,
    "Content-Disposition": 'attachment; filename="supporting-evidence"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Referrer-Policy": "no-referrer",
  };
}
