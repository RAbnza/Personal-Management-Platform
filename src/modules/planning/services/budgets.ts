import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { budget } from "@/platform/db/schema";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import {
  enforceDeferredFinancialConstraints,
  lockActiveFinancialWorkspace,
} from "@/modules/finance/repositories/financial-write-repository";
import { planningId } from "../domain/recurrence";
import {
  budgetCommandSchema,
  BudgetConflictError,
  BudgetUnavailableError,
} from "../domain/budget";
import { readBudgetEvidence } from "../repositories/budget-repository";
const actorSchema = z
  .object({
    userId: planningId,
    workspaceId: planningId,
    requestId: planningId.optional(),
  })
  .strict();
const resultSchema = z
  .object({
    budgetId: planningId,
    version: z.number().int().positive(),
    reason: z.string().nullable(),
    financialRevision: z.string().regex(/^\d+$/),
  })
  .strict();
export async function recordBudgetCommand(
  input: z.input<typeof actorSchema> & z.input<typeof budgetCommandSchema>,
) {
  const { userId, workspaceId, requestId, ...raw } = input,
    actor = actorSchema.parse({ userId, workspaceId, requestId }),
    body = budgetCommandSchema.parse(raw);
  return withDomainTransaction(actor, async (t) => {
    await lockActiveFinancialWorkspace(t, actor.workspaceId);
    const { clientCommandId, ...intent } = body;
    const receipt = await claimFinancialCommandReceipt(t, {
      workspaceId: actor.workspaceId,
      clientCommandId,
      commandType: `planning.budget.${body.operation}`,
      payloadHash: hashFinancialCommandPayload(intent),
    });
    if (receipt.kind === "replay") return resultSchema.parse(receipt.result);
    const id = body.budgetId ?? randomUUID(),
      before = body.budgetId
        ? await readBudgetEvidence(t, actor.workspaceId, id)
        : null;
    if (before && before.version !== body.expectedVersion)
      throw new BudgetConflictError(
        "The budget changed. Reload its current comparison and history.",
      );
    if (body.operation === "save") {
      const f = body.fields;
      const category = await t.db.execute(
        sql`SELECT id FROM core.category WHERE workspace_id=${actor.workspaceId}::uuid AND id=${f.categoryId}::uuid AND kind='expense' AND (archived_at IS NULL OR ${before?.category_id === f.categoryId})`,
      );
      if (!category.rows.length) throw new BudgetUnavailableError();
      const overlaps = await t.db.execute(
        sql`SELECT id FROM planning.budget WHERE workspace_id=${actor.workspaceId}::uuid AND category_id=${f.categoryId}::uuid AND id<>${id}::uuid AND start_date<${f.endDateExclusive}::date AND end_date_exclusive>${f.startDate}::date LIMIT 1`,
      );
      if (overlaps.rows.length) throw new BudgetConflictError();
      if (before)
        await t.db.execute(
          sql`UPDATE planning.budget SET category_id=${f.categoryId}::uuid,start_date=${f.startDate}::date,end_date_exclusive=${f.endDateExclusive}::date,limit_minor=${f.limitMinor}::bigint,basis=${f.basis},notes=${f.notes},version=version+1,command_receipt_id=${receipt.receiptId}::uuid,recorded_by_user_id=${actor.userId}::uuid,request_id=${actor.requestId ?? null}::uuid WHERE workspace_id=${actor.workspaceId}::uuid AND id=${id}::uuid`,
        );
      else
        await t.db.insert(budget).values({
          id,
          workspaceId: actor.workspaceId,
          categoryId: f.categoryId,
          startDate: f.startDate,
          endDateExclusive: f.endDateExclusive,
          limitMinor: BigInt(f.limitMinor),
          basis: f.basis,
          notes: f.notes,
          commandReceiptId: receipt.receiptId,
          recordedByUserId: actor.userId,
          requestId: actor.requestId ?? null,
        });
    } else {
      if (
        !before ||
        (body.operation === "archive") === (before.archived_at !== null)
      )
        throw new BudgetConflictError(
          "The budget is already in that lifecycle state.",
        );
      await t.db.execute(
        sql`UPDATE planning.budget SET archived_at=${body.operation === "archive" ? sql`clock_timestamp()` : sql`NULL`},version=version+1,command_receipt_id=${receipt.receiptId}::uuid,recorded_by_user_id=${actor.userId}::uuid,request_id=${actor.requestId ?? null}::uuid WHERE workspace_id=${actor.workspaceId}::uuid AND id=${id}::uuid`,
      );
    }
    const after = await readBudgetEvidence(t, actor.workspaceId, id);
    await createPrivateRevision(t, {
      id: randomUUID(),
      workspaceId: actor.workspaceId,
      commandReceiptId: receipt.receiptId,
      subjectKind: "budget",
      subjectId: id,
      subjectVersion: after.version,
      operation: before ? "replace" : "create",
      beforeJson: before,
      afterJson: after,
      reason: body.reason,
      effectiveDate: after.start_date,
      recordedByUserId: actor.userId,
      actorKind: "user",
      requestId: actor.requestId ?? null,
    });
    const result = resultSchema.parse({
      budgetId: id,
      version: after.version,
      reason: body.reason,
      financialRevision: after.write_revision,
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
