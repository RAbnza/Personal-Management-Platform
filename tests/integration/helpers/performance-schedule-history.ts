import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import { lockActiveFinancialWorkspace } from "@/modules/finance/repositories/financial-write-repository";
import { getDebtDetailInTransaction } from "@/modules/finance/services/read-debts";
import { reviseDebtScheduleInTransaction } from "@/modules/finance/services/revise-debt-schedule";

/** Give the guarded load workspace finalized schedule history without a new
 * financial charge or changing its synthetic posting-count baseline. */
export async function seedPerformanceScheduleHistory(
  t: ScopedTransaction,
  owner: { userId: string; workspaceId: string },
  debtId: string,
) {
  const root = (
    await t.db.execute<{ database: string; label: string }>(
      sql`SELECT current_database() database,display_name label FROM core.user_profile WHERE user_id=${owner.userId}::uuid`,
    )
  ).rows[0];
  assert.equal(root?.database, "personal_management_test");
  assert.equal(root?.label, "C5 performance fixture");
  await lockActiveFinancialWorkspace(t, owner.workspaceId);
  const before = await getDebtDetailInTransaction(t, { ...owner, debtId });
  const result = await reviseDebtScheduleInTransaction(t, {
    ...owner,
    debtId,
    clientCommandId: randomUUID(),
    expectedDebtVersion: before.debt.version,
    expectedScheduleVersionId: before.debt.scheduleVersionId!,
    expectedFinancialRevision: before.financialRevision,
    effectiveDate: "2016-01-02",
    revisionKind: "date_correction",
    frequency: "manual",
    reason:
      "Synthetic provider due-date correction for versioned-history load coverage",
    entries: before.installments.map((i) => {
      const date = new Date(`${i.dueDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      return {
        entryKey: randomUUID(),
        obligationId: i.obligationId,
        dueDate: date.toISOString().slice(0, 10),
        contractualMinor: i.contractualMinor,
      };
    }),
    mappings: [],
    allocationMappingConfirmed: true,
  });
  assert.equal(result.chargeActionId, null);
  assert.equal(result.scheduleVersionNo, 2);
  const after = await getDebtDetailInTransaction(t, { ...owner, debtId });
  assert.equal(
    after.debt.recognizedLiabilityMinor,
    before.debt.recognizedLiabilityMinor,
  );
  assert.equal(after.installments.length, before.installments.length);
  return {
    scheduleVersions: result.scheduleVersionNo,
    installmentCount: after.installments.length,
    financialChargeCreated: false,
  };
}
