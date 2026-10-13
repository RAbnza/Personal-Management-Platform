import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  SAVINGS_DEFINITION_VERSION,
  SavingsGoalUnavailableError,
  savingsProgress,
  supportedReservation,
} from "../domain/savings-goal";
export type GoalEvidence = {
  id: string;
  workspace_id: string;
  name: string;
  target_minor: string;
  target_date: string | null;
  status: "active" | "completed" | "archived";
  notes: string | null;
  version: number;
  write_revision: string;
  command_receipt_id: string;
  recorded_by_user_id: string;
  request_id: string | null;
};
export type ReservationEvidence = {
  id: string;
  workspace_id: string;
  goal_id: string;
  financial_account_id: string;
  reserved_minor: string;
  version: number;
  write_revision: string;
  command_receipt_id: string;
  recorded_by_user_id: string;
  request_id: string | null;
};
export type CashPool = {
  financialAccountId: string;
  name: string;
  accountType: string;
  currency: string;
  accountVersion: number;
  archived: boolean;
  eligible: boolean;
  balanceMinor: string;
  reservedMinor: string;
  capacityMinor: string;
  availableMinor: string;
  shortfallMinor: string;
};
export async function readSavingsEvidence(
  t: ScopedTransaction,
  workspaceId: string,
  kind: "savings_goal",
  id: string,
): Promise<GoalEvidence>;
export async function readSavingsEvidence(
  t: ScopedTransaction,
  workspaceId: string,
  kind: "goal_reservation",
  id: string,
): Promise<ReservationEvidence>;
export async function readSavingsEvidence(
  t: ScopedTransaction,
  workspaceId: string,
  kind: "savings_goal" | "goal_reservation",
  id: string,
) {
  const r = await t.db.execute<{
    snapshot: GoalEvidence | ReservationEvidence;
  }>(
    sql`SELECT planning.savings_snapshot(to_jsonb(x)) snapshot FROM ${kind === "savings_goal" ? sql`planning.savings_goal` : sql`planning.goal_reservation`} x WHERE workspace_id=${workspaceId}::uuid AND id=${id}::uuid`,
  );
  if (!r.rows[0]) throw new SavingsGoalUnavailableError();
  return r.rows[0].snapshot;
}
export async function readGoalReservation(
  t: ScopedTransaction,
  workspaceId: string,
  goalId: string,
  accountId: string,
) {
  const r = await t.db.execute<{ snapshot: ReservationEvidence }>(
    sql`SELECT planning.savings_snapshot(to_jsonb(x)) snapshot FROM planning.goal_reservation x WHERE workspace_id=${workspaceId}::uuid AND goal_id=${goalId}::uuid AND financial_account_id=${accountId}::uuid`,
  );
  return r.rows[0]?.snapshot ?? null;
}
export async function readCashPools(
  t: ScopedTransaction,
  workspaceId: string,
  p: {
    accountId?: string;
    cursor?: string | undefined;
    pageSize?: number;
  } = {},
) {
  const size = p.pageSize ?? 100;
  const r = await t.db.execute<CashPool>(
    sql`SELECT financial_account_id AS "financialAccountId",name,account_type AS "accountType",currency,account_version AS "accountVersion",archived,eligible,balance_minor::text AS "balanceMinor",reserved_minor::text AS "reservedMinor",capacity_minor::text AS "capacityMinor",GREATEST(capacity_minor-reserved_minor,0)::text AS "availableMinor",GREATEST(reserved_minor-capacity_minor,0)::text AS "shortfallMinor" FROM planning.goal_cash_v WHERE workspace_id=${workspaceId}::uuid ${p.accountId ? sql`AND financial_account_id=${p.accountId}::uuid` : sql``} ${p.cursor ? sql`AND financial_account_id>${p.cursor}::uuid` : sql``} ORDER BY financial_account_id LIMIT ${size + 1}`,
  );
  return {
    items: r.rows.slice(0, size),
    nextCursor:
      r.rows.length > size ? r.rows[size - 1]!.financialAccountId : null,
  };
}
export async function readSavingsGoals(
  t: ScopedTransaction,
  workspaceId: string,
  p: {
    goalId?: string;
    cursor?: string | undefined;
    pageSize?: number;
    includeArchived?: boolean;
  } = {},
) {
  const size = p.pageSize ?? 50;
  const result = await t.db.execute<{
    snapshot: GoalEvidence;
    reservedMinor: string;
    minimumMinor: string;
    maximumMinor: string;
    atRisk: boolean;
  }>(sql`
 WITH selected AS MATERIALIZED (SELECT g.* FROM planning.savings_goal g WHERE g.workspace_id=${workspaceId}::uuid ${p.goalId ? sql`AND g.id=${p.goalId}::uuid` : sql``} ${p.cursor ? sql`AND g.id>${p.cursor}::uuid` : sql``} ${p.includeArchived ? sql`` : sql`AND g.status<>'archived'`} ORDER BY g.id LIMIT ${size + 1}),
 contributions AS (SELECT r.goal_id,r.reserved_minor::numeric amount,GREATEST(LEAST(r.reserved_minor::numeric,c.capacity_minor-(c.reserved_minor-r.reserved_minor::numeric)),0) minimum,LEAST(r.reserved_minor::numeric,c.capacity_minor) maximum,c.reserved_minor>c.capacity_minor AND r.reserved_minor>0 risk FROM planning.goal_reservation r JOIN selected g ON g.workspace_id=r.workspace_id AND g.id=r.goal_id JOIN planning.goal_cash_v c ON c.workspace_id=r.workspace_id AND c.financial_account_id=r.financial_account_id),
 totals AS (SELECT goal_id,sum(amount) amount,sum(minimum) minimum,sum(maximum) maximum,bool_or(risk) risk FROM contributions GROUP BY goal_id)
 SELECT planning.savings_snapshot(to_jsonb(g)) snapshot,COALESCE(c.amount,0)::text AS "reservedMinor",COALESCE(c.minimum,0)::text AS "minimumMinor",COALESCE(c.maximum,0)::text AS "maximumMinor",COALESCE(c.risk,false) AS "atRisk" FROM selected g LEFT JOIN totals c ON c.goal_id=g.id ORDER BY g.id`);
  const summary = await t.db.execute<{
    capacityMinor: string;
    reservedMinor: string;
    availableMinor: string;
    shortfallMinor: string;
    negativeCashMinor: string;
  }>(
    sql`SELECT COALESCE(sum(capacity_minor),0)::text AS "capacityMinor",COALESCE(sum(reserved_minor),0)::text AS "reservedMinor",COALESCE(sum(GREATEST(capacity_minor-reserved_minor,0)),0)::text AS "availableMinor",COALESCE(sum(GREATEST(reserved_minor-capacity_minor,0)),0)::text AS "shortfallMinor",COALESCE(sum(LEAST(balance_minor,0)),0)::text AS "negativeCashMinor" FROM planning.goal_cash_v WHERE workspace_id=${workspaceId}::uuid`,
  );
  return {
    items: result.rows.slice(0, size).map((r) => ({
      ...r.snapshot,
      reservedMinor: r.reservedMinor,
      minimumMinor: r.minimumMinor,
      maximumMinor: r.maximumMinor,
      atRisk: r.atRisk,
      ...savingsProgress(
        r.snapshot.target_minor,
        r.reservedMinor,
        r.minimumMinor,
        r.maximumMinor,
      ),
    })),
    nextCursor:
      result.rows.length > size ? result.rows[size - 1]!.snapshot.id : null,
    summary: summary.rows[0]!,
    definitionVersion: SAVINGS_DEFINITION_VERSION,
  };
}
export async function readGoalReservationPage(
  t: ScopedTransaction,
  workspaceId: string,
  goalId: string,
  cursor?: string,
) {
  const r = await t.db.execute<{
    snapshot: ReservationEvidence;
    name: string;
    capacityMinor: string;
    totalMinor: string;
    archived: boolean;
    eligible: boolean;
  }>(
    sql`SELECT planning.savings_snapshot(to_jsonb(r)) snapshot,c.name,c.capacity_minor::text AS "capacityMinor",c.reserved_minor::text AS "totalMinor",c.archived,c.eligible FROM planning.goal_reservation r JOIN planning.goal_cash_v c ON c.workspace_id=r.workspace_id AND c.financial_account_id=r.financial_account_id WHERE r.workspace_id=${workspaceId}::uuid AND r.goal_id=${goalId}::uuid ${cursor ? sql`AND r.id>(SELECT id FROM planning.goal_reservation WHERE workspace_id=${workspaceId}::uuid AND goal_id=${goalId}::uuid AND id=${cursor}::uuid)` : sql``} ORDER BY r.id LIMIT 51`,
  );
  return {
    items: r.rows.slice(0, 50).map((r) => ({
      ...r.snapshot,
      name: r.name,
      archived: r.archived,
      eligible: r.eligible,
      capacityMinor: r.capacityMinor,
      totalMinor: r.totalMinor,
      ...supportedReservation(
        r.snapshot.reserved_minor,
        r.totalMinor,
        r.capacityMinor,
      ),
    })),
    nextCursor: r.rows.length > 50 ? r.rows[49]!.snapshot.id : null,
  };
}
