import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { statementIdentifierSchema as id } from "../domain/card-statement";
import { isCalendarDate } from "@/shared/calendar-date";
import {
  CardInstallmentUnavailableError,
  installmentProjection,
} from "../domain/card-installment";
import {
  readInstallmentRoot,
  readInstallmentSnapshot,
} from "../repositories/card-installment-repository";
import { getCreditCardDetailInTransaction } from "./read-credit-cards";
import { readCardCreditSources } from "../repositories/card-allocation-repository";
const scopeSchema = z
  .object({ userId: id, workspaceId: id, cardId: id })
  .strict();
const offset = z.number().int().min(0).max(10000).default(0);
const listSchema = scopeSchema.extend({
  offset,
  purchaseActionId: id.optional(),
});
export function listCardInstallmentPlans(i: z.input<typeof listSchema>) {
  const p = listSchema.parse(i);
  return withDomainTransaction(
    p,
    async (t) => {
      const detail = await getCreditCardDetailInTransaction(t, {
        userId: p.userId,
        workspaceId: p.workspaceId,
        cardId: p.cardId,
      });
      const rows = await t.db.execute<{
        planId: string;
        version: number;
        purchaseActionId: string;
        description: string;
        lifecycle: string;
        eligible: boolean;
        principalMinor: string;
        providerReference: string | null;
        installmentCount: number;
        firstDueDate: string | null;
        lastDueDate: string | null;
        unknownDateCount: number;
      }>(
        sql`SELECT e.plan_id AS "planId",e.revision_no AS version,e.purchase_action_id AS "purchaseActionId",f.description,e.lifecycle,e.eligible,e.principal_minor::text AS "principalMinor",r.provider_reference AS "providerReference",r.installment_count AS "installmentCount",min(i.due_date)::text AS "firstDueDate",max(i.due_date)::text AS "lastDueDate",count(*) FILTER(WHERE i.due_date IS NULL)::int AS "unknownDateCount" FROM finance.card_installment_evidence_v e JOIN finance.card_installment_revision r ON r.workspace_id=e.workspace_id AND r.id=e.plan_revision_id JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.purchase_action_id JOIN finance.card_installment i ON i.workspace_id=e.workspace_id AND i.plan_revision_id=e.plan_revision_id WHERE e.workspace_id=${p.workspaceId}::uuid AND e.card_id=${p.cardId}::uuid ${p.purchaseActionId ? sql`AND e.purchase_action_id=${p.purchaseActionId}::uuid` : sql``} GROUP BY e.plan_id,e.revision_no,e.purchase_action_id,f.description,e.lifecycle,e.eligible,e.principal_minor,r.provider_reference,r.installment_count ORDER BY e.plan_id LIMIT 26 OFFSET ${p.offset}`,
      );
      return {
        ...detail,
        plans: rows.rows.slice(0, 25),
        hasMore: rows.rows.length > 25,
      };
    },
    { readOnlySnapshot: true },
  );
}
const setupSchema = scopeSchema.extend({
  offset,
  purchaseActionId: id.optional(),
});
export function getCardInstallmentSetup(i: z.input<typeof setupSchema>) {
  const p = setupSchema.parse(i);
  return withDomainTransaction(
    p,
    async (t) => {
      const detail = await getCreditCardDetailInTransaction(t, {
        userId: p.userId,
        workspaceId: p.workspaceId,
        cardId: p.cardId,
      });
      const q = await t.db.execute<{
        actionId: string;
        actionRevisionId: string;
        description: string;
        amountMinor: string;
        transactionDate: string;
        postingDate: string;
      }>(
        sql`SELECT e.action_id AS "actionId",e.action_revision_id AS "actionRevisionId",f.description,e.amount_minor::text AS "amountMinor",e.transaction_date::text AS "transactionDate",e.posting_date::text AS "postingDate" FROM finance.card_recognized_evidence_v e JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id WHERE e.workspace_id=${p.workspaceId}::uuid AND e.card_id=${p.cardId}::uuid AND e.action_kind='card_purchase' ${p.purchaseActionId ? sql`AND e.action_id=${p.purchaseActionId}::uuid` : sql``} ORDER BY e.transaction_date DESC,e.action_id LIMIT 101 OFFSET ${p.purchaseActionId ? 0 : p.offset}`,
      );
      if (p.purchaseActionId && !q.rows.length)
        throw new CardInstallmentUnavailableError();
      return {
        ...detail,
        purchases: q.rows.slice(0, 100),
        hasMore: q.rows.length > 100,
      };
    },
    { readOnlySnapshot: true },
  );
}
async function readApplications(
  t: ScopedTransaction,
  workspaceId: string,
  planId: string,
  revisionId: string,
  current: boolean,
  historyOffset: number,
) {
  const histories = await t.db.execute<{
    applicationId: string;
    revisionId: string;
    version: number;
    installmentNo: number;
    allocationId: string;
    principalMinor: string;
    interestMinor: string;
    feeMinor: string;
    confirmationSource: string;
    confirmationKind: string;
    confirmedDate: string;
    reversesApplicationId: string | null;
    status: string;
  }>(
    sql`SELECT x.id AS "applicationId",x.plan_revision_id AS "revisionId",r.revision_no AS version,x.installment_no AS "installmentNo",x.allocation_id AS "allocationId",x.principal_minor::text AS "principalMinor",x.interest_minor::text AS "interestMinor",x.fee_minor::text AS "feeMinor",x.confirmation_source AS "confirmationSource",x.confirmation_kind AS "confirmationKind",x.confirmed_date::text AS "confirmedDate",x.reverses_application_id AS "reversesApplicationId",CASE WHEN x.reverses_application_id IS NOT NULL THEN 'reversal' WHEN EXISTS(SELECT 1 FROM finance.card_installment_application undo WHERE undo.workspace_id=x.workspace_id AND undo.reverses_application_id=x.id) THEN 'reversed' WHEN effective.id IS NOT NULL THEN 'effective' ELSE 'superseded evidence — confirmation required' END AS status FROM finance.card_installment_application x JOIN finance.card_installment_revision r ON r.workspace_id=x.workspace_id AND r.id=x.plan_revision_id LEFT JOIN finance.effective_card_installment_application_v effective ON effective.workspace_id=x.workspace_id AND effective.id=x.id WHERE x.workspace_id=${workspaceId}::uuid AND r.plan_id=${planId}::uuid AND (${current} OR x.plan_revision_id=${revisionId}::uuid) ORDER BY x.created_at DESC,x.id LIMIT 101 OFFSET ${historyOffset}`,
  );
  const sums = await t.db.execute<{ unresolvedMinor: string }>(
    sql`SELECT COALESCE(sum(x.principal_minor::numeric+x.interest_minor::numeric+x.fee_minor::numeric),0)::text AS "unresolvedMinor" FROM finance.card_installment_application x JOIN finance.card_installment_revision r ON r.workspace_id=x.workspace_id AND r.id=x.plan_revision_id WHERE x.workspace_id=${workspaceId}::uuid AND r.plan_id=${planId}::uuid AND (${current} OR x.plan_revision_id=${revisionId}::uuid) AND x.reverses_application_id IS NULL AND NOT EXISTS(SELECT 1 FROM finance.card_installment_application undo WHERE undo.workspace_id=x.workspace_id AND undo.reverses_application_id=x.id) AND NOT EXISTS(SELECT 1 FROM finance.effective_card_installment_application_v e WHERE e.workspace_id=x.workspace_id AND e.id=x.id)`,
  );
  return {
    items: histories.rows.slice(0, 100),
    hasMore: histories.rows.length > 100,
    unresolvedMinor: sums.rows[0]!.unresolvedMinor,
  };
}
const detailSchema = scopeSchema.extend({
  planId: id,
  revisionId: id.optional(),
  historyOffset: offset,
  applicationOffset: offset,
  choiceOffset: offset,
  asOfDate: z.string().refine(isCalendarDate).optional(),
});
export function getCardInstallmentPlan(i: z.input<typeof detailSchema>) {
  const p = detailSchema.parse(i);
  return withDomainTransaction(
    p,
    async (t) => {
      const card = await getCreditCardDetailInTransaction(t, {
          userId: p.userId,
          workspaceId: p.workspaceId,
          cardId: p.cardId,
        }),
        root = await readInstallmentRoot(t, p.workspaceId, p.cardId, p.planId),
        revisionId = p.revisionId ?? root.currentRevisionId;
      const versionRows = await t.db.execute<{
        version: number;
        reason: string | null;
        createdAt: string;
        verificationSource: string;
        verifiedDate: string;
      }>(
        sql`SELECT revision_no AS version,reason,created_at::text AS "createdAt",verification_source AS "verificationSource",verified_date::text AS "verifiedDate" FROM finance.card_installment_revision WHERE workspace_id=${p.workspaceId}::uuid AND plan_id=${p.planId}::uuid AND id=${revisionId}::uuid AND state='verified'`,
      );
      if (!versionRows.rows[0]) throw new CardInstallmentUnavailableError();
      const snapshot = await readInstallmentSnapshot(
          t,
          p.workspaceId,
          revisionId,
        ),
        current = revisionId === root.currentRevisionId;
      const statusRows = await t.db.execute<{
          eligible: boolean;
          purchaseCurrent: boolean;
          refundsCurrent: boolean;
          recognizedPurchaseMinor: string;
        }>(
          sql`SELECT eligible,purchase_current AS "purchaseCurrent",refunds_current AS "refundsCurrent",recognized_purchase_minor::text AS "recognizedPurchaseMinor" FROM finance.card_installment_evidence_v WHERE workspace_id=${p.workspaceId}::uuid AND plan_id=${p.planId}::uuid`,
        ),
        status = statusRows.rows[0]!;
      const applied = await t.db.execute<{
        installmentNo: number;
        principalMinor: string;
        interestMinor: string;
        feeMinor: string;
      }>(
        sql`SELECT installment_no AS "installmentNo",sum(principal_minor::numeric)::text AS "principalMinor",sum(interest_minor::numeric)::text AS "interestMinor",sum(fee_minor::numeric)::text AS "feeMinor" FROM finance.effective_card_installment_application_v WHERE workspace_id=${p.workspaceId}::uuid AND plan_revision_id=${revisionId}::uuid GROUP BY installment_no`,
      );
      const zones = await t.db.execute<{ timezone: string }>(
        sql`SELECT timezone FROM core.workspace WHERE id=${p.workspaceId}::uuid`,
      );
      const asOfDate =
        p.asOfDate ??
        new Intl.DateTimeFormat("en-CA", {
          timeZone: zones.rows[0]!.timezone,
        }).format(new Date());
      const eligible = current && status.eligible,
        lines = snapshot.installments.map((line, n) => {
          const projection = installmentProjection(
            line,
            applied.rows.find((x) => x.installmentNo === n + 1),
          );
          return {
            sequenceNo: n + 1,
            ...line,
            remainingPrincipalMinor: eligible
              ? projection.remainingPrincipalMinor
              : null,
            remainingInterestMinor: eligible
              ? projection.remainingInterestMinor
              : null,
            remainingFeeMinor: eligible ? projection.remainingFeeMinor : null,
            remainingTotalMinor: eligible
              ? projection.remainingTotalMinor
              : null,
          };
        });
      const history = await t.db.execute<{
        revisionId: string;
        version: number;
        lifecycle: string;
        reason: string | null;
        verifiedDate: string;
        createdAt: string;
      }>(
        sql`SELECT id AS "revisionId",revision_no AS version,lifecycle,reason,verified_date::text AS "verifiedDate",created_at::text AS "createdAt" FROM finance.card_installment_revision WHERE workspace_id=${p.workspaceId}::uuid AND plan_id=${p.planId}::uuid AND state='verified' ORDER BY revision_no DESC LIMIT 26 OFFSET ${p.historyOffset}`,
      );
      const choices = await t.db.execute<{
        allocationId: string;
        statementId: string;
        statementDate: string;
        sourceActionRevisionId: string;
        description: string;
        amountMinor: string;
        availableMinor: string;
      }>(
        sql`SELECT a.id AS "allocationId",s.id AS "statementId",r.statement_date::text AS "statementDate",a.source_action_revision_id AS "sourceActionRevisionId",f.description,a.amount_minor::text AS "amountMinor",(a.amount_minor::numeric-COALESCE((SELECT sum(x.principal_minor::numeric+x.interest_minor::numeric+x.fee_minor::numeric) FROM finance.effective_card_installment_application_v x WHERE x.workspace_id=a.workspace_id AND x.allocation_id=a.id),0))::text AS "availableMinor" FROM finance.effective_card_allocation_v a JOIN finance.card_statement_revision r ON r.workspace_id=a.workspace_id AND r.id=a.statement_revision_id JOIN finance.card_statement s ON s.workspace_id=r.workspace_id AND s.id=r.statement_id JOIN finance.action_revision source ON source.workspace_id=a.workspace_id AND source.id=a.source_action_revision_id JOIN finance.financial_action f ON f.workspace_id=source.workspace_id AND f.id=source.action_id WHERE a.workspace_id=${p.workspaceId}::uuid AND s.card_id=${p.cardId}::uuid ORDER BY a.created_at DESC,a.id LIMIT 101 OFFSET ${p.choiceOffset}`,
      );
      const charges = await t.db.execute<{
        actionRevisionId: string;
        actionKind: string;
        description: string;
        amountMinor: string;
        availableMinor: string;
      }>(
        sql`SELECT e.action_revision_id AS "actionRevisionId",e.action_kind AS "actionKind",f.description,e.amount_minor::text AS "amountMinor",(e.amount_minor::numeric-COALESCE((SELECT sum(CASE WHEN e.action_kind='card_interest' THEN x.interest_minor::numeric ELSE x.fee_minor::numeric END) FROM finance.effective_card_installment_application_v x WHERE x.workspace_id=e.workspace_id AND CASE WHEN e.action_kind='card_interest' THEN x.interest_action_revision_id ELSE x.fee_action_revision_id END=e.action_revision_id),0))::text AS "availableMinor" FROM finance.card_recognized_evidence_v e JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id WHERE e.workspace_id=${p.workspaceId}::uuid AND e.card_id=${p.cardId}::uuid AND e.action_kind IN('card_fee','card_interest') ORDER BY e.transaction_date DESC,e.action_revision_id LIMIT 101 OFFSET ${p.choiceOffset}`,
      );
      const sum = (
        key:
          | "remainingPrincipalMinor"
          | "remainingInterestMinor"
          | "remainingFeeMinor"
          | "remainingTotalMinor",
      ) =>
        lines.some((l) => l[key] === null)
          ? null
          : lines.reduce((s, l) => s + BigInt(l[key]!), 0n).toString();
      const currentPurchase = await t.db.execute<{
        actionId: string;
        actionRevisionId: string;
        amountMinor: string;
        description: string;
        transactionDate: string;
        postingDate: string;
      }>(
        sql`SELECT e.action_id AS "actionId",e.action_revision_id AS "actionRevisionId",e.amount_minor::text AS "amountMinor",f.description,e.transaction_date::text AS "transactionDate",e.posting_date::text AS "postingDate" FROM finance.card_recognized_evidence_v e JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id WHERE e.workspace_id=${p.workspaceId}::uuid AND e.card_id=${p.cardId}::uuid AND e.action_id=${root.purchaseActionId}::uuid AND e.action_kind='card_purchase'`,
      );
      return {
        ...card,
        currentPurchase: currentPurchase.rows[0] ?? null,
        asOfDate,
        planId: p.planId,
        revisionId,
        version: versionRows.rows[0]!.version,
        currentVersion: root.version,
        isCurrent: current,
        snapshot,
        status: {
          ...status,
          eligible,
          kind: !current
            ? "historical"
            : snapshot.lifecycle === "cancelled"
              ? "cancelled"
              : eligible
                ? "active"
                : "reconciliation required",
        },
        lines,
        totals: {
          remainingPrincipalMinor: eligible
            ? sum("remainingPrincipalMinor")
            : null,
          remainingInterestMinor: eligible
            ? sum("remainingInterestMinor")
            : null,
          remainingFeeMinor: eligible ? sum("remainingFeeMinor") : null,
          remainingTotalMinor: eligible ? sum("remainingTotalMinor") : null,
          unknownDueDateCount: lines.filter((l) => l.dueDate === null).length,
        },
        upcoming: eligible
          ? lines.filter(
              (l) =>
                l.dueDate !== null &&
                l.dueDate >= asOfDate &&
                (l.remainingTotalMinor === null ||
                  BigInt(l.remainingTotalMinor) > 0n),
            )
          : [],
        overdue: eligible
          ? lines.filter(
              (l) =>
                l.dueDate !== null &&
                l.dueDate < asOfDate &&
                (l.remainingTotalMinor === null ||
                  BigInt(l.remainingTotalMinor) > 0n),
            )
          : [],
        applications: await readApplications(
          t,
          p.workspaceId,
          p.planId,
          revisionId,
          current,
          p.applicationOffset,
        ),
        allocationChoices: {
          items: choices.rows.slice(0, 100),
          hasMore: choices.rows.length > 100,
        },
        chargeChoices: {
          items: charges.rows.slice(0, 100),
          hasMore: charges.rows.length > 100,
        },
        unappliedCredits: await readCardCreditSources(
          t,
          p.workspaceId,
          p.cardId,
          p.choiceOffset,
        ),
        history: history.rows.slice(0, 25),
        historyHasMore: history.rows.length > 25,
      };
    },
    { readOnlySnapshot: true },
  );
}
