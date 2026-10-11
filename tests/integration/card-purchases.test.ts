import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
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
import {
  recordCardPurchase,
  recordCardPurchaseInTransaction,
  recordExpense,
} from "@/modules/finance/services/record-expense";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import { listFinancialAccounts } from "@/modules/finance/services/list-financial-accounts";
import { getCreditCardDetail } from "@/modules/finance/services/read-credit-cards";
import { getCardActivity } from "@/modules/finance/services/read-card-activity";
import { listFinancialActions } from "@/modules/finance/services/list-financial-actions";
import {
  getFinancialActionDetail,
  correctFinancialAction,
  reverseFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import {
  getFinancialReport,
  getFinancialDetail,
} from "@/modules/reporting/services/get-reports";
import { prepareCsvSnapshotInTransaction } from "@/modules/reporting/services/export-csv";
import { getDashboard } from "@/modules/dashboard/services/get-dashboard";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import { findSeededCategoryId } from "./helpers/provisioned-test-user";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { createPrivateFinancialRevision } from "@/modules/finance/repositories/financial-write-repository";
import { completeFinancialCommandReceipt } from "@/modules/finance/repositories/command-receipt-repository";

type Owner = { userId: string; workspaceId: string };
const label = "V2-A2 card fixture" as const;
const query = {
  period: "custom" as const,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
};
async function fixture(run: (a: Owner, b: Owner) => Promise<void>) {
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
    for (const owner of owners)
      if (
        (
          await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
            owner.userId,
          ])
        ).rowCount
      )
        await removeNamedFinancialFixture(owner, label);
  }
}
async function card(a: Owner, name = "BPI Visa") {
  return createCreditCard({
    ...a,
    clientCommandId: randomUUID(),
    name,
    issuerName: "BPI",
  });
}
const purchase = (a: Owner, cardId: string) => ({
  ...a,
  clientCommandId: randomUUID(),
  cardId,
  effectiveDate: "2026-10-10",
  postingDate: "2026-11-02",
  providerReference: "provider-123",
  purchaseMinor: "300000",
  splits: [{ amountMinor: "300000", categoryId: null }],
  description: "Weekly groceries",
  merchantName: "Market",
});
async function scoped<T>(
  a: Owner,
  run: (
    c: import("pg").PoolClient,
    t: import("@/platform/db").ScopedTransaction,
  ) => Promise<T>,
) {
  const c = await getDomainPool().connect();
  try {
    return await runScopedTransactionOnClient(c, a, (t) => run(c, t));
  } finally {
    c.release();
  }
}
async function report(a: Owner) {
  return getFinancialReport({ ...a, query });
}
async function correct(
  a: Owner,
  actionId: string,
  change: Record<string, unknown>,
) {
  const d = await getFinancialActionDetail({ ...a, actionId });
  expect(d.replacement?.actionKind).toBe("card_purchase");
  return correctFinancialAction({
    ...a,
    actionId,
    clientCommandId: randomUUID(),
    expectedActionRevisionId: d.current.actionRevisionId,
    expectedFinancialRevision: d.current.financialRevision,
    reason: "Correct provider evidence",
    replacement: { ...d.replacement!, ...change } as NonNullable<
      typeof d.replacement
    >,
  });
}
afterAll(closeRuntimeDatabasePools);

// Raw app_domain construction proves the database recipe independently of the
// service. Every rejected graph rolls back; no validator is disabled.
async function rawPurchase(
  a: Owner,
  cardId: string,
  ledgerId: string,
  mode: string,
  otherCardId: string,
  otherLedgerId: string,
  cashLedgerId: string,
) {
  return scoped(a, async (c, t) => {
    const receipt = randomUUID(),
      action = randomUUID(),
      revision = randomUUID(),
      journal = randomUUID(),
      expense = randomUUID();
    await c.query(
      "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,'finance.record_card_purchase',$4)",
      [receipt, a.workspaceId, randomUUID(), Buffer.alloc(32, 9)],
    );
    await c.query(
      "INSERT INTO finance.financial_action(id,workspace_id,original_command_receipt_id,current_revision_id,description,recorded_by_user_id,actor_kind) VALUES($1,$2,$3,$4,'Raw card purchase',$5,'user')",
      [action, a.workspaceId, receipt, revision, a.userId],
    );
    await c.query(
      "INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,recorded_by_user_id,actor_kind) VALUES($1,$2,$3,1,$4,'create','card_purchase','2026-10-10','PHP',$5,'user')",
      [revision, a.workspaceId, action, receipt, a.userId],
    );
    const ws = [a.workspaceId, action, revision];
    if (mode !== "missing detail")
      await c.query(
        "INSERT INTO finance.purchase_detail(workspace_id,action_id,action_revision_id,funding_ledger_account_id,purchase_minor,card_posting_date,card_provider_reference) VALUES($1,$2,$3,$4,$5,$6,'raw-ref')",
        [
          ...ws,
          ledgerId,
          mode === "wrong purchase amount" ? 40001 : 40000,
          mode === "missing posting date" ? null : "2026-11-02",
        ],
      );
    await c.query(
      "INSERT INTO finance.ledger_account(id,workspace_id,code,name,kind,currency) VALUES($1,$2,$3,'Expense','expense','PHP')",
      [expense, a.workspaceId, `raw-expense:${expense}`],
    );
    await c.query(
      "INSERT INTO finance.journal(id,workspace_id,action_id,action_revision_id,sequence_no,effective_date,currency,role) VALUES($1,$2,$3,$4,1,'2026-10-10','PHP','economic')",
      [journal, ...ws],
    );
    await c.query(
      "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor) VALUES($1,$2,$3,$4,$5,'PHP',1,$6)",
      [
        ...ws,
        journal,
        mode === "wrong card" ? otherLedgerId : ledgerId,
        mode === "duplicate credit" ? -20000 : -40000,
      ],
    );
    if (mode === "duplicate credit")
      await c.query(
        "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor) VALUES($1,$2,$3,$4,$5,'PHP',3,-20000)",
        [...ws, journal, ledgerId],
      );
    await c.query(
      "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,expense_class) VALUES($1,$2,$3,$4,$5,'PHP',2,$6,'gross')",
      [...ws, journal, expense, mode === "cash movement" ? 41000 : 40000],
    );
    if (mode === "cash movement")
      await c.query(
        "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,cash_flow_kind,cash_flow_direction) VALUES($1,$2,$3,$4,$5,'PHP',3,-1000,'purchase','out')",
        [...ws, journal, cashLedgerId],
      );
    if (mode !== "missing activity")
      await c.query(
        "INSERT INTO finance.card_activity(workspace_id,action_id,action_revision_id,card_id,activity_kind,transaction_date,posting_date,provider_reference,signed_liability_minor) VALUES($1,$2,$3,$4,$5,'2026-10-10',$6,'raw-ref',$7)",
        [
          ...ws,
          mode === "wrong activity card" ? otherCardId : cardId,
          mode === "unreleased activity" ? "payment" : "purchase",
          mode === "wrong provider date" ? "2026-11-03" : "2026-11-02",
          mode === "wrong activity amount" ? 40001 : 40000,
        ],
      );
    if (mode !== "missing audit")
      await createPrivateFinancialRevision(t, {
        id: randomUUID(),
        workspaceId: a.workspaceId,
        commandReceiptId: receipt,
        subjectKind: "financial_action",
        subjectId: action,
        subjectVersion: 1,
        operation: "create",
        afterJson: {
          actionRevisionId: revision,
          actionKind: "card_purchase",
          cardId,
          effectiveDate: "2026-10-10",
          postingDate: "2026-11-02",
          providerReference: "raw-ref",
          purchaseMinor: "40000",
        },
        effectiveDate: "2026-10-10",
        recordedByUserId: a.userId,
        requestId: null,
      });
    await c.query(
      "UPDATE finance.journal SET state='posted',finalized_at=clock_timestamp() WHERE id=$1",
      [journal],
    );
    await c.query(
      "UPDATE finance.action_revision SET state='posted',finalized_at=clock_timestamp() WHERE id=$1",
      [revision],
    );
    await completeFinancialCommandReceipt(t, {
      workspaceId: a.workspaceId,
      receiptId: receipt,
      result: {
        actionId: action,
        actionRevisionId: revision,
        financialRevision: "1",
      },
    });
    await c.query("SET CONSTRAINTS ALL IMMEDIATE");
  });
}

describe("V2-A2 posted card purchases", () => {
  it.each([
    "missing detail",
    "missing posting date",
    "wrong purchase amount",
    "wrong card",
    "duplicate credit",
    "cash movement",
    "missing activity",
    "wrong activity card",
    "wrong activity amount",
    "wrong provider date",
    "unreleased activity",
    "missing audit",
  ])("rejects raw %s even when its journal balances", (mode) =>
    fixture(async (a) => {
      const c = await card(a),
        c2 = await card(a, "Other"),
        cash = await openFinancialAccount({
          ...a,
          clientCommandId: randomUUID(),
          name: "Cash",
          accountType: "cash",
          openingCutoffDate: "2026-09-30",
          openingBalanceMinor: "0",
        });
      await expect(
        rawPurchase(
          a,
          c.cardId,
          c.liabilityLedgerAccountId,
          mode,
          c2.cardId,
          c2.liabilityLedgerAccountId,
          cash.ledgerAccountId,
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await getCardActivity({ ...a, cardId: c.cardId })).items).toEqual(
        [],
      );
    }),
  );
  it("protects finalized card activity and purchase provider fields against extension, update, deletion and bypass settings", () =>
    fixture(async (a) => {
      const c = await card(a),
        p = await recordCardPurchase(purchase(a, c.cardId));
      await scoped(a, async (client) => {
        for (const [statement, values, code] of [
          [
            "UPDATE finance.card_activity SET provider_reference='changed' WHERE action_revision_id=$1",
            [p.actionRevisionId],
            "42501",
          ],
          [
            "DELETE FROM finance.card_activity WHERE action_revision_id=$1",
            [p.actionRevisionId],
            "42501",
          ],
          [
            "UPDATE finance.purchase_detail SET card_posting_date='2026-11-04' WHERE action_revision_id=$1",
            [p.actionRevisionId],
            "42501",
          ],
          [
            "INSERT INTO finance.card_activity(workspace_id,card_id,action_id,action_revision_id,activity_kind,transaction_date,posting_date,signed_liability_minor) VALUES($1,$2,$3,$4,'purchase','2026-10-10','2026-11-02',300000)",
            [a.workspaceId, c.cardId, p.actionId, p.actionRevisionId],
            "23514",
          ],
        ] as const) {
          await client.query("SAVEPOINT rejected");
          await client.query(
            "SELECT set_config('app.skip_immutability','true',true)",
          );
          await expect(
            client.query(statement, [...values]),
          ).rejects.toMatchObject({ code });
          await client.query("ROLLBACK TO SAVEPOINT rejected");
        }
      });
    }));
  it("recognizes category spending and the correct card once, keeps cash unchanged, and uses transaction dates in reports", () =>
    fixture(async (a) => {
      const c = await card(a),
        other = await card(a, "Other card"),
        cash = await openFinancialAccount({
          ...a,
          clientCommandId: randomUUID(),
          name: "Cash",
          accountType: "cash",
          openingCutoffDate: "2026-09-30",
          openingBalanceMinor: "900000",
        });
      const categoryId = await scoped(a, (client) =>
        findSeededCategoryId(client, a, { kind: "expense", code: "food" }),
      );
      const input = {
        ...purchase(a, c.cardId),
        splits: [
          { amountMinor: "200000", categoryId },
          { amountMinor: "100000", categoryId: null },
        ],
      };
      const saved = await recordCardPurchase(input);
      expect(
        await recordCardPurchase({ ...input, requestId: randomUUID() }),
      ).toEqual(saved);
      expect(
        (await listFinancialAccounts(a)).items.find(
          (x) => x.accountId === cash.accountId,
        )?.currentBalanceMinor,
      ).toBe("900000");
      expect(
        (await getCreditCardDetail({ ...a, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("300000");
      expect(
        (await getCreditCardDetail({ ...a, cardId: other.cardId })).card
          .postedOutstandingMinor,
      ).toBe("0");
      const r = await report(a);
      expect(r.metrics).toMatchObject({
        gross: "300000",
        net: "300000",
        cash_out: "0",
        closing_cash: "900000",
        closing_liability: "300000",
        tracked_net: "600000",
      });
      expect(r.identities).toEqual({
        cashMatches: true,
        liabilityMatches: true,
      });
      const dashboard = await getDashboard({ ...a, query });
      expect(dashboard.finance).toMatchObject({
        liquidMinor: "900000",
        liabilitiesMinor: "300000",
        trackedNetMinor: "600000",
      });
      expect(dashboard.finance.cards).toContainEqual(
        expect.objectContaining({
          cardId: c.cardId,
          liabilityMinor: "300000",
        }),
      );
      const csv = await scoped(a, (_client, t) =>
        prepareCsvSnapshotInTransaction(t, {
          workspaceId: a.workspaceId,
          kind: "transactions",
          query,
        }),
      );
      const cardRows = csv.rows.filter((row) => row.card_id === c.cardId);
      expect(cardRows).toHaveLength(3);
      for (const row of cardRows)
        expect(row).toMatchObject({
          card_name: "BPI Visa",
          posting_date: "2026-11-02",
          provider_reference: "provider-123",
        });
      expect(
        cardRows
          .filter((row) => row.expense_class === "gross")
          .reduce((sum, row) => sum + BigInt(String(row.amount_minor)), 0n),
      ).toBe(300000n);
      expect(cardRows.every((row) => row.cash_flow_direction === "none")).toBe(
        true,
      );
      expect(
        r.categories.find((x) => x.categoryId === categoryId)?.grossMinor,
      ).toBe("200000");
      expect(
        r.cardRecords.find((x) => x.cardId === c.cardId)?.spendingMinor,
      ).toBe("300000");
      const detail = await getFinancialDetail({
        ...a,
        query: { ...query, metric: "net", cardId: c.cardId },
      });
      expect(detail.amountMinor).toBe("300000");
      expect(detail.items).toHaveLength(2);
      expect(detail.items[0]).toMatchObject({
        cardName: "BPI Visa",
        postingDate: "2026-11-02",
      });
      const november = await getFinancialReport({
        ...a,
        query: { ...query, startDate: "2026-11-01", endDate: "2026-11-30" },
      });
      expect(november.metrics.gross).toBe("0");
      const history = await getCardActivity({ ...a, cardId: c.cardId });
      expect(history.items).toHaveLength(1);
      expect(history.items[0]).toMatchObject({
        transactionDate: "2026-10-10",
        postingDate: "2026-11-02",
        providerReference: "provider-123",
        signedLiabilityMinor: "300000",
      });
      expect(
        await listFinancialActions({
          ...a,
          filters: {
            cardId: c.cardId,
            categoryId,
            postingFrom: "2026-11-01",
            transactionTo: "2026-10-31",
          },
        }),
      ).toHaveLength(1);
      expect(
        await listFinancialActions({
          ...a,
          filters: { fundingSource: "cash" },
        }),
      ).toEqual([]);
    }));
  it("replays before archived card validation and rejects changed intent", () =>
    fixture(async (a) => {
      const c = await card(a),
        input = purchase(a, c.cardId),
        saved = await recordCardPurchase(input);
      await updateCreditCard({
        ...a,
        clientCommandId: randomUUID(),
        cardId: c.cardId,
        expectedVersion: 1,
        archived: true,
        name: "BPI Visa",
        issuerName: "BPI",
      });
      expect(await recordCardPurchase(input)).toEqual(saved);
      await expect(
        recordCardPurchase({ ...input, postingDate: "2026-11-03" }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
      await expect(
        recordCardPurchase({ ...input, clientCommandId: randomUUID() }),
      ).rejects.toThrow("active funding source");
      await correct(a, saved.actionId, {
        description: "Retained archived card",
      });
    }));
  it("retains immutable dates for a zero-money correction; amount/date/category corrections and reversal reconcile all signed postings", () =>
    fixture(async (a) => {
      const c = await card(a),
        saved = await recordCardPurchase(purchase(a, c.cardId));
      await correct(a, saved.actionId, {
        postingDate: "2026-11-04",
        providerReference: null,
      });
      let h = await getCardActivity({ ...a, cardId: c.cardId });
      expect(h.items).toHaveLength(2);
      expect(h.items.find((x) => x.revisionNo === 2)).toMatchObject({
        signedLiabilityMinor: "0",
        postingDate: "2026-11-04",
        providerReference: null,
      });
      await correct(a, saved.actionId, {
        purchaseMinor: "450000",
        splits: [{ amountMinor: "450000", categoryId: null }],
        effectiveDate: "2026-11-01",
      });
      expect((await report(a)).metrics.gross).toBe("0");
      expect(
        (await getCreditCardDetail({ ...a, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("450000");
      h = await getCardActivity({ ...a, cardId: c.cardId });
      expect(
        h.items.find((x) => x.revisionNo === 3)?.signedLiabilityMinor,
      ).toBe("150000");
      const d = await getFinancialActionDetail({
          ...a,
          actionId: saved.actionId,
        }),
        reverse = {
          ...a,
          actionId: saved.actionId,
          clientCommandId: randomUUID(),
          expectedActionRevisionId: d.current.actionRevisionId,
          expectedFinancialRevision: d.current.financialRevision,
          reason: "Duplicate real-world purchase",
        };
      const reversed = await reverseFinancialAction(reverse);
      expect(await reverseFinancialAction(reverse)).toEqual(reversed);
      expect(
        (await getCreditCardDetail({ ...a, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("0");
      expect(
        (await getCardActivity({ ...a, cardId: c.cardId })).items.find(
          (x) => x.changeKind === "void",
        ),
      ).toMatchObject({
        signedLiabilityMinor: "-450000",
        postingDate: "2026-11-04",
      });
    }));
  it("moves a corrected purchase between cards without changing spending or cash", () =>
    fixture(async (a) => {
      const c = await card(a),
        c2 = await card(a, "Second"),
        saved = await recordCardPurchase(purchase(a, c.cardId));
      await correct(a, saved.actionId, { cardId: c2.cardId });
      expect(
        (await getCreditCardDetail({ ...a, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("0");
      expect(
        (await getCreditCardDetail({ ...a, cardId: c2.cardId })).card
          .postedOutstandingMinor,
      ).toBe("300000");
      expect((await report(a)).metrics).toMatchObject({
        gross: "300000",
        cash_out: "0",
        closing_liability: "300000",
      });
      expect(
        (await getCardActivity({ ...a, cardId: c.cardId })).items.find(
          (x) => x.revisionNo === 2,
        )?.signedLiabilityMinor,
      ).toBe("-300000");
      expect(
        (await getCardActivity({ ...a, cardId: c2.cardId })).items[0]
          ?.signedLiabilityMinor,
      ).toBe("300000");
    }));
  it("rejects missing/foreign cards, foreign categories, spoofed workspace context, and cash-command use of card IDs", () =>
    fixture(async (a, b) => {
      const c = await card(a),
        foreign = await card(b);
      for (const cardId of [foreign.cardId, randomUUID()])
        await expect(
          recordCardPurchase(purchase(a, cardId)),
        ).rejects.toBeInstanceOf(CreditCardUnavailableError);
      await expect(
        getCardActivity({ ...a, cardId: foreign.cardId }),
      ).rejects.toBeInstanceOf(CreditCardUnavailableError);
      await expect(
        listFinancialActions({ ...a, filters: { cardId: foreign.cardId } }),
      ).rejects.toBeInstanceOf(CreditCardUnavailableError);
      const categoryId = await scoped(b, (client) =>
        findSeededCategoryId(client, b, { kind: "expense", code: "food" }),
      );
      await expect(
        recordCardPurchase({
          ...purchase(a, c.cardId),
          splits: [{ amountMinor: "300000", categoryId }],
        }),
      ).rejects.toThrow("category");
      await expect(
        recordCardPurchase(
          purchase({ ...a, workspaceId: b.workspaceId }, foreign.cardId),
        ),
      ).rejects.toBeInstanceOf(FinancialWriteWorkspaceUnavailableError);
      await expect(
        recordExpense({
          ...a,
          clientCommandId: randomUUID(),
          fundingAccountId: c.cardId,
          effectiveDate: "2026-10-10",
          purchaseMinor: "300000",
          splits: [{ amountMinor: "300000" }],
          description: "Wrong command",
        }),
      ).rejects.toThrow("account");
      expect((await report(a)).metrics.gross).toBe("0");
    }));
  it("serializes same-key retries and distinct commands on independent database connections", () =>
    fixture(async (a) => {
      const c = await card(a),
        input = purchase(a, c.cardId);
      const same = await Promise.all([
        recordCardPurchase(input),
        recordCardPurchase(input),
      ]);
      expect(same[0]).toEqual(same[1]);
      await Promise.all([
        recordCardPurchase({ ...input, clientCommandId: randomUUID() }),
        recordCardPurchase({ ...input, clientCommandId: randomUUID() }),
      ]);
      expect(
        (await getCreditCardDetail({ ...a, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("900000");
      expect((await report(a)).metrics.gross).toBe("900000");
    }));
  it("rolls back postings/activity/audit/receipt/revision as one command", () =>
    fixture(async (a) => {
      const c = await card(a),
        input = purchase(a, c.cardId),
        before = (await getCreditCardDetail({ ...a, cardId: c.cardId }))
          .financialRevision;
      await expect(
        scoped(a, async (_client, t) => {
          await recordCardPurchaseInTransaction(t, input);
          throw new Error("Injected failure");
        }),
      ).rejects.toThrow("Injected failure");
      expect(
        (await getCreditCardDetail({ ...a, cardId: c.cardId }))
          .financialRevision,
      ).toBe(before);
      expect((await getCardActivity({ ...a, cardId: c.cardId })).items).toEqual(
        [],
      );
      await scoped(a, async (client) => {
        expect(
          (
            await client.query(
              "SELECT id FROM core.command_receipt WHERE client_command_id=$1",
              [input.clientCommandId],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (
            await client.query(
              "SELECT id FROM finance.posting WHERE workspace_id=$1",
              [a.workspaceId],
            )
          ).rowCount,
        ).toBe(0);
      });
      await recordCardPurchase(input);
    }));
  it("blocks pending-deletion writes and purges posted card evidence with the approved operator while preserving another owner", () =>
    fixture(async (a, b) => {
      const c = await card(a),
        other = await card(b);
      await recordCardPurchase(purchase(a, c.cardId));
      await recordCardPurchase(purchase(b, other.cardId));
      const requestId = await scoped(
        a,
        async (client) => (await makeDeletionPending(client, a)).requestId,
      );
      await expect(
        recordCardPurchase(purchase(a, c.cardId)),
      ).rejects.toBeInstanceOf(FinancialWriteWorkspaceUnavailableError);
      await expect(
        getCardActivity({ ...a, cardId: c.cardId }),
      ).rejects.toBeInstanceOf(CreditCardUnavailableError);
      const env = parseEnv(readFileSync(".env.bootstrap", "utf8")),
        url = new URL(process.env.DATABASE_URL!);
      url.username = "lifecycle_operator";
      url.password = env.LIFECYCLE_OPERATOR_PASSWORD!;
      const operator = new Client({ connectionString: url.toString() }),
        adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
      adminUrl.pathname = "/personal_management_test";
      const admin = new Client({ connectionString: adminUrl.toString() });
      await operator.connect();
      await admin.connect();
      try {
        await admin.query("BEGIN");
        await admin.query("SET LOCAL session_replication_role='replica'");
        await admin.query(
          "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_user_id=$2",
          [requestId, a.userId],
        );
        await admin.query("COMMIT");
        for (let n = 0; n < 10; n++)
          if (
            (await purgeDeletionStep(operator, requestId)).state === "completed"
          )
            break;
        expect((await purgeDeletionStep(operator, requestId)).state).toBe(
          "completed",
        );
        expect(
          (
            await admin.query(
              "SELECT id FROM finance.card_activity WHERE workspace_id=$1",
              [a.workspaceId],
            )
          ).rowCount,
        ).toBe(0);
      } finally {
        await operator.end();
        await admin.end();
      }
      expect(
        (await getCreditCardDetail({ ...b, cardId: other.cardId })).card
          .postedOutstandingMinor,
      ).toBe("300000");
    }));
});
