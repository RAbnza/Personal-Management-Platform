import { z } from "zod";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import { readReportContext } from "@/modules/reporting/repositories/report-context-repository";
import { planningId } from "../domain/recurrence";
import { SavingsGoalUnavailableError } from "../domain/savings-goal";
import {
  readSavingsGoals,
  readCashPools,
  readGoalReservationPage,
  type GoalEvidence,
  type ReservationEvidence,
} from "../repositories/savings-goal-repository";
const scope = z
  .object({ userId: planningId, workspaceId: planningId })
  .strict();
export const savingsListQuerySchema = z
  .object({
    cursor: planningId.optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    includeArchived: z.enum(["true", "false"]).default("false"),
  })
  .strict();
export const savingsDetailQuerySchema = z
  .object({
    goalId: planningId,
    historyCursor: planningId.optional(),
    reservationCursor: planningId.optional(),
    accountCursor: planningId.optional(),
    targetCursor: planningId.optional(),
  })
  .strict();
export async function listSavingsGoals(
  input: z.input<typeof scope> & z.input<typeof savingsListQuerySchema>,
) {
  const { userId, workspaceId, ...raw } = input,
    s = scope.parse({ userId, workspaceId }),
    q = savingsListQuerySchema.parse(raw);
  return withDomainTransaction(
    s,
    async (t) => ({
      ...(await readReportContext(t, s.workspaceId)),
      ...(await readSavingsGoals(t, s.workspaceId, {
        cursor: q.cursor,
        pageSize: q.pageSize,
        includeArchived: q.includeArchived === "true",
      })),
    }),
    { readOnlySnapshot: true },
  );
}
export async function getSavingsGoal(
  input: z.input<typeof scope> & z.input<typeof savingsDetailQuerySchema>,
) {
  const { userId, workspaceId, ...raw } = input,
    s = scope.parse({ userId, workspaceId }),
    q = savingsDetailQuerySchema.parse(raw);
  return withDomainTransaction(
    s,
    async (t) => {
      const context = await readReportContext(t, s.workspaceId),
        page = await readSavingsGoals(t, s.workspaceId, {
          goalId: q.goalId,
          includeArchived: true,
          pageSize: 1,
        }),
        goal = page.items[0];
      if (!goal) throw new SavingsGoalUnavailableError();
      const ownedHistory = sql`(a.subject_kind='savings_goal' AND a.subject_id=${q.goalId}::uuid OR a.subject_kind='goal_reservation' AND a.subject_id IN(SELECT id FROM planning.goal_reservation WHERE workspace_id=${s.workspaceId}::uuid AND goal_id=${q.goalId}::uuid))`;
      const history = await t.db.execute<{
        id: string;
        subjectKind: string;
        version: number;
        reason: string | null;
        createdAt: string;
        before: GoalEvidence | ReservationEvidence | null;
        after: GoalEvidence | ReservationEvidence;
      }>(
        sql`SELECT a.id,a.subject_kind AS "subjectKind",a.subject_version version,a.reason,a.created_at::text AS "createdAt",a.before_json before,a.after_json after FROM audit.private_revision a WHERE a.workspace_id=${s.workspaceId}::uuid AND ${ownedHistory} ${q.historyCursor ? sql`AND (a.created_at,a.id)<(SELECT a.created_at,a.id FROM audit.private_revision a WHERE a.workspace_id=${s.workspaceId}::uuid AND a.id=${q.historyCursor}::uuid AND ${ownedHistory})` : sql``} ORDER BY a.created_at DESC,a.id DESC LIMIT 51`,
      );
      return {
        ...context,
        definitionVersion: page.definitionVersion,
        summary: page.summary,
        goal,
        reservations: await readGoalReservationPage(
          t,
          s.workspaceId,
          q.goalId,
          q.reservationCursor,
        ),
        accounts: await readCashPools(t, s.workspaceId, {
          cursor: q.accountCursor,
        }),
        targets: await readSavingsGoals(t, s.workspaceId, {
          cursor: q.targetCursor,
          pageSize: 100,
        }),
        history: {
          items: history.rows.slice(0, 50),
          nextCursor: history.rows.length > 50 ? history.rows[49]!.id : null,
        },
      };
    },
    { readOnlySnapshot: true },
  );
}
