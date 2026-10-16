import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import { id, SharingUnavailableError } from "../domain/sharing";
const sources = [
  ["participant", "id,display_name,identity_kind,created_at"],
  [
    "membership",
    "id,participant_id,role,joined_at,left_at,exit_kind,history_policy_version",
  ],
  [
    "shared_expense",
    "id,created_by_participant_id,current_revision_id,created_at",
  ],
  [
    "expense_revision",
    "id,expense_id,revision_no,previous_revision_id,actor_participant_id,description,expense_date,total_minor::text,split_method,category_label,notes,reason,state,created_at",
  ],
  [
    "payer_contribution",
    "id,expense_id,expense_revision_id,participant_id,amount_minor::text",
  ],
  [
    "participant_share",
    "id,expense_id,expense_revision_id,participant_id,amount_minor::text,rounding_rank,rounding_extra_minor",
  ],
  [
    "refund",
    "id,expense_id,source_revision_id,actor_id,total_minor::text,refund_date,reason,created_at",
  ],
  ["refund_allocation", "id,refund_id,participant_id,axis,amount_minor::text"],
  [
    "settlement",
    "id,sender_id,recipient_id,reported_by,amount_minor::text,advance_minor::text,mode,payment_date,note,state,version,created_at",
  ],
  [
    "settlement_allocation",
    "id,settlement_id,expense_id,source_revision_id,amount_minor::text",
  ],
  [
    "settlement_event",
    "id,settlement_id,version,actor_id,from_state,to_state,confirmation_type,reason,created_at",
  ],
  [
    "audit.group_revision",
    "id,actor_participant_id,actor_kind,subject_kind,subject_id,subject_version,operation,before_json,after_json,created_at",
  ],
] as const;
export function exportGroup(
  actor: { userId: string; workspaceId: string },
  groupId: string,
) {
  id.parse(groupId);
  return withDomainTransaction(
    actor,
    async (t) => {
      await t.db.execute(sql`SET LOCAL statement_timeout='15s'`);
      const group = (
        await t.db.execute(
          sql`SELECT id,name,currency,version,archived_at,sharing.active(id) AS active FROM sharing.expense_group WHERE id=${groupId}::uuid AND sharing.visible(id)`,
        )
      ).rows[0];
      if (!group) throw new SharingUnavailableError();
      const entities: { kind: string; records: Record<string, unknown>[] }[] =
        [];
      let count = 0;
      for (const [name, columns] of sources) {
        const table = name.startsWith("audit.") ? name : `sharing.${name}`;
        const records = (
          await t.db.execute(
            sql`SELECT ${sql.raw(columns)} FROM ${sql.raw(table)} WHERE group_id=${groupId}::uuid ORDER BY id LIMIT 10001`,
          )
        ).rows;
        count += records.length;
        if (count > 10000)
          throw new RangeError(
            "Group export exceeds the reviewed 10,000-row limit.",
          );
        entities.push({ kind: table, records });
      }
      const snapshot = {
        format: "pmp-authorized-group-history",
        version: 1,
        generatedAt: new Date().toISOString(),
        group,
        historyPolicyVersion: 1,
        coverage: group.active
          ? "Current member group history"
          : "Visible historical records and authorized subsequent resolution only",
        attributionPolicyVersion: 1,
        privateFundingIncluded: false,
        restorable: false,
        entities,
        rowCount: count,
      };
      if (Buffer.byteLength(JSON.stringify(snapshot)) > 10 * 1024 * 1024)
        throw new RangeError("Group export exceeds the reviewed 10 MiB limit.");
      return snapshot;
    },
    { readOnlySnapshot: true },
  );
}
