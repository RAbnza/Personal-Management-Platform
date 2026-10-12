import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import {
  getAuthPool,
  getDomainPool,
  closeRuntimeDatabasePools,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  createCreditCard,
  updateCreditCard,
} from "@/modules/finance/services/credit-cards";
import { recordCardPurchase } from "@/modules/finance/services/record-expense";
import { recordCardCommand } from "@/modules/finance/services/record-card-command";
import { getCardCommandSetup } from "@/modules/finance/services/read-card-command-setup";
import { recordCardStatement } from "@/modules/finance/services/card-statements";
import {
  recordCardAllocation,
  reverseCardAllocation,
} from "@/modules/finance/services/card-allocations";
import {
  recordCardInstallmentPlan,
  recordInstallmentApplication,
  reverseInstallmentApplication,
} from "@/modules/finance/services/card-installments";
import {
  getCardInstallmentPlan,
  listCardInstallmentPlans,
  getCardInstallmentSetup,
} from "@/modules/finance/services/read-card-installments";
import {
  getFinancialActionDetail,
  correctFinancialAction,
  reverseFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import { getFinancialReport } from "@/modules/reporting/services/get-reports";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
type Owner = { userId: string; workspaceId: string };
const label = "V2-A5 installment fixture" as const;
async function fixture(run: (o: Owner, other: Owner) => Promise<void>) {
  const owners: Owner[] = [];
  try {
    for (let n = 0; n < 2; n++) {
      const userId = randomUUID();
      await getAuthPool().query(
        'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
        [userId, label, `${userId}@example.test`],
      );
      const { workspaceId } = await provisionPersonalWorkspace({
        userId,
        displayName: label,
      });
      owners.push({ userId, workspaceId });
    }
    await run(owners[0]!, owners[1]!);
  } finally {
    for (const o of owners)
      if (
        (
          await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
            o.userId,
          ])
        ).rowCount
      )
        await removeNamedFinancialFixture(o, label);
  }
}
async function scoped<T>(
  o: Owner,
  run: (c: import("pg").PoolClient) => Promise<T>,
) {
  const c = await getDomainPool().connect();
  try {
    return await runScopedTransactionOnClient(c, o, () => run(c));
  } finally {
    c.release();
  }
}
async function setup(o: Owner) {
  const c = await createCreditCard({
    ...o,
    clientCommandId: randomUUID(),
    name: "A5 Visa",
    issuerName: "Provider",
  });
  const cash = await openFinancialAccount({
    ...o,
    clientCommandId: randomUUID(),
    name: "Bank",
    accountType: "savings",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "900000",
  });
  const purchase = await recordCardPurchase({
    ...o,
    clientCommandId: randomUUID(),
    cardId: c.cardId,
    effectiveDate: "2026-10-10",
    postingDate: "2026-10-11",
    purchaseMinor: "300000",
    splits: [{ amountMinor: "300000", categoryId: null }],
    description: "Recognized laptop",
  });
  return { c, cash, purchase };
}
function body(
  o: Owner,
  cardId: string,
  purchase: { actionId: string; actionRevisionId: string },
) {
  return {
    ...o,
    cardId,
    clientCommandId: randomUUID(),
    purchaseActionId: purchase.actionId,
    purchaseActionRevisionId: purchase.actionRevisionId,
    principalMinor: "300000",
    installmentCount: 3,
    providerConfirmed: true as const,
    verificationSource: "Full provider schedule including settled portions",
    verifiedDate: "2026-10-12",
    installments: ["2026-11-10", "2026-12-10", "2027-01-10"].map((dueDate) => ({
      dueDate,
      principalMinor: "100000",
      interestMinor: "0",
      feeMinor: "0",
      totalMinor: "100000",
    })),
  };
}
async function credits(
  o: Owner,
  x: Awaited<ReturnType<typeof setup>>,
  amount = "100000",
) {
  const payment = await recordCardCommand({
    ...o,
    clientCommandId: randomUUID(),
    cardId: x.c.cardId,
    actionKind: "card_payment",
    payingAccountId: x.cash.accountId,
    amountMinor: amount,
    effectiveDate: "2026-11-05",
    postingDate: "2026-11-06",
    description: "Actual payment",
    providerConfirmed: true,
    confirmationSource: "Provider receipt",
  });
  const statement = await recordCardStatement({
    ...o,
    clientCommandId: randomUUID(),
    cardId: x.c.cardId,
    cycleStart: "2026-10-01",
    cycleEnd: "2026-10-31",
    statementDate: "2026-11-01",
    dueDate: "2026-11-20",
    balanceMinor: "300000",
    minimumDueMinor: "10000",
    verificationSource: "Provider statement",
    verifiedDate: "2026-11-02",
    entries: [],
  });
  const allocation = await recordCardAllocation({
    ...o,
    clientCommandId: randomUUID(),
    cardId: x.c.cardId,
    statementRevisionId: statement.revisionId,
    sourceActionRevisionId: payment.actionRevisionId,
    amountMinor: amount,
    confirmationKind: "provider",
    confirmationSource: "Actual statement application",
    confirmedDate: "2026-11-07",
  });
  return { payment, statement, allocation };
}
function application(
  o: Owner,
  cardId: string,
  plan: { planId: string; revisionId: string },
  allocationId: string,
  principalMinor = "50000",
) {
  return {
    ...o,
    cardId,
    planId: plan.planId,
    clientCommandId: randomUUID(),
    planRevisionId: plan.revisionId,
    allocationId,
    installmentNo: 1,
    principalMinor,
    confirmationKind: "provider" as const,
    confirmationSource: "Provider confirmed exact installment principal",
    confirmedDate: "2026-11-08",
  };
}
async function ledger(o: Owner) {
  return scoped(
    o,
    async (q) =>
      (
        await q.query(
          "SELECT (SELECT count(*) FROM finance.financial_action WHERE workspace_id=$1)::int actions,(SELECT count(*) FROM finance.journal WHERE workspace_id=$1)::int journals,(SELECT count(*) FROM finance.posting WHERE workspace_id=$1)::int postings,(SELECT jsonb_object_agg(ledger_account_id,total) FROM (SELECT ledger_account_id,sum(amount_minor::numeric)::text total FROM finance.posting WHERE workspace_id=$1 GROUP BY ledger_account_id) balances) balances",
          [o.workspaceId],
        )
      ).rows[0],
  );
}
async function correct(
  o: Owner,
  actionId: string,
  changes: Record<string, unknown>,
) {
  const d = await getFinancialActionDetail({ ...o, actionId });
  return correctFinancialAction({
    ...o,
    actionId,
    clientCommandId: randomUUID(),
    expectedActionRevisionId: d.current.actionRevisionId,
    expectedFinancialRevision: d.current.financialRevision,
    reason: "Correct actual source",
    replacement: { ...d.replacement!, ...changes } as NonNullable<
      typeof d.replacement
    >,
  });
}
async function reverse(o: Owner, actionId: string) {
  const d = await getFinancialActionDetail({ ...o, actionId });
  return reverseFinancialAction({
    ...o,
    actionId,
    clientCommandId: randomUUID(),
    expectedActionRevisionId: d.current.actionRevisionId,
    expectedFinancialRevision: d.current.financialRevision,
    reason: "Reverse mistaken source",
  });
}
afterAll(closeRuntimeDatabasePools);
const tables = [
  "card_installment_plan",
  "card_installment_revision",
  "card_installment",
  "card_installment_application",
] as const;
async function evidenceCounts(o: Owner) {
  return scoped(
    o,
    async (q) =>
      (
        await q.query(
          "SELECT (SELECT count(*) FROM finance.card_installment_plan WHERE workspace_id=$1)::int plans,(SELECT count(*) FROM finance.card_installment_revision WHERE workspace_id=$1)::int revisions,(SELECT count(*) FROM finance.card_installment WHERE workspace_id=$1)::int lines,(SELECT count(*) FROM finance.card_installment_application WHERE workspace_id=$1)::int applications,(SELECT count(*) FROM core.command_receipt WHERE workspace_id=$1)::int receipts,(SELECT count(*) FROM audit.private_revision WHERE workspace_id=$1)::int audits,(SELECT financial_revision::text FROM core.workspace WHERE id=$1) version",
          [o.workspaceId],
        )
      ).rows[0],
  );
}
// Independent runtime-role construction proves deferred SQL gates, rather than
// merely exercising application validation. Every rejected transaction rolls back.
async function rawPlan(
  o: Owner,
  x: Awaited<ReturnType<typeof setup>>,
  mode = "valid",
) {
  return scoped(o, async (q) => {
    const receipt = randomUUID(),
      planId = randomUUID(),
      revisionId = randomUUID();
    await q.query(
      "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,$4,$5)",
      [
        receipt,
        o.workspaceId,
        randomUUID(),
        mode === "wrong command"
          ? "finance.record_expense"
          : "finance.record_card_installment_plan",
        Buffer.alloc(32, 9),
      ],
    );
    await q.query(
      "INSERT INTO finance.card_installment_plan(id,workspace_id,card_id,purchase_action_id) VALUES($1,$2,$3,$4)",
      [planId, o.workspaceId, x.c.cardId, x.purchase.actionId],
    );
    await q.query(
      "INSERT INTO finance.card_installment_revision(id,workspace_id,plan_id,revision_no,command_receipt_id,purchase_action_revision_id,principal_minor,installment_count,lifecycle,verification_source,verified_date,refund_evidence,recorded_by_user_id,state) VALUES($1,$2,$3,1,$4,$5,300000,1,'active','Independent provider schedule','2026-10-12',$6::jsonb,$7,$8)",
      [
        revisionId,
        o.workspaceId,
        planId,
        receipt,
        x.purchase.actionRevisionId,
        JSON.stringify(
          mode === "invented refund"
            ? [{ actionRevisionId: randomUUID(), amountMinor: "1" }]
            : [],
        ),
        mode === "wrong actor" ? randomUUID() : o.userId,
        mode === "pre-finalized" ? "verified" : "building",
      ],
    );
    await q.query(
      "INSERT INTO finance.card_installment(workspace_id,plan_revision_id,sequence_no,due_date,principal_minor,interest_minor,fee_minor,total_minor) VALUES($1,$2,$3,$4,$5,0,0,$6)",
      [
        o.workspaceId,
        revisionId,
        mode === "line gap" ? 2 : 1,
        mode === "past due" ? "2026-10-09" : "2026-11-10",
        mode === "wrong principal" ? "299999" : "300000",
        mode === "wrong total"
          ? "300001"
          : mode === "wrong principal"
            ? "299999"
            : "300000",
      ],
    );
    const snapshot = (
      await q.query(
        "SELECT finance.card_installment_snapshot($1,$2) evidence",
        [o.workspaceId, revisionId],
      )
    ).rows[0].evidence;
    if (mode !== "missing audit")
      await q.query(
        "INSERT INTO audit.private_revision(workspace_id,command_receipt_id,subject_kind,subject_id,subject_version,operation,before_json,after_json,effective_date,recorded_by_user_id,actor_kind) VALUES($1,$2,'card_installment_plan',$3,1,'create',$4::jsonb,$5::jsonb,'2026-10-12',$6,'user')",
        [
          o.workspaceId,
          receipt,
          planId,
          mode === "invented before" ? "{}" : null,
          JSON.stringify(
            mode === "wrong audit"
              ? { ...snapshot, principalMinor: "1" }
              : snapshot,
          ),
          o.userId,
        ],
      );
    if (mode !== "unfinished")
      await q.query(
        "UPDATE finance.card_installment_revision SET state='verified',finalized_at=clock_timestamp() WHERE id=$1",
        [revisionId],
      );
    await q.query(
      "UPDATE finance.card_installment_plan SET current_revision_id=$1 WHERE id=$2",
      [revisionId, planId],
    );
    const version = (
      await q.query(
        "UPDATE core.workspace SET financial_revision=financial_revision+1 WHERE id=$1 RETURNING financial_revision::text",
        [o.workspaceId],
      )
    ).rows[0].financial_revision;
    if (mode !== "incomplete receipt")
      await q.query(
        "UPDATE core.command_receipt SET state='completed',completed_at=clock_timestamp(),result_json=$2::jsonb WHERE id=$1",
        [
          receipt,
          JSON.stringify({
            planId,
            revisionId,
            version: mode === "wrong result" ? 2 : 1,
            financialRevision: version,
          }),
        ],
      );
    await q.query("SET CONSTRAINTS ALL IMMEDIATE");
    return { planId, revisionId };
  });
}
async function rawApplication(
  o: Owner,
  plan: { planId: string; revisionId: string },
  allocationId: string,
  amount: string,
  mode = "valid",
) {
  return scoped(o, async (q) => {
    const receipt = randomUUID(),
      applicationId = randomUUID();
    await q.query(
      "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,'finance.record_card_installment_application',$4)",
      [receipt, o.workspaceId, randomUUID(), Buffer.alloc(32, 7)],
    );
    await q.query(
      "INSERT INTO finance.card_installment_application(id,workspace_id,plan_revision_id,installment_no,allocation_id,principal_minor,interest_minor,fee_minor,command_receipt_id,confirmation_kind,confirmation_source,confirmed_date,recorded_by_user_id) VALUES($1,$2,$3,1,$4,$5,0,0,$6,'provider','Independent application','2026-11-08',$7)",
      [
        applicationId,
        o.workspaceId,
        plan.revisionId,
        allocationId,
        amount,
        receipt,
        o.userId,
      ],
    );
    const snapshot = (
      await q.query(
        "SELECT finance.card_installment_application_snapshot($1,$2) evidence",
        [o.workspaceId, applicationId],
      )
    ).rows[0].evidence;
    await q.query(
      "INSERT INTO audit.private_revision(workspace_id,command_receipt_id,subject_kind,subject_id,subject_version,operation,after_json,effective_date,recorded_by_user_id,actor_kind) VALUES($1,$2,'card_installment_application',$3,1,'create',$4::jsonb,'2026-11-08',$5,'user')",
      [
        o.workspaceId,
        receipt,
        applicationId,
        JSON.stringify(
          mode === "wrong audit"
            ? { ...snapshot, principalMinor: "999" }
            : snapshot,
        ),
        o.userId,
      ],
    );
    const version = (
      await q.query(
        "UPDATE core.workspace SET financial_revision=financial_revision+1 WHERE id=$1 RETURNING financial_revision::text",
        [o.workspaceId],
      )
    ).rows[0].financial_revision;
    await q.query(
      "UPDATE core.command_receipt SET state='completed',completed_at=clock_timestamp(),result_json=$2::jsonb WHERE id=$1",
      [receipt, JSON.stringify({ applicationId, financialRevision: version })],
    );
    await q.query("SET CONSTRAINTS ALL IMMEDIATE");
    return applicationId;
  });
}
describe("A5 provider schedules, supersession and supported applications", () => {
  it("reversing a linked refund cannot silently reactivate an old plan or restore reused allocation capacity", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan(b),
        c = await credits(o, x);
      await recordInstallmentApplication(
        application(o, x.c.cardId, p, c.allocation.allocationId, "100000"),
      );
      const parts = (
        await getCardCommandSetup({
          ...o,
          cardId: x.c.cardId,
          purchaseActionId: x.purchase.actionId,
        })
      ).refundSources;
      const refund = await recordCardCommand({
        ...o,
        cardId: x.c.cardId,
        clientCommandId: randomUUID(),
        actionKind: "card_refund",
        amountMinor: "10000",
        effectiveDate: "2026-11-09",
        postingDate: "2026-11-10",
        description: "Actual refund",
        providerConfirmed: true,
        confirmationSource: "Provider refund",
        purchaseActionId: x.purchase.actionId,
        refundParts: [
          {
            originalPurchasePostingId: parts[0]!.postingId,
            amountMinor: "10000",
          },
        ],
      });
      const otherPurchase = await recordCardPurchase({
        ...o,
        cardId: x.c.cardId,
        clientCommandId: randomUUID(),
        effectiveDate: "2026-10-10",
        postingDate: "2026-10-11",
        purchaseMinor: "300000",
        splits: [{ amountMinor: "300000", categoryId: null }],
        description: "Another recognized purchase",
      });
      const otherPlan = await recordCardInstallmentPlan(
        body(o, x.c.cardId, otherPurchase),
      );
      await recordInstallmentApplication(
        application(
          o,
          x.c.cardId,
          otherPlan,
          c.allocation.allocationId,
          "100000",
        ),
      );
      await reverse(o, refund.actionId);
      const d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.status.kind).toBe("reconciliation required");
      expect(d.totals.remainingPrincipalMinor).toBeNull();
      expect(d.applications.unresolvedMinor).toBe("100000");
      const revised = await recordCardInstallmentPlan({
        ...b,
        clientCommandId: randomUUID(),
        planId: p.planId,
        expectedVersion: 1,
        reason: "Provider confirmed after refund reversal",
      });
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p.planId,
          })
        ).status.kind,
      ).toBe("active");
      await expect(
        recordInstallmentApplication(
          application(o, x.c.cardId, revised, c.allocation.allocationId, "1"),
        ),
      ).rejects.toThrow(/exceeds/i);
    }));
  it("competing provider revisions cannot silently overwrite a finalized schedule", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan(b),
        before = await ledger(o);
      const changes = ["Provider option A", "Provider option B"].map(
        (reason) => ({
          ...b,
          clientCommandId: randomUUID(),
          planId: p.planId,
          expectedVersion: 1,
          reason,
          providerReference: reason,
        }),
      );
      const results = await Promise.allSettled(
        changes.map(recordCardInstallmentPlan),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.version).toBe(2);
      expect(d.history).toHaveLength(2);
      expect(await ledger(o)).toEqual(before);
    }));
  it("changing the purchase card suspends the old plan; only explicit cancellation retains that historical source", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan(b),
        other = await createCreditCard({
          ...o,
          clientCommandId: randomUUID(),
          name: "Correct card",
          issuerName: "Provider",
        });
      const replaced = await correct(o, x.purchase.actionId, {
        cardId: other.cardId,
      });
      const d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.currentPurchase).toBeNull();
      expect(d.status.kind).toBe("reconciliation required");
      expect(d.upcoming).toEqual([]);
      await expect(
        recordCardInstallmentPlan({
          ...b,
          clientCommandId: randomUUID(),
          planId: p.planId,
          expectedVersion: 1,
          reason: "Invalid card reassignment",
          purchaseActionRevisionId: replaced.actionRevisionId,
        }),
      ).rejects.toThrow();
      const before = await ledger(o);
      await recordCardInstallmentPlan({
        ...b,
        clientCommandId: randomUUID(),
        planId: p.planId,
        expectedVersion: 1,
        reason: "Provider cancelled original arrangement",
        lifecycle: "cancelled",
      });
      expect(await ledger(o)).toEqual(before);
      await recordCardInstallmentPlan({
        ...body(o, other.cardId, {
          actionId: x.purchase.actionId,
          actionRevisionId: replaced.actionRevisionId,
        }),
        verificationSource: "Provider confirmed on corrected card",
      });
    }));
  it("accepts independently constructed provider evidence and rejects unsafe app-role finalization atomically", () =>
    fixture(async (o) => {
      const x = await setup(o),
        before = await ledger(o);
      for (const mode of [
        "wrong command",
        "wrong actor",
        "pre-finalized",
        "line gap",
        "past due",
        "wrong principal",
        "wrong total",
        "invented refund",
        "missing audit",
        "invented before",
        "wrong audit",
        "unfinished",
        "incomplete receipt",
        "wrong result",
      ]) {
        const counts = await evidenceCounts(o);
        await expect(rawPlan(o, x, mode)).rejects.toThrow();
        expect(await evidenceCounts(o)).toEqual(counts);
      }
      const p = await rawPlan(o, x);
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p.planId,
          })
        ).totals.remainingPrincipalMinor,
      ).toBe("300000");
      expect(await ledger(o)).toEqual(before);
      await expect(rawPlan(o, x)).rejects.toMatchObject({ code: "23514" });
      for (const sql of [
        "UPDATE finance.card_installment_revision SET principal_minor=1 WHERE workspace_id=$1",
        "DELETE FROM finance.card_installment_revision WHERE workspace_id=$1",
        "UPDATE finance.card_installment SET principal_minor=1 WHERE workspace_id=$1",
        "DELETE FROM finance.card_installment_plan WHERE workspace_id=$1",
        "UPDATE finance.card_installment_plan SET purchase_action_id=gen_random_uuid() WHERE workspace_id=$1",
        "INSERT INTO finance.card_installment(workspace_id,plan_revision_id,sequence_no,principal_minor) SELECT workspace_id,id,2,0 FROM finance.card_installment_revision WHERE workspace_id=$1",
      ])
        await expect(
          scoped(o, (q) => q.query(sql, [o.workspaceId])),
        ).rejects.toThrow();
    }));
  it("independent application SQL enforces global allocation capacity, exact audit and immutable reversals", () =>
    fixture(async (o) => {
      const x = await setup(o),
        p = await recordCardInstallmentPlan(body(o, x.c.cardId, x.purchase)),
        c = await credits(o, x, "50000"),
        before = await ledger(o);
      const a = await rawApplication(o, p, c.allocation.allocationId, "30000");
      for (const [amount, mode] of [
        ["20001", "valid"],
        ["1", "wrong audit"],
      ]) {
        const counts = await evidenceCounts(o);
        await expect(
          rawApplication(o, p, c.allocation.allocationId, amount!, mode),
        ).rejects.toMatchObject({ code: "23514" });
        expect(await evidenceCounts(o)).toEqual(counts);
      }
      for (const sql of [
        "UPDATE finance.card_installment_application SET principal_minor=1 WHERE workspace_id=$1",
        "DELETE FROM finance.card_installment_application WHERE workspace_id=$1",
        "INSERT INTO finance.card_installment_application(workspace_id,plan_revision_id,installment_no,allocation_id,principal_minor,interest_minor,fee_minor,command_receipt_id,confirmation_kind,confirmation_source,confirmed_date,recorded_by_user_id,reverses_application_id) SELECT workspace_id,plan_revision_id,installment_no,allocation_id,principal_minor-1,interest_minor,fee_minor,command_receipt_id,confirmation_kind,'Forged partial reversal',confirmed_date,recorded_by_user_id,id FROM finance.card_installment_application WHERE workspace_id=$1",
      ])
        await expect(
          scoped(o, (q) => q.query(sql, [o.workspaceId])),
        ).rejects.toThrow();
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p.planId,
          })
        ).totals.remainingPrincipalMinor,
      ).toBe("270000");
      await reverseInstallmentApplication({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
        clientCommandId: randomUUID(),
        applicationId: a,
        reason: "Confirmed correction",
      });
      expect(await ledger(o)).toEqual(before);
    }));
  it("actual interest and fees can satisfy explicit schedule portions once; charge correction makes their confirmation unresolved", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan({
          ...b,
          installments: b.installments.map((i) => ({
            ...i,
            interestMinor: "10000",
            feeMinor: "5000",
            totalMinor: "115000",
          })),
        }),
        c = await credits(o, x, "150000");
      const charges = [];
      for (const [actionKind, amountMinor] of [
        ["card_interest", "10000"],
        ["card_fee", "5000"],
      ] as const)
        charges.push(
          await recordCardCommand({
            ...o,
            cardId: x.c.cardId,
            clientCommandId: randomUUID(),
            actionKind,
            amountMinor,
            effectiveDate: "2026-11-05",
            postingDate: "2026-11-06",
            description: actionKind,
            providerConfirmed: true,
            confirmationSource: "Actual posted charge",
          }),
        );
      const input = {
          ...application(o, x.c.cardId, p, c.allocation.allocationId, "100000"),
          interestMinor: "10000",
          feeMinor: "5000",
          interestActionRevisionId: charges[0]!.actionRevisionId,
          feeActionRevisionId: charges[1]!.actionRevisionId,
        },
        before = await ledger(o);
      const [a, replay] = await Promise.all([
        recordInstallmentApplication(input),
        recordInstallmentApplication(input),
      ]);
      expect(a).toEqual(replay);
      let d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.lines[0]).toMatchObject({
        remainingPrincipalMinor: "0",
        remainingInterestMinor: "0",
        remainingFeeMinor: "0",
        remainingTotalMinor: "0",
      });
      await expect(
        recordInstallmentApplication({
          ...input,
          clientCommandId: randomUUID(),
          installmentNo: 2,
          principalMinor: "0",
          feeMinor: "0",
          feeActionRevisionId: null,
          interestMinor: "1",
        }),
      ).rejects.toThrow(/actual|charge/i);
      await expect(
        recordInstallmentApplication({
          ...input,
          clientCommandId: randomUUID(),
          installmentNo: 2,
          principalMinor: "1",
          interestMinor: "0",
          interestActionRevisionId: null,
          feeMinor: "0",
          feeActionRevisionId: null,
          confirmedDate: "2026-11-06",
        }),
      ).rejects.toThrow();
      expect(await ledger(o)).toEqual(before);
      await correct(o, charges[0]!.actionId, { postingDate: "2026-11-07" });
      d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.applications.unresolvedMinor).toBe("115000");
      expect(d.totals.remainingPrincipalMinor).toBe("300000");
    }));
  it("forces owner RLS and invoker views, denies bypass and restricts every runtime role", () =>
    fixture(async (o, other) => {
      const x = await setup(o),
        p = await recordCardInstallmentPlan(body(o, x.c.cardId, x.purchase)),
        c = await credits(o, x);
      await recordInstallmentApplication(
        application(o, x.c.cardId, p, c.allocation.allocationId),
      );
      await scoped(o, async (q) => {
        const catalog = (
          await q.query(
            "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='finance'::regnamespace AND relname=ANY($1)",
            [tables],
          )
        ).rows;
        expect(catalog).toHaveLength(4);
        expect(
          catalog.every((r) => r.relrowsecurity && r.relforcerowsecurity),
        ).toBe(true);
        for (const table of tables)
          for (const role of ["auth_adapter", "queue_broker", "worker_domain"])
            expect(
              (
                await q.query(
                  "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",
                  [role, `finance.${table}`],
                )
              ).rows[0].allowed,
            ).toBe(false);
        const views = (
          await q.query(
            "SELECT reloptions FROM pg_class WHERE oid IN('finance.card_installment_evidence_v'::regclass,'finance.effective_card_installment_application_v'::regclass)",
          )
        ).rows;
        expect(
          views.every((v) => v.reloptions.includes("security_invoker=true")),
        ).toBe(true);
        await q.query("SELECT set_config('app.user_id',$1,true)", [
          other.userId,
        ]);
        for (const table of [
          ...tables,
          "card_installment_evidence_v",
          "effective_card_installment_application_v",
        ])
          expect(
            (
              await q.query(
                `SELECT workspace_id FROM finance.${table} WHERE workspace_id=$1`,
                [o.workspaceId],
              )
            ).rows,
          ).toEqual([]);
        expect(
          (
            await q.query(
              "SELECT finance.card_installment_snapshot($1,$2) evidence",
              [o.workspaceId, p.revisionId],
            )
          ).rows[0].evidence,
        ).toBeNull();
      });
      await expect(
        scoped(o, async (q) => {
          await q.query("SET LOCAL row_security=off");
          return q.query("SELECT * FROM finance.card_installment_plan");
        }),
      ).rejects.toThrow();
      await expect(
        scoped(other, (q) =>
          q.query(
            "INSERT INTO finance.card_installment_plan(workspace_id,card_id,purchase_action_id) VALUES($1,$2,$3)",
            [o.workspaceId, x.c.cardId, x.purchase.actionId],
          ),
        ),
      ).rejects.toThrow();
    }));
  it("deletion-pending blocks reads and commands; approved purge removes the complete immutable graph and preserves another owner", () =>
    fixture(async (o, other) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan(b),
        c = await credits(o, x),
        a = await recordInstallmentApplication(
          application(o, x.c.cardId, p, c.allocation.allocationId),
        );
      await reverseInstallmentApplication({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
        clientCommandId: randomUUID(),
        applicationId: a.applicationId,
        reason: "Retain reversal",
      });
      await recordCardInstallmentPlan({
        ...b,
        clientCommandId: randomUUID(),
        planId: p.planId,
        expectedVersion: 1,
        reason: "Provider revised",
      });
      const keep = await setup(other),
        kept = await recordCardInstallmentPlan(
          body(other, keep.c.cardId, keep.purchase),
        );
      const requestId = await scoped(
        o,
        async (q) => (await makeDeletionPending(q, o)).requestId,
      );
      await expect(recordCardInstallmentPlan(b)).rejects.toThrow();
      await expect(
        getCardInstallmentPlan({ ...o, cardId: x.c.cardId, planId: p.planId }),
      ).rejects.toThrow();
      const env = parseEnv(readFileSync(".env.bootstrap", "utf8")),
        operatorUrl = new URL(process.env.DATABASE_URL!),
        adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
      expect(operatorUrl.pathname).toBe("/personal_management_test");
      adminUrl.pathname = "/personal_management_test";
      operatorUrl.username = "lifecycle_operator";
      operatorUrl.password = env.LIFECYCLE_OPERATOR_PASSWORD!;
      const operator = new Client({ connectionString: operatorUrl.toString() }),
        admin = new Client({ connectionString: adminUrl.toString() });
      try {
        await operator.connect();
        await admin.connect();
        await admin.query("BEGIN");
        await admin.query("SET LOCAL session_replication_role='replica'");
        await admin.query(
          "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_user_id=$2",
          [requestId, o.userId],
        );
        await admin.query("COMMIT");
        for (let n = 0; n < 12; n++)
          if (
            (await purgeDeletionStep(operator, requestId)).state === "completed"
          )
            break;
        expect((await purgeDeletionStep(operator, requestId)).state).toBe(
          "completed",
        );
        for (const table of tables)
          expect(
            (
              await admin.query(
                `SELECT workspace_id FROM finance.${table} WHERE workspace_id=$1`,
                [o.workspaceId],
              )
            ).rows,
          ).toEqual([]);
      } finally {
        await operator.end();
        await admin.end();
      }
      expect(
        (
          await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
            o.userId,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await getCardInstallmentPlan({
            ...other,
            cardId: keep.c.cardId,
            planId: kept.planId,
          })
        ).snapshot.principalMinor,
      ).toBe("300000");
    }));
  it("records/replays a schedule without recognizing money; exposes exact future obligations", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        before = await ledger(o),
        p = await recordCardInstallmentPlan(b);
      expect(
        await recordCardInstallmentPlan({
          ...b,
          cardId: b.cardId.toUpperCase(),
          purchaseActionId: b.purchaseActionId.toUpperCase(),
        }),
      ).toEqual(p);
      expect(await ledger(o)).toEqual(before);
      const report = await getFinancialReport({
        ...o,
        query: {
          period: "custom",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        },
      });
      expect(report.metrics.gross).toBe("300000");
      const d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
        asOfDate: "2026-11-11",
      });
      expect(d.totals.remainingPrincipalMinor).toBe("300000");
      expect(d.totals.remainingTotalMinor).toBe("300000");
      expect(d.upcoming).toHaveLength(2);
      expect(d.overdue).toHaveLength(1);
      expect(d.status.kind).toBe("active");
      expect(
        (await listCardInstallmentPlans({ ...o, cardId: x.c.cardId })).plans,
      ).toHaveLength(1);
      expect(
        (
          await getCardInstallmentSetup({
            ...o,
            cardId: x.c.cardId,
            purchaseActionId: x.purchase.actionId,
          })
        ).purchases[0]?.actionRevisionId,
      ).toBe(x.purchase.actionRevisionId);
      await expect(
        recordCardInstallmentPlan({
          ...b,
          verificationSource: "Changed command",
        }),
      ).rejects.toThrow(/conflict|different/i);
      await expect(
        recordCardInstallmentPlan({ ...b, clientCommandId: randomUUID() }),
      ).rejects.toThrow(/existing/i);
    }));
  it("retains unknown dates, interest and fees; never invents a repayment total", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan({
          ...b,
          installments: b.installments.map((i) => ({
            ...i,
            dueDate: null,
            interestMinor: null,
            feeMinor: null,
            totalMinor: null,
          })),
        });
      const d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
        asOfDate: "2026-11-01",
      });
      expect(d.totals.remainingPrincipalMinor).toBe("300000");
      expect(d.totals.remainingTotalMinor).toBeNull();
      expect(d.totals.unknownDueDateCount).toBe(3);
      expect(d.upcoming).toEqual([]);
      expect((await ledger(o)).actions).toBe(2);
    }));
  it("supports projections beyond Number precision without posting expected charges", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        before = await ledger(o);
      const p = await recordCardInstallmentPlan({
        ...b,
        installments: b.installments.map((i) => ({
          ...i,
          interestMinor: "9007199254740993",
          totalMinor: null,
        })),
      });
      const d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.totals.remainingInterestMinor).toBe("27021597764222979");
      expect(d.totals.remainingTotalMinor).toBe("27021597764522979");
      expect(await ledger(o)).toEqual(before);
    }));
  it("applies only explicit A4 allocations; supports partial amounts, replay and exact reversal without new postings", () =>
    fixture(async (o) => {
      const x = await setup(o),
        p = await recordCardInstallmentPlan(body(o, x.c.cardId, x.purchase)),
        c = await credits(o, x),
        before = await ledger(o),
        input = application(o, x.c.cardId, p, c.allocation.allocationId),
        a = await recordInstallmentApplication(input);
      expect(await recordInstallmentApplication(input)).toEqual(a);
      let d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.totals.remainingPrincipalMinor).toBe("250000");
      expect(d.lines[0]?.remainingPrincipalMinor).toBe("50000");
      expect(d.allocationChoices.items[0]?.availableMinor).toBe("50000");
      const r = {
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
        clientCommandId: randomUUID(),
        applicationId: a.applicationId,
        reason: "Wrong provider application",
      };
      expect(await reverseInstallmentApplication(r)).toEqual(
        await reverseInstallmentApplication(r),
      );
      d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.totals.remainingPrincipalMinor).toBe("300000");
      expect(d.applications.items.map((i) => i.status)).toEqual([
        "reversal",
        "reversed",
      ]);
      expect(await ledger(o)).toEqual(before);
      await expect(
        reverseInstallmentApplication({ ...r, clientCommandId: randomUUID() }),
      ).rejects.toThrow(/already/i);
      const reversal = d.applications.items.find(
        (i) => i.reversesApplicationId,
      )!;
      await expect(
        reverseInstallmentApplication({
          ...r,
          clientCommandId: randomUUID(),
          applicationId: reversal.applicationId,
        }),
      ).rejects.toThrow(/reversal/i);
    }));
  it("supersedes schedules and applications without rewriting history or money", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan(b),
        c = await credits(o, x);
      await recordInstallmentApplication(
        application(o, x.c.cardId, p, c.allocation.allocationId),
      );
      const before = await ledger(o),
        change = {
          ...b,
          clientCommandId: randomUUID(),
          planId: p.planId,
          expectedVersion: 1,
          reason: "Provider rescheduled",
          installments: b.installments.map((i, n) => ({
            ...i,
            dueDate: ["2026-11-20", "2026-12-20", "2027-01-20"][n]!,
          })),
        },
        v = await recordCardInstallmentPlan(change);
      expect(await recordCardInstallmentPlan(change)).toEqual(v);
      let d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.version).toBe(2);
      expect(d.totals.remainingPrincipalMinor).toBe("300000");
      expect(d.applications.unresolvedMinor).toBe("50000");
      const old = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
        revisionId: p.revisionId,
      });
      expect(old.snapshot.installments[0]?.dueDate).toBe("2026-11-10");
      expect(old.status.kind).toBe("historical");
      await recordInstallmentApplication(
        application(o, x.c.cardId, v, c.allocation.allocationId),
      );
      d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.totals.remainingPrincipalMinor).toBe("250000");
      expect(await ledger(o)).toEqual(before);
      await expect(
        recordCardInstallmentPlan({ ...change, clientCommandId: randomUUID() }),
      ).rejects.toThrow();
    }));
  it("purchase correction/reversal suspends current projections; explicit reconciliation or cancellation preserves history", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan(b);
      const replaced = await correct(o, x.purchase.actionId, {
        postingDate: "2026-10-12",
      });
      let d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
        asOfDate: "2026-11-01",
      });
      expect(d.status.kind).toBe("reconciliation required");
      expect(d.totals.remainingPrincipalMinor).toBeNull();
      expect(d.lines.every((i) => i.remainingPrincipalMinor === null)).toBe(
        true,
      );
      expect(d.upcoming).toEqual([]);
      const v = await recordCardInstallmentPlan({
        ...b,
        clientCommandId: randomUUID(),
        purchaseActionRevisionId: replaced.actionRevisionId,
        planId: p.planId,
        expectedVersion: 1,
        reason: "Provider confirmed corrected source",
      });
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p.planId,
          })
        ).status.kind,
      ).toBe("active");
      await reverse(o, x.purchase.actionId);
      d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.status.kind).toBe("reconciliation required");
      const before = await ledger(o);
      await recordCardInstallmentPlan({
        ...b,
        clientCommandId: randomUUID(),
        purchaseActionRevisionId: replaced.actionRevisionId,
        planId: p.planId,
        expectedVersion: v.version,
        reason: "Provider cancellation confirmed",
        lifecycle: "cancelled",
      });
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p.planId,
          })
        ).status.kind,
      ).toBe("cancelled");
      expect(await ledger(o)).toEqual(before);
    }));
  it("linked refund changes require provider reconciliation and use actual A4 credit applications", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan(b),
        parts = (
          await getCardCommandSetup({
            ...o,
            cardId: x.c.cardId,
            purchaseActionId: x.purchase.actionId,
          })
        ).refundSources;
      const refund = await recordCardCommand({
        ...o,
        cardId: x.c.cardId,
        clientCommandId: randomUUID(),
        actionKind: "card_refund",
        amountMinor: "50000",
        effectiveDate: "2026-11-05",
        postingDate: "2026-11-06",
        description: "Actual laptop refund",
        providerConfirmed: true,
        confirmationSource: "Actual provider credit",
        purchaseActionId: x.purchase.actionId,
        refundParts: [
          {
            originalPurchasePostingId: parts[0]!.postingId,
            amountMinor: "50000",
          },
        ],
      });
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p.planId,
          })
        ).status.kind,
      ).toBe("reconciliation required");
      const v = await recordCardInstallmentPlan({
        ...b,
        clientCommandId: randomUUID(),
        planId: p.planId,
        expectedVersion: 1,
        reason: "Provider schedule and credit confirmed",
      });
      const s = await recordCardStatement({
        ...o,
        cardId: x.c.cardId,
        clientCommandId: randomUUID(),
        cycleStart: "2026-11-01",
        cycleEnd: "2026-11-30",
        statementDate: "2026-12-01",
        dueDate: "2026-12-20",
        balanceMinor: "250000",
        minimumDueMinor: "0",
        verificationSource: "Actual statement",
        verifiedDate: "2026-12-02",
        entries: [],
      });
      const a = await recordCardAllocation({
        ...o,
        cardId: x.c.cardId,
        clientCommandId: randomUUID(),
        statementRevisionId: s.revisionId,
        sourceActionRevisionId: refund.actionRevisionId,
        amountMinor: "50000",
        confirmationKind: "provider",
        confirmationSource: "Provider credit application",
        confirmedDate: "2026-12-02",
      });
      await recordInstallmentApplication({
        ...application(o, x.c.cardId, v, a.allocationId),
        confirmedDate: "2026-12-03",
      });
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p.planId,
          })
        ).totals.remainingPrincipalMinor,
      ).toBe("250000");
    }));
  it("reversed or corrected A4 allocations/payments invalidate applications while preserving exact original evidence", () =>
    fixture(async (o) => {
      const x = await setup(o),
        p = await recordCardInstallmentPlan(body(o, x.c.cardId, x.purchase)),
        c = await credits(o, x);
      await recordInstallmentApplication(
        application(o, x.c.cardId, p, c.allocation.allocationId),
      );
      await reverseCardAllocation({
        ...o,
        cardId: x.c.cardId,
        clientCommandId: randomUUID(),
        allocationId: c.allocation.allocationId,
        reason: "Wrong statement application",
      });
      let d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.totals.remainingPrincipalMinor).toBe("300000");
      expect(d.applications.unresolvedMinor).toBe("50000");
      await expect(
        recordInstallmentApplication(
          application(o, x.c.cardId, p, c.allocation.allocationId),
        ),
      ).rejects.toThrow();
      const a = await recordCardAllocation({
        ...o,
        cardId: x.c.cardId,
        clientCommandId: randomUUID(),
        statementRevisionId: c.statement.revisionId,
        sourceActionRevisionId: c.payment.actionRevisionId,
        amountMinor: "100000",
        confirmationKind: "user",
        confirmationSource: "Correct statement application",
        confirmedDate: "2026-11-07",
      });
      await recordInstallmentApplication(
        application(o, x.c.cardId, p, a.allocationId),
      );
      await correct(o, c.payment.actionId, { postingDate: "2026-11-09" });
      d = await getCardInstallmentPlan({
        ...o,
        cardId: x.c.cardId,
        planId: p.planId,
      });
      expect(d.totals.remainingPrincipalMinor).toBe("300000");
      expect(d.applications.unresolvedMinor).toBe("100000");
    }));
  it("rejects excess, foreign-card and unsupported references", () =>
    fixture(async (o, other) => {
      const x = await setup(o),
        foreign = await setup(other),
        p = await recordCardInstallmentPlan(body(o, x.c.cardId, x.purchase)),
        c = await credits(o, x, "50000");
      await expect(
        recordCardInstallmentPlan({ ...body(o, x.c.cardId, foreign.purchase) }),
      ).rejects.toThrow();
      await expect(
        getCardInstallmentPlan({
          ...other,
          cardId: x.c.cardId,
          planId: p.planId,
        }),
      ).rejects.toThrow();
      await expect(
        recordInstallmentApplication(
          application(o, x.c.cardId, p, c.allocation.allocationId, "50001"),
        ),
      ).rejects.toThrow(/exceeds/i);
      await expect(
        recordCardInstallmentPlan({
          ...body(o, x.c.cardId, x.purchase),
          clientCommandId: randomUUID(),
          planId: p.planId,
          expectedVersion: 1,
          reason: "Excess principal",
          principalMinor: "300001",
          installments: [{ principalMinor: "300001" }],
          installmentCount: 1,
        }),
      ).rejects.toThrow();
      const second = await createCreditCard({
        ...o,
        clientCommandId: randomUUID(),
        name: "Other card",
        issuerName: "Other",
      });
      await expect(
        recordInstallmentApplication({
          ...application(o, second.cardId, p, c.allocation.allocationId),
        }),
      ).rejects.toThrow();
    }));
  it("serializes identical plan commands and independent competing applications within supported capacity", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        [p, again] = await Promise.all([
          recordCardInstallmentPlan(b),
          recordCardInstallmentPlan(b),
        ]);
      expect(p).toEqual(again);
      const c = await credits(o, x, "60000"),
        a = application(o, x.c.cardId, p!, c.allocation.allocationId, "40000"),
        secondInput = { ...a, clientCommandId: randomUUID() },
        results = await Promise.allSettled([
          recordInstallmentApplication(a),
          recordInstallmentApplication(secondInput),
        ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const winner = results.findIndex((r) => r.status === "fulfilled"),
        good = results[winner]!;
      if (good.status === "fulfilled")
        expect(
          await recordInstallmentApplication(winner === 0 ? a : secondInput),
        ).toEqual(good.value);
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p!.planId,
          })
        ).totals.remainingPrincipalMinor,
      ).toBe("260000");
    }));
  it("archived evidence remains readable and identical commands replay; cancelled schedules create no financial effects", () =>
    fixture(async (o) => {
      const x = await setup(o),
        b = body(o, x.c.cardId, x.purchase),
        p = await recordCardInstallmentPlan(b);
      await updateCreditCard({
        ...o,
        cardId: x.c.cardId,
        clientCommandId: randomUUID(),
        expectedVersion: 1,
        name: "Archived",
        issuerName: "Provider",
        archived: true,
      });
      expect(await recordCardInstallmentPlan(b)).toEqual(p);
      const before = await ledger(o);
      await recordCardInstallmentPlan({
        ...b,
        clientCommandId: randomUUID(),
        planId: p.planId,
        expectedVersion: 1,
        reason: "Provider cancelled installment arrangement",
        lifecycle: "cancelled",
      });
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.c.cardId,
            planId: p.planId,
            asOfDate: "2026-11-01",
          })
        ).upcoming,
      ).toEqual([]);
      expect(await ledger(o)).toEqual(before);
    }));
});
