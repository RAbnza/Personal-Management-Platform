import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";

export class NegativeBalanceAcknowledgementRequiredError extends RangeError {
  constructor() {
    super(
      "This command produces a negative tracked balance. Review the warning and explicitly acknowledge it before saving.",
    );
    this.name = "NegativeBalanceAcknowledgementRequiredError";
  }
}
export async function reviewCashChanges(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    acknowledgeNegativeBalance: boolean;
    changes: Array<{
      accountId: string;
      effectiveDate: string;
      signedMinor: bigint;
    }>;
    excludeRevisionId?: string | undefined;
  },
) {
  const warnings: Array<{
    accountId: string;
    effectiveDate: string;
    beforeMinor: string;
    afterMinor: string;
  }> = [];
  for (const accountId of new Set(input.changes.map((c) => c.accountId))) {
    const changes = input.changes.filter((c) => c.accountId === accountId);
    const removed = input.excludeRevisionId
      ? await t.db.execute<{ date: string }>(
          sql`SELECT j.effective_date::text AS date FROM finance.financial_account a JOIN finance.posting p ON p.workspace_id=a.workspace_id AND p.ledger_account_id=a.ledger_account_id JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' AND j.role='economic' WHERE a.workspace_id=${input.workspaceId}::uuid AND a.id=${accountId}::uuid AND p.action_revision_id=${input.excludeRevisionId}::uuid`,
        )
      : { rows: [] };
    const earliest = [
      ...changes.map((c) => c.effectiveDate),
      ...removed.rows.map((r) => r.date),
    ].sort()[0]!;
    const rows = await t.db.execute<{
      date: string;
      amount: string;
    }>(sql`SELECT j.effective_date::text AS date,sum(p.amount_minor::numeric)::text AS amount FROM finance.financial_account a
      JOIN finance.posting p ON p.workspace_id=a.workspace_id AND p.ledger_account_id=a.ledger_account_id JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
      WHERE a.workspace_id=${input.workspaceId}::uuid AND a.id=${accountId}::uuid ${input.excludeRevisionId ? sql`AND NOT (j.action_revision_id=${input.excludeRevisionId}::uuid AND j.role='economic')` : sql``} GROUP BY j.effective_date ORDER BY j.effective_date`);
    const dates = [
      ...new Set([
        ...rows.rows.map((r) => r.date),
        ...changes.map((c) => c.effectiveDate),
      ]),
    ].sort();
    const tracked = new Map(rows.rows.map((r) => [r.date, BigInt(r.amount)]));
    const proposed = new Map<string, bigint>();
    for (const change of changes)
      proposed.set(
        change.effectiveDate,
        (proposed.get(change.effectiveDate) ?? 0n) + change.signedMinor,
      );
    let before = 0n,
      delta = 0n;
    for (const date of dates) {
      before += tracked.get(date) ?? 0n;
      delta += proposed.get(date) ?? 0n;
      const after = before + delta;
      if (date >= earliest && after < 0n)
        warnings.push({
          accountId,
          effectiveDate: date,
          beforeMinor: before.toString(),
          afterMinor: after.toString(),
        });
    }
  }
  if (warnings.length && !input.acknowledgeNegativeBalance)
    throw new NegativeBalanceAcknowledgementRequiredError();
  return warnings;
}
