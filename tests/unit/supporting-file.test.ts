import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  FILE_LIMIT_BYTES,
  WORKSPACE_FILE_QUOTA_BYTES,
  assertFileQuota,
  assertScannedContent,
  fileDownloadHeaders,
  readBoundedBody,
  sha256,
  supportingUploadSchema,
  verifySupportingContent,
} from "@/modules/files/domain/supporting-file";
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHAAAAABJRU5ErkJggg==",
  "base64",
);
const upload = {
  clientCommandId: randomUUID(),
  sourceKind: "financial_action",
  sourceId: randomUUID(),
  originalFilename: "receipt.pdf",
  declaredMime: "application/pdf",
  declaredBytes: pdf.length,
};
describe("private supporting-file boundaries", () => {
  it.each([
    "financial_action",
    "debt",
    "debt_settlement",
    "reconciliation",
    "card_statement_revision",
    "job_application",
    "application_event",
    "resume_version",
  ])("accepts the concrete %s source contract", (sourceKind) => {
    expect(
      supportingUploadSchema.parse({ ...upload, sourceKind }).sourceKind,
    ).toBe(sourceKind);
  });
  it.each(["group_expense", "tracker_entry", "card_statement", "resume"])(
    "rejects unsupported or mutable source %s",
    (sourceKind) => {
      expect(() =>
        supportingUploadSchema.parse({ ...upload, sourceKind }),
      ).toThrow();
    },
  );
  it.each([
    "../receipt.pdf",
    "receipt\\file.pdf",
    "receipt\r\n.pdf",
    "receipt\0.pdf",
  ])("rejects unsafe filename %s", (originalFilename) => {
    expect(() =>
      supportingUploadSchema.parse({ ...upload, originalFilename }),
    ).toThrow();
  });
  it("rejects caller storage, ownership and scan claims", () => {
    for (const extra of [
      { workspaceId: randomUUID() },
      { objectKey: "arbitrary" },
      { available: true },
      { scanResult: "passed" },
    ])
      expect(() =>
        supportingUploadSchema.parse({ ...upload, ...extra }),
      ).toThrow();
  });
  it("checks exact quota boundaries without numeric rounding", () => {
    assertFileQuota(
      BigInt(WORKSPACE_FILE_QUOTA_BYTES - FILE_LIMIT_BYTES),
      FILE_LIMIT_BYTES,
    );
    expect(() =>
      assertFileQuota(BigInt(WORKSPACE_FILE_QUOTA_BYTES), 1),
    ).toThrow("FILE_QUOTA_EXCEEDED");
    expect(() => assertFileQuota(-1n, 1)).toThrow();
    expect(() => assertFileQuota(0n, FILE_LIMIT_BYTES + 1)).toThrow();
  });
  it.each([
    [pdf, "application/pdf"],
    [png, "image/png"],
    [Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0]), "image/jpeg"],
  ] as const)(
    "detects actual content and exact checksum",
    async (bytes, mime) => {
      expect(await verifySupportingContent(bytes, bytes.length, mime)).toEqual({
        actualBytes: bytes.length,
        verifiedMime: mime,
        checksumSha256: sha256(bytes),
      });
    },
  );
  it("does not trust claimed MIME or declared size", async () => {
    await expect(
      verifySupportingContent(pdf, pdf.length, "image/png"),
    ).rejects.toThrow("FILE_TYPE_MISMATCH");
    await expect(
      verifySupportingContent(pdf, pdf.length + 1, "application/pdf"),
    ).rejects.toThrow("FILE_SIZE_MISMATCH");
    await expect(
      verifySupportingContent(
        Buffer.from("<script>bad</script>"),
        20,
        "application/pdf",
      ),
    ).rejects.toThrow();
  });
  it("cancels oversized streaming input before consuming the remainder", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(Buffer.alloc(6));
        c.enqueue(Buffer.alloc(6));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readBoundedBody(body, 10)).rejects.toThrow("FILE_TOO_LARGE");
    expect(cancelled).toBe(true);
  });
  it("accepts an exact bounded stream and rejects empty or aborted reads", async () => {
    expect(await readBoundedBody(new Blob([pdf]).stream(), pdf.length)).toEqual(
      pdf,
    );
    await expect(readBoundedBody(new Blob([]).stream(), 1)).rejects.toThrow(
      "FILE_EMPTY",
    );
    await expect(
      readBoundedBody(
        new Blob([pdf]).stream(),
        pdf.length,
        AbortSignal.abort(),
      ),
    ).rejects.toThrow();
    await expect(readBoundedBody(null, 1)).rejects.toThrow();
  });
  it("requires fresh, matching, affirmative scan evidence", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const evidence = {
      result: "passed" as const,
      engineVersion: "ClamAV 1.4.3",
      signaturesUpdatedAt: now.toISOString(),
      checksumSha256: sha256(pdf),
    };
    assertScannedContent(sha256(pdf), evidence, now);
    expect(() =>
      assertScannedContent(
        sha256(pdf),
        { ...evidence, result: "infected" },
        now,
      ),
    ).toThrow("FILE_SCAN_REJECTED");
    expect(() => assertScannedContent(sha256(png), evidence, now)).toThrow(
      "FILE_SCAN_CHECKSUM_MISMATCH",
    );
    expect(() =>
      assertScannedContent(
        sha256(pdf),
        { ...evidence, signaturesUpdatedAt: "2026-10-13T11:59:59Z" },
        now,
      ),
    ).toThrow("FILE_SCANNER_STALE");
    expect(() =>
      assertScannedContent(
        sha256(pdf),
        { ...evidence, signaturesUpdatedAt: "2026-10-15T12:06:00Z" },
        now,
      ),
    ).toThrow("FILE_SCANNER_STALE");
  });
  it("uses attachment-only, generic, no-store download headers", () => {
    expect(fileDownloadHeaders("application/pdf")).toMatchObject({
      "Content-Disposition": 'attachment; filename="supporting-evidence"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    expect(() => fileDownloadHeaders("text/html")).toThrow();
  });
});
