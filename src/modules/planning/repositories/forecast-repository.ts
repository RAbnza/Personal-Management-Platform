import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  balancePostingFacts,
  metricExpression,
} from "@/modules/reporting/repositories/posting-facts";
import { readCardSurface } from "@/modules/finance/repositories/card-surface-repository";
import { readSavingsGoals } from "./savings-goal-repository";
import { ruleFromEvidence, type Evidence } from "./recurring-repository";
import { generateRecurrenceDates } from "../domain/recurrence";
import type { ForecastSource } from "../domain/forecast";
import { addCalendarDays } from "@/modules/reporting/domain/period";
export async function readForecastEvidence(
  t: ScopedTransaction,
  workspaceId: string,
  input: {
    today: string;
    endDate: string;
    projectionStart: string;
    currency: string;
  },
) {
  const opening = await t.db.execute<{ amount: string }>(
    sql`${balancePostingFacts(workspaceId)} SELECT COALESCE(sum(${metricExpression("closing_cash")}),0)::text amount FROM facts WHERE effective_date<=${input.today}::date`,
  );
  const future = await t.db.execute<{
    key: string;
    date: string;
    amountMinor: string;
    title: string;
    href: string;
    provenance: string;
    unmatchedMinor: string;
  }>(sql`
    SELECT 'recorded:'||p.action_id::text||':'||j.effective_date::text key,j.effective_date::text date,sum(p.amount_minor::numeric)::text AS "amountMinor",f.description title,'/money/actions/'||p.action_id::text href,'action:'||f.current_revision_id::text||';posted revisions:'||count(DISTINCT p.action_revision_id)::text provenance,GREATEST(abs(sum(p.amount_minor::numeric))-COALESCE(linked.amount,0),0)::text AS "unmatchedMinor"
    FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted' JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted' JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='cash_asset' JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id
    LEFT JOIN LATERAL(SELECT sum(x.linked_minor::numeric) amount FROM planning.effective_occurrence_link_v x JOIN planning.eligible_actual_v e ON e.workspace_id=x.workspace_id AND e.action_id=x.action_id AND e.action_revision_id=x.action_revision_id WHERE x.workspace_id=f.workspace_id AND x.action_id=f.id) linked ON true
    WHERE p.workspace_id=${workspaceId}::uuid AND j.effective_date BETWEEN ${input.projectionStart}::date AND ${input.endDate}::date GROUP BY p.action_id,j.effective_date,f.description,f.current_revision_id,linked.amount HAVING sum(p.amount_minor::numeric)<>0 ORDER BY j.effective_date,p.action_id LIMIT 5001`);
  const rules = await t.db.execute<{
    rootId: string;
    name: string;
    kind: string;
    archived: boolean;
    rootVersion: number;
    rule: Evidence;
  }>(
    sql`SELECT p.id AS "rootId",p.name,p.kind,p.archived_at IS NOT NULL archived,p.version AS "rootVersion",planning.evidence_snapshot(to_jsonb(r)) rule FROM planning.recurring_obligation p JOIN planning.recurrence_version r ON r.workspace_id=p.workspace_id AND r.obligation_id=p.id WHERE p.workspace_id=${workspaceId}::uuid ORDER BY p.id,r.effective_from LIMIT 1001`,
  );
  const occurrences = await t.db.execute<{
    id: string;
    rootId: string;
    ruleId: string;
    logicalDate: string;
    date: string;
    amount: string;
    state: string;
    name: string;
    kind: string;
    timezone: string;
    defaultAccountId: string | null;
    generation: number;
    version: number;
  }>(
    sql`SELECT id,obligation_id AS "rootId",recurrence_version_id AS "ruleId",logical_date::text AS "logicalDate",due_date::text date,remaining_minor::text amount,state,name,kind,timezone,default_account_id AS "defaultAccountId",generation,version FROM planning.occurrence_due_v WHERE workspace_id=${workspaceId}::uuid AND (logical_date BETWEEN ${input.projectionStart}::date AND ${input.endDate}::date OR due_date BETWEEN ${input.projectionStart}::date AND ${input.endDate}::date OR (due_date<=${input.today}::date AND state IN('planned','linked'))) ORDER BY obligation_id,logical_date,generation DESC LIMIT 10001`,
  );
  const accounts = await t.db.execute<{ id: string }>(
    sql`SELECT a.id FROM finance.financial_account a JOIN finance.ledger_account l ON l.workspace_id=a.workspace_id AND l.id=a.ledger_account_id WHERE a.workspace_id=${workspaceId}::uuid AND a.archived_at IS NULL AND l.archived_at IS NULL AND l.kind='cash_asset' AND a.currency=${input.currency} AND l.currency=${input.currency} AND a.opening_cutoff_date<=${input.today}::date LIMIT 10001`,
  );
  if (
    future.rows.length > 5000 ||
    rules.rows.length > 1000 ||
    new Set(rules.rows.map((r) => r.rootId)).size > 500 ||
    occurrences.rows.length > 10000 ||
    accounts.rows.length > 10000
  )
    throw new RangeError(
      "Forecast evidence exceeds the supported interactive inventory.",
    );
  const activeAccounts = new Set(accounts.rows.map((a) => a.id)),
    sources: ForecastSource[] = future.rows.map((r) => ({
      ...r,
      kind: "recorded_cash",
      blocker: null,
    }));
  const addRecurring = (
    r: {
      rootId: string;
      name: string;
      kind: string;
      date: string;
      amount: string;
      timezone: string;
      defaultAccountId: string | null;
      currency: string;
    },
    key: string,
    href: string,
    provenance: string,
  ) =>
    sources.push({
      key,
      kind: r.kind === "income" ? "recurring_income" : "recurring_outflow",
      title: r.name,
      date: r.date,
      amountMinor: (
        BigInt(r.amount) * (r.kind === "income" ? 1n : -1n)
      ).toString(),
      timezone: r.timezone,
      unassigned:
        !r.defaultAccountId || !activeAccounts.has(r.defaultAccountId),
      href,
      provenance,
      blocker:
        r.currency !== input.currency
          ? "Source currency does not match workspace cash; no conversion inferred."
          : null,
    });
  let terminalCount = 0;
  const byLogicalDate = new Map<string, typeof occurrences.rows>();
  for (const o of occurrences.rows) {
    const key = `${o.rootId}:${o.logicalDate}`;
    byLogicalDate.set(key, [...(byLogicalDate.get(key) ?? []), o]);
    if (o.state !== "planned" && o.state !== "linked") {
      terminalCount++;
      continue;
    }
    if (BigInt(o.amount) <= 0n) continue;
    addRecurring(
      {
        ...o,
        currency: String(
          rules.rows.find((r) => String(r.rule.id) === o.ruleId)?.rule.currency,
        ),
      },
      `recurring:${o.rootId}:${o.logicalDate}`,
      `/money/recurring/occurrences/${o.id}`,
      `occurrence:${o.id}:${o.version};rule:${o.ruleId};generation:${o.generation}`,
    );
  }
  const roots = new Map<string, typeof rules.rows>();
  if (sources.length > 5000)
    throw new RangeError("Forecast exceeds 5,000 contributing sources.");
  let calendarWork = 0;
  for (const r of rules.rows)
    roots.set(r.rootId, [...(roots.get(r.rootId) ?? []), r]);
  for (const [rootId, versions] of roots) {
    if (versions[0]!.archived) continue;
    for (let i = 0; i < versions.length; i++) {
      const v = versions[i]!,
        rule = ruleFromEvidence(v.rule),
        next = versions[i + 1];
      if (next && String(next.rule.effective_from) <= input.projectionStart)
        continue;
      const through = next
        ? [
            input.endDate,
            addCalendarDays(String(next.rule.effective_from), -1),
          ].sort()[0]!
        : input.endDate;
      if (rule.endsOn !== null && rule.endsOn < input.projectionStart) continue;
      const span = Math.max(
        0,
        (Date.parse(`${through}T00:00:00Z`) -
          Date.parse(`${rule.effectiveFrom}T00:00:00Z`)) /
          86400000,
      );
      calendarWork +=
        rule.frequency === "daily"
          ? Math.min(366, Math.ceil(span / rule.intervalCount) + 1)
          : rule.frequency === "weekly"
            ? Math.ceil(span / (7 * rule.intervalCount)) *
                (rule.weekdays?.length ?? 1) +
              1
            : Math.ceil(span / (28 * rule.intervalCount)) + 1;
      if (calendarWork > 100000)
        throw new RangeError(
          "Recurrence calendar history exceeds the supported interactive calculation budget.",
        );
      for (const date of generateRecurrenceDates(rule, {
        from: input.projectionStart,
        through,
      })) {
        if (next && date >= String(next.rule.effective_from)) continue;
        const existing = byLogicalDate.get(`${rootId}:${date}`) ?? [];
        if (
          existing.some(
            (o) => o.state !== "cancelled" || o.ruleId === String(v.rule.id),
          )
        )
          continue;
        addRecurring(
          {
            rootId,
            name: v.name,
            kind: v.kind,
            date,
            amount: rule.expectedMinor,
            timezone: rule.timezone,
            defaultAccountId: rule.defaultAccountId,
            currency: rule.currency,
          },
          `recurring:${rootId}:${date}`,
          `/money/recurring/${rootId}`,
          `derived rule:${String(v.rule.id)};root:${v.rootVersion}`,
        );
        if (sources.length > 5000)
          throw new RangeError("Forecast exceeds 5,000 contributing sources.");
      }
    }
  }
  const cards = await readCardSurface(t, workspaceId, {
    today: input.today,
    startDate: input.projectionStart,
    endDate: input.endDate,
  });
  if (cards.cards.length > 100)
    throw new RangeError("Forecast card inventory exceeds 100 cards.");
  const credits = await t.db.execute<{
    cardId: string;
    statementUnapplied: string;
    installmentUnapplied: string;
  }>(sql`
    SELECT d.card_id AS "cardId",sum(GREATEST(d.amount_minor::numeric-COALESCE(a.amount,0),0))::text AS "statementUnapplied",sum(GREATEST(d.amount_minor::numeric-COALESCE(i.amount,0),0))::text AS "installmentUnapplied"
    FROM finance.card_action_detail d JOIN finance.financial_action f ON f.workspace_id=d.workspace_id AND f.current_revision_id=d.action_revision_id JOIN finance.action_revision r ON r.workspace_id=d.workspace_id AND r.id=d.action_revision_id AND r.state='posted' AND r.change_kind<>'void' AND r.action_kind IN('card_payment','card_refund')
    LEFT JOIN LATERAL(SELECT sum(x.amount_minor::numeric) amount FROM finance.effective_card_allocation_v x WHERE x.workspace_id=d.workspace_id AND x.source_action_revision_id=d.action_revision_id) a ON true
    LEFT JOIN LATERAL(SELECT sum(x.principal_minor::numeric+x.interest_minor::numeric+x.fee_minor::numeric) amount FROM finance.effective_card_installment_application_v x JOIN finance.effective_card_allocation_v e ON e.workspace_id=x.workspace_id AND e.id=x.allocation_id WHERE e.workspace_id=d.workspace_id AND e.source_action_revision_id=d.action_revision_id) i ON true
    WHERE d.workspace_id=${workspaceId}::uuid GROUP BY d.card_id`);
  const cardBlocker = (cardId: string, basis: "statement" | "installments") => {
    const c = cards.cards.find((c) => c.cardId === cardId),
      u = credits.rows.find((u) => u.cardId === cardId);
    return c && BigInt(c.cardCreditMinor) > 0n
      ? "Card credit is not cash; additional payment need unresolved."
      : u &&
          BigInt(
            basis === "statement"
              ? u.statementUnapplied
              : u.installmentUnapplied,
          ) > 0n
        ? "Unapplied payment/credit evidence; resolve allocations before projecting another payment."
        : null;
  };
  for (const s of cards.statements) {
    if (BigInt(s.remainingDueMinor) <= 0n || s.dueDate > input.endDate)
      continue;
    sources.push({
      key: `statement:${s.statementId}`,
      kind: "statement",
      cardId: s.cardId,
      statementId: s.statementId,
      title: `${cards.cards.find((c) => c.cardId === s.cardId)!.name} verified statement`,
      date: s.dueDate,
      amountMinor: (-BigInt(s.remainingDueMinor)).toString(),
      href: `/money/cards/${s.cardId}/statements/${s.statementId}`,
      provenance: `statement:${s.revisionId}:${s.version};allocations:${s.allocatedMinor}`,
      blocker:
        BigInt(s.unresolvedAllocationMinor) > 0n
          ? "Unresolved statement allocation evidence."
          : cardBlocker(s.cardId, "statement"),
    });
  }
  // Read all current schedule evidence, including unknown dates/suspended plans,
  // instead of using the surface's dated eligible-only installment preview.
  const installments = await t.db.execute<{
    cardId: string;
    key: string;
    title: string;
    date: string | null;
    amountMinor: string | null;
    href: string;
    provenance: string;
    eligible: boolean;
  }>(
    sql`SELECT i.card_id AS "cardId",'installment:'||i.installment_id::text key,c.name||' installment '||i.sequence_no::text title,i.due_date::text date,(-i.remaining_total_minor)::text AS "amountMinor",'/money/cards/'||i.card_id::text||'/installments/'||i.plan_id::text href,'plan:'||i.revision_id::text||':'||i.version::text provenance,i.eligible FROM finance.card_installment_due_v i JOIN finance.credit_card c ON c.workspace_id=i.workspace_id AND c.id=i.card_id WHERE i.workspace_id=${workspaceId}::uuid AND i.lifecycle='active' AND (i.due_date IS NULL OR i.due_date<=${input.endDate}::date) AND (i.remaining_total_minor IS NULL OR i.remaining_total_minor>0) ORDER BY i.due_date NULLS LAST,i.installment_id LIMIT 5001`,
  );
  for (const i of installments.rows)
    sources.push({
      ...i,
      kind: "installment",
      blocker: !i.eligible
        ? "Originating purchase/plan requires reconciliation."
        : cardBlocker(i.cardId, "installments"),
    });
  if (sources.length > 5000)
    throw new RangeError("Forecast exceeds 5,000 contributing sources.");
  const savings = await readSavingsGoals(t, workspaceId, { pageSize: 10 });
  return {
    openingMinor: opening.rows[0]!.amount,
    sources,
    cards,
    savings,
    terminalCount,
  };
}
