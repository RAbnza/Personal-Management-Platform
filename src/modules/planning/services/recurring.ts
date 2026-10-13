import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  recurringObligation,
  recurrenceVersion,
  expectedOccurrence,
  occurrenceActualLink,
} from "@/platform/db/schema";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import {
  lockActiveFinancialWorkspace,
  advanceWorkspaceFinancialRevision,
  enforceDeferredFinancialConstraints,
} from "@/modules/finance/repositories/financial-write-repository";
import {
  generateRecurrenceDates,
  planningCommandSchema,
  planningToday,
  planningId,
  PlanningConflictError,
  PlanningUnavailableError,
  type PlanningCommand,
} from "../domain/recurrence";
import {
  readPlanningEvidence,
  readPlanningRoot,
  readPlanningOccurrence,
  readPlanningVersions,
  readOccurrenceLinkedMinor,
  type EvidenceTable,
  type Evidence,
} from "../repositories/recurring-repository";

const actorSchema = z
  .object({
    userId: planningId,
    workspaceId: planningId,
    requestId: planningId.optional(),
  })
  .strict();
const resultSchema = z
  .object({
    obligationId: planningId,
    version: z.number().int().positive(),
    recurrenceVersionId: planningId.optional(),
    occurrenceId: planningId.optional(),
    linkId: planningId.optional(),
    occurrenceIds: z.array(planningId).max(500).optional(),
    generationFrom: z.string().optional(),
    generationThrough: z.string().optional(),
    reason: z.string().nullable(),
    financialRevision: z.string().regex(/^\d+$/),
  })
  .strict();
export type PlanningResult = z.output<typeof resultSchema>;
type Actor = z.output<typeof actorSchema>;
type Context = {
  t: ScopedTransaction;
  actor: Actor;
  receiptId: string;
  reason: string | null;
};
async function audit(
  c: Context,
  table: EvidenceTable,
  id: string,
  before: Evidence | null,
  operation: "create" | "replace" | "void" = before ? "replace" : "create",
) {
  const after = await readPlanningEvidence(c.t, c.actor.workspaceId, table, id);
  let effectiveDate: string | null = null;
  if (table === "recurrence_version")
    effectiveDate = String(after.effective_from);
  else if (table === "expected_occurrence")
    effectiveDate = String(after.due_date);
  else if (table === "occurrence_actual_link") {
    const r = await c.t.db.execute<{ date: string }>(
      sql`SELECT primary_effective_date::text AS date FROM finance.action_revision WHERE workspace_id=${c.actor.workspaceId}::uuid AND id=${String(after.action_revision_id)}::uuid`,
    );
    effectiveDate = r.rows[0]!.date;
  }
  await createPrivateRevision(c.t, {
    id: randomUUID(),
    workspaceId: c.actor.workspaceId,
    commandReceiptId: c.receiptId,
    subjectKind: table,
    subjectId: id,
    subjectVersion: Number(after.version ?? after.version_no ?? 1),
    operation,
    beforeJson: before,
    afterJson: after,
    reason: c.reason,
    effectiveDate,
    recordedByUserId: c.actor.userId,
    actorKind: "user",
    requestId: c.actor.requestId ?? null,
  });
}
async function checkRoot(c: Context, id: string, expected: number) {
  const root = await readPlanningRoot(c.t, c.actor.workspaceId, id);
  if (root.version !== expected || root.archived_at !== null)
    throw new PlanningConflictError(
      "The definition changed or is archived. Reload its current history.",
    );
  return root;
}
async function changeOccurrence(
  c: Context,
  id: string,
  before: Evidence,
  changes: {
    state: string;
    dueDate?: string | undefined;
    expectedMinor?: string;
    overrideReason?: string | null;
  },
) {
  await c.t.db.execute(
    sql`UPDATE planning.expected_occurrence SET state=${changes.state},due_date=COALESCE(${changes.dueDate ?? null}::date,due_date),expected_minor=COALESCE(${changes.expectedMinor ?? null}::bigint,expected_minor),override_reason=CASE WHEN ${changes.overrideReason !== undefined} THEN ${changes.overrideReason ?? null} ELSE override_reason END,completed_at=CASE WHEN ${changes.state}='completed' THEN COALESCE(completed_at,clock_timestamp()) ELSE NULL END,version=version+1,command_receipt_id=${c.receiptId}::uuid,recorded_by_user_id=${c.actor.userId}::uuid,request_id=${c.actor.requestId ?? null}::uuid WHERE workspace_id=${c.actor.workspaceId}::uuid AND id=${id}::uuid`,
  );
  await audit(c, "expected_occurrence", id, before);
}
async function cancelFuture(
  c: Context,
  obligationId: string,
  boundary: string,
) {
  const r = await c.t.db.execute<{ snapshot: Evidence }>(
    sql`SELECT planning.evidence_snapshot(to_jsonb(o)) snapshot FROM planning.expected_occurrence o WHERE workspace_id=${c.actor.workspaceId}::uuid AND obligation_id=${obligationId}::uuid AND logical_date>=${boundary}::date AND due_date>=${boundary}::date AND state='planned' ORDER BY logical_date,id LIMIT 10001`,
  );
  if (r.rows.length > 10000)
    throw new PlanningConflictError(
      "Too many outstanding occurrences for one reviewed revision.",
    );
  for (const { snapshot } of r.rows)
    await changeOccurrence(c, String(snapshot.id), snapshot, {
      state: "cancelled",
      overrideReason: c.reason,
    });
}
async function generate(
  c: Context,
  obligationId: string,
  window: { from: string; through: string },
) {
  const versions = await readPlanningVersions(
    c.t,
    c.actor.workspaceId,
    obligationId,
  );
  const existing = await c.t.db.execute<{
    id: string;
    date: string;
    generation: number;
    recurrenceVersionId: string;
    state: string;
  }>(
    sql`SELECT id,logical_date::text AS date,generation,recurrence_version_id AS "recurrenceVersionId",state FROM planning.expected_occurrence WHERE workspace_id=${c.actor.workspaceId}::uuid AND obligation_id=${obligationId}::uuid AND logical_date BETWEEN ${window.from}::date AND ${window.through}::date ORDER BY generation DESC LIMIT 10001`,
  );
  if (existing.rows.length > 10000)
    throw new PlanningConflictError(
      "Occurrence generation history exceeds this interactive window.",
    );
  const ids: string[] = [];
  for (let i = 0; i < versions.length; i += 1) {
    const v = versions[i]!,
      next = versions[i + 1];
    for (const date of generateRecurrenceDates(v.rule, window)) {
      if (next && date >= next.rule.effectiveFrom) continue;
      const prior = existing.rows.filter((x) => x.date === date);
      const active = prior.find((x) => x.state !== "cancelled");
      if (active) {
        ids.push(active.id);
        continue;
      }
      if (prior.some((x) => x.recurrenceVersionId === v.id)) continue;
      const id = randomUUID();
      await c.t.db.insert(expectedOccurrence).values({
        id,
        workspaceId: c.actor.workspaceId,
        obligationId,
        recurrenceVersionId: v.id,
        logicalDate: date,
        dueDate: date,
        expectedMinor: BigInt(v.rule.expectedMinor),
        generation: (prior[0]?.generation ?? 0) + 1,
        commandReceiptId: c.receiptId,
        recordedByUserId: c.actor.userId,
        requestId: c.actor.requestId ?? null,
      });
      await audit(c, "expected_occurrence", id, null);
      ids.push(id);
    }
  }
  if (ids.length > 500)
    throw new PlanningConflictError("Generation exceeds 500 occurrences.");
  return ids;
}
async function definition(
  c: Context,
  b: Extract<PlanningCommand, { operation: "definition" }>,
) {
  if (b.rule.categoryId) {
    const category = await c.t.db.execute(
      sql`SELECT id FROM core.category WHERE workspace_id=${c.actor.workspaceId}::uuid AND id=${b.rule.categoryId}::uuid AND archived_at IS NULL AND kind=${b.kind === "income" ? "income" : "expense"}`,
    );
    if (!category.rows.length) throw new PlanningUnavailableError();
  }
  if (b.rule.defaultAccountId) {
    const account = await c.t.db.execute(
      sql`SELECT id FROM finance.financial_account WHERE workspace_id=${c.actor.workspaceId}::uuid AND id=${b.rule.defaultAccountId}::uuid AND archived_at IS NULL AND currency='PHP'`,
    );
    if (!account.rows.length) throw new PlanningUnavailableError();
  }
  const zone = await c.t.db.execute(
    sql`SELECT name FROM pg_timezone_names WHERE name=${b.rule.timezone}`,
  );
  if (!zone.rows.length)
    throw new PlanningConflictError(
      "The named timezone is unavailable. Select a supported timezone and review the dates.",
    );
  const before = b.obligationId
    ? await checkRoot(c, b.obligationId, b.expectedVersion!)
    : null;
  if (before && before.kind !== b.kind)
    throw new PlanningConflictError(
      "The recurring kind is immutable. Create a separate definition for a different financial meaning.",
    );
  const obligationId = b.obligationId ?? randomUUID(),
    revisionId = randomUUID();
  const versions = before
    ? await readPlanningVersions(c.t, c.actor.workspaceId, obligationId)
    : [];
  const previous = versions.at(-1);
  if (
    previous &&
    (b.rule.effectiveFrom <= previous.rule.effectiveFrom ||
      b.rule.effectiveFrom < planningToday(previous.rule.timezone))
  )
    throw new PlanningConflictError(
      "Select a new future boundary after the current rule's start.",
    );
  if (b.window.through < b.rule.effectiveFrom)
    throw new PlanningConflictError(
      "The preview/generation window must include the new rule.",
    );
  if (!before)
    await c.t.db.insert(recurringObligation).values({
      id: obligationId,
      workspaceId: c.actor.workspaceId,
      name: b.name,
      kind: b.kind,
      commandReceiptId: c.receiptId,
      recordedByUserId: c.actor.userId,
      requestId: c.actor.requestId ?? null,
    });
  await c.t.db.insert(recurrenceVersion).values({
    ...b.rule,
    expectedMinor: BigInt(b.rule.expectedMinor),
    id: revisionId,
    workspaceId: c.actor.workspaceId,
    obligationId,
    versionNo: (previous?.versionNo ?? 0) + 1,
    previousVersionId: previous?.id ?? null,
    reason: c.reason,
    commandReceiptId: c.receiptId,
    recordedByUserId: c.actor.userId,
    requestId: c.actor.requestId ?? null,
  });
  await audit(c, "recurrence_version", revisionId, null);
  if (before) await cancelFuture(c, obligationId, b.rule.effectiveFrom);
  const version = (before?.version ?? 0) + 1;
  await c.t.db.execute(
    sql`UPDATE planning.recurring_obligation SET name=${b.name},current_version_id=${revisionId}::uuid,version=${version},command_receipt_id=${c.receiptId}::uuid,recorded_by_user_id=${c.actor.userId}::uuid,request_id=${c.actor.requestId ?? null}::uuid WHERE workspace_id=${c.actor.workspaceId}::uuid AND id=${obligationId}::uuid`,
  );
  await audit(c, "recurring_obligation", obligationId, before);
  return {
    obligationId,
    version,
    recurrenceVersionId: revisionId,
    occurrenceIds: await generate(c, obligationId, b.window),
    generationFrom: b.window.from,
    generationThrough: b.window.through,
  };
}
async function mutate(
  c: Context,
  b: PlanningCommand,
): Promise<Omit<PlanningResult, "financialRevision" | "reason">> {
  if (b.operation === "definition") return definition(c, b);
  if (b.operation === "generate") {
    const root = await checkRoot(c, b.obligationId, b.expectedVersion);
    return {
      obligationId: root.id,
      version: root.version,
      occurrenceIds: await generate(c, root.id, b.window),
      generationFrom: b.window.from,
      generationThrough: b.window.through,
    };
  }
  if (b.operation === "archive") {
    const before = await checkRoot(c, b.obligationId, b.expectedVersion),
      versions = await readPlanningVersions(
        c.t,
        c.actor.workspaceId,
        before.id,
      );
    await cancelFuture(
      c,
      before.id,
      planningToday(versions.at(-1)!.rule.timezone),
    );
    await c.t.db.execute(
      sql`UPDATE planning.recurring_obligation SET archived_at=clock_timestamp(),version=version+1,command_receipt_id=${c.receiptId}::uuid,recorded_by_user_id=${c.actor.userId}::uuid,request_id=${c.actor.requestId ?? null}::uuid WHERE workspace_id=${c.actor.workspaceId}::uuid AND id=${before.id}::uuid`,
    );
    await audit(c, "recurring_obligation", before.id, before);
    return { obligationId: before.id, version: before.version + 1 };
  }
  const original =
    b.operation === "unlink"
      ? await readPlanningEvidence(
          c.t,
          c.actor.workspaceId,
          "occurrence_actual_link",
          b.linkId,
        )
      : null;
  const occurrenceId =
    b.operation === "unlink" ? String(original!.occurrence_id) : b.occurrenceId;
  const before = await readPlanningOccurrence(
    c.t,
    c.actor.workspaceId,
    occurrenceId,
  );
  const expected =
    b.operation === "unlink" ? b.expectedOccurrenceVersion : b.expectedVersion;
  if (
    before.version !== expected ||
    before.state === "skipped" ||
    before.state === "cancelled"
  )
    throw new PlanningConflictError();
  const linked = await readOccurrenceLinkedMinor(
    c.t,
    c.actor.workspaceId,
    occurrenceId,
  );
  if (b.operation === "occurrence") {
    if (
      before.state === "completed" ||
      (b.change !== "override" && linked > 0n) ||
      (b.change === "override" && BigInt(b.expectedMinor!) < linked)
    )
      throw new PlanningConflictError(
        "Reverse actual links before skipping/cancelling, or retain enough expected amount for supported links.",
      );
    const expectedMinor =
      b.change === "override" ? b.expectedMinor! : before.expected_minor;
    const state =
      b.change === "skip"
        ? "skipped"
        : b.change === "cancel"
          ? "cancelled"
          : linked === 0n
            ? "planned"
            : linked === BigInt(expectedMinor)
              ? "completed"
              : "linked";
    await changeOccurrence(c, occurrenceId, before, {
      state,
      dueDate: b.dueDate ?? undefined,
      expectedMinor,
      overrideReason: b.reason,
    });
    return {
      obligationId: before.obligation_id,
      occurrenceId,
      version: before.version + 1,
    };
  }
  const linkId = randomUUID();
  if (b.operation === "unlink") {
    const active = await c.t.db.execute(
      sql`SELECT id FROM planning.effective_occurrence_link_v WHERE workspace_id=${c.actor.workspaceId}::uuid AND id=${b.linkId}::uuid`,
    );
    if (!active.rows.length || original!.reverses_link_id !== null)
      throw new PlanningConflictError(
        "This original link has already been reversed.",
      );
    await c.t.db.insert(occurrenceActualLink).values({
      id: linkId,
      workspaceId: c.actor.workspaceId,
      occurrenceId,
      actionId: String(original!.action_id),
      actionRevisionId: String(original!.action_revision_id),
      linkedMinor: BigInt(String(original!.linked_minor)),
      reversesLinkId: b.linkId,
      reason: b.reason,
      commandReceiptId: c.receiptId,
      recordedByUserId: c.actor.userId,
      requestId: c.actor.requestId ?? null,
    });
    await audit(c, "occurrence_actual_link", linkId, original, "void");
  } else {
    const root = await readPlanningRoot(
      c.t,
      c.actor.workspaceId,
      before.obligation_id,
    );
    const actual = await c.t.db.execute<{
      amount: string;
      used: string;
      kind: string;
    }>(
      sql`SELECT a.amount_minor::text AS amount,a.action_kind AS kind,COALESCE((SELECT sum(l.linked_minor::numeric) FROM planning.effective_occurrence_link_v l WHERE l.workspace_id=a.workspace_id AND l.action_id=a.action_id),0)::text AS used FROM planning.eligible_actual_v a WHERE workspace_id=${c.actor.workspaceId}::uuid AND action_id=${b.actionId}::uuid AND action_revision_id=${b.actionRevisionId}::uuid`,
    );
    if (!actual.rows[0]) {
      const owned = await c.t.db.execute(
        sql`SELECT id FROM finance.financial_action WHERE workspace_id=${c.actor.workspaceId}::uuid AND id=${b.actionId}::uuid`,
      );
      if (owned.rows.length)
        throw new PlanningConflictError(
          "The actual transaction changed or is no longer eligible. Reload its current evidence before linking.",
        );
      throw new PlanningUnavailableError();
    }
    const x = actual.rows[0];
    const duplicate = await c.t.db.execute(
      sql`SELECT id FROM planning.effective_occurrence_link_v WHERE workspace_id=${c.actor.workspaceId}::uuid AND occurrence_id=${occurrenceId}::uuid AND action_id=${b.actionId}::uuid`,
    );
    if (
      (root.kind === "income") !== (x.kind === "income") ||
      duplicate.rows.length ||
      BigInt(b.linkedMinor) + BigInt(x.used) > BigInt(x.amount) ||
      linked + BigInt(b.linkedMinor) > BigInt(before.expected_minor)
    )
      throw new PlanningConflictError(
        "Link exceeds the expected amount or eligible actual capacity, has the wrong financial meaning, or duplicates an active source link.",
      );
    await c.t.db.insert(occurrenceActualLink).values({
      id: linkId,
      workspaceId: c.actor.workspaceId,
      occurrenceId,
      actionId: b.actionId,
      actionRevisionId: b.actionRevisionId,
      linkedMinor: BigInt(b.linkedMinor),
      commandReceiptId: c.receiptId,
      recordedByUserId: c.actor.userId,
      requestId: c.actor.requestId ?? null,
    });
    await audit(c, "occurrence_actual_link", linkId, null);
  }
  const total = await readOccurrenceLinkedMinor(
    c.t,
    c.actor.workspaceId,
    occurrenceId,
  );
  await changeOccurrence(c, occurrenceId, before, {
    state:
      total === 0n
        ? "planned"
        : total === BigInt(before.expected_minor)
          ? "completed"
          : "linked",
  });
  return {
    obligationId: before.obligation_id,
    occurrenceId,
    linkId,
    version: before.version + 1,
  };
}
export async function recordRecurringCommand(
  input: z.input<typeof actorSchema> & z.input<typeof planningCommandSchema>,
) {
  const { userId, workspaceId, requestId, ...raw } = input,
    actor = actorSchema.parse({ userId, workspaceId, requestId }),
    body = planningCommandSchema.parse(raw);
  return withDomainTransaction(actor, async (t) => {
    await lockActiveFinancialWorkspace(t, actor.workspaceId);
    const { clientCommandId, ...intent } = body;
    const receipt = await claimFinancialCommandReceipt(t, {
      workspaceId: actor.workspaceId,
      clientCommandId,
      commandType: `planning.${body.operation}`,
      payloadHash: hashFinancialCommandPayload(intent),
    });
    if (receipt.kind === "replay") return resultSchema.parse(receipt.result);
    const reason = "reason" in body ? body.reason : null;
    const outcome = await mutate(
      { t, actor, receiptId: receipt.receiptId, reason },
      body,
    );
    const result = resultSchema.parse({
      ...outcome,
      reason,
      financialRevision: await advanceWorkspaceFinancialRevision(
        t,
        actor.workspaceId,
      ),
    });
    await completeFinancialCommandReceipt(t, {
      workspaceId: actor.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    await enforceDeferredFinancialConstraints(t);
    return result;
  });
}
