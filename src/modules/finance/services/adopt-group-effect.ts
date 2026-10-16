import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  id,
  SharingConflictError,
  SharingUnavailableError,
} from "@/modules/sharing/domain/sharing";
import {
  lockGroup,
  type SharingActor,
} from "@/modules/sharing/services/groups";
import { ensureBinding } from "./adopt-group-expense";
import {
  lockActiveFinancialWorkspace,
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  finalizeJournal,
  finalizeActionRevision,
} from "../repositories/financial-write-repository";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  resolveFundingFinancialAccount,
  ensureActiveExpenseCategory,
  getOrCreateSharedExpenseLedger,
  createExpenseFinancialAction,
} from "../repositories/expense-repository";
import { resolvePurchaseCard } from "../repositories/card-purchase-repository";
import {
  beginActionReplacement,
  readCurrentFinancialAction,
} from "../repositories/financial-correction-repository";
import { reviewCashChanges } from "../repositories/negative-balance-repository";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";
import {
  readRetainedSourceReview,
  readPrivateLinkAmounts,
} from "./review-group-source";

export const effectReferenceSchema = z
  .object({
    groupId: id,
    sourceKind: z.enum(["refund", "settlement"]),
    sourceId: id,
  })
  .strict();
export const effectAdoptionSchema = effectReferenceSchema
  .extend({
    clientCommandId: id,
    expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedFinancialRevision: z.string().regex(/^(0|[1-9]\d*)$/),
    approved: z.literal(true),
    categoryId: id.nullable().default(null),
    acknowledgeNegativeBalance: z.boolean().default(false),
    funding: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("none") }).strict(),
      z.object({ kind: z.literal("keep") }).strict(),
      z.object({ kind: z.literal("cash"), accountId: id }).strict(),
      z
        .object({
          kind: z.literal("card"),
          cardId: id,
          postingDate: z.iso.date(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("existing"),
          actionId: id,
          expectedActionRevisionId: id,
        })
        .strict(),
    ]),
  })
  .strict();
type Reference = z.infer<typeof effectReferenceSchema>;
type EffectSource = {
  groupId: string;
  sourceId: string;
  purpose: string;
  sourceVersion: number;
  state: string;
  paidMinor: string;
  shareMinor: string;
  cashMinor: string;
  spendingMinor: string;
  groupMinor: string;
  clearingMinor: string;
  canResolve: boolean;
  effectiveDate: string;
  sourceHash: string;
};
async function effectSource(
  t: ScopedTransaction,
  c: Reference,
  participantId: string,
): Promise<EffectSource> {
  return (
    await t.db.execute<{ source: EffectSource }>(
      sql`SELECT finance.group_effect_source(${c.groupId}::uuid,${participantId}::uuid,${c.sourceKind === "refund" ? c.sourceId : null}::uuid,${c.sourceKind === "settlement" ? c.sourceId : null}::uuid) AS source`,
    )
  ).rows[0]!.source;
}
async function currentLink(t: ScopedTransaction, c: Reference) {
  return (
    (
      await t.db.execute<{
        id: string;
        revisionId: string;
        revisionNo: number;
        actionId: string;
        sourceHash: string;
      }>(
        sql`SELECT l.id,l.current_link_revision_id AS "revisionId",r.revision_no AS "revisionNo",l.action_id AS "actionId",r.accepted_source_hash AS "sourceHash" FROM finance.private_group_link l JOIN finance.private_group_link_revision r ON r.workspace_id=l.workspace_id AND r.id=l.current_link_revision_id WHERE l.group_id=${c.groupId}::uuid AND (${c.sourceKind}='refund' AND l.refund_id=${c.sourceId}::uuid OR ${c.sourceKind}='settlement' AND l.settlement_id=${c.sourceId}::uuid)`,
      )
    ).rows[0] ?? null
  );
}
export function getGroupEffectPreview(actor: SharingActor, raw: unknown) {
  const c = effectReferenceSchema.parse(raw);
  return withDomainTransaction(actor, async (t) => {
    const g = await lockGroup(t, c.groupId, true);
    await lockActiveFinancialWorkspace(t, actor.workspaceId);
    const source = await effectSource(t, c, g.participantId),
      link = await currentLink(t, c),
      financialRevision = (
        await t.db.execute<{ v: string }>(
          sql`SELECT financial_revision::text v FROM core.workspace WHERE id=${actor.workspaceId}::uuid`,
        )
      ).rows[0]!.v;
    const existingMovements = (
      await t.db.execute<{
        id: string;
        revisionId: string;
        description: string;
      }>(
        sql`SELECT a.id,r.id AS "revisionId",a.description FROM finance.financial_action a JOIN finance.action_revision r ON r.workspace_id=a.workspace_id AND r.id=a.current_revision_id AND r.state='posted' AND r.change_kind<>'void' WHERE r.primary_effective_date=${source.effectiveDate}::date AND (NOT EXISTS(SELECT 1 FROM finance.private_group_link l WHERE l.workspace_id=a.workspace_id AND l.action_id=a.id) OR (${c.sourceKind}='settlement' AND EXISTS(SELECT 1 FROM finance.private_group_link l JOIN sharing.settlement old ON old.group_id=l.group_id AND old.id=l.settlement_id JOIN sharing.settlement next ON next.group_id=old.group_id AND next.id=${c.sourceId}::uuid WHERE l.workspace_id=a.workspace_id AND l.action_id=a.id AND l.group_id=${c.groupId}::uuid AND old.state IN('cancelled','reversed') AND next.state NOT IN('cancelled','reversed') AND old.sender_id=next.sender_id AND old.recipient_id=next.recipient_id AND old.amount_minor=next.amount_minor AND old.payment_date=next.payment_date))) AND (SELECT coalesce(sum(p.amount_minor::numeric),0) FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind IN('cash_asset','card_liability') WHERE p.workspace_id=a.workspace_id AND p.action_revision_id=r.id)=${source.cashMinor}::numeric ORDER BY a.id LIMIT 100`,
      )
    ).rows;
    return {
      ...source,
      ...c,
      financialRevision,
      link,
      review: link
        ? await readRetainedSourceReview(
            t,
            link.id,
            link.revisionId,
            source.sourceHash,
          )
        : null,
      retainedAmounts: link ? await readPrivateLinkAmounts(t, link.id) : null,
      existingMovements,
      needsReview: !!link && link.sourceHash !== source.sourceHash,
    };
  });
}
export type EffectPreview = Awaited<ReturnType<typeof getGroupEffectPreview>>;
export function adoptGroupEffect(actor: SharingActor, raw: unknown) {
  const c = effectAdoptionSchema.parse(raw);
  return withDomainTransaction(actor, async (t) => {
    const g = await lockGroup(t, c.groupId, true);
    await lockActiveFinancialWorkspace(t, actor.workspaceId);
    const receipt = await claimFinancialCommandReceipt(t, {
      workspaceId: actor.workspaceId,
      clientCommandId: c.clientCommandId,
      commandType: "finance.adopt_group_effect",
      payloadHash: hashFinancialCommandPayload(c),
    });
    if (receipt.kind === "replay") return receipt.result;
    const source = await effectSource(t, c, g.participantId),
      currentFinancialRevision = (
        await t.db.execute<{ v: string }>(
          sql`SELECT financial_revision::text v FROM core.workspace WHERE id=${actor.workspaceId}::uuid`,
        )
      ).rows[0]!.v;
    let link = await currentLink(t, c),
      retarget = false;
    if (
      !link &&
      c.sourceKind === "settlement" &&
      c.funding.kind === "existing"
    ) {
      link =
        (
          await t.db.execute<
            NonNullable<Awaited<ReturnType<typeof currentLink>>>
          >(
            sql`SELECT l.id,l.current_link_revision_id AS "revisionId",r.revision_no AS "revisionNo",l.action_id AS "actionId",r.accepted_source_hash AS "sourceHash" FROM finance.private_group_link l JOIN finance.private_group_link_revision r ON r.workspace_id=l.workspace_id AND r.id=l.current_link_revision_id JOIN sharing.settlement old ON old.group_id=l.group_id AND old.id=l.settlement_id JOIN sharing.settlement next ON next.group_id=old.group_id AND next.id=${c.sourceId}::uuid WHERE l.action_id=${c.funding.actionId}::uuid AND l.participant_id=${g.participantId}::uuid AND old.group_id=${c.groupId}::uuid AND old.state IN('cancelled','reversed') AND next.state NOT IN('cancelled','reversed') AND old.sender_id=next.sender_id AND old.recipient_id=next.recipient_id AND old.amount_minor=next.amount_minor AND old.payment_date=next.payment_date`,
          )
        ).rows[0] ?? null;
      retarget = !!link;
    }
    if (
      source.sourceHash !== c.expectedSourceHash ||
      currentFinancialRevision !== c.expectedFinancialRevision
    )
      throw new SharingConflictError();
    if (
      link ? c.funding.kind !== "keep" && !retarget : c.funding.kind === "keep"
    )
      throw new RangeError(
        "An existing link retains its actual funding. A new link needs explicit funding or an existing private movement.",
      );
    const cash = BigInt(source.cashMinor),
      spending = BigInt(source.spendingMinor),
      group = BigInt(source.groupMinor),
      clearing = BigInt(source.clearingMinor);
    if (
      [cash, spending, group, clearing].some(
        (n) => (n < 0n ? -n : n) > MAX_FINANCIAL_COMPONENT_MINOR,
      )
    )
      throw new RangeError(
        "The allocation exceeds the existing private posting limit.",
      );
    if (!cash && !spending && !group && !clearing)
      throw new RangeError(
        "Adopt the related bill first, then review this private refund.",
      );
    const binding = await ensureBinding(t, actor, c.groupId, g.participantId);
    const clearingCode = `group:${c.groupId}:clearing`;
    await t.db.execute(
      sql`INSERT INTO finance.ledger_account(workspace_id,code,name,kind,currency) VALUES(${actor.workspaceId}::uuid,${clearingCode},'Group settlement clearing','payment_clearing_asset','PHP') ON CONFLICT(workspace_id,code) DO NOTHING`,
    );
    const clearingLedger = (
      await t.db.execute<{ id: string }>(
        sql`SELECT id FROM finance.ledger_account WHERE workspace_id=${actor.workspaceId}::uuid AND code=${clearingCode} AND kind='payment_clearing_asset' AND currency='PHP' AND archived_at IS NULL`,
      )
    ).rows[0]?.id;
    if (!clearingLedger) throw new SharingUnavailableError();
    let actionId = randomUUID() as string,
      revisionId = randomUUID() as string,
      revisionNo = 1,
      before: Record<string, unknown> | null = null,
      fundingLedger: string | null = null,
      cardId: string | null = null,
      postingDate = source.effectiveDate;
    const priorAction =
      link?.actionId ??
      (c.funding.kind === "existing" ? c.funding.actionId : null);
    if (priorAction) {
      const current = await readCurrentFinancialAction(
        t,
        actor.workspaceId,
        priorAction,
      );
      if (
        current.changeKind === "void" ||
        (c.funding.kind === "existing" &&
          current.actionRevisionId !== c.funding.expectedActionRevisionId) ||
        current.effectiveDate !== source.effectiveDate
      )
        throw new SharingConflictError();
      const movements = (
        await t.db.execute<{
          ledger: string;
          kind: string;
          amount: string;
          cardId: string | null;
        }>(
          sql`SELECT l.id ledger,l.kind,sum(p.amount_minor::numeric)::text amount,c.id AS "cardId" FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind IN('cash_asset','card_liability') LEFT JOIN finance.credit_card c ON c.workspace_id=l.workspace_id AND c.liability_ledger_account_id=l.id WHERE p.workspace_id=${actor.workspaceId}::uuid AND p.action_revision_id=${current.actionRevisionId}::uuid GROUP BY l.id,c.id`,
        )
      ).rows;
      if (
        cash !== 0n &&
        (movements.length !== 1 || movements[0]!.amount !== source.cashMinor)
      )
        throw new RangeError(
          "Existing movement must exactly match the private cash/card amount. It will be reclassified without repeating funding.",
        );
      fundingLedger = movements[0]?.ledger ?? null;
      cardId = movements[0]?.cardId ?? null;
      if (cardId && c.sourceKind !== "refund")
        throw new RangeError("Settlements require an actual cash movement.");
      if (!link) {
        const deps = (
          await t.db.execute(
            sql`SELECT 1 WHERE EXISTS(SELECT 1 FROM finance.private_group_link WHERE action_id=${priorAction}::uuid) OR EXISTS(SELECT 1 FROM planning.occurrence_actual_link WHERE action_id=${priorAction}::uuid) OR EXISTS(SELECT 1 FROM finance.refund_detail WHERE purchase_action_id=${priorAction}::uuid) OR EXISTS(SELECT 1 FROM finance.card_action_detail WHERE purchase_action_id=${priorAction}::uuid) OR EXISTS(SELECT 1 FROM finance.card_statement_entry WHERE action_revision_id=${current.actionRevisionId}::uuid) OR EXISTS(SELECT 1 FROM finance.card_installment_plan WHERE purchase_action_id=${priorAction}::uuid) OR EXISTS(SELECT 1 FROM finance.debt_action_link WHERE action_id=${priorAction}::uuid)`,
          )
        ).rows;
        if (deps.length)
          throw new RangeError(
            "Resolve dependent private records before converting this movement.",
          );
      }
      const replacement = await beginActionReplacement(t, {
        ...actor,
        receiptId: receipt.receiptId,
        current,
        actionKind: "group_effect",
        reason:
          "Owner approved group source classification; actual funding retained",
        effectiveDate: source.effectiveDate,
      });
      actionId = replacement.actionId;
      revisionId = replacement.actionRevisionId;
      revisionNo = replacement.revisionNo;
      before = replacement.before;
    } else {
      if (
        (cash === 0n && c.funding.kind !== "none") ||
        (cash !== 0n && c.funding.kind === "none")
      )
        throw new RangeError(
          "Choose funding only for an actual cash/card movement.",
        );
      if (c.funding.kind === "cash") {
        const account = await resolveFundingFinancialAccount(t, {
          workspaceId: actor.workspaceId,
          accountId: c.funding.accountId,
        });
        if (
          account.archived ||
          account.currency !== "PHP" ||
          account.openingCutoffDate >= source.effectiveDate
        )
          throw new RangeError(
            "Choose an active PHP account with an earlier cutoff.",
          );
        fundingLedger = account.ledgerAccountId;
        if (cash < 0n)
          await reviewCashChanges(t, {
            workspaceId: actor.workspaceId,
            acknowledgeNegativeBalance: c.acknowledgeNegativeBalance,
            changes: [
              {
                accountId: c.funding.accountId,
                effectiveDate: source.effectiveDate,
                signedMinor: cash,
              },
            ],
          });
      } else if (c.funding.kind === "card") {
        if (c.sourceKind !== "refund")
          throw new RangeError(
            "Only an actual merchant refund may return to a card.",
          );
        const card = await resolvePurchaseCard(
          t,
          actor.workspaceId,
          c.funding.cardId,
        );
        if (card.archived || card.currency !== "PHP")
          throw new RangeError("Choose an active PHP card.");
        fundingLedger = card.ledgerAccountId;
        cardId = c.funding.cardId;
        postingDate = c.funding.postingDate;
      }
      await createExpenseFinancialAction(t, {
        id: actionId,
        workspaceId: actor.workspaceId,
        commandReceiptId: receipt.receiptId,
        currentRevisionId: revisionId,
        description:
          c.sourceKind === "refund" ? "Shared refund" : "Group settlement",
        reference: null,
        notes: null,
        recordedByUserId: actor.userId,
        requestId: actor.requestId ?? null,
      });
      await t.db.execute(
        sql`INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,recorded_by_user_id,actor_kind) VALUES(${revisionId}::uuid,${actor.workspaceId}::uuid,${actionId}::uuid,1,${receipt.receiptId}::uuid,'create','group_effect',${source.effectiveDate}::date,'PHP',${actor.userId}::uuid,'user')`,
      );
    }
    if (c.categoryId)
      await ensureActiveExpenseCategory(t, {
        workspaceId: actor.workspaceId,
        categoryId: c.categoryId,
      });
    const expenseLedger = await getOrCreateSharedExpenseLedger(t, {
        workspaceId: actor.workspaceId,
        currency: "PHP",
      }),
      journalId = randomUUID();
    await t.db.execute(
      sql`INSERT INTO finance.journal(id,workspace_id,action_id,action_revision_id,sequence_no,effective_date,currency,role) VALUES(${journalId}::uuid,${actor.workspaceId}::uuid,${actionId}::uuid,${revisionId}::uuid,1,${source.effectiveDate}::date,'PHP','economic')`,
    );
    // Offset the owner's adopted payable/receivable when possible. An unadopted
    // source remains in clearing; it never fabricates a recognized debt.
    const buckets = (
      await t.db.execute<{ payable: string; receivable: string }>(
        sql`SELECT coalesce(sum(amount_minor::numeric) FILTER(WHERE ledger_account_id=${binding.payable}::uuid),0)::text payable,coalesce(sum(amount_minor::numeric) FILTER(WHERE ledger_account_id=${binding.receivable}::uuid),0)::text receivable FROM finance.posting WHERE ledger_account_id IN(${binding.payable}::uuid,${binding.receivable}::uuid)`,
      )
    ).rows[0]!;
    const payableAvailable =
        BigInt(buckets.payable) < 0n ? -BigInt(buckets.payable) : 0n,
      receivableAvailable =
        BigInt(buckets.receivable) > 0n ? BigInt(buckets.receivable) : 0n;
    const payableDelta =
      group > 0n
        ? group < payableAvailable
          ? group
          : payableAvailable
        : group < 0n
          ? group +
            (-group < receivableAvailable ? -group : receivableAvailable)
          : 0n;
    const receivableDelta = group - payableDelta;
    let line = 0;
    for (const p of [
      { ledger: fundingLedger, n: cash, expense: false, funding: true },
      { ledger: expenseLedger, n: spending, expense: true, funding: false },
      {
        ledger: binding.payable,
        n: payableDelta,
        expense: false,
        funding: false,
      },
      {
        ledger: binding.receivable,
        n: receivableDelta,
        expense: false,
        funding: false,
      },
      { ledger: clearingLedger, n: clearing, expense: false, funding: false },
    ])
      if (p.n !== 0n && p.ledger)
        await t.db.execute(
          sql`INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,category_id,expense_class,cash_flow_kind,cash_flow_direction) VALUES(${actor.workspaceId}::uuid,${actionId}::uuid,${revisionId}::uuid,${journalId}::uuid,${p.ledger}::uuid,'PHP',${++line},${p.n},${p.expense ? c.categoryId : null}::uuid,${p.expense ? "refund_offset" : "none"},${p.funding && !cardId ? (c.sourceKind === "refund" ? "refund" : "clearing") : "none"},${p.funding && !cardId ? (p.n < 0n ? "out" : "in") : "none"})`,
        );
    if (cardId) {
      const movement = (
        await t.db.execute<{ n: string }>(
          sql`SELECT (-sum(amount_minor::numeric))::text n FROM finance.posting WHERE action_revision_id=${revisionId}::uuid AND ledger_account_id=${fundingLedger}::uuid`,
        )
      ).rows[0]?.n;
      if (movement && BigInt(movement) !== 0n)
        await t.db.execute(
          sql`INSERT INTO finance.card_activity(workspace_id,card_id,action_id,action_revision_id,activity_kind,transaction_date,posting_date,signed_liability_minor) VALUES(${actor.workspaceId}::uuid,${cardId}::uuid,${actionId}::uuid,${revisionId}::uuid,'refund',${source.effectiveDate}::date,${postingDate}::date,${movement}::bigint)`,
        );
    }
    const linkId = link?.id ?? randomUUID(),
      linkRevisionId = randomUUID();
    if (link)
      await t.db.execute(
        sql`UPDATE finance.private_group_link SET current_link_revision_id=${linkRevisionId}::uuid,settlement_id=CASE WHEN ${retarget} THEN ${c.sourceId}::uuid ELSE settlement_id END WHERE id=${link.id}::uuid`,
      );
    else
      await t.db.execute(
        sql`INSERT INTO finance.private_group_link(id,workspace_id,group_id,participant_id,refund_id,settlement_id,purpose,action_id,current_link_revision_id) VALUES(${linkId}::uuid,${actor.workspaceId}::uuid,${c.groupId}::uuid,${g.participantId}::uuid,${c.sourceKind === "refund" ? c.sourceId : null}::uuid,${c.sourceKind === "settlement" ? c.sourceId : null}::uuid,${source.purpose},${actionId}::uuid,${linkRevisionId}::uuid)`,
      );
    await t.db.execute(
      sql`INSERT INTO finance.private_group_link_revision(id,workspace_id,link_id,group_id,participant_id,source_refund_id,source_settlement_id,source_settlement_version,action_id,action_revision_id,revision_no,previous_link_revision_id,accepted_source_hash,adoption_kind,paid_minor,share_minor,consent_json) VALUES(${linkRevisionId}::uuid,${actor.workspaceId}::uuid,${linkId}::uuid,${c.groupId}::uuid,${g.participantId}::uuid,${c.sourceKind === "refund" ? c.sourceId : null}::uuid,${c.sourceKind === "settlement" ? c.sourceId : null}::uuid,${c.sourceKind === "settlement" ? source.sourceVersion : null},${actionId}::uuid,${revisionId}::uuid,${(link?.revisionNo ?? 0) + 1},${link?.revisionId ?? null}::uuid,${source.sourceHash},${link ? "clearing_resolution" : c.funding.kind === "existing" ? "existing_action_reclassification" : "new_posting"},${source.paidMinor}::bigint,${source.shareMinor}::bigint,${JSON.stringify({ approved: true, sourceHash: source.sourceHash })}::jsonb)`,
    );
    await createPrivateFinancialRevision(t, {
      id: randomUUID(),
      workspaceId: actor.workspaceId,
      commandReceiptId: receipt.receiptId,
      subjectKind: "financial_action",
      subjectId: actionId,
      subjectVersion: revisionNo,
      operation: before ? "replace" : "create",
      beforeJson: before,
      reason: before
        ? "Owner reviewed current group evidence; retained actual cash movement"
        : null,
      afterJson: {
        actionRevisionId: revisionId,
        actionKind: "group_effect",
        privateGroupLinkRevisionId: linkRevisionId,
        acceptedSourceHash: source.sourceHash,
        source,
        acknowledgeNegativeBalance: c.acknowledgeNegativeBalance,
      },
      effectiveDate: source.effectiveDate,
      recordedByUserId: actor.userId,
      requestId: actor.requestId ?? null,
    });
    await finalizeJournal(t, { workspaceId: actor.workspaceId, journalId });
    await finalizeActionRevision(t, {
      workspaceId: actor.workspaceId,
      actionRevisionId: revisionId,
    });
    const financialRevision = await advanceWorkspaceFinancialRevision(
        t,
        actor.workspaceId,
      ),
      result = {
        actionId,
        actionRevisionId: revisionId,
        linkId,
        financialRevision,
      };
    await completeFinancialCommandReceipt(t, {
      workspaceId: actor.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    return result;
  });
}
