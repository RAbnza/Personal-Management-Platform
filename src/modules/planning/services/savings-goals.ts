import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { savingsGoal, goalReservation } from "@/platform/db/schema";
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
import { readReportContext } from "@/modules/reporting/repositories/report-context-repository";
import { planningId } from "../domain/recurrence";
import {
  savingsGoalCommandSchema,
  savingsMinor,
  SavingsGoalConflictError,
  SavingsGoalUnavailableError,
} from "../domain/savings-goal";
import {
  readSavingsEvidence,
  readGoalReservation,
  readCashPools,
  type GoalEvidence,
  type ReservationEvidence,
} from "../repositories/savings-goal-repository";
const actorSchema = z
  .object({
    userId: planningId,
    workspaceId: planningId,
    requestId: planningId.optional(),
  })
  .strict();
export const savingsGoalResultSchema = z
  .object({
    goalId: planningId,
    financialRevision: z.string().regex(/^\d+$/),
    reason: z.string().nullable(),
    goals: z
      .array(
        z
          .object({
            goalId: planningId,
            version: z.number().int().positive(),
            financialRevision: z.string().regex(/^\d+$/),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    reservations: z
      .array(
        z
          .object({
            reservationId: planningId,
            version: z.number().int().positive(),
            financialRevision: z.string().regex(/^\d+$/),
          })
          .strict(),
      )
      .max(2),
  })
  .strict();
export async function recordSavingsGoalCommand(
  input: z.input<typeof actorSchema> & z.input<typeof savingsGoalCommandSchema>,
) {
  const { userId, workspaceId, requestId, ...raw } = input,
    actor = actorSchema.parse({ userId, workspaceId, requestId }),
    body = savingsGoalCommandSchema.parse(raw);
  return withDomainTransaction(actor, async (t) => {
    await lockActiveFinancialWorkspace(t, workspaceId);
    const { clientCommandId, ...intent } = body,
      receipt = await claimFinancialCommandReceipt(t, {
        workspaceId,
        clientCommandId,
        commandType: `planning.goal.${body.operation}`,
        payloadHash: hashFinancialCommandPayload(intent),
      });
    if (receipt.kind === "replay")
      return savingsGoalResultSchema.parse(receipt.result);
    const context = await readReportContext(t, workspaceId),
      id = body.goalId ?? randomUUID(),
      before = body.goalId
        ? await readSavingsEvidence(t, workspaceId, "savings_goal", id)
        : null;
    if (before && before.version !== body.expectedVersion)
      throw new SavingsGoalConflictError(
        "The goal changed. Reload its current funding and history.",
      );
    const rootBefore = new Map<string, GoalEvidence | null>([[id, before]]);
    async function audit(
      kind: "savings_goal" | "goal_reservation",
      prior: GoalEvidence | ReservationEvidence | null,
      next: GoalEvidence | ReservationEvidence,
    ) {
      await createPrivateRevision(t, {
        id: randomUUID(),
        workspaceId,
        commandReceiptId: receipt.receiptId,
        subjectKind: kind,
        subjectId: next.id,
        subjectVersion: next.version,
        operation: prior ? "replace" : "create",
        beforeJson: prior,
        afterJson: next,
        reason: body.reason,
        effectiveDate: context.today,
        recordedByUserId: userId,
        actorKind: "user",
        requestId: requestId ?? null,
      });
    }
    if (body.operation === "save") {
      const f = body.fields;
      if (before)
        await t.db.execute(
          sql`UPDATE planning.savings_goal SET name=${f.name},target_minor=${f.targetMinor}::bigint,target_date=${f.targetDate}::date,notes=${f.notes},version=version+1,command_receipt_id=${receipt.receiptId}::uuid,recorded_by_user_id=${userId}::uuid,request_id=${requestId ?? null}::uuid WHERE workspace_id=${workspaceId}::uuid AND id=${id}::uuid`,
        );
      else
        await t.db.insert(savingsGoal).values({
          id,
          workspaceId,
          name: f.name,
          targetMinor: BigInt(f.targetMinor),
          targetDate: f.targetDate,
          notes: f.notes,
          commandReceiptId: receipt.receiptId,
          recordedByUserId: userId,
          requestId: requestId ?? null,
        });
    } else if (
      body.operation === "reserve" ||
      body.operation === "reallocate"
    ) {
      if (context.financialRevision !== body.expectedFinancialRevision)
        throw new SavingsGoalConflictError(
          "Cash or reservation evidence changed. Reload and review again.",
        );
      const changes: {
        goalId: string;
        accountId: string;
        amount: bigint;
        before: ReservationEvidence | null;
      }[] = [];
      if (body.operation === "reserve") {
        const prior = await readGoalReservation(
          t,
          workspaceId,
          id,
          body.financialAccountId,
        );
        if (BigInt(prior?.reserved_minor ?? "0") === BigInt(body.reservedMinor))
          throw new SavingsGoalConflictError(
            "Choose a changed reservation amount.",
          );
        changes.push({
          goalId: id,
          accountId: body.financialAccountId,
          amount: BigInt(body.reservedMinor),
          before: prior,
        });
      } else {
        if (body.targetGoalId !== id) {
          const target = await readSavingsEvidence(
            t,
            workspaceId,
            "savings_goal",
            body.targetGoalId,
          );
          if (target.version !== body.expectedTargetVersion)
            throw new SavingsGoalConflictError("The destination goal changed.");
          rootBefore.set(target.id, target);
        }
        const source = await readGoalReservation(
            t,
            workspaceId,
            id,
            body.sourceAccountId,
          ),
          target = await readGoalReservation(
            t,
            workspaceId,
            body.targetGoalId,
            body.targetAccountId,
          ),
          amount = BigInt(body.amountMinor);
        if (!source || amount > BigInt(source.reserved_minor))
          throw new SavingsGoalConflictError(
            "Reallocation exceeds the recorded source reservation.",
          );
        const destination = BigInt(
          savingsMinor.parse(
            (BigInt(target?.reserved_minor ?? "0") + amount).toString(),
          ),
        );
        changes.push(
          {
            goalId: id,
            accountId: body.sourceAccountId,
            amount: BigInt(source.reserved_minor) - amount,
            before: source,
          },
          {
            goalId: body.targetGoalId,
            accountId: body.targetAccountId,
            amount: destination,
            before: target,
          },
        );
      }
      for (const accountId of new Set(changes.map((c) => c.accountId))) {
        const pool = (await readCashPools(t, workspaceId, { accountId }))
          .items[0];
        if (!pool) throw new SavingsGoalUnavailableError();
        const accountChanges = changes.filter((c) => c.accountId === accountId),
          delta = accountChanges.reduce(
            (s, c) => s + c.amount - BigInt(c.before?.reserved_minor ?? "0"),
            0n,
          ),
          increases = accountChanges.filter(
            (c) => c.amount > BigInt(c.before?.reserved_minor ?? "0"),
          );
        if (
          increases.length &&
          (!pool.eligible ||
            BigInt(pool.reservedMinor) + delta > BigInt(pool.capacityMinor))
        )
          throw new SavingsGoalConflictError(
            "Increased reservations must fit eligible cash after the complete command.",
          );
        if (
          increases.some((c) => rootBefore.get(c.goalId)?.status !== "active")
        )
          throw new SavingsGoalConflictError(
            "Reopen the destination goal before increasing its reservations.",
          );
      }
      for (const c of changes.sort(
        (a, b) =>
          a.goalId.localeCompare(b.goalId) ||
          a.accountId.localeCompare(b.accountId),
      )) {
        const reservationId = c.before?.id ?? randomUUID();
        if (c.before)
          await t.db.execute(
            sql`UPDATE planning.goal_reservation SET reserved_minor=${c.amount.toString()}::bigint,version=version+1,command_receipt_id=${receipt.receiptId}::uuid,recorded_by_user_id=${userId}::uuid,request_id=${requestId ?? null}::uuid WHERE workspace_id=${workspaceId}::uuid AND id=${reservationId}::uuid`,
          );
        else
          await t.db.insert(goalReservation).values({
            id: reservationId,
            workspaceId,
            goalId: c.goalId,
            financialAccountId: c.accountId,
            reservedMinor: c.amount,
            commandReceiptId: receipt.receiptId,
            recordedByUserId: userId,
            requestId: requestId ?? null,
          });
        await audit(
          "goal_reservation",
          c.before,
          await readSavingsEvidence(
            t,
            workspaceId,
            "goal_reservation",
            reservationId,
          ),
        );
      }
      for (const goalId of rootBefore.keys())
        await touchGoal(t, actor, goalId, receipt.receiptId);
    } else {
      const status =
        body.operation === "complete"
          ? "completed"
          : body.operation === "archive"
            ? "archived"
            : "active";
      if (
        !before ||
        before.status === status ||
        (body.operation === "complete" && before.status !== "active")
      )
        throw new SavingsGoalConflictError(
          "The goal is not eligible for that lifecycle change.",
        );
      if (body.operation === "archive") {
        const r = await t.db.execute(
          sql`SELECT id FROM planning.goal_reservation WHERE workspace_id=${workspaceId}::uuid AND goal_id=${id}::uuid AND reserved_minor>0 LIMIT 1`,
        );
        if (r.rows.length)
          throw new SavingsGoalConflictError(
            "Release reservations explicitly before archiving this goal.",
          );
      }
      await t.db.execute(
        sql`UPDATE planning.savings_goal SET status=${status},version=version+1,command_receipt_id=${receipt.receiptId}::uuid,recorded_by_user_id=${userId}::uuid,request_id=${requestId ?? null}::uuid WHERE workspace_id=${workspaceId}::uuid AND id=${id}::uuid`,
      );
    }
    for (const [goalId, prior] of rootBefore)
      await audit(
        "savings_goal",
        prior,
        await readSavingsEvidence(t, workspaceId, "savings_goal", goalId),
      );
    const rows = await t.db.execute<{ result: unknown }>(
        sql`SELECT planning.goal_command_result(${workspaceId}::uuid,${receipt.receiptId}::uuid,${id}::uuid,${body.reason}::text) result`,
      ),
      result = savingsGoalResultSchema.parse(rows.rows[0]!.result);
    await completeFinancialCommandReceipt(t, {
      workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    await enforceDeferredFinancialConstraints(t);
    return result;
  });
}
async function touchGoal(
  t: ScopedTransaction,
  a: z.output<typeof actorSchema>,
  id: string,
  receiptId: string,
) {
  await t.db.execute(
    sql`UPDATE planning.savings_goal SET version=version+1,command_receipt_id=${receiptId}::uuid,recorded_by_user_id=${a.userId}::uuid,request_id=${a.requestId ?? null}::uuid WHERE workspace_id=${a.workspaceId}::uuid AND id=${id}::uuid`,
  );
}
