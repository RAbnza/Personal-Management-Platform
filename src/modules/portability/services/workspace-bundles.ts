import { createHash } from "node:crypto";
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
import { graphRegistry } from "../domain/graph-registry";
import { previewDigest } from "../domain/csv-preview";
import { FileBoundaryError } from "@/modules/files/domain/supporting-file";
const schemaFingerprint = previewDigest(graphRegistry);
const sharedPrivateKinds = new Set([
  "finance.group_ledger_binding",
  "finance.private_group_link",
  "finance.private_group_link_revision",
  "finance.private_group_review",
]);
const legacyHRegistry = graphRegistry.filter(
  (d) => !sharedPrivateKinds.has(d.kind),
);
const legacyHFingerprint = previewDigest(legacyHRegistry);
const hasSharedPrivateEvidence = (bundle: {
  entities: { kind: string; records: Record<string, unknown>[] }[];
}) =>
  bundle.entities.some(
    (e) =>
      (sharedPrivateKinds.has(e.kind) && e.records.length > 0) ||
      (e.kind === "finance.action_revision" &&
        e.records.some((r) =>
          ["group_adoption", "group_effect"].includes(String(r.action_kind)),
        )),
  );
const omittedFileFields = new Set([
  "object_key",
  "bucket_key",
  "object_version",
  "scan_claim_id",
  "scan_lease_until",
]);
const ident = (s: string) =>
  sql.raw(
    s
      .split(".")
      .map((p) => `"${p}"`)
      .join("."),
  );
function ownerValues(
  value: unknown,
  owner: string,
  workspace: string,
): unknown {
  if (Array.isArray(value))
    return value.map((v) => ownerValues(v, owner, workspace));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /(?:^|_)user_id$|^userId$|^recordedByUserId$/.test(k) && v === owner
          ? "$owner"
          : /workspace_id|^workspaceId$/.test(k) && v === workspace
            ? "$workspace"
            : ownerValues(v, owner, workspace),
      ]),
    );
  return value;
}
async function assertTrackerPortabilityReady(tx: ScopedTransaction) {
  // Assignment 1 safety boundary: C owns versioned tracker portability. A
  // bundle must never advertise completeness while omitting these records.
  if (
    (await tx.db.execute(sql`SELECT id FROM tracker.template LIMIT 1`)).rows
      .length
  )
    throw new FileBoundaryError("TRACKER_PORTABILITY_PENDING");
}
export async function captureWorkspaceGraph(
  tx: ScopedTransaction,
  a: ScopedDatabaseContext,
) {
  await assertTrackerPortabilityReady(tx);
  const root = (
    await tx.db.execute<{
      currency: string;
      timezone: string;
      week_start: number;
      financial_revision: string;
    }>(
      sql`SELECT currency,timezone,week_start,financial_revision::text FROM core.workspace`,
    )
  ).rows[0];
  if (!root) throw new FileBoundaryError("PORTABLE_SCOPE_UNAVAILABLE");
  let count = 0;
  const entities: { kind: string; records: Record<string, unknown>[] }[] = [];
  for (const table of graphRegistry) {
    const fields = table.columns
      .filter(
        (c) =>
          !(
            table.kind === "files.private_attachment" &&
            omittedFileFields.has(c.name)
          ),
      )
      .map(
        (c) =>
          sql`${sql.raw(`'${c.name}'`)},${c.type === "bytea" ? sql`encode(${ident(c.name)},'hex')` : c.type === "bigint" || c.type.startsWith("numeric") || c.type === "date" || c.type.startsWith("timestamp") ? sql`${ident(c.name)}::text` : sql`${ident(c.name)}`}`,
      );
    const rows = (
      await tx.db.execute<{ row: Record<string, unknown> }>(
        sql`SELECT jsonb_build_object(${sql.join(fields, sql`,`)}) row FROM ${ident(table.kind)} ${table.kind === "core.command_receipt" ? sql`WHERE command_type<>'portability.retire_notification'` : sql``} ORDER BY ctid LIMIT 10001`,
      )
    ).rows.map(
      (r) =>
        ownerValues(r.row, a.userId, a.workspaceId) as Record<string, unknown>,
    );
    count += rows.length;
    if (count > 10000) throw new FileBoundaryError("PORTABLE_ROW_LIMIT");
    entities.push({ kind: table.kind, records: rows });
  }
  const manifest = {
    format: "pmp-private-workspace-graph",
    manifestVersion: 2,
    schemaFingerprint,
    sourceWorkspaceId: a.workspaceId,
    generatedAt: new Date().toISOString(),
    financialRevision: root.financial_revision,
    currency: root.currency,
    timezone: root.timezone,
    weekStart: root.week_start,
    rowCount: count,
    attachmentBytesIncluded: false,
    excluded: [
      "authentication",
      "account lifecycle/tombstones",
      "queue jobs",
      "operator mail/recovery metadata",
      "export artifacts",
      "attachment bytes",
      "shared group authority and group-owned history",
      "server-owned shared bundle provenance",
    ],
    notificationConsentRestored: false,
    calculationDefinitions: [
      "v2-a6-integrated-cards-1",
      "v2-f-corrected-cohorts-1",
    ],
  };
  const data = { manifest, entities };
  const bundle = { ...data, checksumSha256: previewDigest(data) };
  if (Buffer.byteLength(JSON.stringify(bundle)) > 10 * 1024 * 1024)
    throw new FileBoundaryError("PORTABLE_BYTE_LIMIT");
  return bundle;
}
export type WorkspaceBundle = Awaited<ReturnType<typeof captureWorkspaceGraph>>;
export function validateWorkspaceGraph(raw: unknown) {
  const basic = z
    .object({
      manifest: z
        .object({
          format: z.literal("pmp-private-workspace-graph"),
          manifestVersion: z.literal(2),
          schemaFingerprint: z.union([
            z.literal(schemaFingerprint),
            z.literal(legacyHFingerprint),
          ]),
          sourceWorkspaceId: z.uuid(),
          generatedAt: z.iso.datetime(),
          financialRevision: z.string().regex(/^\d+$/),
          currency: z.literal("PHP"),
          timezone: z
            .string()
            .max(100)
            .refine((s) => {
              try {
                new Intl.DateTimeFormat("en", { timeZone: s });
                return true;
              } catch {
                return false;
              }
            }),
          weekStart: z.number().int().min(0).max(6),
          rowCount: z.number().int().min(0).max(10000),
          attachmentBytesIncluded: z.literal(false),
          excluded: z.array(z.string()).max(20),
          notificationConsentRestored: z.literal(false),
          calculationDefinitions: z.array(z.string()).max(20),
        })
        .strict(),
      entities: z
        .array(
          z
            .object({
              kind: z.string(),
              records: z.array(z.record(z.string(), z.unknown())).max(10000),
            })
            .strict(),
        )
        .max(100),
      checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .parse(raw);
  const { checksumSha256, ...unsigned } = basic;
  if (previewDigest(unsigned) !== checksumSha256)
    throw new FileBoundaryError("PORTABLE_CHECKSUM_MISMATCH");
  if (Buffer.byteLength(JSON.stringify(basic)) > 10 * 1024 * 1024)
    throw new FileBoundaryError("PORTABLE_BYTE_LIMIT");
  if (basic.manifest.schemaFingerprint === legacyHFingerprint) {
    if (
      basic.entities.length !== legacyHRegistry.length ||
      basic.entities.some(
        (e) => !legacyHRegistry.some((d) => d.kind === e.kind),
      ) ||
      basic.entities.some(
        (e) =>
          (e.kind === "finance.action_revision" &&
            e.records.some((r) =>
              ["group_adoption", "group_effect"].includes(
                String(r.action_kind),
              ),
            )) ||
          (e.kind === "finance.ledger_account" &&
            e.records.some((r) =>
              ["group_receivable_asset", "group_payable_liability"].includes(
                String(r.kind),
              ),
            )),
      )
    )
      throw new FileBoundaryError("PORTABLE_GRAPH_COVERAGE");
    basic.entities.push(
      ...graphRegistry
        .filter((d) => sharedPrivateKinds.has(d.kind))
        .map((d) => ({ kind: d.kind, records: [] })),
    );
    basic.manifest.schemaFingerprint = schemaFingerprint;
    basic.checksumSha256 = previewDigest({
      manifest: basic.manifest,
      entities: basic.entities,
    });
  }
  if (
    basic.entities.length !== graphRegistry.length ||
    new Set(basic.entities.map((e) => e.kind)).size !== graphRegistry.length
  )
    throw new FileBoundaryError("PORTABLE_GRAPH_COVERAGE");
  let total = 0;
  const indexed = new Map<string, Set<string>>();
  for (const descriptor of graphRegistry) {
    const e = basic.entities.find((e) => e.kind === descriptor.kind);
    if (!e) throw new FileBoundaryError("PORTABLE_GRAPH_COVERAGE");
    total += e.records.length;
    if (total > 10000) throw new FileBoundaryError("PORTABLE_ROW_LIMIT");
    const ids = new Set<string>();
    const columns = descriptor.columns.filter(
      (c) =>
        !(
          descriptor.kind === "files.private_attachment" &&
          omittedFileFields.has(c.name)
        ),
    );
    for (const row of e.records) {
      if (
        descriptor.kind === "core.command_receipt" &&
        row.command_type === "portability.retire_notification"
      )
        throw new FileBoundaryError("PORTABLE_OPERATIONAL_RECORD");
      if (
        Object.keys(row).length !== columns.length ||
        Object.keys(row).some((k) => !columns.some((c) => c.name === k))
      )
        throw new FileBoundaryError("PORTABLE_COLUMNS_UNSUPPORTED");
      if (row.workspace_id !== "$workspace")
        throw new FileBoundaryError("PORTABLE_FOREIGN_SCOPE");
      for (const c of columns) {
        const v = row[c.name];
        if (v === null) {
          if (c.notNull) throw new FileBoundaryError("PORTABLE_NULL_VALUE");
          continue;
        }
        if (c.type === "uuid") {
          if (c.name === "workspace_id") {
            if (v !== "$workspace")
              throw new FileBoundaryError("PORTABLE_FOREIGN_SCOPE");
          } else if (c.name.endsWith("user_id")) {
            if (v !== "$owner")
              throw new FileBoundaryError("PORTABLE_AUTH_IDENTITY");
          } else z.uuid().parse(v);
        } else if (c.type === "bigint")
          z.string()
            .max(20)
            .regex(/^-?(0|[1-9]\d*)$/)
            .parse(v);
        else if (c.type.startsWith("numeric"))
          z.string()
            .max(100)
            .regex(/^-?(0|[1-9]\d*)(\.\d+)?$/)
            .parse(v);
        else if (c.type === "bytea")
          z.string()
            .regex(/^[a-f0-9]*$/)
            .max(1000)
            .parse(v);
        else if (c.type === "integer" || c.type === "smallint")
          z.number().int().parse(v);
        else if (c.type === "boolean") z.boolean().parse(v);
        else if (c.type === "text[]")
          z.array(z.string().max(20000)).max(1000).parse(v);
        else if (c.type === "integer[]")
          z.array(z.number().int()).max(1000).parse(v);
        else if (c.type === "date") z.iso.date().parse(v);
        else if (c.type.startsWith("timestamp"))
          z.string()
            .max(100)
            .refine(
              (x) =>
                z.iso
                  .datetime({ offset: true })
                  .safeParse(
                    x.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"),
                  ).success,
            )
            .parse(v);
        else if (c.type !== "jsonb") z.string().max(20000).parse(v);
      }
      if (typeof row.id === "string") {
        if (ids.has(row.id))
          throw new FileBoundaryError("PORTABLE_DUPLICATE_IDENTITY");
        ids.add(row.id);
      }
    }
    indexed.set(descriptor.kind, ids);
  }
  if (total !== basic.manifest.rowCount)
    throw new FileBoundaryError("PORTABLE_COUNT_MISMATCH");
  for (const descriptor of graphRegistry) {
    const e = basic.entities.find((e) => e.kind === descriptor.kind)!;
    for (const row of e.records)
      for (const fk of descriptor.foreignKeys) {
        if (
          fk.targetColumns.length === 2 &&
          fk.targetColumns[1] === "id" &&
          indexed.has(fk.target)
        ) {
          const id = row[fk.columns[1]!];
          if (id !== null && !indexed.get(fk.target)!.has(String(id)))
            throw new FileBoundaryError("PORTABLE_RELATIONSHIP_INVALID");
        }
      }
  }
  return basic as WorkspaceBundle;
}
export function remapForeignGraph(
  bundle: WorkspaceBundle,
  targetWorkspaceId: string,
) {
  const map = new Map<string, string>();
  for (const e of bundle.entities)
    for (const r of e.records)
      if (typeof r.id === "string") {
        const h = createHash("sha256")
          .update(targetWorkspaceId + ":portable:" + r.id)
          .digest("hex");
        map.set(
          r.id,
          h.slice(0, 8) +
            "-" +
            h.slice(8, 12) +
            "-5" +
            h.slice(13, 16) +
            "-a" +
            h.slice(17, 20) +
            "-" +
            h.slice(20, 32),
        );
      }
  const internalKeys = new Set([
    "id",
    "revisionId",
    "receiptId",
    "allocationId",
    "accountId",
    "eventId",
    "applicationId",
    "goalId",
    "budgetId",
    "obligationId",
    "planId",
    "statementId",
    "cardId",
  ]);
  for (const d of graphRegistry)
    for (const c of d.columns)
      if (
        c.type === "uuid" &&
        !/user_id$|workspace_id$|request_id$|client_command_id$/.test(c.name)
      ) {
        internalKeys.add(c.name);
        internalKeys.add(
          c.name.replace(/_([a-z])/g, (_, x: string) => x.toUpperCase()),
        );
      }
  const rewrite = (v: unknown, key: string): unknown =>
    /provider|reference|notes|description/i.test(key) && !internalKeys.has(key)
      ? v
      : typeof v === "string"
        ? internalKeys.has(key)
          ? (map.get(v) ?? v)
          : v
        : Array.isArray(v)
          ? v.map((x) =>
              rewrite(x, key.endsWith("Ids") ? key.slice(0, -1) : key),
            )
          : v !== null && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, x]) => [k, rewrite(x, k)]),
              )
            : v;
  const entities = bundle.entities.map((e) => {
    const descriptor = graphRegistry.find((d) => d.kind === e.kind)!;
    return {
      ...e,
      records: e.records.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => {
            const c = descriptor.columns.find((c) => c.name === k)!;
            return [
              k,
              c.type === "uuid" &&
              typeof v === "string" &&
              k !== "request_id" &&
              k !== "client_command_id"
                ? (map.get(v) ?? v)
                : c.type === "jsonb"
                  ? rewrite(v, k)
                  : v,
            ];
          }),
        ),
      ),
    };
  });
  const unsigned = { manifest: bundle.manifest, entities };
  return {
    bundle: validateWorkspaceGraph({
      ...unsigned,
      checksumSha256: previewDigest(unsigned),
    }),
    map,
  };
}
async function restoreAudit(
  tx: ScopedTransaction,
  a: ScopedDatabaseContext,
  r: string,
  id: string,
  operation: string,
  after: Record<string, unknown>,
) {
  await createPrivateRevision(tx, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: r,
    subjectKind:
      operation === "portability.export" ? "export_run" : "restore_run",
    subjectId: id,
    subjectVersion: 1,
    operation,
    beforeJson: null,
    afterJson: after,
    reason: null,
    effectiveDate: null,
    recordedByUserId: a.userId,
    actorKind: "user",
    requestId: null,
  });
}
export function bundleTotals(bundle: WorkspaceBundle) {
  const ledgers = bundle.entities.find(
      (e) => e.kind === "finance.ledger_account",
    )!.records,
    postings = bundle.entities.find(
      (e) => e.kind === "finance.posting",
    )!.records;
  const positions = ledgers.map((l) => ({
    ledgerId: String(l.id),
    name: String(l.name),
    kind: String(l.kind),
    signedMinor: postings
      .filter((p) => p.ledger_account_id === l.id)
      .reduce((v, p) => v + BigInt(String(p.amount_minor)), 0n)
      .toString(),
  }));
  return {
    positions,
    cashMinor: positions
      .filter((p) => p.kind === "cash_asset")
      .reduce((v, p) => v + BigInt(p.signedMinor), 0n)
      .toString(),
    expenseMinor: postings
      .filter((p) => p.expense_class !== null && p.expense_class !== "none")
      .reduce((v, p) => v + BigInt(String(p.amount_minor)), 0n)
      .toString(),
    incomeMinor: postings
      .filter((p) => p.income_class !== null && p.income_class !== "none")
      .reduce((v, p) => v - BigInt(String(p.amount_minor)), 0n)
      .toString(),
  };
}
export async function exportWorkspace(a: ScopedDatabaseContext) {
  return withDomainTransaction(a, (tx) => captureWorkspaceGraph(tx, a), {
    readOnlySnapshot: true,
  });
}
export async function prepareWorkspaceExport(
  a: ScopedDatabaseContext,
  clientCommandId: string,
) {
  z.uuid().parse(clientCommandId);
  const receiptInput = {
    workspaceId: a.workspaceId,
    clientCommandId,
    commandType: "portability.export",
    payloadHash: hashCommandPayload({
      format: "pmp-private-workspace-graph",
      manifestVersion: 2,
    }),
  };
  // A completed export replays independently of later graph growth/limits.
  const prior = await withDomainTransaction(a, async (tx) => {
    await lockActivePrivateWorkspace(tx, a);
    const existing = await tx.db.execute(
      sql`SELECT id FROM core.command_receipt WHERE workspace_id=${a.workspaceId}::uuid AND client_command_id=${clientCommandId}::uuid`,
    );
    if (!existing.rows.length) return null;
    const r = await claimCommandReceipt(tx, receiptInput);
    if (r.kind !== "replay")
      throw new Error("PORTABLE_EXPORT_REPLAY_UNAVAILABLE");
    return r.result;
  });
  if (prior !== null) return prior;
  const bundle = await exportWorkspace(a);
  return withDomainTransaction(a, async (tx) => {
    await lockActivePrivateWorkspace(tx, a);
    await tx.db.execute(sql`SELECT id FROM core.workspace FOR UPDATE`);
    const r = await claimCommandReceipt(tx, receiptInput);
    if (r.kind === "replay") return r.result;
    await assertTrackerPortabilityReady(tx);
    const id = randomUUID();
    await tx.db.execute(
      sql`INSERT INTO ops.export_run(id,workspace_id,export_kind,schema_version,filters_json,requested_by_user_id,command_receipt_id,state,snapshot_financial_revision,generated_at,row_count,coverage_json,bundle_json,expires_at,checksum_sha256) VALUES(${id}::uuid,${a.workspaceId}::uuid,'workspace_bundle',2,'{}'::jsonb,${a.userId}::uuid,${r.receiptId}::uuid,'completed',${bundle.manifest.financialRevision}::bigint,statement_timestamp(),${bundle.manifest.rowCount},${JSON.stringify(bundle.manifest)}::jsonb,${JSON.stringify(bundle)}::jsonb,statement_timestamp()+interval '24 hours',${bundle.checksumSha256})`,
    );
    const result = { exportRunId: id, checksumSha256: bundle.checksumSha256 };
    await restoreAudit(tx, a, r.receiptId, id, "portability.export", {
      checksumSha256: bundle.checksumSha256,
      rowCount: bundle.manifest.rowCount,
    });
    await completeCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      receiptId: r.receiptId,
      result,
    });
    if (hasSharedPrivateEvidence(bundle))
      await tx.db.execute(
        sql`SELECT ops.bind_shared_bundle_export(${id}::uuid)`,
      );
    return result;
  });
}
export async function downloadWorkspaceExport(
  a: ScopedDatabaseContext,
  id: string,
) {
  z.uuid().parse(id);
  return withDomainTransaction(
    a,
    async (tx) => {
      const r = (
        await tx.db.execute<{
          bundle_json: unknown;
          checksum_sha256: string;
          fresh: boolean;
        }>(
          sql`SELECT bundle_json,checksum_sha256,expires_at>clock_timestamp() fresh FROM ops.export_run WHERE id=${id}::uuid AND export_kind='workspace_bundle' AND state='completed'`,
        )
      ).rows[0];
      if (!r?.fresh || !r.bundle_json)
        throw new FileBoundaryError("PORTABLE_EXPORT_EXPIRED");
      validateWorkspaceGraph(r.bundle_json);
      const bundle = r.bundle_json as WorkspaceBundle;
      if (bundle.checksumSha256 !== r.checksum_sha256)
        throw new FileBoundaryError("PORTABLE_CHECKSUM_MISMATCH");
      return bundle;
    },
    { readOnlySnapshot: true },
  );
}
export async function restoreStatus(a: ScopedDatabaseContext) {
  return withDomainTransaction(
    a,
    async (tx) =>
      (
        await tx.db.execute(
          sql`SELECT id,state,preview_json,last_error_code,created_at::text,completed_at::text,expires_at::text,recovery_json IS NOT NULL AS recovery_retained FROM ops.restore_run ORDER BY created_at DESC,id LIMIT 50`,
        )
      ).rows,
    { readOnlySnapshot: true },
  );
}
export async function previewWorkspaceRestore(
  a: ScopedDatabaseContext,
  raw: { clientCommandId: string; bundle: unknown },
) {
  const c = z
      .object({ clientCommandId: z.uuid(), bundle: z.unknown() })
      .strict()
      .parse(raw),
    originalBundle = validateWorkspaceGraph(c.bundle);
  const mapping =
    originalBundle.manifest.sourceWorkspaceId === a.workspaceId
      ? { bundle: originalBundle, map: new Map<string, string>() }
      : remapForeignGraph(originalBundle, a.workspaceId);
  const bundle = mapping.bundle;
  return withDomainTransaction(a, async (tx) => {
    await lockActivePrivateWorkspace(tx, a);
    await tx.db.execute(sql`SELECT id FROM core.workspace FOR UPDATE`);
    const receipt = await claimCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      clientCommandId: c.clientCommandId,
      commandType: "portability.preview",
      payloadHash: hashCommandPayload({ checksum: bundle.checksumSha256 }),
    });
    if (receipt.kind === "replay") return receipt.result;
    const current = await captureWorkspaceGraph(tx, a),
      blockers: string[] = [];
    if (hasSharedPrivateEvidence(bundle)) {
      const trusted = (
        await tx.db.execute<{ trusted: boolean }>(
          sql`SELECT ops.shared_bundle_trusted(${JSON.stringify(bundle)}::jsonb) trusted`,
        )
      ).rows[0]!.trusted;
      if (!trusted)
        blockers.push(
          "SHARED_PRIVATE_HISTORY_REQUIRES_UNMODIFIED_TRUSTED_OWN_EXPORT",
        );
    }
    if (bundle.manifest.currency !== current.manifest.currency)
      blockers.push("CURRENCY_MISMATCH");
    if (
      current.entities
        .find((e) => e.kind === "files.private_attachment")!
        .records.some((r) => r.status !== "deleted")
    )
      blockers.push("CURRENT_FILES_REQUIRE_EXPLICIT_DELETION_OR_BYTE_RECOVERY");
    if (
      current.entities
        .find((e) => e.kind === "time.notification_delivery")!
        .records.some((r) => r.status === "attempted")
    )
      blockers.push("EXTERNAL_DELIVERY_IN_FLIGHT");
    if (
      bundle.manifest.sourceWorkspaceId !== a.workspaceId &&
      bundle.entities.find((e) => e.kind === "time.notification_attempt")!
        .records.length
    )
      blockers.push("FOREIGN_EXTERNAL_PROVIDER_HISTORY");
    for (const kind of [
      "time.notification_attempt",
      "time.notification_provider_event",
      "time.notification_delivery",
    ])
      for (const row of bundle.entities.find((e) => e.kind === kind)!.records) {
        if (
          kind === "time.notification_delivery" &&
          ["scheduled", "cancelled"].includes(String(row.status))
        )
          continue;
        const known = (
          await tx.db.execute<{ known: boolean }>(
            sql`SELECT ops.provider_history_known(${kind},${JSON.stringify(row)}::jsonb) known`,
          )
        ).rows[0]!.known;
        if (
          !known &&
          !blockers.includes("UNVERIFIED_EXTERNAL_PROVIDER_HISTORY")
        )
          blockers.push("UNVERIFIED_EXTERNAL_PROVIDER_HISTORY");
      }
    const preview = {
      sourceChecksumSha256: (c.bundle as { checksumSha256: string })
        .checksumSha256,
      ...((c.bundle as { checksumSha256: string }).checksumSha256 !==
      originalBundle.checksumSha256
        ? {
            sourceSchemaUpgrade:
              "V2-H private graph; empty shared link tables added, financial evidence preserved",
          }
        : {}),
      sourceRows: bundle.manifest.rowCount,
      currentRows: current.manifest.rowCount,
      sourceTotals: bundleTotals(bundle),
      currentTotals: bundleTotals(current),
      sourceFinancialRevision: bundle.manifest.financialRevision,
      currentFinancialRevision: current.manifest.financialRevision,
      mode: "replace_private_workspace",
      attachmentBytesIncluded: false,
      notificationConsentReset: true,
      pendingImportsCancelled: true,
      groupOwnedHistoryRestored: false,
      sharedPrivateEvidenceRequiresTrustedOwnExport: true,
      identityMapping: mapping.map.size
        ? "workspace/owner and evidence UUIDs remapped"
        : "workspace/owner remapped; evidence UUIDs preserved",
      blockers,
    };
    const runId = randomUUID(),
      hash = previewDigest({ preview, bundleChecksum: bundle.checksumSha256 });
    await tx.db.execute(
      sql`INSERT INTO ops.restore_run(id,workspace_id,manifest_version,bundle_checksum,staging_reference,preview_json,preview_hash,bundle_json,expected_financial_revision,expires_at,command_receipt_id) VALUES(${runId}::uuid,${a.workspaceId}::uuid,2,decode(${bundle.checksumSha256},'hex'),${runId},${JSON.stringify(preview)}::jsonb,decode(${hash},'hex'),${JSON.stringify(bundle)}::jsonb,${current.manifest.financialRevision}::bigint,statement_timestamp()+interval '24 hours',${receipt.receiptId}::uuid)`,
    );
    for (const e of originalBundle.entities)
      for (const row of e.records)
        if (typeof row.id === "string" && mapping.map.has(row.id))
          await tx.db.execute(
            sql`INSERT INTO ops.restore_id_map(workspace_id,restore_run_id,entity_kind,source_id,target_id)VALUES(${a.workspaceId}::uuid,${runId}::uuid,${e.kind},${row.id}::uuid,${mapping.map.get(row.id)!}::uuid)`,
          );
    const result = { runId, previewHash: hash, preview };
    await restoreAudit(tx, a, receipt.receiptId, runId, "portability.preview", {
      previewHash: hash,
      blockers,
      rowCount: bundle.manifest.rowCount,
    });
    await completeCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    return result;
  });
}
export async function restoreWorkspace(
  a: ScopedDatabaseContext,
  raw: {
    clientCommandId: string;
    runId: string;
    previewHash: string;
    confirmation: string;
  },
) {
  const c = z
    .object({
      clientCommandId: z.uuid(),
      runId: z.uuid(),
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("replace-private-workspace"),
    })
    .strict()
    .parse(raw);
  return withDomainTransaction(a, async (tx) => {
    await tx.db.execute(
      sql`SELECT ops.lock_shared_restore_groups(${c.runId}::uuid)`,
    );
    await lockActivePrivateWorkspace(tx, a);
    await tx.db.execute(sql`SELECT id FROM core.workspace FOR UPDATE`);
    const receipt = await claimCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      clientCommandId: c.clientCommandId,
      commandType: "portability.restore",
      payloadHash: hashCommandPayload(c),
    });
    if (receipt.kind === "replay") return receipt.result;
    // A restore preview can predate the first tracker. Recheck while holding
    // the same workspace lock used by tracker creation, before graph replacement.
    await assertTrackerPortabilityReady(tx);
    const result = (
      await tx.db.execute<{ result: Record<string, unknown> }>(
        sql`SELECT ops.apply_private_restore(${c.runId}::uuid,decode(${c.previewHash},'hex'),${receipt.receiptId}::uuid) result`,
      )
    ).rows[0]!.result;
    await restoreAudit(
      tx,
      a,
      receipt.receiptId,
      c.runId,
      "portability.restore",
      result,
    );
    await completeCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    return result;
  });
}

/** Recovery is a fresh, validated portable bundle, never an executable SQL dump. */
export async function downloadWorkspaceRecovery(
  a: ScopedDatabaseContext,
  id: string,
) {
  z.uuid().parse(id);
  const bundle = await withDomainTransaction(
    a,
    async (tx) => {
      const r = (
        await tx.db.execute<{
          recovery_json: {
            workspace: Record<string, unknown>;
            entities: Record<string, Record<string, unknown>[]>;
          };
          fresh: boolean;
        }>(
          sql`SELECT recovery_json,expires_at>clock_timestamp() fresh FROM ops.restore_run WHERE id=${id}::uuid`,
        )
      ).rows[0];
      if (!r?.fresh || !r.recovery_json)
        throw new FileBoundaryError("PORTABLE_RECOVERY_EXPIRED");
      const template = await captureWorkspaceGraph(tx, a),
        root = r.recovery_json.workspace;
      const entities = graphRegistry.map((d) => ({
        kind: d.kind,
        records: (r.recovery_json.entities[d.kind] ?? [])
          .filter(
            (row) =>
              d.kind !== "core.command_receipt" ||
              row.command_type !== "portability.retire_notification",
          )
          .map((row) =>
            Object.fromEntries(
              d.columns
                .filter(
                  (c) =>
                    !(
                      d.kind === "files.private_attachment" &&
                      omittedFileFields.has(c.name)
                    ),
                )
                .map((c) => {
                  let v = row[c.name];
                  if (v !== null) {
                    if (c.type === "bigint" || c.type.startsWith("numeric"))
                      v = String(v);
                    else if (c.type === "bytea")
                      v = String(v).replace(/^\\x/, "");
                    else if (c.type.startsWith("timestamp"))
                      v = String(v).replace("T", " ");
                  }
                  return [c.name, ownerValues(v, a.userId, a.workspaceId)];
                }),
            ),
          )
          .map(
            (row) =>
              ownerValues(row, a.userId, a.workspaceId) as Record<
                string,
                unknown
              >,
          ),
      }));
      const manifest = {
        ...template.manifest,
        financialRevision: String(root.financial_revision),
        currency: String(root.currency),
        timezone: String(root.timezone),
        weekStart: Number(root.week_start),
        rowCount: entities.reduce((n, e) => n + e.records.length, 0),
      };
      const unsigned = { manifest, entities };
      return validateWorkspaceGraph({
        ...unsigned,
        checksumSha256: previewDigest(unsigned),
      });
    },
    { readOnlySnapshot: true },
  );
  if (hasSharedPrivateEvidence(bundle))
    await withDomainTransaction(a, async (tx) => {
      await tx.db.execute(
        sql`SELECT ops.bind_shared_recovery(${id}::uuid,${JSON.stringify(bundle)}::jsonb)`,
      );
    });
  return bundle;
}
