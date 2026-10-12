import { randomUUID } from "node:crypto";
import { afterAll, describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, type PoolClient } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { ScopedTransaction } from "@/platform/db";
import { withDomainTransaction } from "@/platform/db";
import { readCardSurface } from "@/modules/finance/repositories/card-surface-repository";
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
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import { recordCardCommand } from "@/modules/finance/services/record-card-command";
import { recordCardStatement } from "@/modules/finance/services/card-statements";
import { getCardStatement } from "@/modules/finance/services/read-card-statements";
import {
  recordCardAllocation,
  reverseCardAllocation,
} from "@/modules/finance/services/card-allocations";
import {
  recordCardInstallmentPlan,
  recordInstallmentApplication,
  reverseInstallmentApplication,
} from "@/modules/finance/services/card-installments";
import { getCardInstallmentPlan } from "@/modules/finance/services/read-card-installments";
import { getCardSurface } from "@/modules/finance/services/read-card-surface";
import { getCardActivity } from "@/modules/finance/services/read-card-activity";
import { getDashboard } from "@/modules/dashboard/services/get-dashboard";
import {
  getFinancialReport,
  getFinancialDetail,
} from "@/modules/reporting/services/get-reports";
import {
  prepareCsvSnapshotInTransaction,
  serializeCsv,
} from "@/modules/reporting/services/export-csv";
import { parse } from "csv-parse/sync";
import { listAgendaItems } from "@/modules/time/services/list-agenda-items";
import {
  getReminder,
  mutateReminder,
  getReminderAttention,
} from "@/modules/time/services/reminders";
import type {
  ReminderSource,
  ReminderCommand,
} from "@/modules/time/domain/reminder";
import { updateModulePreferenceInTransaction } from "@/modules/core/services/update-module-preference";
import {
  getFinancialActionDetail,
  correctFinancialAction,
  reverseFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
type Owner = { userId: string; workspaceId: string };
const label = "V2-A6 integrated fixture";
const period = {
  period: "custom" as const,
  startDate: "2026-10-01",
  endDate: "2026-11-30",
};
const tx = (c: PoolClient) =>
  ({ db: drizzle({ client: c }) }) as ScopedTransaction;
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
async function scoped<T>(o: Owner, run: (c: PoolClient) => Promise<T>) {
  const c = await getDomainPool().connect();
  try {
    return await runScopedTransactionOnClient(c, o, () => run(c));
  } finally {
    c.release();
  }
}
async function setup(o: Owner) {
  const card = await createCreditCard({
    ...o,
    clientCommandId: randomUUID(),
    name: "Integrated Visa",
    issuerName: "Provider",
    creditLimitMinor: "1000000",
    limitVerifiedDate: "2026-10-12",
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
    cardId: card.cardId,
    effectiveDate: "2026-10-10",
    postingDate: "2026-10-11",
    purchaseMinor: "300000",
    splits: [{ amountMinor: "300000", categoryId: null }],
    description: "Recognized laptop",
  });
  return { card, cash, purchase };
}
type Setup = Awaited<ReturnType<typeof setup>>;
function planBody(o: Owner, x: Setup) {
  return {
    ...o,
    clientCommandId: randomUUID(),
    cardId: x.card.cardId,
    purchaseActionId: x.purchase.actionId,
    purchaseActionRevisionId: x.purchase.actionRevisionId,
    principalMinor: "300000",
    installmentCount: 3,
    providerConfirmed: true as const,
    verificationSource: "Complete provider schedule",
    verifiedDate: "2026-10-12",
    installments: [
      {
        dueDate: "2026-10-20",
        principalMinor: "100000",
        interestMinor: "1000",
        feeMinor: "0",
        totalMinor: "101000",
      },
      {
        dueDate: "2026-11-20",
        principalMinor: "100000",
        interestMinor: null,
        feeMinor: null,
        totalMinor: null,
      },
      {
        dueDate: null,
        principalMinor: "100000",
        interestMinor: null,
        feeMinor: null,
        totalMinor: null,
      },
    ],
  };
}
function statementBody(o: Owner, x: Setup) {
  return {
    ...o,
    clientCommandId: randomUUID(),
    cardId: x.card.cardId,
    cycleStart: "2026-10-01",
    cycleEnd: "2026-10-11",
    statementDate: "2026-10-12",
    dueDate: "2026-10-20",
    balanceMinor: "300000",
    minimumDueMinor: "10000",
    openingBalanceMinor: "0",
    verificationSource: "Verified provider statement",
    verifiedDate: "2026-10-12",
    entries: [
      {
        description: "Provider laptop",
        postingDate: "2026-10-11",
        amountMinor: "300000",
        actionRevisionId: x.purchase.actionRevisionId,
      },
    ],
  };
}
async function payment(o: Owner, x: Setup, amountMinor = "100000") {
  return recordCardCommand({
    ...o,
    clientCommandId: randomUUID(),
    cardId: x.card.cardId,
    actionKind: "card_payment",
    payingAccountId: x.cash.accountId,
    amountMinor,
    effectiveDate: "2026-10-12",
    postingDate: "2026-10-12",
    description: "Actual card transfer",
    providerConfirmed: true,
    confirmationSource: "Receipt",
  });
}
async function allocation(
  o: Owner,
  x: Setup,
  s: { revisionId: string },
  p: { actionRevisionId: string },
  amountMinor = "100000",
) {
  return recordCardAllocation({
    ...o,
    clientCommandId: randomUUID(),
    cardId: x.card.cardId,
    statementRevisionId: s.revisionId,
    sourceActionRevisionId: p.actionRevisionId,
    amountMinor,
    confirmationKind: "provider",
    confirmationSource: "Exact provider allocation",
    confirmedDate: "2026-10-12",
  });
}
async function ledger(o: Owner) {
  return scoped(
    o,
    async (c) =>
      (
        await c.query(
          "SELECT (SELECT count(*) FROM finance.posting WHERE workspace_id=$1)::int postings,(SELECT count(*) FROM finance.journal WHERE workspace_id=$1)::int journals,(SELECT financial_revision::text FROM core.workspace WHERE id=$1) revision,(SELECT jsonb_object_agg(ledger_account_id,amount) FROM (SELECT ledger_account_id,sum(amount_minor::numeric)::text amount FROM finance.posting WHERE workspace_id=$1 GROUP BY ledger_account_id)b) balances",
          [o.workspaceId],
        )
      ).rows[0],
  );
}
async function control(
  o: Owner,
  target: ReminderSource,
  action: ReminderCommand["action"],
) {
  const view = await getReminder(o, target);
  const command = {
    target,
    action,
    expectedSnapshot: view.snapshot,
    clientCommandId: randomUUID(),
  };
  await mutateReminder(o, command);
  return command;
}
const agenda = (o: Owner) =>
  listAgendaItems({
    ...o,
    startDate: period.startDate,
    endDate: period.endDate,
    modules: ["money"],
    pageSize: 100,
  });
afterAll(closeRuntimeDatabasePools);
describe("V2-A6 integrated card acceptance", () => {
  it("keeps multi-query provider and posting reads on one repeatable snapshot while a real payment commits", async () =>
    fixture(async (o) => {
      const x = await setup(o);
      await recordCardStatement(statementBody(o, x));
      await recordCardInstallmentPlan(planBody(o, x));
      await withDomainTransaction(
        o,
        async (t) => {
          const input = {
            today: "2026-10-12",
            startDate: period.startDate,
            endDate: period.endDate,
          };
          const before = await readCardSurface(t, o.workspaceId, input);
          await payment(o, x);
          expect(await readCardSurface(t, o.workspaceId, input)).toEqual(
            before,
          );
        },
        { readOnlySnapshot: true },
      );
      const fresh = await getCardSurface(o);
      expect(fresh.cards[0]!.postedOutstandingMinor).toBe("200000");
      expect(fresh.cards[0]!.latestStatement!.remainingDueMinor).toBe("300000");
      expect(fresh.installments[0]!.remainingPrincipalMinor).toBe("100000");
    }));
  it("retains forced RLS and restricted invoker-view access for every derived card surface", async () =>
    fixture(async (o, other) => {
      const x = await setup(o);
      await recordCardStatement(statementBody(o, x));
      await recordCardInstallmentPlan(planBody(o, x));
      await scoped(o, async (c) => {
        for (const view of ["card_statement_due_v", "card_installment_due_v"]) {
          expect(
            (
              await c.query(
                "SELECT reloptions FROM pg_class WHERE oid=$1::regclass",
                ["finance." + view],
              )
            ).rows[0].reloptions,
          ).toContain("security_invoker=true");
          for (const role of ["auth_adapter", "worker_domain", "queue_broker"])
            expect(
              (
                await c.query(
                  "SELECT has_table_privilege($1,$2,'SELECT') allowed",
                  [role, "finance." + view],
                )
              ).rows[0].allowed,
            ).toBe(false);
        }
        for (const table of [
          "reminder_occurrence",
          "reminder_rule",
          "source_reminder_setting",
        ])
          expect(
            (
              await c.query(
                "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",
                ["time." + table],
              )
            ).rows[0],
          ).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
        await c.query("SELECT set_config('app.user_id',$1,true)", [
          other.userId,
        ]);
        for (const view of ["card_statement_due_v", "card_installment_due_v"])
          expect(
            (
              await c.query(
                `SELECT workspace_id FROM finance.${view} WHERE workspace_id=$1`,
                [o.workspaceId],
              )
            ).rows,
          ).toEqual([]);
      });
      await expect(
        scoped(o, async (c) => {
          await c.query("SET LOCAL row_security=off");
          return c.query("SELECT * FROM finance.card_statement_due_v");
        }),
      ).rejects.toThrow();
    }));
  it("keeps exact financial, provider, projection and export grains separate across all surfaces", async () =>
    fixture(async (o, other) => {
      const x = await setup(o);
      const before = await ledger(o);
      const s = await recordCardStatement(statementBody(o, x));
      const plan = await recordCardInstallmentPlan(planBody(o, x));
      expect(await ledger(o)).toEqual({
        ...before,
        revision: (BigInt(before.revision) + 2n).toString(),
      });
      const p = await payment(o, x);
      const a = await allocation(o, x, s, p);
      await recordInstallmentApplication({
        ...o,
        cardId: x.card.cardId,
        planId: plan.planId,
        planRevisionId: plan.revisionId,
        clientCommandId: randomUUID(),
        allocationId: a.allocationId,
        installmentNo: 1,
        principalMinor: "50000",
        confirmationKind: "provider",
        confirmationSource: "Principal portion confirmed",
        confirmedDate: "2026-10-12",
      });
      for (const actionKind of [
        "card_fee",
        "card_interest",
        "card_refund",
      ] as const)
        await recordCardCommand({
          ...o,
          cardId: x.card.cardId,
          clientCommandId: randomUUID(),
          actionKind,
          amountMinor: actionKind === "card_refund" ? "10000" : "2000",
          effectiveDate: "2026-10-12",
          postingDate: "2026-10-12",
          description: actionKind,
          providerConfirmed: true,
          confirmationSource: "Posted provider line",
        });
      const stable = await ledger(o);
      const d = await getDashboard({ ...o, query: period });
      const r = await getFinancialReport({ ...o, query: period });
      const surface = await getCardSurface({ ...o, cardId: x.card.cardId });
      expect(d.finance).toMatchObject({
        liquidMinor: "800000",
        liabilitiesMinor: "194000",
        trackedNetMinor: "606000",
        spending: {
          grossMinor: "304000",
          offsetsMinor: "10000",
          netMinor: "294000",
        },
      });
      expect(r.metrics).toMatchObject({
        income: "0",
        gross: "304000",
        offsets: "10000",
        net: "294000",
        fees: "2000",
        interest: "2000",
        card_payments: "100000",
        closing_cash: "800000",
        closing_liability: "194000",
      });
      expect(r.identities).toEqual({
        cashMatches: true,
        liabilityMatches: true,
      });
      expect(r.cardRecords[0]).toMatchObject({
        spendingMinor: "294000",
        feesMinor: "2000",
        interestMinor: "2000",
        refundsMinor: "10000",
        paymentsMinor: "100000",
      });
      expect(surface.cards[0]).toMatchObject({
        postedOutstandingMinor: "194000",
        cardCreditMinor: "0",
        availableCreditEstimateMinor: "806000",
        utilizationPercent: "19.40%",
        latestStatement: {
          balanceMinor: "300000",
          minimumDueMinor: "10000",
          allocatedMinor: "100000",
          remainingDueMinor: "200000",
          unexplainedDifferenceMinor: "0",
          unlinkedRecognizedCount: "0",
        },
      });
      expect(r.cardSurface.installments).toHaveLength(2);
      expect(r.cardSurface.totals).toMatchObject({
        projectedPrincipalMinor: "150000",
        knownProjectedTotalMinor: "51000",
        unknownProjectedTotalCount: 1,
        unknownInstallmentDateCount: 1,
      });
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: x.card.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.recordedRemainingDueMinor,
      ).toBe(surface.cards[0]!.latestStatement!.remainingDueMinor);
      expect(
        (
          await getCardInstallmentPlan({
            ...o,
            cardId: x.card.cardId,
            planId: plan.planId,
          })
        ).totals.remainingPrincipalMinor,
      ).toBe("250000");
      expect(
        (await getCardActivity({ ...o, cardId: x.card.cardId })).cardSurface
          .cards[0],
      ).toEqual(surface.cards[0]);
      const items = await agenda(o);
      expect(items.items.map((i) => i.sourceKind).sort()).toEqual([
        "card_installment",
        "card_installment",
        "card_statement",
      ]);
      expect(
        items.items.find((i) => i.sourceKind === "card_statement")!.reminder!
          .remainingMinor,
      ).toBe("200000");
      expect(
        items.items.some(
          (i) =>
            i.sourceKind === "card_installment" &&
            i.reminder!.remainingMinor === null,
        ),
      ).toBe(true);
      expect(
        (
          await getFinancialDetail({
            ...o,
            query: {
              ...period,
              metric: "card_payments",
              cardId: x.card.cardId,
            },
          })
        ).amountMinor,
      ).toBe("100000");
      const csv = await scoped(o, async (c) => {
        const snapshot = await prepareCsvSnapshotInTransaction(tx(c), {
          workspaceId: o.workspaceId,
          kind: "report",
          query: period,
        });
        return parse(await serializeCsv(snapshot.rows), {
          columns: true,
          bom: true,
        }) as Record<string, string>[];
      });
      expect(
        csv.find((v) => v.record_type === "verified_card_statement"),
      ).toMatchObject({
        provider_balance_minor: "300000",
        remaining_due_minor: "200000",
        recorded_minimum_due_minor: "10000",
      });
      expect(
        csv.filter((v) => v.record_type === "card_installment_projection"),
      ).toHaveLength(2);
      expect(
        csv.find((v) => v.expected_remaining_total_minor === ""),
      ).toBeDefined();
      expect(await ledger(o)).toEqual(stable);
      expect((await getCardSurface(other)).cards).toEqual([]);
      expect((await agenda(other)).items).toEqual([]);
      await expect(
        getCardSurface({ ...other, cardId: x.card.cardId }),
      ).rejects.toThrow("unavailable");
    }));
  it("resolves, reactivates and revises statement reminders without replaying financial activity or dismissal", async () =>
    fixture(async (o) => {
      const x = await setup(o),
        s = await recordCardStatement(statementBody(o, x)),
        source = {
          sourceKind: "card_statement" as const,
          sourceId: s.statementId,
        };
      const stable = await ledger(o);
      const dismiss = await control(o, source, {
        kind: "dismiss",
        ruleKey: "0:09:00",
      });
      expect(await mutateReminder(o, dismiss)).toEqual({ saved: true });
      expect(await ledger(o)).toEqual(stable);
      const p = await payment(o, x, "300000");
      const a = await allocation(o, x, s, p, "300000");
      expect((await getReminder(o, source)).eligible).toBe(false);
      expect((await getReminder(o, source)).history[0]!.state).toBe(
        "cancelled",
      );
      await reverseCardAllocation({
        ...o,
        cardId: x.card.cardId,
        clientCommandId: randomUUID(),
        allocationId: a.allocationId,
        reason: "Provider corrected allocation",
      });
      const renewed = await getReminder(o, source);
      expect(renewed.eligible).toBe(true);
      expect(renewed.sourceGeneration).toBe(2);
      expect(renewed.rules[0]!.state).toBe("active");
      const body = statementBody(o, x);
      await recordCardStatement({
        ...body,
        clientCommandId: randomUUID(),
        statementId: s.statementId,
        expectedVersion: 1,
        reason: "Correct due date",
        dueDate: "2026-10-21",
      });
      const revised = await getReminder(o, source);
      expect(revised.occurrenceKey).not.toBe(renewed.occurrenceKey);
      expect(revised.dueDate).toBe("2026-10-21");
      await expect(
        mutateReminder(o, { ...dismiss, clientCommandId: randomUUID() }),
      ).rejects.toThrow("changed");
    }));
  it("uses explicit installment satisfaction, invalidates corrected sources, and retains immutable reminder history", async () =>
    fixture(async (o) => {
      const x = await setup(o),
        s = await recordCardStatement(statementBody(o, x)),
        plan = await recordCardInstallmentPlan(planBody(o, x));
      const source = {
        sourceKind: "card_installment" as const,
        sourceId: (await getCardSurface({ ...o, cardId: x.card.cardId }))
          .installments[0]!.installmentId,
      };
      const before = await ledger(o);
      await control(o, source, { kind: "dismiss", ruleKey: "0:09:00" });
      expect(await ledger(o)).toEqual(before);
      const p = await payment(o, x),
        a = await allocation(o, x, s, p);
      const app = await recordInstallmentApplication({
        ...o,
        cardId: x.card.cardId,
        planId: plan.planId,
        planRevisionId: plan.revisionId,
        clientCommandId: randomUUID(),
        allocationId: a.allocationId,
        installmentNo: 1,
        principalMinor: "100000",
        confirmationKind: "provider",
        confirmationSource: "Principal fully applied; interest is not paid",
        confirmedDate: "2026-10-12",
      });
      expect((await getReminder(o, source)).remainingMinor).toBe("1000");
      await reverseInstallmentApplication({
        ...o,
        cardId: x.card.cardId,
        planId: plan.planId,
        clientCommandId: randomUUID(),
        applicationId: app.applicationId,
        reason: "Provider application correction",
      });
      expect((await getReminder(o, source)).remainingMinor).toBe("101000");
      const detail = await getFinancialActionDetail({
        ...o,
        actionId: x.purchase.actionId,
      });
      await correctFinancialAction({
        ...o,
        actionId: x.purchase.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: detail.current.actionRevisionId,
        expectedFinancialRevision: detail.current.financialRevision,
        reason: "Correct source description",
        replacement: {
          ...detail.replacement!,
          description: "Corrected recognized laptop",
        } as NonNullable<typeof detail.replacement>,
      });
      expect((await getCardSurface(o)).totals.reconciliationPlanCount).toBe(1);
      expect((await getReminder(o, source)).eligible).toBe(false);
      expect((await getReminder(o, source)).history[0]!.state).toBe(
        "cancelled",
      );
      expect(
        (await agenda(o)).items.filter(
          (i) => i.sourceKind === "card_installment",
        ),
      ).toEqual([]);
      await recordCardInstallmentPlan({
        ...planBody(o, x),
        clientCommandId: randomUUID(),
        planId: plan.planId,
        expectedVersion: 1,
        reason: "Provider cancelled schedule",
        lifecycle: "cancelled",
      });
      expect((await getReminder(o, source)).eligible).toBe(false);
    }));
  it("serializes duplicate reminder writes and rejects stale previews after partial allocations", async () =>
    fixture(async (o) => {
      const x = await setup(o),
        s = await recordCardStatement(statementBody(o, x)),
        source = {
          sourceKind: "card_statement" as const,
          sourceId: s.statementId,
        };
      const view = await getReminder(o, source);
      const command = {
        target: source,
        expectedSnapshot: view.snapshot,
        clientCommandId: randomUUID(),
        action: { kind: "dismiss" as const, ruleKey: "0:09:00" },
      };
      expect(
        await Promise.all([
          mutateReminder(o, command),
          mutateReminder(o, command),
        ]),
      ).toEqual([{ saved: true }, { saved: true }]);
      expect(
        await mutateReminder(o, {
          ...command,
          target: { ...source, sourceId: source.sourceId.toUpperCase() },
        }),
      ).toEqual({ saved: true });
      expect((await getReminder(o, source)).history).toHaveLength(1);
      const preview = await getReminder(o, source);
      const p = await payment(o, x);
      await allocation(o, x, s, p);
      await expect(
        mutateReminder(o, {
          ...command,
          clientCommandId: randomUUID(),
          expectedSnapshot: preview.snapshot,
        }),
      ).rejects.toThrow("changed");
      expect((await getReminder(o, source)).remainingMinor).toBe("200000");
    }));
  it("keeps notification preferences separate from navigation and rejects foreign or mixed source references", async () =>
    fixture(async (o, other) => {
      const x = await setup(o),
        s = await recordCardStatement(statementBody(o, x)),
        source = {
          sourceKind: "card_statement" as const,
          sourceId: s.statementId,
        };
      await scoped(o, async (c) =>
        updateModulePreferenceInTransaction(tx(c), {
          ...o,
          moduleKey: "money",
          clientCommandId: randomUUID(),
          expectedVersion: 0,
          enabled: false,
          agendaVisible: false,
          remindersEnabled: false,
        }),
      );
      expect((await agenda(o)).items).toEqual([]);
      expect((await getReminder(o, source)).moduleRemindersEnabled).toBe(false);
      expect((await getReminderAttention(o)).total).toBe(0);
      expect(
        (await getDashboard({ ...o, query: period })).finance.cardSurface.cards,
      ).toHaveLength(1);
      await expect(getReminder(other, source)).rejects.toThrow("unavailable");
      expect(
        await scoped(
          other,
          async (c) =>
            (
              await c.query(
                "SELECT * FROM finance.card_statement_due_v WHERE statement_id=$1",
                [s.statementId],
              )
            ).rowCount,
        ),
      ).toBe(0);
      await expect(
        scoped(other, (c) =>
          c.query(
            "INSERT INTO time.source_reminder_setting(workspace_id,card_statement_id,mode) VALUES($1,$2,'off')",
            [other.workspaceId, s.statementId],
          ),
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        scoped(o, (c) =>
          c.query(
            "INSERT INTO time.source_reminder_setting(workspace_id,card_statement_id,card_installment_id,mode) VALUES($1,$2,$3,'off')",
            [o.workspaceId, s.statementId, randomUUID()],
          ),
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await control(o, source, { kind: "settings", mode: "off", rules: [] });
      await expect(
        scoped(o, (c) =>
          c.query(
            "UPDATE time.source_reminder_setting SET card_statement_id=NULL,personal_event_id=$2 WHERE workspace_id=$1",
            [o.workspaceId, randomUUID()],
          ),
        ),
      ).rejects.toThrow("immutable");
    }));
  it("does not turn overpayments, archived limits, refunds or provider balances into liquid cash", async () =>
    fixture(async (o) => {
      const x = await setup(o);
      const s = await recordCardStatement({
        ...statementBody(o, x),
        balanceMinor: "-1000",
        minimumDueMinor: "0",
        entries: [],
        openingBalanceMinor: null,
      });
      await payment(o, x, "400000");
      const r = await getFinancialReport({ ...o, query: period });
      expect(r.metrics).toMatchObject({
        gross: "300000",
        card_payments: "400000",
        closing_cash: "500000",
        closing_liability: "-100000",
      });
      expect(r.cardSurface.cards[0]).toMatchObject({
        postedOutstandingMinor: "0",
        cardCreditMinor: "100000",
        availableCreditEstimateMinor: "1000000",
        latestStatement: {
          statementCreditMinor: "1000",
          remainingDueMinor: "0",
          unexplainedDifferenceMinor: null,
        },
      });
      expect(
        (
          await getReminder(o, {
            sourceKind: "card_statement",
            sourceId: s.statementId,
          })
        ).eligible,
      ).toBe(false);
      await updateCreditCard({
        ...o,
        cardId: x.card.cardId,
        clientCommandId: randomUUID(),
        expectedVersion: 1,
        name: "Integrated Visa",
        issuerName: "Provider",
        creditLimitMinor: "1000000",
        limitVerifiedDate: "2026-10-12",
        archived: true,
      });
      const after = await getCardSurface(o);
      expect(after.cards[0]!.cardCreditMinor).toBe("100000");
      expect(after.utilization).toMatchObject({
        eligibleCount: 0,
        utilizationPercent: null,
      });
    }));
  it("removes card reminder evidence during real resumable lifecycle purge while preserving another owner", async () =>
    fixture(async (o, other) => {
      const x = await setup(o),
        s = await recordCardStatement(statementBody(o, x));
      await recordCardInstallmentPlan(planBody(o, x));
      for (const item of (await agenda(o)).items)
        await control(
          o,
          { sourceKind: item.sourceKind, sourceId: item.sourceId },
          { kind: "dismiss", ruleKey: "0:09:00" },
        );
      const preserved = await setup(other);
      const deletion = await scoped(o, (c) => makeDeletionPending(c, o));
      const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!),
        operatorUrl = new URL(process.env.DATABASE_URL!);
      expect(operatorUrl.pathname).toBe("/personal_management_test");
      adminUrl.pathname = "/personal_management_test";
      operatorUrl.username = "lifecycle_operator";
      operatorUrl.password = parseEnv(
        readFileSync(".env.bootstrap", "utf8"),
      ).LIFECYCLE_OPERATOR_PASSWORD!;
      const admin = new Client({ connectionString: adminUrl.toString() });
      const operator = new Client({ connectionString: operatorUrl.toString() });
      await admin.connect();
      await operator.connect();
      try {
        await admin.query("BEGIN");
        await admin.query("SET LOCAL session_replication_role='replica'");
        await admin.query(
          "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1",
          [deletion.requestId],
        );
        await admin.query("COMMIT");
        let completed = false;
        for (let n = 0; n < 50; n++) {
          if (
            (await purgeDeletionStep(operator, deletion.requestId, 1000))
              .state === "completed"
          ) {
            completed = true;
            break;
          }
        }
        expect(completed).toBe(true);
        for (const table of [
          "reminder_occurrence",
          "reminder_rule",
          "source_reminder_setting",
        ])
          expect(
            (
              await admin.query(
                `SELECT id FROM time.${table} WHERE workspace_id=$1`,
                [o.workspaceId],
              )
            ).rowCount,
          ).toBe(0);
        expect(
          (
            await admin.query(
              "SELECT statement_id FROM finance.card_statement_due_v WHERE statement_id=$1",
              [s.statementId],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (await getCardSurface({ ...other, cardId: preserved.card.cardId }))
            .cards[0]!.postedOutstandingMinor,
        ).toBe("300000");
      } finally {
        await operator.end();
        await admin.end();
      }
    }));
  it("correction and reversal of payment evidence restore exact statement due without silently applying installments", async () =>
    fixture(async (o) => {
      const x = await setup(o),
        s = await recordCardStatement(statementBody(o, x));
      await recordCardInstallmentPlan(planBody(o, x));
      const p = await payment(o, x);
      await allocation(o, x, s, p);
      const d = await getFinancialActionDetail({ ...o, actionId: p.actionId });
      await reverseFinancialAction({
        ...o,
        actionId: p.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: d.current.actionRevisionId,
        expectedFinancialRevision: d.current.financialRevision,
        reason: "Mistaken transfer reversed",
      });
      const surface = await getCardSurface(o);
      expect(surface.cards[0]!.latestStatement).toMatchObject({
        remainingDueMinor: "300000",
        allocatedMinor: "0",
        unresolvedAllocationMinor: "100000",
      });
      expect(surface.installments[0]!.remainingPrincipalMinor).toBe("100000");
      const report = await getFinancialReport({ ...o, query: period });
      expect(report.metrics).toMatchObject({
        card_payments: "0",
        gross: "300000",
        closing_cash: "900000",
        closing_liability: "300000",
      });
      expect(report.cardRecords[0]!.paymentsMinor).toBe("0");
    }));
});
