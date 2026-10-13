import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ScopedTransaction } from "@/platform/db";
import {
  PlanningUnavailableError,
  recurrenceRuleSchema,
} from "../domain/recurrence";

export type EvidenceTable =
  | "recurring_obligation"
  | "recurrence_version"
  | "expected_occurrence"
  | "occurrence_actual_link";
export type Evidence = Record<string, unknown>;
export async function readPlanningEvidence(
  t: ScopedTransaction,
  workspaceId: string,
  table: EvidenceTable,
  id: string,
): Promise<Evidence> {
  const result = await t.db.execute<{ snapshot: Evidence }>(
    sql`SELECT planning.evidence_snapshot(to_jsonb(x)) AS snapshot FROM ${sql.identifier("planning")}.${sql.identifier(table)} x WHERE workspace_id=${workspaceId}::uuid AND id=${id}::uuid`,
  );
  if (!result.rows[0]) throw new PlanningUnavailableError();
  return result.rows[0].snapshot;
}
export const rootEvidenceSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(["income", "bill", "subscription"]),
    current_version_id: z.uuid(),
    archived_at: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .passthrough();
export const occurrenceEvidenceSchema = z
  .object({
    id: z.uuid(),
    obligation_id: z.uuid(),
    recurrence_version_id: z.uuid(),
    logical_date: z.string(),
    due_date: z.string(),
    expected_minor: z.string(),
    state: z.enum(["planned", "linked", "completed", "skipped", "cancelled"]),
    version: z.number().int().positive(),
  })
  .passthrough();
export async function readPlanningRoot(
  t: ScopedTransaction,
  workspaceId: string,
  id: string,
) {
  return rootEvidenceSchema.parse(
    await readPlanningEvidence(t, workspaceId, "recurring_obligation", id),
  );
}
export async function readPlanningOccurrence(
  t: ScopedTransaction,
  workspaceId: string,
  id: string,
) {
  return occurrenceEvidenceSchema.parse(
    await readPlanningEvidence(t, workspaceId, "expected_occurrence", id),
  );
}
export function ruleFromEvidence(e: Evidence) {
  return recurrenceRuleSchema.parse({
    effectiveFrom: e.effective_from,
    frequency: e.frequency,
    intervalCount: e.interval_count,
    weekdays: e.weekdays,
    dayOfMonth: e.day_of_month,
    shortMonthPolicy: e.short_month_policy,
    endsOn: e.ends_on,
    occurrenceLimit: e.occurrence_limit,
    expectedMinor: e.expected_minor,
    currency: e.currency,
    categoryId: e.category_id,
    defaultAccountId: e.default_account_id,
    timezone: e.timezone,
  });
}
export async function readPlanningVersions(
  t: ScopedTransaction,
  workspaceId: string,
  obligationId: string,
) {
  const result = await t.db.execute<{ snapshot: Evidence }>(
    sql`SELECT planning.evidence_snapshot(to_jsonb(r)) AS snapshot FROM planning.recurrence_version r WHERE workspace_id=${workspaceId}::uuid AND obligation_id=${obligationId}::uuid ORDER BY effective_from LIMIT 1001`,
  );
  if (result.rows.length > 1000)
    throw new RangeError(
      "Recurrence version history exceeds the supported interactive limit.",
    );
  return result.rows.map(({ snapshot }) => ({
    id: String(snapshot.id),
    versionNo: Number(snapshot.version_no),
    rule: ruleFromEvidence(snapshot),
    evidence: snapshot,
  }));
}
export async function readOccurrenceLinkedMinor(
  t: ScopedTransaction,
  workspaceId: string,
  occurrenceId: string,
) {
  const r = await t.db.execute<{ amount: string }>(
    sql`SELECT COALESCE(sum(linked_minor::numeric),0)::text AS amount FROM planning.effective_occurrence_link_v WHERE workspace_id=${workspaceId}::uuid AND occurrence_id=${occurrenceId}::uuid`,
  );
  return BigInt(r.rows[0]!.amount);
}
export type PlanningOccurrenceRow = {
  id: string;
  obligationId: string;
  recurrenceVersionId: string;
  logicalDate: string;
  generation: number;
  dueDate: string;
  expectedMinor: string;
  state: "planned" | "linked" | "completed" | "skipped" | "cancelled";
  version: number;
  linkedMinor: string;
  remainingMinor: string;
  overrideReason: string | null;
  timezone: string;
  name: string;
  kind: "income" | "bill" | "subscription";
};
export async function listPlanningOccurrences(
  t: ScopedTransaction,
  workspaceId: string,
  obligationId: string,
  cursor: string | null,
  pageSize: number,
) {
  const result = await t.db.execute<PlanningOccurrenceRow>(
    sql`SELECT id,obligation_id AS "obligationId",recurrence_version_id AS "recurrenceVersionId",logical_date::text AS "logicalDate",generation,due_date::text AS "dueDate",expected_minor::text AS "expectedMinor",state,version,linked_minor::text AS "linkedMinor",remaining_minor::text AS "remainingMinor",override_reason AS "overrideReason",timezone,name,kind FROM planning.occurrence_due_v WHERE workspace_id=${workspaceId}::uuid AND obligation_id=${obligationId}::uuid AND (${cursor}::uuid IS NULL OR (logical_date,generation,id)>(SELECT logical_date,generation,id FROM planning.expected_occurrence WHERE workspace_id=${workspaceId}::uuid AND obligation_id=${obligationId}::uuid AND id=${cursor}::uuid)) ORDER BY logical_date,generation,id LIMIT ${pageSize + 1}`,
  );
  const hasMore = result.rows.length > pageSize,
    items = result.rows.slice(0, pageSize);
  return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
}
