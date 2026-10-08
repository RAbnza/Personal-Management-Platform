import { sql } from "drizzle-orm";
import type { FinancialMetric } from "../domain/reports";

/** Grain: exactly one immutable posted posting. Category/account/source rows
 * are one-to-one. Many-side metadata is EXISTS or reduced to one row before
 * joining; tags, due allocations and schedule entries never enter this grain.
 * Reversal classification comes from reverses_posting_id, not current intent. */
export function postingFacts(workspaceId: string) {
  return sql`WITH facts AS (
    SELECT p.id,p.action_id,p.action_revision_id,p.journal_id,p.ledger_account_id,p.category_id,
      p.amount_minor::numeric AS amount,p.expense_class,p.income_class,p.cash_flow_kind,p.cash_flow_direction,p.liability_component,
      j.effective_date,j.role AS journal_role,r.revision_no,r.action_kind,
      l.kind AS ledger_kind,l.name AS ledger_name,f.description,c.name AS category,
      COALESCE(pc.disposition,CASE WHEN sr.action_kind='payment_reclassification' THEN
        (SELECT v.after_json->'components'->(sp.line_no-2)->>'disposition' FROM audit.private_revision v
          WHERE v.workspace_id=p.workspace_id AND v.subject_kind='financial_action' AND v.subject_id=p.action_id AND v.command_receipt_id=sr.command_receipt_id ORDER BY v.created_at DESC,v.id DESC LIMIT 1) END) AS payment_disposition,
      CASE WHEN fee.id IS NOT NULL THEN 'fee'
        WHEN pc.disposition='new_interest' THEN 'interest' WHEN pc.disposition='new_penalty' THEN 'penalty'
        WHEN sr.action_kind='payment_reclassification' THEN
          replace((SELECT v.after_json->'components'->(sp.line_no-2)->>'disposition' FROM audit.private_revision v
            WHERE v.workspace_id=p.workspace_id AND v.subject_kind='financial_action' AND v.subject_id=p.action_id AND v.command_receipt_id=sr.command_receipt_id ORDER BY v.created_at DESC,v.id DESC LIMIT 1),'new_','')
        WHEN sr.action_kind='debt_charge' THEN (SELECT max(q.liability_component) FROM finance.posting q WHERE q.workspace_id=p.workspace_id AND q.journal_id=sp.journal_id)
        ELSE sc.charge_component END AS charge_kind,
      sc.waiver,
      EXISTS(SELECT 1 FROM finance.debt_action_link dl WHERE dl.workspace_id=p.workspace_id AND dl.action_revision_id=sp.action_revision_id) AS debt_linked,
      (tf.source_account_id IS NOT NULL AND ta.ledger_account_id=p.ledger_account_id) AS transfer_source,
      sp.amount_minor::numeric AS source_amount,sp.id AS classification_posting_id,sp.action_revision_id AS classification_revision_id
    FROM finance.posting p
    JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
    JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
    JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id
    JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id
    JOIN finance.posting sp ON sp.workspace_id=p.workspace_id AND sp.id=COALESCE(p.reverses_posting_id,p.id)
    JOIN finance.action_revision sr ON sr.workspace_id=sp.workspace_id AND sr.id=sp.action_revision_id
    LEFT JOIN core.category c ON c.workspace_id=p.workspace_id AND c.id=p.category_id
    LEFT JOIN finance.fee_component fee ON fee.workspace_id=p.workspace_id AND fee.expense_posting_id=sp.id
    LEFT JOIN LATERAL (SELECT max(cp.disposition) AS disposition FROM finance.payment_component cp
      JOIN finance.debt_payment_revision pr ON pr.workspace_id=cp.workspace_id AND pr.id=cp.payment_revision_id AND pr.action_revision_id=sp.action_revision_id
      WHERE cp.workspace_id=p.workspace_id AND cp.posting_id=sp.id) pc ON TRUE
    LEFT JOIN finance.transfer_detail tf ON tf.workspace_id=p.workspace_id AND tf.action_revision_id=sp.action_revision_id
    LEFT JOIN finance.financial_account ta ON ta.workspace_id=p.workspace_id AND ta.id=tf.source_account_id
    LEFT JOIN LATERAL (SELECT max(s.liability_component) FILTER (WHERE s.counter_posting_id=sp.id AND (s.component_kind='recognized_charge' OR s.rounding_treatment='recognized_charge')) AS charge_component,
      bool_or(s.effect_posting_id=sp.id AND (s.component_kind='recognized_waiver' OR s.rounding_treatment='recognized_waiver')) AS waiver
      FROM finance.settlement_component s WHERE s.workspace_id=p.workspace_id AND (s.counter_posting_id=sp.id OR s.effect_posting_id=sp.id)) sc ON TRUE
    WHERE p.workspace_id=${workspaceId}::uuid
  )`;
}
export function metricExpression(metric: FinancialMetric) {
  const expressions = {
    income: sql`CASE WHEN income_class<>'none' THEN -amount END`,
    gross: sql`CASE WHEN expense_class='gross' THEN amount END`,
    offsets: sql`CASE WHEN expense_class IN ('refund_offset','rebate_offset','waiver_offset') THEN -amount END`,
    net: sql`CASE WHEN expense_class<>'none' THEN amount END`,
    fees: sql`CASE WHEN expense_class='gross' AND charge_kind='fee' THEN amount END`,
    interest: sql`CASE WHEN expense_class='gross' AND charge_kind='interest' THEN amount END`,
    penalties: sql`CASE WHEN expense_class='gross' AND charge_kind='penalty' THEN amount END`,
    cash_in: sql`CASE WHEN cash_flow_direction='in' THEN amount END`,
    cash_out: sql`CASE WHEN cash_flow_direction='out' THEN -amount END`,
    transfers: sql`CASE WHEN cash_flow_direction='internal' AND transfer_source THEN -amount END`,
    internal_cash_net: sql`CASE WHEN cash_flow_direction='internal' THEN amount END`,
    borrowing: sql`CASE WHEN cash_flow_kind='borrowing' AND cash_flow_direction='in' THEN amount END`,
    cash_refunds: sql`CASE WHEN cash_flow_kind='refund' AND cash_flow_direction='in' THEN amount END`,
    debt_payments: sql`CASE WHEN ledger_kind='cash_asset' AND cash_flow_direction='out' AND action_kind IN ('debt_payment','debt_settlement') THEN -amount END`,
    principal: sql`CASE WHEN ledger_kind='debt_liability' AND liability_component='principal' AND payment_disposition='liability_reduction' THEN amount END`,
    debt_charges: sql`CASE WHEN expense_class='gross' AND debt_linked THEN amount END`,
    waivers: sql`CASE WHEN ledger_kind='debt_liability' AND waiver THEN amount END`,
    baseline: sql`CASE WHEN cash_flow_direction='baseline' THEN amount END`,
    adjustments: sql`CASE WHEN cash_flow_direction='adjustment' THEN amount END`,
    opening_cash: sql`CASE WHEN ledger_kind='cash_asset' THEN amount END`,
    closing_cash: sql`CASE WHEN ledger_kind='cash_asset' THEN amount END`,
    net_cash_change: sql`CASE WHEN ledger_kind='cash_asset' AND cash_flow_direction<>'internal' THEN amount END`,
    opening_liability: sql`CASE WHEN ledger_kind='debt_liability' THEN -amount END`,
    liability_increases: sql`CASE WHEN ledger_kind='debt_liability' AND source_amount<0 THEN -amount END`,
    liability_reductions: sql`CASE WHEN ledger_kind='debt_liability' AND source_amount>0 THEN amount END`,
    closing_liability: sql`CASE WHEN ledger_kind='debt_liability' THEN -amount END`,
    clearing: sql`CASE WHEN ledger_kind='payment_clearing_asset' THEN amount END`,
    tracked_net: sql`CASE WHEN ledger_kind IN ('cash_asset','debt_liability') THEN amount END`,
  };
  return expressions[metric];
}
export function metricDatePredicate(
  metric: FinancialMetric,
  start: string,
  end: string,
) {
  return metric.startsWith("opening_")
    ? sql`effective_date<${start}::date`
    : ["closing_cash", "closing_liability", "clearing", "tracked_net"].includes(
          metric,
        )
      ? sql`effective_date<${end}::date`
      : sql`effective_date>=${start}::date AND effective_date<${end}::date`;
}
