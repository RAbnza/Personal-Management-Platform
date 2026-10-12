import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import { deriveCardPosition } from "../domain/credit-card";
import { cardLimitEstimate, aggregateCardLimits } from "../domain/card-surface";
import { ReportLimitError } from "@/modules/reporting/domain/reports";
export async function readCardSurface(
  t: ScopedTransaction,
  workspaceId: string,
  input: { today: string; startDate: string; endDate: string; cardId?: string },
) {
  const cardRows = await t.db.execute<{
    cardId: string;
    name: string;
    issuerName: string;
    currency: string;
    archived: boolean;
    creditLimitMinor: string | null;
    limitVerifiedDate: string | null;
    signedMinor: string;
  }>(sql`
    SELECT c.id AS "cardId",c.name,c.issuer_name AS "issuerName",c.currency,c.archived_at IS NOT NULL AS archived,c.credit_limit_minor::text AS "creditLimitMinor",c.limit_verified_date::text AS "limitVerifiedDate",COALESCE(b.amount,0)::text AS "signedMinor"
    FROM finance.credit_card c LEFT JOIN LATERAL(SELECT sum(p.amount_minor::numeric) amount FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted' JOIN finance.action_revision r ON r.workspace_id=j.workspace_id AND r.id=j.action_revision_id AND r.state='posted' WHERE p.workspace_id=c.workspace_id AND p.ledger_account_id=c.liability_ledger_account_id) b ON true
    WHERE c.workspace_id=${workspaceId}::uuid ${input.cardId ? sql`AND c.id=${input.cardId}::uuid` : sql``} ORDER BY c.name,c.id LIMIT 10001`);
  const statements = await t.db.execute<{
    cardId: string;
    statementId: string;
    revisionId: string;
    version: number;
    statementDate: string;
    dueDate: string;
    balanceMinor: string;
    minimumDueMinor: string;
    remainingDueMinor: string;
    statementCreditMinor: string;
    allocatedMinor: string;
    unresolvedAllocationMinor: string;
    unresolvedEntryCount: string;
    unexplainedDifferenceMinor: string | null;
    unlinkedRecognizedCount: string;
  }>(sql`
    SELECT card_id AS "cardId",statement_id AS "statementId",revision_id AS "revisionId",version,statement_date::text AS "statementDate",due_date::text AS "dueDate",balance_minor::text AS "balanceMinor",minimum_due_minor::text AS "minimumDueMinor",remaining_due_minor::text AS "remainingDueMinor",statement_credit_minor::text AS "statementCreditMinor",allocated_minor::text AS "allocatedMinor",unresolved_allocation_minor::text AS "unresolvedAllocationMinor",unresolved_entry_count::text AS "unresolvedEntryCount",unexplained_difference_minor::text AS "unexplainedDifferenceMinor",unlinked_recognized_count::text AS "unlinkedRecognizedCount"
    FROM finance.card_statement_due_v WHERE workspace_id=${workspaceId}::uuid ${input.cardId ? sql`AND card_id=${input.cardId}::uuid` : sql``} ORDER BY statement_date DESC,statement_id DESC LIMIT 10001`);
  const installmentRows = await t.db.execute<{
    cardId: string;
    planId: string;
    revisionId: string;
    installmentId: string;
    version: number;
    sequenceNo: number;
    dueDate: string | null;
    lifecycle: string;
    eligible: boolean;
    remainingPrincipalMinor: string | null;
    remainingInterestMinor: string | null;
    remainingFeeMinor: string | null;
    remainingTotalMinor: string | null;
  }>(sql`
    SELECT card_id AS "cardId",plan_id AS "planId",revision_id AS "revisionId",installment_id AS "installmentId",version,sequence_no AS "sequenceNo",due_date::text AS "dueDate",lifecycle,eligible,remaining_principal_minor::text AS "remainingPrincipalMinor",remaining_interest_minor::text AS "remainingInterestMinor",remaining_fee_minor::text AS "remainingFeeMinor",remaining_total_minor::text AS "remainingTotalMinor"
    FROM finance.card_installment_due_v WHERE workspace_id=${workspaceId}::uuid ${input.cardId ? sql`AND card_id=${input.cardId}::uuid` : sql``} ORDER BY due_date NULLS LAST,installment_id LIMIT 10001`);
  if (
    [cardRows.rows, statements.rows, installmentRows.rows].some(
      (r) => r.length > 10000,
    )
  )
    throw new ReportLimitError();
  const latestByCard = new Map<string, (typeof statements.rows)[number]>();
  const unpaidByCard = new Map<string, number>();
  for (const d of statements.rows) {
    if (!latestByCard.has(d.cardId)) latestByCard.set(d.cardId, d);
    if (BigInt(d.remainingDueMinor) > 0n)
      unpaidByCard.set(d.cardId, (unpaidByCard.get(d.cardId) ?? 0) + 1);
  }
  const cards = cardRows.rows.map((c) => {
    const position = deriveCardPosition(c.signedMinor);
    const latestStatement = latestByCard.get(c.cardId) ?? null;
    return {
      ...c,
      ...position,
      ...cardLimitEstimate({ ...c, ...position }, input.today),
      latestStatement,
      olderUnpaidStatementCount:
        (unpaidByCard.get(c.cardId) ?? 0) -
        (latestStatement && BigInt(latestStatement.remainingDueMinor) > 0n
          ? 1
          : 0),
    };
  });
  const installments = installmentRows.rows.filter(
    (i) =>
      i.eligible &&
      i.dueDate !== null &&
      i.dueDate >= input.startDate &&
      i.dueDate <= input.endDate &&
      (i.remainingTotalMinor === null || BigInt(i.remainingTotalMinor) > 0n),
  );
  const sum = (values: (string | null)[]) =>
    values.reduce<bigint>((n, v) => n + BigInt(v ?? "0"), 0n).toString();
  return {
    basisDate: input.today,
    projectionStart: input.startDate,
    projectionEnd: input.endDate,
    cards,
    statements: statements.rows,
    installments,
    utilization: aggregateCardLimits(cards),
    totals: {
      postedOutstandingMinor: sum(cards.map((c) => c.postedOutstandingMinor)),
      cardCreditMinor: sum(cards.map((c) => c.cardCreditMinor)),
      latestStatementDueMinor: sum(
        cards.map((c) => c.latestStatement?.remainingDueMinor ?? "0"),
      ),
      projectedPrincipalMinor: sum(
        installments.map((i) => i.remainingPrincipalMinor),
      ),
      knownProjectedTotalMinor: sum(
        installments.map((i) => i.remainingTotalMinor),
      ),
      unknownProjectedTotalCount: installments.filter(
        (i) => i.remainingTotalMinor === null,
      ).length,
      unknownInstallmentDateCount: installmentRows.rows.filter(
        (i) => i.eligible && i.dueDate === null,
      ).length,
      reconciliationPlanCount: new Set(
        installmentRows.rows
          .filter((i) => i.lifecycle === "active" && !i.eligible)
          .map((i) => i.planId),
      ).size,
    },
    warning:
      "Statement snapshots may carry earlier balances. Installment projections may overlap statements; do not add them together. Unknown provider allocation and future charges remain explicit.",
  };
}
export type CardSurface = Awaited<ReturnType<typeof readCardSurface>>;
