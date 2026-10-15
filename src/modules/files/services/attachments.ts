import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  withDomainTransaction,
  type ScopedDatabaseContext,
  type ScopedTransaction,
} from "@/platform/db";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  supportingUploadSchema,
  supportingSourceSchema,
  FileBoundaryError,
  assertFileQuota,
  verifySupportingContent,
  sha256,
  type SupportingUpload,
} from "../domain/supporting-file";
import {
  createPrivateEvidenceStore,
  type PrivateEvidenceStore,
} from "@/platform/files/object-store";
export const sources = {
  financial_action: [
    "finance.financial_action",
    "files.action_attachment",
    "action_id",
  ],
  debt: ["finance.debt", "files.debt_attachment", "debt_id"],
  debt_settlement: [
    "finance.debt_settlement",
    "files.settlement_attachment",
    "settlement_id",
  ],
  reconciliation: [
    "finance.reconciliation",
    "files.reconciliation_attachment",
    "reconciliation_id",
  ],
  card_statement_revision: [
    "finance.card_statement_revision",
    "files.card_statement_attachment",
    "card_statement_revision_id",
  ],
  job_application: [
    "career.job_application",
    "files.application_attachment",
    "application_id",
  ],
  application_event: [
    "career.application_event",
    "files.application_event_attachment",
    "application_event_id",
  ],
  resume_version: [
    "career.resume_version",
    "files.resume_attachment",
    "resume_version_id",
  ],
} as const;
const trusted = (s: string) =>
  sql.raw(
    s
      .split(".")
      .map((p) => `"${p}"`)
      .join("."),
  );
export async function assertAttachmentSource(
  tx: ScopedTransaction,
  kind: string,
  id: string,
) {
  const k = supportingSourceSchema.parse(kind);
  z.uuid().parse(id);
  if (
    !(
      await tx.db.execute(
        sql`SELECT id FROM ${trusted(sources[k][0])} WHERE id=${id}::uuid`,
      )
    ).rows[0]
  )
    throw new FileBoundaryError("FILE_SOURCE_UNAVAILABLE");
  return k;
}
async function audit(
  tx: ScopedTransaction,
  a: ScopedDatabaseContext,
  receiptId: string,
  id: string,
  version: number,
  operation: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await createPrivateRevision(tx, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: receiptId,
    subjectKind: "private_attachment",
    subjectId: id,
    subjectVersion: version,
    operation,
    beforeJson: before,
    afterJson: after,
    reason: null,
    effectiveDate: null,
    recordedByUserId: a.userId,
    actorKind: "user",
    requestId: null,
  });
}
async function fileLock(tx: ScopedTransaction, a: ScopedDatabaseContext) {
  await lockActivePrivateWorkspace(tx, a);
  await tx.db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${a.workspaceId}||':files',0))`,
  );
}
export async function reserveAttachment(
  a: ScopedDatabaseContext,
  raw: SupportingUpload,
  requireInfrastructure = true,
) {
  const c = supportingUploadSchema.parse(raw);
  let namespace = "evidence";
  if (requireInfrastructure) {
    namespace = createPrivateEvidenceStore().namespace ?? "evidence";
    const { createClamScanner } =
      await import("@/platform/files/malware-scanner");
    createClamScanner();
  }
  return withDomainTransaction(a, async (tx) => {
    await fileLock(tx, a);
    const r = await claimCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      clientCommandId: c.clientCommandId,
      commandType: "files.reserve",
      payloadHash: hashCommandPayload(JSON.parse(JSON.stringify(c))),
    });
    if (r.kind === "replay") return r.result;
    const kind = await assertAttachmentSource(tx, c.sourceKind, c.sourceId);
    const total = (
      await tx.db.execute<{ total: string }>(
        sql`SELECT COALESCE(sum(declared_bytes),0)::text total FROM files.private_attachment WHERE status<>'deleted'`,
      )
    ).rows[0]!.total;
    assertFileQuota(BigInt(total), c.declaredBytes);
    const id = randomUUID(),
      key = `evidence/${a.workspaceId}/${id}`;
    await tx.db.execute(
      sql`INSERT INTO files.private_attachment(id,workspace_id,object_key,bucket_key,original_filename,declared_mime,declared_bytes,created_by_user_id,command_receipt_id,expires_at) VALUES(${id}::uuid,${a.workspaceId}::uuid,${key},${namespace},${c.originalFilename},${c.declaredMime},${c.declaredBytes},${a.userId}::uuid,${r.receiptId}::uuid,clock_timestamp()+interval '15 minutes')`,
    );
    await tx.db.execute(
      sql`SELECT set_config('files.receipt_id',${r.receiptId},true)`,
    );
    await tx.db.execute(
      sql`INSERT INTO ${trusted(sources[kind][1])}(workspace_id,${trusted(sources[kind][2])},attachment_id) VALUES(${a.workspaceId}::uuid,${c.sourceId}::uuid,${id}::uuid)`,
    );
    const result = { attachmentId: id, version: 1 };
    await audit(tx, a, r.receiptId, id, 1, "files.reserve", null, {
      ...result,
      sourceKind: kind,
      sourceId: c.sourceId,
      declaredBytes: c.declaredBytes,
      declaredMime: c.declaredMime,
    });
    await completeCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      receiptId: r.receiptId,
      result,
    });
    return result;
  });
}
export type AttachmentRow = {
  id: string;
  object_key: string;
  bucket_key: string;
  original_filename: string;
  declared_mime: string;
  declared_bytes: string;
  verified_mime: string | null;
  actual_bytes: string | null;
  checksum: string | null;
  status: string;
  version: number;
  scan_engine_version: string | null;
  scan_result_code: string | null;
  scanned_at: string | null;
  uploaded_at: string | null;
  expires_at: string;
};
export async function ownedAttachment(
  tx: ScopedTransaction,
  id: string,
  allowUnlinked = false,
) {
  z.uuid().parse(id);
  const r = (
    await tx.db.execute<AttachmentRow>(
      sql`SELECT id,object_key,bucket_key,original_filename,declared_mime,declared_bytes::text,verified_mime,actual_bytes::text,encode(checksum_sha256,'hex') checksum,status,version,scan_engine_version,scan_result_code,scanned_at::text,uploaded_at::text,expires_at::text FROM files.private_attachment WHERE id=${id}::uuid`,
    )
  ).rows[0];
  if (!r) throw new FileBoundaryError("FILE_UNAVAILABLE");
  let links = 0;
  for (const [kind, s] of Object.entries(sources)) {
    const link = (
      await tx.db.execute<{ id: string }>(
        sql`SELECT ${trusted(s[2])}::text id FROM ${trusted(s[1])} WHERE attachment_id=${id}::uuid`,
      )
    ).rows[0];
    if (link) {
      await assertAttachmentSource(tx, kind, link.id);
      links++;
    }
  }
  if (!links && !allowUnlinked) throw new FileBoundaryError("FILE_UNLINKED");
  return r;
}
export async function uploadAttachment(
  a: ScopedDatabaseContext,
  id: string,
  clientCommandId: string,
  body: Buffer,
  store: PrivateEvidenceStore = createPrivateEvidenceStore(),
) {
  z.uuid().parse(clientCommandId);
  const first = await withDomainTransaction(
    a,
    (tx) => ownedAttachment(tx, id),
    { readOnlySnapshot: true },
  );
  if (first.bucket_key !== (store.namespace ?? "evidence"))
    throw new FileBoundaryError("FILE_STORAGE_NAMESPACE_MISMATCH");
  await verifySupportingContent(
    body,
    Number(first.declared_bytes),
    first.declared_mime,
  );
  if (first.status !== "pending_upload" && first.uploaded_at === null)
    throw new FileBoundaryError("FILE_UPLOAD_CLOSED");
  if (first.uploaded_at === null && Date.parse(first.expires_at) < Date.now())
    throw new FileBoundaryError("FILE_UPLOAD_EXPIRED");
  if (first.uploaded_at === null) {
    await withDomainTransaction(a, async (tx) => {
      await fileLock(tx, a);
      await ownedAttachment(tx, id);
      const leased = (
        await tx.db.execute(
          sql`UPDATE files.private_attachment SET scan_lease_until=statement_timestamp()+interval '4 minutes',version=version+1 WHERE id=${id}::uuid AND status='pending_upload' AND uploaded_at IS NULL AND expires_at>clock_timestamp() AND (scan_lease_until IS NULL OR scan_lease_until<clock_timestamp()) RETURNING id`,
        )
      ).rows;
      if (!leased.length)
        throw new FileBoundaryError("FILE_UPLOAD_IN_PROGRESS");
    });
    try {
      await store.putOnce(first.object_key, body);
    } catch {
      const stored = await store.read(first.object_key);
      if (!stored.equals(body))
        throw new FileBoundaryError("FILE_STORAGE_WRITE_UNCONFIRMED");
    }
  }
  return withDomainTransaction(a, async (tx) => {
    await fileLock(tx, a);
    const c = { attachmentId: id, checksumSha256: sha256(body) },
      r = await claimCommandReceipt(tx, {
        workspaceId: a.workspaceId,
        clientCommandId,
        commandType: "files.upload",
        payloadHash: hashCommandPayload(JSON.parse(JSON.stringify(c))),
      });
    if (r.kind === "replay") return r.result;
    const current = await ownedAttachment(tx, id);
    if (current.status !== "pending_upload" || current.uploaded_at !== null)
      throw new FileBoundaryError("FILE_UPLOAD_CLOSED");
    await tx.db.execute(
      sql`UPDATE files.private_attachment SET uploaded_at=clock_timestamp(),scan_lease_until=NULL,command_receipt_id=${r.receiptId}::uuid,version=version+1 WHERE id=${id}::uuid`,
    );
    const result = {
      attachmentId: id,
      version: current.version + 1,
      status: "pending_upload",
    };
    await audit(
      tx,
      a,
      r.receiptId,
      id,
      current.version + 1,
      "files.upload",
      { status: current.status },
      { status: "pending_upload", checksumSha256: c.checksumSha256 },
    );
    await completeCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      receiptId: r.receiptId,
      result,
    });
    return result;
  });
}
export async function listAttachments(
  a: ScopedDatabaseContext,
  sourceKind: string,
  sourceId: string,
  afterId?: string,
) {
  return withDomainTransaction(
    a,
    async (tx) => {
      const k = await assertAttachmentSource(tx, sourceKind, sourceId),
        s = sources[k];
      return (
        await tx.db.execute(
          sql`SELECT f.id,f.original_filename,f.status,f.version,f.declared_mime,f.declared_bytes::text,f.scan_result_code,f.created_at::text,count(*) OVER()::text total FROM files.private_attachment f JOIN ${trusted(s[1])} l ON l.workspace_id=f.workspace_id AND l.attachment_id=f.id WHERE l.${trusted(s[2])}=${sourceId}::uuid AND (${afterId ?? null}::uuid IS NULL OR f.id>${afterId ?? null}::uuid) ORDER BY f.id LIMIT 50`,
        )
      ).rows;
    },
    { readOnlySnapshot: true },
  );
}
export async function mutateAttachment(
  a: ScopedDatabaseContext,
  raw: {
    clientCommandId: string;
    attachmentId: string;
    sourceKind?: string | undefined;
    sourceId?: string | undefined;
    operation: "unlink" | "delete";
    expectedVersion: number;
  },
) {
  const c = z
    .object({
      clientCommandId: z.uuid(),
      attachmentId: z.uuid(),
      sourceKind: supportingSourceSchema.optional(),
      sourceId: z.uuid().optional(),
      operation: z.enum(["unlink", "delete"]),
      expectedVersion: z.number().int().positive(),
    })
    .strict()
    .refine((v) => Boolean(v.sourceKind) === Boolean(v.sourceId), {
      message: "Source kind and record must be provided together.",
    })
    .parse(raw);
  return withDomainTransaction(a, async (tx) => {
    await fileLock(tx, a);
    const r = await claimCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      clientCommandId: c.clientCommandId,
      commandType: `files.${c.operation}`,
      payloadHash: hashCommandPayload(JSON.parse(JSON.stringify(c))),
    });
    if (r.kind === "replay") return r.result;
    const f = await ownedAttachment(
      tx,
      c.attachmentId,
      c.operation === "delete",
    );
    if (c.sourceKind && c.sourceId)
      await assertAttachmentSource(tx, c.sourceKind, c.sourceId);
    else if (c.operation !== "delete")
      throw new FileBoundaryError("FILE_SOURCE_UNAVAILABLE");
    if (f.version !== c.expectedVersion)
      throw new FileBoundaryError("FILE_VERSION_CONFLICT");
    if (f.status === "deleted" && c.operation === "delete")
      throw new FileBoundaryError("FILE_ALREADY_DELETED");
    const s = c.sourceKind ? sources[c.sourceKind] : null;
    await tx.db.execute(
      sql`SELECT set_config('files.receipt_id',${r.receiptId},true)`,
    );
    if (s && c.sourceId) {
      if (
        !(
          await tx.db.execute(
            sql`SELECT 1 FROM ${trusted(s[1])} WHERE attachment_id=${f.id}::uuid AND ${trusted(s[2])}=${c.sourceId}::uuid`,
          )
        ).rows.length
      )
        throw new FileBoundaryError("FILE_SOURCE_UNAVAILABLE");
    }
    if (c.operation === "unlink" && s && c.sourceId) {
      await tx.db.execute(
        sql`DELETE FROM ${trusted(s[1])} WHERE attachment_id=${f.id}::uuid AND ${trusted(s[2])}=${c.sourceId}::uuid`,
      );
    } else {
      let refs = 0;
      for (const source of Object.values(sources))
        refs += Number(
          (
            await tx.db.execute<{ n: string }>(
              sql`SELECT count(*)::text n FROM ${trusted(source[1])} WHERE attachment_id=${f.id}::uuid`,
            )
          ).rows[0]!.n,
        );
      if (refs > 1 || (!c.sourceId && refs !== 0))
        throw new FileBoundaryError("FILE_REFERENCES_REMAIN");
    }
    let remainingReferences = 0;
    if (c.operation === "unlink")
      for (const source of Object.values(sources))
        remainingReferences += Number(
          (
            await tx.db.execute<{ n: string }>(
              sql`SELECT count(*)::text n FROM ${trusted(source[1])} WHERE attachment_id=${f.id}::uuid`,
            )
          ).rows[0]!.n,
        );
    await tx.db.execute(
      sql`UPDATE files.private_attachment SET command_receipt_id=${r.receiptId}::uuid,version=version+1,unlinked_at=CASE WHEN ${c.operation}='unlink' AND ${remainingReferences}=0 THEN clock_timestamp() ELSE unlinked_at END,status=CASE WHEN ${c.operation}='delete' THEN 'deleting' ELSE status END WHERE id=${f.id}::uuid`,
    );
    const result = {
      attachmentId: f.id,
      version: f.version + 1,
      operation: c.operation,
    };
    await audit(
      tx,
      a,
      r.receiptId,
      f.id,
      f.version + 1,
      `files.${c.operation}`,
      { status: f.status },
      {
        operation: c.operation,
        sourceKind: c.sourceKind ?? null,
        sourceId: c.sourceId ?? null,
      },
    );
    await completeCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      receiptId: r.receiptId,
      result,
    });
    return result;
  });
}
export async function attachmentCatalog(
  a: ScopedDatabaseContext,
  kind: string,
  afterId?: string,
) {
  const k = supportingSourceSchema.parse(kind);
  if (afterId) z.uuid().parse(afterId);
  return withDomainTransaction(
    a,
    async (tx) => {
      const rows = (
        await tx.db.execute<{ id: string; label: string }>(
          sql`SELECT id,COALESCE(to_jsonb(s)->>'label',to_jsonb(s)->>'name',to_jsonb(s)->>'description',to_jsonb(s)->>'company_name',to_jsonb(s)->>'title',to_jsonb(s)->>'event_kind','Recorded evidence')||' · '||COALESCE(to_jsonb(s)->>'statement_date',to_jsonb(s)->>'settlement_date',to_jsonb(s)->>'created_at','') AS label FROM ${trusted(sources[k][0])} s WHERE (${afterId ?? null}::uuid IS NULL OR id>${afterId ?? null}::uuid) ORDER BY id LIMIT 51`,
        )
      ).rows;
      return {
        sources: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
      };
    },
    { readOnlySnapshot: true },
  );
}
export async function downloadAttachment(
  a: ScopedDatabaseContext,
  id: string,
  store: PrivateEvidenceStore = createPrivateEvidenceStore(),
) {
  const first = await withDomainTransaction(
    a,
    (tx) => ownedAttachment(tx, id),
    { readOnlySnapshot: true },
  );
  if (first.status !== "available" || !first.checksum)
    throw new FileBoundaryError("FILE_NOT_AVAILABLE");
  if (first.bucket_key !== (store.namespace ?? "evidence"))
    throw new FileBoundaryError("FILE_STORAGE_NAMESPACE_MISMATCH");
  const bytes = await store.read(first.object_key);
  if (
    sha256(bytes) !== first.checksum ||
    bytes.length !== Number(first.actual_bytes)
  )
    throw new FileBoundaryError("FILE_CHECKSUM_MISMATCH");
  const now = await withDomainTransaction(a, (tx) => ownedAttachment(tx, id), {
    readOnlySnapshot: true,
  });
  if (now.version !== first.version || now.status !== "available")
    throw new FileBoundaryError("FILE_NOT_AVAILABLE");
  // Scan freshness is required when processing, not every later historical
  // download; immutable passed evidence remains bound to these exact bytes.
  if (
    now.scan_result_code !== "passed" ||
    !now.scan_engine_version ||
    !now.scanned_at
  )
    throw new FileBoundaryError("FILE_NOT_AVAILABLE");
  return { bytes, mime: now.verified_mime! };
}

export async function unlinkedAttachments(a: ScopedDatabaseContext) {
  return withDomainTransaction(
    a,
    async (tx) =>
      (
        await tx.db.execute(
          sql`SELECT id,original_filename,status,version,unlinked_at::text FROM files.private_attachment WHERE unlinked_at IS NOT NULL AND status<>'deleted' ORDER BY unlinked_at DESC,id LIMIT 50`,
        )
      ).rows,
    { readOnlySnapshot: true },
  );
}
