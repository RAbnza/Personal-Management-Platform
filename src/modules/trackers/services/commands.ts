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
import {
  hashCommandPayload,
  type CanonicalJsonValue,
} from "@/modules/core/domain/command";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  definitionSchema,
  trackerCommandSchema,
  TrackerError,
  validateValues,
  migrateValues,
  type Definition,
  type TrackerCommand,
  type MigrationRules,
} from "../domain/tracker";
import { presets } from "../domain/presets";
import { trackersEnabled } from "../feature";
import {
  assertEditable,
  migrationEntries,
  readDefinition,
  readEntry,
  readMigration,
  readTracker,
  type EntryRow,
  type Preview,
  type TrackerRow,
} from "../repositories/trackers";
type Context = {
  t: ScopedTransaction;
  actor: ScopedDatabaseContext & { requestId?: string | undefined };
  receiptId: string;
};
const json = (v: unknown) => JSON.stringify(v);
const hash = (v: unknown) =>
  hashCommandPayload(v as CanonicalJsonValue).toString("hex");
async function publish(
  c: Context,
  d: Definition,
  templateId: string | null,
  expectedVersionId: string | null,
  reason: string,
  preset?: { key: string; version: number },
) {
  const { t, actor: a, receiptId: r } = c,
    id = templateId ?? randomUUID(),
    versionId = randomUUID();
  const previous = templateId
    ? (
        await t.db.execute<{
          current_version_id: string;
          archived_at: string | null;
          version: number;
        }>(
          sql`SELECT current_version_id,archived_at,version FROM tracker.template WHERE id=${id}::uuid`,
        )
      ).rows[0]
    : null;
  if (templateId && !previous)
    throw new TrackerError(404, "Private template unavailable.");
  if (
    (previous?.current_version_id ?? null) !== expectedVersionId ||
    previous?.archived_at
  )
    throw new TrackerError(
      409,
      "Template changed or is archived. Reload before publishing.",
    );
  const existing = templateId
    ? (await readDefinition(t, previous!.current_version_id)).definition
    : null;
  if (existing) {
    for (const f of existing.fields) {
      const replacement = d.fields.find((x) => x.key === f.key);
      if (!replacement || (f.retired && !replacement.retired))
        throw new TrackerError(
          422,
          "Retain old field identities as retired fields; retired identities cannot be reused.",
        );
      if (
        f.type === "single_select" &&
        replacement.type === "single_select" &&
        f.options.some(
          (o) =>
            !replacement.options.some((n) => n.key === o.key) ||
            (o.retired &&
              !replacement.options.find((n) => n.key === o.key)?.retired),
        )
      )
        throw new TrackerError(
          422,
          "Retain removed option keys as retired options; do not recycle retired keys.",
        );
    }
  }
  if (!templateId)
    await t.db.execute(
      sql`INSERT INTO tracker.template(id,workspace_id,name,preset_key,preset_version,current_version_id,command_receipt_id,recorded_by_user_id) VALUES(${id}::uuid,${a.workspaceId}::uuid,${d.name},${preset?.key ?? null},${preset?.version ?? null},${versionId}::uuid,${r}::uuid,${a.userId}::uuid)`,
    );
  const identities = new Map<string, string>();
  for (const f of d.fields) {
    const old = (
      await t.db.execute<{ id: string }>(
        sql`SELECT id FROM tracker.field_identity WHERE template_id=${id}::uuid AND stable_key=${f.key}`,
      )
    ).rows[0];
    const fieldId = old?.id ?? randomUUID();
    identities.set(f.key, fieldId);
    if (!old)
      await t.db.execute(
        sql`INSERT INTO tracker.field_identity(id,workspace_id,template_id,stable_key,command_receipt_id,recorded_by_user_id) VALUES(${fieldId}::uuid,${a.workspaceId}::uuid,${id}::uuid,${f.key},${r}::uuid,${a.userId}::uuid)`,
      );
  }
  const versionNo = existing
    ? (await readDefinition(t, previous!.current_version_id)).versionNo + 1
    : 1;
  await t.db.execute(
    sql`INSERT INTO tracker.template_version(id,workspace_id,template_id,version_no,previous_version_id,name,title_field_id,status_field_id,deadline_field_id,completion_json,reason,command_receipt_id,recorded_by_user_id) VALUES(${versionId}::uuid,${a.workspaceId}::uuid,${id}::uuid,${versionNo},${expectedVersionId}::uuid,${d.name},${identities.get(d.titleKey)}::uuid,${d.statusKey ? identities.get(d.statusKey) : null}::uuid,${d.deadlineKey ? identities.get(d.deadlineKey) : null}::uuid,${json({ key: d.completionKey, statuses: d.completedStatusKeys })}::jsonb,${reason},${r}::uuid,${a.userId}::uuid)`,
  );
  for (const [position, f] of d.fields.entries()) {
    const definitionId = randomUUID();
    await t.db.execute(
      sql`INSERT INTO tracker.field_definition(id,workspace_id,template_id,template_version_id,field_id,label,field_type,required,position,validation_json,default_json,retired,command_receipt_id,recorded_by_user_id) VALUES(${definitionId}::uuid,${a.workspaceId}::uuid,${id}::uuid,${versionId}::uuid,${identities.get(f.key)}::uuid,${f.label},${f.type},${f.required},${position},${json(f.validation)}::jsonb,${json(f.default ?? null)}::jsonb,${f.retired},${r}::uuid,${a.userId}::uuid)`,
    );
    for (const [n, o] of f.options.entries())
      await t.db.execute(
        sql`INSERT INTO tracker.field_option(workspace_id,field_definition_id,option_key,label,position,retired,command_receipt_id,recorded_by_user_id) VALUES(${a.workspaceId}::uuid,${definitionId}::uuid,${o.key},${o.label},${n},${o.retired},${r}::uuid,${a.userId}::uuid)`,
      );
  }
  await t.db.execute(
    sql`UPDATE tracker.template_version SET state='published' WHERE id=${versionId}::uuid`,
  );
  if (templateId)
    await t.db.execute(
      sql`UPDATE tracker.template SET name=${d.name},current_version_id=${versionId}::uuid,version=version+1,command_receipt_id=${r}::uuid WHERE id=${id}::uuid`,
    );
  return { templateId: id, versionId, versionNo };
}
async function createTracker(
  c: Context,
  templateId: string,
  versionId: string,
  name: string,
) {
  const v = await readDefinition(c.t, versionId);
  if (v.templateId !== templateId || v.archived)
    throw new TrackerError(404, "Active private template/version unavailable.");
  const id = randomUUID();
  await c.t.db.execute(
    sql`INSERT INTO tracker.tracker(id,workspace_id,template_id,template_version_id,name,command_receipt_id,recorded_by_user_id) VALUES(${id}::uuid,${c.actor.workspaceId}::uuid,${templateId}::uuid,${versionId}::uuid,${name},${c.receiptId}::uuid,${c.actor.userId}::uuid)`,
  );
  return { trackerId: id };
}
async function revision(
  c: Context,
  tr: TrackerRow,
  versionId: string,
  input: ReturnType<typeof validateValues>,
  before: EntryRow | null,
  reason: string,
) {
  const { t, actor: a, receiptId: r } = c,
    id = before?.id ?? randomUUID(),
    revisionId = randomUUID(),
    n = (before?.revision_no ?? 0) + 1;
  if (!before)
    await t.db.execute(
      sql`INSERT INTO tracker.entry(id,workspace_id,tracker_id,template_version_id,current_revision_id,title,status_key,deadline_date,completed_at,command_receipt_id,recorded_by_user_id) VALUES(${id}::uuid,${a.workspaceId}::uuid,${tr.id}::uuid,${versionId}::uuid,${revisionId}::uuid,${input.title},${input.status || null},${input.deadline || null}::date,CASE WHEN ${input.completed} THEN clock_timestamp() ELSE NULL END,${r}::uuid,${a.userId}::uuid)`,
    );
  await t.db.execute(
    sql`INSERT INTO tracker.entry_revision(id,workspace_id,entry_id,template_version_id,revision_no,previous_revision_id,values_json,reason,command_receipt_id,recorded_by_user_id) VALUES(${revisionId}::uuid,${a.workspaceId}::uuid,${id}::uuid,${versionId}::uuid,${n},${before?.current_revision_id ?? null}::uuid,${json(input.values)}::jsonb,${reason},${r}::uuid,${a.userId}::uuid)`,
  );
  if (before)
    await t.db.execute(
      sql`UPDATE tracker.entry SET template_version_id=${versionId}::uuid,current_revision_id=${revisionId}::uuid,title=${input.title},status_key=${input.status || null},deadline_date=${input.deadline || null}::date,completed_at=CASE WHEN ${input.completed} THEN COALESCE(completed_at,clock_timestamp()) ELSE NULL END,notification_generation=notification_generation+CASE WHEN deadline_date IS DISTINCT FROM ${input.deadline || null}::date OR (completed_at IS NOT NULL)<>${input.completed} THEN 1 ELSE 0 END,version=version+1,command_receipt_id=${r}::uuid WHERE id=${id}::uuid`,
    );
  return { entryId: id, revisionId, revisionNo: n };
}
async function preview(
  t: ScopedTransaction,
  tr: TrackerRow,
  toId: string,
  rules: MigrationRules,
) {
  const from = await readDefinition(t, tr.template_version_id),
    to = await readDefinition(t, toId);
  if (
    to.templateId !== tr.template_id ||
    toId === tr.template_version_id ||
    to.versionNo <= from.versionNo
  )
    throw new TrackerError(
      422,
      "Choose a later version in this template lineage.",
    );
  const entries = await migrationEntries(t, tr.id),
    counts: Preview = {
      total: entries.length,
      valid: 0,
      invalid: 0,
      issues: [],
      samples: [],
    };
  // Validate mapping even for an empty tracker, without requiring example values.
  for (const [key, rule] of Object.entries(rules))
    if (
      !to.definition.fields.some((f) => f.key === key && !f.retired) ||
      (rule.from !== null &&
        !from.definition.fields.some((f) => f.key === rule.from))
    )
      throw new TrackerError(422, "Mapping references an unavailable field.");
  for (const e of entries) {
    if (e.template_version_id !== tr.template_version_id)
      throw new TrackerError(
        409,
        "Finish the interrupted migration before preparing a new target.",
      );
    try {
      const next = migrateValues(
        from.definition,
        to.definition,
        e.values,
        rules,
      );
      counts.valid++;
      if (counts.samples.length < 5)
        counts.samples.push({
          entryId: e.id,
          before: e.values,
          after: next.values,
        });
    } catch (error) {
      if (!(error instanceof TrackerError || error instanceof z.ZodError))
        throw error;
      counts.invalid++;
      if (counts.issues.length < 50)
        counts.issues.push({
          entryId: e.id,
          title: e.title,
          message: error.message,
        });
    }
  }
  const previewHash = hash({
    trackerId: tr.id,
    trackerVersion: tr.version,
    from: tr.template_version_id,
    to: toId,
    rules,
    entries: entries.map((e) => ({
      id: e.id,
      revision: e.current_revision_id,
      version: e.version,
    })),
  });
  return { counts, previewHash };
}
async function execute(
  c: Context,
  b: TrackerCommand,
): Promise<Record<string, unknown>> {
  const { t, actor: a, receiptId: r } = c;
  if (b.operation === "preset") {
    const p = await publish(
      c,
      presets[b.preset],
      null,
      null,
      "Create private preset",
      { key: b.preset, version: 1 },
    );
    return {
      ...p,
      ...(await createTracker(c, p.templateId, p.versionId, b.name)),
    };
  }
  if (b.operation === "publish")
    return publish(
      c,
      definitionSchema.parse(b.definition),
      b.templateId,
      b.expectedVersionId,
      b.reason,
    );
  if (b.operation === "create_tracker")
    return createTracker(c, b.templateId, b.versionId, b.name);
  if (b.operation === "save_entry") {
    const tr = await readTracker(t, b.trackerId);
    await assertEditable(t, tr.id);
    if (tr.archived_at)
      throw new TrackerError(
        409,
        "Restore this tracker before editing entries.",
      );
    const before = b.entryId ? await readEntry(t, b.entryId) : null;
    if (
      (before?.current_revision_id ?? null) !== b.expectedRevisionId ||
      (before && (before.tracker_id !== tr.id || before.archived_at))
    )
      throw new TrackerError(
        409,
        "Entry changed, belongs to another tracker, or is archived. Reload it.",
      );
    if (before && before.template_version_id !== tr.template_version_id)
      throw new TrackerError(
        409,
        "Finish migrating this tracker before editing.",
      );
    const v = await readDefinition(t, tr.template_version_id);
    return revision(
      c,
      tr,
      v.id,
      validateValues(v.definition, b.values),
      before,
      b.reason,
    );
  }
  if (b.operation === "archive") {
    const table =
      b.kind === "tracker"
        ? "tracker"
        : b.kind === "template"
          ? "template"
          : "entry";
    const before = (
      await t.db.execute<{
        id: string;
        version: number;
        tracker_id?: string;
        archived_at: string | null;
      }>(
        sql`SELECT * FROM tracker.${sql.identifier(table)} WHERE id=${b.id}::uuid`,
      )
    ).rows[0];
    if (!before) throw new TrackerError(404, "Private record unavailable.");
    if (before.version !== b.expectedVersion)
      throw new TrackerError(
        409,
        "Record changed. Reload before archiving/restoring.",
      );
    if (b.kind === "template") {
      const trackers = (
        await t.db.execute<{ id: string }>(
          sql`SELECT id FROM tracker.tracker WHERE template_id=${b.id}::uuid`,
        )
      ).rows;
      for (const tr of trackers) await assertEditable(t, tr.id);
    } else
      await assertEditable(t, b.kind === "tracker" ? b.id : before.tracker_id!);
    await t.db.execute(
      sql`UPDATE tracker.${sql.identifier(table)} SET archived_at=CASE WHEN ${b.archived} THEN clock_timestamp() ELSE NULL END,version=version+1,command_receipt_id=${r}::uuid WHERE id=${b.id}::uuid`,
    );
    return {
      id: b.id,
      version: before.version + 1,
      kind: b.kind,
      beforeArchived: before.archived_at !== null,
      archived: b.archived,
    };
  }
  if (b.operation === "preview") {
    const tr = await readTracker(t, b.trackerId);
    await assertEditable(t, tr.id);
    if (tr.archived_at)
      throw new TrackerError(409, "Restore tracker before migration.");
    const p = await preview(t, tr, b.toVersionId, b.rules),
      id = randomUUID();
    await t.db.execute(
      sql`INSERT INTO tracker.template_migration(id,workspace_id,tracker_id,from_version_id,to_version_id,mapping_json,preview_counts_json,preview_hash,command_receipt_id,recorded_by_user_id) VALUES(${id}::uuid,${a.workspaceId}::uuid,${tr.id}::uuid,${tr.template_version_id}::uuid,${b.toVersionId}::uuid,${json(b.rules)}::jsonb,${json(p.counts)}::jsonb,${p.previewHash},${r}::uuid,${a.userId}::uuid)`,
    );
    return { migrationId: id, ...p };
  }
  const m = await readMigration(t, b.migrationId),
    tr = await readTracker(t, m.tracker_id);
  if (b.operation === "cancel") {
    if (m.state === "completed")
      throw new TrackerError(409, "Completed migrations cannot be cancelled.");
    await t.db.execute(
      sql`UPDATE tracker.template_migration SET state='cancelled' WHERE id=${m.id}::uuid`,
    );
    return {
      migrationId: m.id,
      state: "cancelled",
      migrated: m.migrated_count,
    };
  }
  if (b.operation === "confirm") {
    if (
      !["preview", "cancelled", "failed"].includes(m.state) ||
      b.previewHash !== m.preview_hash
    )
      throw new TrackerError(
        409,
        "Review the current migration before confirmation.",
      );
    if (m.migrated_count === 0) {
      await assertEditable(t, tr.id);
      const p = await preview(t, tr, m.to_version_id, m.mapping_json);
      if (p.previewHash !== m.preview_hash)
        throw new TrackerError(
          409,
          "Preview is stale. Prepare and review a new preview.",
        );
      if (p.counts.invalid)
        throw new TrackerError(
          422,
          "Resolve invalid entries/defaults in a new preview before confirming.",
        );
    } else if (tr.template_version_id !== m.from_version_id)
      throw new TrackerError(409, "Tracker version changed.");
    await t.db.execute(
      sql`UPDATE tracker.template_migration SET state='confirmed' WHERE id=${m.id}::uuid`,
    );
    return { migrationId: m.id, state: "confirmed" };
  }
  if (!["confirmed", "running", "failed"].includes(m.state))
    throw new TrackerError(
      409,
      "Confirm or resume this migration before processing a batch.",
    );
  const from = await readDefinition(t, m.from_version_id),
    to = await readDefinition(t, m.to_version_id);
  const entries = (await migrationEntries(t, tr.id))
    .filter((e) => e.template_version_id !== m.to_version_id)
    .slice(0, 50);
  for (const e of entries) {
    if (e.template_version_id !== m.from_version_id)
      throw new TrackerError(409, "Unexpected entry version.");
    await revision(
      c,
      tr,
      to.id,
      migrateValues(from.definition, to.definition, e.values, m.mapping_json),
      e,
      `Template migration ${m.id}`,
    );
  }
  const remaining = (
    await t.db.execute<{ n: number }>(
      sql`SELECT count(*)::int n FROM tracker.entry WHERE tracker_id=${tr.id}::uuid AND template_version_id<>${m.to_version_id}::uuid`,
    )
  ).rows[0]!.n;
  const state = remaining === 0 ? "completed" : "running";
  if (state === "completed")
    await t.db.execute(
      sql`UPDATE tracker.tracker SET template_version_id=${m.to_version_id}::uuid,version=version+1,command_receipt_id=${r}::uuid WHERE id=${tr.id}::uuid`,
    );
  await t.db.execute(
    sql`UPDATE tracker.template_migration SET state=${state},migrated_count=migrated_count+${entries.length},last_entry_id=COALESCE(${entries.at(-1)?.id ?? null}::uuid,last_entry_id),completed_at=CASE WHEN ${state}='completed' THEN clock_timestamp() ELSE NULL END WHERE id=${m.id}::uuid`,
  );
  return {
    migrationId: m.id,
    state,
    migrated: m.migrated_count + entries.length,
    remaining,
  };
}
export async function recordTrackerCommand(
  actor: ScopedDatabaseContext & { requestId?: string | undefined },
  raw: unknown,
) {
  if (!trackersEnabled())
    throw new TrackerError(404, "Tracker preview unavailable.");
  const a = z
      .object({
        userId: z.uuid(),
        workspaceId: z.uuid(),
        requestId: z.uuid().optional(),
      })
      .strict()
      .parse(actor),
    b = trackerCommandSchema.parse(raw);
  return withDomainTransaction(a, async (t) => {
    await lockActivePrivateWorkspace(t, a);
    // One owned workspace lock serializes tracker mutations, receipts, previews and lifecycle.
    await t.db.execute(
      sql`SELECT id FROM core.workspace WHERE id=${a.workspaceId}::uuid FOR UPDATE`,
    );
    const receipt = await claimCommandReceipt(t, {
      workspaceId: a.workspaceId,
      clientCommandId: b.clientCommandId,
      commandType: `tracker.${b.operation}`,
      payloadHash: hashCommandPayload(b as CanonicalJsonValue),
    });
    if (receipt.kind === "replay") return receipt.result;
    const result = await execute(
      { t, actor: a, receiptId: receipt.receiptId },
      b,
    );
    const subjectId = String(
      result.entryId ??
        result.migrationId ??
        result.trackerId ??
        result.templateId ??
        result.id,
    );
    await createPrivateRevision(t, {
      id: randomUUID(),
      workspaceId: a.workspaceId,
      commandReceiptId: receipt.receiptId,
      subjectKind: "tracker",
      subjectId,
      subjectVersion: Number(
        result.revisionNo ?? result.versionNo ?? result.version ?? 1,
      ),
      operation: b.operation,
      beforeJson: null,
      afterJson: result,
      reason: "reason" in b ? b.reason : null,
      effectiveDate: null,
      recordedByUserId: a.userId,
      actorKind: "user",
      requestId: a.requestId ?? null,
    });
    await completeCommandReceipt(t, {
      workspaceId: a.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    await t.db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
    return result;
  });
}
