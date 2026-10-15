import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { sql } from "drizzle-orm";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { ownedAttachment } from "@/modules/files/services/attachments";
import {
  verifySupportingContent,
  assertScannedContent,
} from "@/modules/files/domain/supporting-file";
import {
  createPrivateEvidenceStore,
  type PrivateEvidenceStore,
} from "./object-store";
import { createClamScanner, type MalwareScanner } from "./malware-scanner";
import { z } from "zod";

export async function processAttachment(
  pool: Pool,
  raw: unknown,
  store: PrivateEvidenceStore = createPrivateEvidenceStore(),
  scanner: MalwareScanner = createClamScanner(),
  signal?: AbortSignal,
) {
  const job = z
    .object({ schemaVersion: z.literal(1), attachmentId: z.uuid() })
    .strict()
    .parse(raw);
  const scope = (
    await pool.query<{ user_id: string; workspace_id: string }>(
      "SELECT * FROM ops.file_scope($1)",
      [job.attachmentId],
    )
  ).rows[0];
  if (!scope) return { processed: false };
  const actor = { userId: scope.user_id, workspaceId: scope.workspace_id },
    claimId = randomUUID();
  async function transaction<T>(
    fn: Parameters<typeof runScopedTransactionOnClient<T>>[2],
  ) {
    const client = await pool.connect();
    try {
      return await runScopedTransactionOnClient(client, actor, fn);
    } finally {
      client.release();
    }
  }
  const claim = await transaction(async (tx) => {
    await tx.db.execute(sql`SELECT ops.lock_file_scope()`);
    const f = (
      await tx.db.execute<{
        id: string;
        status: string;
        uploaded_at: string | null;
        expires_at: string;
        scan_lease_until: string | null;
        unlinked_expired: boolean;
      }>(
        sql`SELECT id,status,uploaded_at::text,expires_at::text,scan_lease_until::text,unlinked_at<clock_timestamp()-interval '30 days' AS unlinked_expired FROM files.private_attachment WHERE id=${job.attachmentId}::uuid FOR UPDATE`,
      )
    ).rows[0];
    if (
      !f ||
      (f.status === "available" && !f.unlinked_expired) ||
      f.status === "deleted" ||
      (f.scan_lease_until && Date.parse(f.scan_lease_until) > Date.now())
    )
      return null;
    const deleting =
      f.unlinked_expired ||
      f.status === "deleting" ||
      f.status === "rejected" ||
      (f.status === "pending_upload" &&
        f.uploaded_at === null &&
        Date.parse(f.expires_at) < Date.now());
    if (!deleting && !f.uploaded_at) return null;
    await tx.db.execute(
      sql`UPDATE files.private_attachment SET status=${deleting ? "deleting" : "quarantined"},scan_claim_id=${claimId}::uuid,scan_lease_until=clock_timestamp()+interval '4 minutes',version=version+1 WHERE id=${f.id}::uuid`,
    );
    const metadata = (
      await tx.db.execute<{
        object_key: string;
        bucket_key: string;
        declared_bytes: string;
        declared_mime: string;
      }>(
        sql`SELECT object_key,bucket_key,declared_bytes::text,declared_mime FROM files.private_attachment WHERE id=${f.id}::uuid`,
      )
    ).rows[0]!;
    return { ...metadata, id: f.id, deleting };
  });
  if (!claim) return { processed: false };
  try {
    if (claim.bucket_key !== (store.namespace ?? "evidence"))
      return { processed: false };
    if (claim.deleting) {
      await store.delete(claim.object_key, signal);
      await transaction(async (tx) => {
        await tx.db.execute(sql`SELECT ops.lock_file_scope()`);
        await tx.db.execute(
          sql`UPDATE files.private_attachment SET status='deleted',deleted_at=clock_timestamp(),scan_lease_until=NULL,version=version+1 WHERE id=${claim.id}::uuid AND scan_claim_id=${claimId}::uuid AND status='deleting'`,
        );
      });
      return { processed: true };
    }
    const body = await store.read(claim.object_key, signal),
      content = await verifySupportingContent(
        body,
        Number(claim.declared_bytes),
        claim.declared_mime,
      ),
      evidence = await scanner.scan(body, signal);
    if (evidence.result === "passed")
      assertScannedContent(content.checksumSha256, evidence);
    await transaction(async (tx) => {
      await tx.db.execute(sql`SELECT ops.lock_file_scope()`);
      await ownedAttachment(tx, claim.id);
      await tx.db.execute(
        sql`UPDATE files.private_attachment SET actual_bytes=${content.actualBytes},verified_mime=${content.verifiedMime},checksum_sha256=decode(${content.checksumSha256},'hex'),scan_engine_version=${evidence.engineVersion},scan_result_code=${evidence.result},scanned_at=clock_timestamp(),status=${evidence.result === "passed" ? "available" : "rejected"},scan_lease_until=NULL,version=version+1 WHERE id=${claim.id}::uuid AND scan_claim_id=${claimId}::uuid AND status='quarantined' AND scan_lease_until>clock_timestamp()`,
      );
    });
    return { processed: true };
  } catch {
    // Quarantine and durable leased state survive provider failures/crashes.
    // No network error can create availability. A later scan retries exact bytes.
    return { processed: false };
  }
}
