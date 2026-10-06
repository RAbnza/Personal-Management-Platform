import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

export type PrivateRevisionActorKind = "user" | "system" | "import";

export async function createPrivateRevision(
  transaction: ScopedTransaction,
  input: {
    id: string;
    workspaceId: string;
    commandReceiptId: string;

    subjectKind: string;
    subjectId: string;
    subjectVersion: number;
    operation: string;

    beforeJson: Record<string, unknown> | null;
    afterJson: Record<string, unknown> | null;

    reason: string | null;
    effectiveDate: string | null;

    recordedByUserId: string | null;
    actorKind: PrivateRevisionActorKind;
    requestId: string | null;
  },
): Promise<void> {
  const serializedBeforeJson =
    input.beforeJson === null ? null : JSON.stringify(input.beforeJson);

  const serializedAfterJson =
    input.afterJson === null ? null : JSON.stringify(input.afterJson);

  await transaction.db.execute(sql`
    INSERT INTO "audit"."private_revision" (
      "id",
      "workspace_id",
      "command_receipt_id",
      "subject_kind",
      "subject_id",
      "subject_version",
      "operation",
      "before_json",
      "after_json",
      "reason",
      "effective_date",
      "recorded_by_user_id",
      "actor_kind",
      "request_id"
    )
    VALUES (
      ${input.id}::uuid,
      ${input.workspaceId}::uuid,
      ${input.commandReceiptId}::uuid,
      ${input.subjectKind},
      ${input.subjectId}::uuid,
      ${input.subjectVersion},
      ${input.operation},
      ${serializedBeforeJson}::jsonb,
      ${serializedAfterJson}::jsonb,
      ${input.reason},
      ${input.effectiveDate}::date,
      ${input.recordedByUserId}::uuid,
      ${input.actorKind},
      ${input.requestId}::uuid
    )
  `);
}
