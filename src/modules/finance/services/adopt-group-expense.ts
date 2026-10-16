import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  id,
  SharingConflictError,
  SharingUnavailableError,
  groupCommandSchema,
} from "@/modules/sharing/domain/sharing";
import {
  lockGroup,
  executeGroupCommand,
  type SharingActor,
} from "@/modules/sharing/services/groups";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  lockActiveFinancialWorkspace,
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  finalizeJournal,
  finalizeActionRevision,
} from "../repositories/financial-write-repository";
import {
  getOrCreateSharedExpenseLedger,
  ensureActiveExpenseCategory,
  resolveFundingFinancialAccount,
  createExpenseFinancialAction,
  createExpenseActionRevision,
  createPurchaseDetail,
} from "../repositories/expense-repository";
import {
  resolvePurchaseCard,
  createCardRevisionActivity,
} from "../repositories/card-purchase-repository";
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

export const adoptionSchema = z
  .object({
    clientCommandId: id,
    groupId: id,
    expenseId: id,
    expectedSourceRevisionId: id,
    expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedFinancialRevision: z.string().regex(/^(0|[1-9]\d*)$/),
    approved: z.literal(true),
    categoryId: id.nullable().default(null),
    funding: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("keep") }).strict(),
      z.object({ kind: z.literal("none") }).strict(),
      z.object({ kind: z.literal("cash"), accountId: id }).strict(),
      z
        .object({
          kind: z.literal("card"),
          cardId: id,
          postingDate: z.iso.date(),
          providerReference: z.string().max(2000).nullable().default(null),
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
    acknowledgeNegativeBalance: z.boolean().default(false),
    acknowledgeFundingCorrection: z.boolean().optional(),
  })
  .strict();
export type AdoptionInput = z.infer<typeof adoptionSchema>;
type Source = {
  revisionId: string;
  description: string;
  expenseDate: string;
  paidMinor: string;
  shareMinor: string;
  sourceHash: string;
};
async function source(
  t: ScopedTransaction,
  groupId: string,
  expenseId: string,
  participantId: string,
): Promise<Source> {
  const row = (
    await t.db.execute<Source>(
      sql`SELECT r.id AS "revisionId",r.description,r.expense_date::text AS "expenseDate",p.paid::text AS "paidMinor",s.consumed::text AS "shareMinor",encode(sha256(convert_to(jsonb_build_object('revisionId',r.id,'paidMinor',p.paid::text,'shareMinor',s.consumed::text)::text,'UTF8')),'hex') AS "sourceHash" FROM sharing.shared_expense e JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id AND r.state='finalized' CROSS JOIN LATERAL(SELECT coalesce(sum(amount_minor::numeric),0) paid FROM sharing.payer_contribution WHERE group_id=e.group_id AND expense_revision_id=r.id AND participant_id=${participantId}::uuid) p CROSS JOIN LATERAL(SELECT coalesce(sum(amount_minor::numeric),0) consumed FROM sharing.participant_share WHERE group_id=e.group_id AND expense_revision_id=r.id AND participant_id=${participantId}::uuid) s WHERE e.group_id=${groupId}::uuid AND e.id=${expenseId}::uuid`,
    )
  ).rows[0];
  if (!row) throw new SharingUnavailableError();
  if (
    BigInt(row.paidMinor) === 0n &&
    BigInt(row.shareMinor) === 0n &&
    !(
      await t.db.execute(
        sql`SELECT id FROM finance.private_group_link WHERE group_id=${groupId}::uuid AND expense_id=${expenseId}::uuid`,
      )
    ).rows.length
  )
    throw new SharingUnavailableError();
  return row;
}
export async function getAdoptionPreview(
  actor: SharingActor,
  groupId: string,
  expenseId: string,
) {
  id.parse(groupId);
  id.parse(expenseId);
  return withDomainTransaction(
    actor,
    async (t) => {
      const group = await lockGroup(t, groupId, true);
      await lockActiveFinancialWorkspace(t, actor.workspaceId);
      const s = await source(t, groupId, expenseId, group.participantId);
      const financialRevision = (
        await t.db.execute<{ version: string }>(
          sql`SELECT financial_revision::text AS version FROM core.workspace WHERE id=${actor.workspaceId}::uuid`,
        )
      ).rows[0]?.version;
      const link =
        (
          await t.db.execute<{
            id: string;
            actionId: string;
            acceptedSourceRevisionId: string;
            acceptedSourceHash: string;
            actionRevisionId: string;
            currentActionRevisionId: string;
            linkRevisionId: string;
          }>(
            sql`SELECT l.id,r.id AS "linkRevisionId",l.action_id AS "actionId",r.source_expense_revision_id AS "acceptedSourceRevisionId",r.accepted_source_hash AS "acceptedSourceHash",r.action_revision_id AS "actionRevisionId",a.current_revision_id AS "currentActionRevisionId" FROM finance.private_group_link l JOIN finance.private_group_link_revision r ON r.workspace_id=l.workspace_id AND r.id=l.current_link_revision_id JOIN finance.financial_action a ON a.workspace_id=l.workspace_id AND a.id=l.action_id WHERE l.workspace_id=${actor.workspaceId}::uuid AND l.group_id=${groupId}::uuid AND l.expense_id=${expenseId}::uuid`,
          )
        ).rows[0] ?? null;
      const net = BigInt(s.paidMinor) - BigInt(s.shareMinor);
      return {
        ...s,
        groupId,
        expenseId,
        financialRevision: financialRevision!,
        receivableMinor: (net > 0n ? net : 0n).toString(),
        payableMinor: (net < 0n ? -net : 0n).toString(),
        link,
        review: link
          ? await readRetainedSourceReview(
              t,
              link.id,
              link.linkRevisionId,
              s.sourceHash,
            )
          : null,
        retainedAmounts: link ? await readPrivateLinkAmounts(t, link.id) : null,
        needsPrivateCorrection:
          !!link &&
          (link.acceptedSourceRevisionId !== s.revisionId ||
            link.acceptedSourceHash !== s.sourceHash ||
            link.actionRevisionId !== link.currentActionRevisionId),
      };
    },
    {
      /* group serialization precedes any private write; preview itself posts nothing */
    },
  );
}
export type AdoptionPreview = Awaited<ReturnType<typeof getAdoptionPreview>>;
export async function ensureBinding(
  t: ScopedTransaction,
  actor: SharingActor,
  groupId: string,
  participantId: string,
) {
  let b = (
    await t.db.execute<{ receivable: string; payable: string }>(
      sql`SELECT receivable_ledger_account_id AS receivable,payable_ledger_account_id AS payable FROM finance.group_ledger_binding WHERE workspace_id=${actor.workspaceId}::uuid AND group_id=${groupId}::uuid AND participant_id=${participantId}::uuid`,
    )
  ).rows[0];
  if (b) return b;
  b = { receivable: randomUUID(), payable: randomUUID() };
  for (const [kind, ledgerId] of [
    ["group_receivable_asset", b.receivable],
    ["group_payable_liability", b.payable],
  ])
    await t.db.execute(
      sql`INSERT INTO finance.ledger_account(id,workspace_id,code,name,kind,currency) VALUES(${ledgerId!}::uuid,${actor.workspaceId}::uuid,${`group:${groupId}:${kind}`},${kind === "group_receivable_asset" ? "Group receivable" : "Group payable"},${kind!},'PHP')`,
    );
  await t.db.execute(
    sql`INSERT INTO finance.group_ledger_binding(workspace_id,group_id,participant_id,receivable_ledger_account_id,payable_ledger_account_id) VALUES(${actor.workspaceId}::uuid,${groupId}::uuid,${participantId}::uuid,${b.receivable}::uuid,${b.payable}::uuid)`,
  );
  return b;
}
export async function adoptGroupExpenseInTransaction(
  t: ScopedTransaction,
  actor: SharingActor,
  raw: unknown,
) {
  const c = adoptionSchema.parse(raw),
    g = await lockGroup(t, c.groupId, true);
  if (!g.participantId) throw new SharingUnavailableError();
  // Mandatory global order: group -> private profile/workspace. Never invoke a
  // standalone private command before this lock in an integrated workflow.
  await lockActiveFinancialWorkspace(t, actor.workspaceId);
  const { acknowledgeFundingCorrection, ...originalIntent } = c;
  const receipt = await claimFinancialCommandReceipt(t, {
    workspaceId: actor.workspaceId,
    clientCommandId: c.clientCommandId,
    commandType: "finance.adopt_group_expense",
    payloadHash: hashFinancialCommandPayload(
      acknowledgeFundingCorrection === undefined
        ? originalIntent
        : { ...originalIntent, acknowledgeFundingCorrection },
    ),
  });
  if (receipt.kind === "replay") return receipt.result;
  const s = await source(t, c.groupId, c.expenseId, g.participantId);
  const w = (
    await t.db.execute<{ revision: string }>(
      sql`SELECT financial_revision::text AS revision FROM core.workspace WHERE id=${actor.workspaceId}::uuid`,
    )
  ).rows[0]!;
  if (
    s.revisionId !== c.expectedSourceRevisionId ||
    s.sourceHash !== c.expectedSourceHash ||
    w.revision !== c.expectedFinancialRevision
  )
    throw new SharingConflictError(
      "The group source or private ledger changed. Review the preview again.",
    );
  const existingLink = (
    await t.db.execute<{
      id: string;
      revisionId: string;
      revisionNo: number;
      actionId: string;
      paidMinor: string;
    }>(
      sql`SELECT l.id,l.current_link_revision_id AS "revisionId",l.action_id AS "actionId",r.revision_no AS "revisionNo",r.paid_minor::text AS "paidMinor" FROM finance.private_group_link l JOIN finance.private_group_link_revision r ON r.workspace_id=l.workspace_id AND r.id=l.current_link_revision_id WHERE l.workspace_id=${actor.workspaceId}::uuid AND l.group_id=${c.groupId}::uuid AND l.expense_id=${c.expenseId}::uuid`,
    )
  ).rows[0];
  if (existingLink ? c.funding.kind === "existing" : c.funding.kind === "keep")
    throw new RangeError(
      "Choose retained funding only when reviewing an existing private adoption.",
    );
  const paid = BigInt(s.paidMinor),
    share = BigInt(s.shareMinor),
    net = paid - share;
  if (
    paid > MAX_FINANCIAL_COMPONENT_MINOR ||
    share > MAX_FINANCIAL_COMPONENT_MINOR
  )
    throw new RangeError(
      "The group bill is valid, but this allocation exceeds the existing private financial posting limit.",
    );
  if (!existingLink && (paid === 0n) !== (c.funding.kind === "none"))
    throw new RangeError(
      "Select funding only for an actual payer contribution.",
    );
  const binding = await ensureBinding(t, actor, c.groupId, g.participantId);
  if (c.categoryId)
    await ensureActiveExpenseCategory(t, {
      workspaceId: actor.workspaceId,
      categoryId: c.categoryId,
    });
  const expenseLedger = await getOrCreateSharedExpenseLedger(t, {
    workspaceId: actor.workspaceId,
    currency: "PHP",
  });
  let fundingLedger: string | null = null,
    cardId: string | null = null,
    postingDate: string | null = null,
    providerReference: string | null = null,
    actionKind: "expense" | "card_purchase" | "group_adoption" =
      paid === 0n ? "group_adoption" : "expense";
  let actionId: string = randomUUID(),
    actionRevisionId: string = randomUUID(),
    revisionNo = 1;
  let before: Record<string, unknown> | null = null;
  if (existingLink) {
    const current = await readCurrentFinancialAction(
      t,
      actor.workspaceId,
      existingLink.actionId,
    );
    if (c.funding.kind === "keep" && existingLink.paidMinor !== s.paidMinor)
      throw new RangeError(
        "The corrected contribution changes actual funding. Resolve the actual cash/card evidence before adopting this correction; retained funding cannot invent a payment.",
      );
    const detail = (
      await t.db.execute<{
        ledger: string;
        postingDate: string | null;
        providerReference: string | null;
        cardId: string | null;
      }>(
        sql`SELECT d.funding_ledger_account_id AS ledger,d.card_posting_date::text AS "postingDate",d.card_provider_reference AS "providerReference",c.id AS "cardId" FROM finance.purchase_detail d LEFT JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.liability_ledger_account_id=d.funding_ledger_account_id WHERE d.workspace_id=${actor.workspaceId}::uuid AND d.action_revision_id=${current.actionRevisionId}::uuid`,
      )
    ).rows[0];
    if (c.funding.kind === "keep") {
      actionKind = current.actionKind as typeof actionKind;
      fundingLedger = detail?.ledger ?? null;
      cardId = detail?.cardId ?? null;
      postingDate = detail?.postingDate ?? null;
      providerReference = detail?.providerReference ?? null;
    } else {
      if (!c.acknowledgeFundingCorrection)
        throw new RangeError(
          "Explicitly approve correcting the original actual funding evidence.",
        );
      if (
        paid === 0n
          ? c.funding.kind !== "none"
          : !["cash", "card"].includes(c.funding.kind)
      )
        throw new RangeError(
          "Choose corrected actual funding, or none for zero contribution.",
        );
      if (c.funding.kind === "cash") {
        const account = await resolveFundingFinancialAccount(t, {
          workspaceId: actor.workspaceId,
          accountId: c.funding.accountId,
        });
        if (
          account.archived ||
          account.currency !== "PHP" ||
          account.openingCutoffDate >= s.expenseDate
        )
          throw new RangeError(
            "Choose an active PHP account with an earlier cutoff.",
          );
        fundingLedger = account.ledgerAccountId;
        actionKind = "expense";
        const delta =
          -paid +
          (detail?.ledger === fundingLedger
            ? BigInt(existingLink.paidMinor)
            : 0n);
        await reviewCashChanges(t, {
          workspaceId: actor.workspaceId,
          acknowledgeNegativeBalance: c.acknowledgeNegativeBalance,
          changes: [
            {
              accountId: c.funding.accountId,
              effectiveDate: s.expenseDate,
              signedMinor: delta,
            },
          ],
        });
      } else if (c.funding.kind === "card") {
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
        providerReference = c.funding.providerReference;
        actionKind = "card_purchase";
      }
    }
    const replacement = await beginActionReplacement(t, {
      ...actor,
      receiptId: receipt.receiptId,
      current,
      reason: "Owner reviewed changed shared bill; retained actual funding",
      actionKind,
      void: paid === 0n && share === 0n,
      effectiveDate: s.expenseDate,
    });
    actionId = replacement.actionId;
    actionRevisionId = replacement.actionRevisionId;
    revisionNo = replacement.revisionNo;
    before = replacement.before;
  } else if (c.funding.kind === "existing") {
    const current = await readCurrentFinancialAction(
      t,
      actor.workspaceId,
      c.funding.actionId,
    );
    if (
      current.actionRevisionId !== c.funding.expectedActionRevisionId ||
      !["expense", "card_purchase"].includes(current.actionKind) ||
      current.changeKind === "void"
    )
      throw new SharingConflictError();
    const p = (
      await t.db.execute<{
        amount: string;
        ledger: string;
        postingDate: string | null;
        providerReference: string | null;
        cardId: string | null;
      }>(
        sql`SELECT d.purchase_minor::text AS amount,d.funding_ledger_account_id AS ledger,d.card_posting_date::text AS "postingDate",d.card_provider_reference AS "providerReference",c.id AS "cardId" FROM finance.purchase_detail d LEFT JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.liability_ledger_account_id=d.funding_ledger_account_id WHERE d.workspace_id=${actor.workspaceId}::uuid AND d.action_revision_id=${current.actionRevisionId}::uuid`,
      )
    ).rows[0];
    if (
      !p ||
      p.amount !== s.paidMinor ||
      current.effectiveDate !== s.expenseDate
    )
      throw new RangeError(
        "Existing purchase date and actual funding must exactly match your contribution.",
      );
    const dependencies = await t.db.execute(
      sql`SELECT 1 WHERE EXISTS(SELECT 1 FROM finance.private_group_link WHERE workspace_id=${actor.workspaceId}::uuid AND action_id=${current.actionId}::uuid) OR EXISTS(SELECT 1 FROM planning.occurrence_actual_link WHERE workspace_id=${actor.workspaceId}::uuid AND action_id=${current.actionId}::uuid) OR EXISTS(SELECT 1 FROM finance.refund_detail WHERE workspace_id=${actor.workspaceId}::uuid AND purchase_action_id=${current.actionId}::uuid) OR EXISTS(SELECT 1 FROM finance.card_action_detail WHERE workspace_id=${actor.workspaceId}::uuid AND purchase_action_id=${current.actionId}::uuid) OR EXISTS(SELECT 1 FROM finance.card_statement_entry WHERE workspace_id=${actor.workspaceId}::uuid AND action_revision_id=${current.actionRevisionId}::uuid) OR EXISTS(SELECT 1 FROM finance.card_installment_plan WHERE workspace_id=${actor.workspaceId}::uuid AND purchase_action_id=${current.actionId}::uuid)`,
    );
    if (dependencies.rows.length)
      throw new RangeError(
        "Resolve dependent refunds, recurring links, statements or installments before converting this purchase.",
      );
    actionKind = current.actionKind as "expense" | "card_purchase";
    fundingLedger = p.ledger;
    cardId = p.cardId;
    postingDate = p.postingDate;
    providerReference = p.providerReference;
    const replacement = await beginActionReplacement(t, {
      ...actor,
      receiptId: receipt.receiptId,
      current,
      reason: "Owner approved shared purchase reclassification",
      effectiveDate: s.expenseDate,
    });
    actionId = replacement.actionId;
    actionRevisionId = replacement.actionRevisionId;
    revisionNo = replacement.revisionNo;
    before = replacement.before;
  } else {
    if (c.funding.kind === "cash") {
      const a = await resolveFundingFinancialAccount(t, {
        workspaceId: actor.workspaceId,
        accountId: c.funding.accountId,
      });
      if (
        a.archived ||
        a.currency !== "PHP" ||
        s.expenseDate <= a.openingCutoffDate
      )
        throw new RangeError(
          "Choose an active cash account with a cutoff before the purchase.",
        );
      fundingLedger = a.ledgerAccountId;
      await reviewCashChanges(t, {
        workspaceId: actor.workspaceId,
        acknowledgeNegativeBalance: c.acknowledgeNegativeBalance,
        changes: [
          {
            accountId: c.funding.accountId,
            effectiveDate: s.expenseDate,
            signedMinor: -paid,
          },
        ],
      });
    } else if (c.funding.kind === "card") {
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
      providerReference = c.funding.providerReference;
      actionKind = "card_purchase";
    }
    await createExpenseFinancialAction(t, {
      id: actionId,
      workspaceId: actor.workspaceId,
      commandReceiptId: receipt.receiptId,
      currentRevisionId: actionRevisionId,
      description: s.description,
      reference: null,
      notes: null,
      recordedByUserId: actor.userId,
      requestId: actor.requestId ?? null,
    });
    if (actionKind === "group_adoption")
      await t.db.execute(
        sql`INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,recorded_by_user_id,actor_kind) VALUES(${actionRevisionId}::uuid,${actor.workspaceId}::uuid,${actionId}::uuid,1,${receipt.receiptId}::uuid,'create','group_adoption',${s.expenseDate}::date,'PHP',${actor.userId}::uuid,'user')`,
      );
    else
      await createExpenseActionRevision(t, {
        id: actionRevisionId,
        workspaceId: actor.workspaceId,
        actionId,
        commandReceiptId: receipt.receiptId,
        effectiveDate: s.expenseDate,
        currency: "PHP",
        recordedByUserId: actor.userId,
        requestId: actor.requestId ?? null,
        actionKind,
      });
  }
  if (fundingLedger)
    await createPurchaseDetail(t, {
      workspaceId: actor.workspaceId,
      actionId,
      actionRevisionId,
      fundingLedgerAccountId: fundingLedger,
      purchaseMinor: paid,
      merchantName: null,
      cardPostingDate: postingDate,
      cardProviderReference: providerReference,
    });
  const journalId = randomUUID(),
    linkId = existingLink?.id ?? randomUUID(),
    linkRevisionId = randomUUID();
  if (paid !== 0n || share !== 0n)
    await t.db.execute(
      sql`INSERT INTO finance.journal(id,workspace_id,action_id,action_revision_id,sequence_no,effective_date,currency,role) VALUES(${journalId}::uuid,${actor.workspaceId}::uuid,${actionId}::uuid,${actionRevisionId}::uuid,1,${s.expenseDate}::date,'PHP','economic')`,
    );
  let line = 0;
  for (const p of [
    {
      ledger: fundingLedger,
      amount: -paid,
      expense: false,
      cash: actionKind === "expense",
    },
    { ledger: expenseLedger, amount: share, expense: true, cash: false },
    {
      ledger: net > 0n ? binding.receivable : binding.payable,
      amount: net,
      expense: false,
      cash: false,
    },
  ])
    if (p.amount !== 0n && p.ledger)
      await t.db.execute(
        sql`INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,category_id,expense_class,cash_flow_kind,cash_flow_direction) VALUES(${actor.workspaceId}::uuid,${actionId}::uuid,${actionRevisionId}::uuid,${journalId}::uuid,${p.ledger}::uuid,'PHP',${++line},${p.amount},${p.expense ? c.categoryId : null}::uuid,${p.expense ? "gross" : "none"},${p.cash ? "purchase" : "none"},${p.cash ? "out" : "none"})`,
      );
  if (existingLink)
    await t.db.execute(
      sql`UPDATE finance.private_group_link SET current_link_revision_id=${linkRevisionId}::uuid WHERE workspace_id=${actor.workspaceId}::uuid AND id=${linkId}::uuid`,
    );
  else
    await t.db.execute(
      sql`INSERT INTO finance.private_group_link(id,workspace_id,group_id,participant_id,expense_id,action_id,current_link_revision_id) VALUES(${linkId}::uuid,${actor.workspaceId}::uuid,${c.groupId}::uuid,${g.participantId}::uuid,${c.expenseId}::uuid,${actionId}::uuid,${linkRevisionId}::uuid)`,
    );
  await t.db.execute(
    sql`INSERT INTO finance.private_group_link_revision(id,workspace_id,link_id,group_id,participant_id,expense_id,source_expense_revision_id,action_id,action_revision_id,revision_no,previous_link_revision_id,accepted_source_hash,adoption_kind,paid_minor,share_minor,consent_json) VALUES(${linkRevisionId}::uuid,${actor.workspaceId}::uuid,${linkId}::uuid,${c.groupId}::uuid,${g.participantId}::uuid,${c.expenseId}::uuid,${s.revisionId}::uuid,${actionId}::uuid,${actionRevisionId}::uuid,${(existingLink?.revisionNo ?? 0) + 1},${existingLink?.revisionId ?? null}::uuid,${s.sourceHash},${c.funding.kind === "existing" || existingLink ? "existing_action_reclassification" : "new_posting"},${paid},${share},${JSON.stringify({ approved: true, sourceHash: s.sourceHash })}::jsonb)`,
  );
  if (cardId || existingLink)
    await createCardRevisionActivity(t, {
      workspaceId: actor.workspaceId,
      actionId,
      actionRevisionId,
    });
  await createPrivateFinancialRevision(t, {
    id: randomUUID(),
    workspaceId: actor.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_action",
    subjectId: actionId,
    subjectVersion: revisionNo,
    operation: before ? "replace" : "create",
    beforeJson: before,
    reason: before ? "Owner approved shared purchase reclassification" : null,
    afterJson: {
      actionRevisionId,
      actionKind,
      privateGroupLinkRevisionId: linkRevisionId,
      acceptedSourceHash: s.sourceHash,
      groupId: c.groupId,
      expenseId: c.expenseId,
      paidMinor: s.paidMinor,
      shareMinor: s.shareMinor,
      acknowledgeNegativeBalance: c.acknowledgeNegativeBalance,
    },
    effectiveDate: s.expenseDate,
    recordedByUserId: actor.userId,
    requestId: actor.requestId ?? null,
  });
  if (paid !== 0n || share !== 0n)
    await finalizeJournal(t, { workspaceId: actor.workspaceId, journalId });
  await finalizeActionRevision(t, {
    workspaceId: actor.workspaceId,
    actionRevisionId,
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
      t,
      actor.workspaceId,
    ),
    result = { actionId, actionRevisionId, linkId, financialRevision };
  await completeFinancialCommandReceipt(t, {
    workspaceId: actor.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  return result;
}
export function adoptGroupExpense(actor: SharingActor, raw: unknown) {
  return withDomainTransaction(actor, (t) =>
    adoptGroupExpenseInTransaction(t, actor, raw),
  );
}

export const integratedExpenseSchema = z
  .object({
    groupCommand: groupCommandSchema,
    adoption: adoptionSchema.omit({
      expenseId: true,
      expectedSourceRevisionId: true,
      expectedSourceHash: true,
    }),
  })
  .strict();
export function recordIntegratedSharedExpense(
  actor: SharingActor,
  raw: unknown,
) {
  const c = integratedExpenseSchema.parse(raw);
  if (
    c.groupCommand.kind !== "bill" ||
    c.groupCommand.expenseId ||
    c.groupCommand.groupId !== c.adoption.groupId
  )
    throw new RangeError(
      "Integrated entry requires one new bill in the selected group.",
    );
  return withDomainTransaction(actor, async (t) => {
    const groupResult = await executeGroupCommand(t, actor, c.groupCommand);
    const g = await lockGroup(t, groupResult.groupId, true);
    await lockActiveFinancialWorkspace(t, actor.workspaceId);
    const accepted = (
      await t.db.execute<{ revisionId: string; sourceHash: string }>(
        sql`SELECT x.source_expense_revision_id AS "revisionId",x.accepted_source_hash AS "sourceHash" FROM finance.private_group_link_revision x JOIN finance.action_revision r ON r.workspace_id=x.workspace_id AND r.id=x.action_revision_id JOIN core.command_receipt c0 ON c0.workspace_id=r.workspace_id AND c0.id=r.command_receipt_id WHERE x.workspace_id=${actor.workspaceId}::uuid AND x.group_id=${g.id}::uuid AND x.expense_id=${groupResult.subjectId}::uuid AND c0.client_command_id=${c.adoption.clientCommandId}::uuid`,
      )
    ).rows[0];
    const s =
      accepted ??
      (await source(t, g.id, groupResult.subjectId, g.participantId));
    const privateResult = await adoptGroupExpenseInTransaction(t, actor, {
      ...c.adoption,
      expenseId: groupResult.subjectId,
      expectedSourceRevisionId: s.revisionId,
      expectedSourceHash: s.sourceHash,
    });
    return { group: groupResult, private: privateResult };
  });
}
