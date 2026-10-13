import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { planningId, PlanningUnavailableError } from "../domain/recurrence";
import {
  listPlanningOccurrences,
  readPlanningEvidence,
  readPlanningOccurrence,
  readPlanningRoot,
  readPlanningVersions,
  ruleFromEvidence,
  type Evidence,
} from "../repositories/recurring-repository";
const scope = z
  .object({ userId: planningId, workspaceId: planningId })
  .strict();
const paging = {
  pageSize: z.number().int().min(1).max(100).default(50),
  cursor: planningId.optional(),
};
const listSchema = scope.extend(paging).strict();
export async function listRecurringObligations(
  input: z.input<typeof listSchema>,
) {
  const p = listSchema.parse(input);
  return withDomainTransaction(
    p,
    async (t) => {
      const r = await t.db.execute<{ snapshot: Evidence; rule: Evidence }>(
        sql`SELECT planning.evidence_snapshot(to_jsonb(p)) AS snapshot,planning.evidence_snapshot(to_jsonb(r)) AS rule FROM planning.recurring_obligation p JOIN planning.recurrence_version r ON r.workspace_id=p.workspace_id AND r.id=p.current_version_id WHERE p.workspace_id=${p.workspaceId}::uuid AND (${p.cursor ?? null}::uuid IS NULL OR p.id>${p.cursor ?? null}::uuid) ORDER BY p.id LIMIT ${p.pageSize + 1}`,
      );
      const items = r.rows.slice(0, p.pageSize).map((x) => ({
        id: String(x.snapshot.id),
        name: String(x.snapshot.name),
        kind: String(x.snapshot.kind),
        archived: x.snapshot.archived_at !== null,
        version: Number(x.snapshot.version),
        rule: ruleFromEvidence(x.rule),
      }));
      return {
        items,
        nextCursor: r.rows.length > p.pageSize ? items.at(-1)!.id : null,
      };
    },
    { readOnlySnapshot: true },
  );
}
const detailSchema = scope
  .extend({ obligationId: planningId, ...paging })
  .strict();
export async function getRecurringObligation(
  input: z.input<typeof detailSchema>,
) {
  const p = detailSchema.parse(input);
  return withDomainTransaction(
    p,
    async (t) => {
      const root = await readPlanningRoot(t, p.workspaceId, p.obligationId),
        versions = await readPlanningVersions(t, p.workspaceId, p.obligationId),
        occurrences = await listPlanningOccurrences(
          t,
          p.workspaceId,
          p.obligationId,
          p.cursor ?? null,
          p.pageSize,
        );
      const history = await t.db.execute<{
        id: string;
        operation: string;
        createdAt: string;
        reason: string | null;
        before: Evidence | null;
        after: Evidence;
      }>(
        sql`SELECT id,operation,created_at::text AS "createdAt",reason,before_json AS before,after_json AS after FROM audit.private_revision WHERE workspace_id=${p.workspaceId}::uuid AND subject_kind='recurring_obligation' AND subject_id=${p.obligationId}::uuid ORDER BY subject_version DESC LIMIT 50`,
      );
      return { root, versions, occurrences, history: history.rows };
    },
    { readOnlySnapshot: true },
  );
}
const occurrenceSchema = scope
  .extend({
    occurrenceId: planningId,
    actualCursor: planningId.optional(),
    preferredActionId: planningId.optional(),
  })
  .strict();
export async function getRecurringOccurrence(
  input: z.input<typeof occurrenceSchema>,
) {
  const p = occurrenceSchema.parse(input);
  return withDomainTransaction(
    p,
    async (t) => {
      const occurrence = await readPlanningOccurrence(
          t,
          p.workspaceId,
          p.occurrenceId,
        ),
        root = await readPlanningRoot(
          t,
          p.workspaceId,
          occurrence.obligation_id,
        ),
        evidence = await readPlanningEvidence(
          t,
          p.workspaceId,
          "recurrence_version",
          occurrence.recurrence_version_id,
        );
      const links = await t.db.execute<{
        id: string;
        actionId: string;
        actionRevisionId: string;
        linkedMinor: string;
        reversesLinkId: string | null;
        effective: boolean;
        recordedAt: string;
        reason: string | null;
      }>(
        sql`SELECT l.id,l.action_id AS "actionId",l.action_revision_id AS "actionRevisionId",l.linked_minor::text AS "linkedMinor",l.reverses_link_id AS "reversesLinkId",e.id IS NOT NULL AS effective,l.created_at::text AS "recordedAt",l.reason FROM planning.occurrence_actual_link l LEFT JOIN planning.effective_occurrence_link_v e ON e.workspace_id=l.workspace_id AND e.id=l.id WHERE l.workspace_id=${p.workspaceId}::uuid AND l.occurrence_id=${p.occurrenceId}::uuid ORDER BY l.created_at DESC,l.id LIMIT 1001`,
      );
      if (links.rows.length > 1000)
        throw new RangeError(
          "Occurrence link history exceeds the supported interactive limit.",
        );
      const candidates = await t.db.execute<{
        actionId: string;
        actionRevisionId: string;
        transactionDate: string;
        description: string;
        amountMinor: string;
        availableMinor: string;
        kind: string;
      }>(
        sql`SELECT a.action_id AS "actionId",a.action_revision_id AS "actionRevisionId",a.transaction_date::text AS "transactionDate",a.description,a.amount_minor::text AS "amountMinor",(a.amount_minor::numeric-COALESCE(used.amount,0))::text AS "availableMinor",a.action_kind AS kind FROM planning.eligible_actual_v a LEFT JOIN LATERAL(SELECT sum(l.linked_minor::numeric) amount FROM planning.effective_occurrence_link_v l WHERE l.workspace_id=a.workspace_id AND l.action_id=a.action_id) used ON true WHERE a.workspace_id=${p.workspaceId}::uuid AND (${root.kind === "income"}::boolean)=(a.action_kind='income') AND a.amount_minor::numeric>COALESCE(used.amount,0) AND NOT EXISTS(SELECT 1 FROM planning.effective_occurrence_link_v l WHERE l.workspace_id=a.workspace_id AND l.action_id=a.action_id AND l.occurrence_id=${p.occurrenceId}::uuid) AND (${p.actualCursor ?? null}::uuid IS NULL OR (CASE WHEN a.action_id=${p.preferredActionId ?? null}::uuid THEN 0 ELSE 1 END,a.action_id)>(CASE WHEN ${p.actualCursor ?? null}::uuid=${p.preferredActionId ?? null}::uuid THEN 0 ELSE 1 END,${p.actualCursor ?? null}::uuid)) ORDER BY CASE WHEN a.action_id=${p.preferredActionId ?? null}::uuid THEN 0 ELSE 1 END,a.action_id LIMIT 51`,
      );
      const totals = await t.db.execute<{
        remainingMinor: string;
        linkedMinor: string;
      }>(
        sql`SELECT remaining_minor::text AS "remainingMinor",linked_minor::text AS "linkedMinor" FROM planning.occurrence_due_v WHERE workspace_id=${p.workspaceId}::uuid AND id=${p.occurrenceId}::uuid`,
      );
      if (!totals.rows[0]) throw new PlanningUnavailableError();
      const history = await t.db.execute<{
        id: string;
        operation: string;
        recordedAt: string;
        reason: string | null;
        before: Evidence | null;
        after: Evidence;
      }>(
        sql`SELECT id,operation,created_at::text AS "recordedAt",reason,before_json AS before,after_json AS after FROM audit.private_revision WHERE workspace_id=${p.workspaceId}::uuid AND subject_kind='expected_occurrence' AND subject_id=${p.occurrenceId}::uuid ORDER BY subject_version DESC LIMIT 50`,
      );
      const actuals = candidates.rows.slice(0, 50);
      return {
        occurrence,
        root,
        rule: ruleFromEvidence(evidence),
        links: links.rows,
        ...totals.rows[0],
        actuals,
        preferredActionId: p.preferredActionId ?? null,
        nextActualCursor:
          candidates.rows.length > 50 ? actuals.at(-1)!.actionId : null,
        history: history.rows,
      };
    },
    { readOnlySnapshot: true },
  );
}
