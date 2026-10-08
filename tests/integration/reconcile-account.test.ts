import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ScopedTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  removeProvisionedTestUser,
  type ProvisionedTestUser,
} from "./helpers/provisioned-test-user";
import { FinancialAccountNotFoundError } from "@/modules/finance/services/get-account-history";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import * as repo from "@/modules/finance/repositories/reconciliation-repository";
import { ReconciliationPreviewStaleError } from "@/modules/finance/domain/reconciliation";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import {
  adjustAccountBalanceInTransaction,
  getAccountReconciliationSetupInTransaction,
  reconcileAccountInTransaction,
  type AdjustAccountInput,
  type ReconcileAccountInput,
} from "@/modules/finance/services/reconcile-account";
import { getAccountHistoryInTransaction } from "@/modules/finance/services/get-account-history";
import { listFinancialAccountsInTransaction } from "@/modules/finance/services/list-financial-accounts";
import * as writes from "@/modules/finance/repositories/financial-write-repository";
import {
  payment,
  withFixture,
  type DebtFixture,
  fixture,
  scoped,
  action,
  finish,
} from "./helpers/debt-payment-fixture";
const foreignRoots: ProvisionedTestUser[] = [];
afterAll(async () => {
  for (const root of foreignRoots)
    await removeProvisionedTestUser(root, "d11-reconciliation-test-cleanup");
  await closeRuntimeDatabasePools();
});
const tx = (c: PoolClient) =>
  ({ db: drizzle({ client: c }) }) as ScopedTransaction;
const scope = (f: DebtFixture) => ({
  userId: f.userId,
  workspaceId: f.workspaceId,
  financialAccountId: f.accountId,
});
const setup = (c: PoolClient, f: DebtFixture) =>
  getAccountReconciliationSetupInTransaction(tx(c), scope(f));
async function comparison(
  c: PoolClient,
  f: DebtFixture,
  observedMinor = "0",
  cutoffDate = "2026-10-08",
): Promise<ReconcileAccountInput> {
  const s = await setup(c, f);
  return {
    ...scope(f),
    clientCommandId: randomUUID(),
    expectedFinancialRevision: s.financialRevision,
    expectedAccountVersion: s.account.version,
    cutoffDate,
    observedMinor,
  };
}
async function adjustment(
  c: PoolClient,
  f: DebtFixture,
  signedAdjustmentMinor = "100",
  reconciliationId: string | null = null,
): Promise<AdjustAccountInput> {
  const s = await setup(c, f);
  return {
    ...scope(f),
    clientCommandId: randomUUID(),
    expectedFinancialRevision: s.financialRevision,
    expectedAccountVersion: s.account.version,
    effectiveDate: "2026-10-08",
    signedAdjustmentMinor,
    reason: "Unexplained statement difference",
    reconciliationId,
  };
}
describe("D11 reconciliation and explicit adjustments", () => {
  it("includes end-of-day opening evidence and signed balances exactly", () =>
    withFixture(async (c, f) => {
      const a = await openFinancialAccountInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        name: "Opening account",
        accountType: "checking",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "90071992500",
      });
      const r = await repo.readAccountBalanceAt(tx(c), {
        workspaceId: f.workspaceId,
        financialAccountId: a.accountId,
        cutoffDate: "2026-09-30",
      });
      expect(r.calculatedMinor).toBe("90071992500");
      expect(r.sourceJournalCount).toBe("1");
      await expect(
        reconcileAccountInTransaction(tx(c), {
          ...(await comparison(c, f)),
          cutoffDate: "2026-09-29",
        }),
      ).rejects.toThrow("opening cutoff");
    }));
  it("unrelated account activity does not invalidate verified comparisons", () =>
    withFixture(async (c, f) => {
      await reconcileAccountInTransaction(tx(c), await comparison(c, f));
      const other = await fixture(c, {
        userId: f.userId,
        workspaceId: f.workspaceId,
      });
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      await adjustAccountBalanceInTransaction(
        tx(c),
        await adjustment(c, other),
      );
      expect((await setup(c, f)).history[0]?.status).toBe("verified");
    }));
  it("preserves partial adjustment difference and requires cutoff-applicable dates", () =>
    withFixture(async (c, f) => {
      const r = await reconcileAccountInTransaction(
        tx(c),
        await comparison(c, f, "200"),
      );
      await expect(
        adjustAccountBalanceInTransaction(tx(c), {
          ...(await adjustment(c, f, "100", r.reconciliationId)),
          effectiveDate: "2026-10-09",
        }),
      ).rejects.toThrow("cutoff");
      expect(
        (
          await adjustAccountBalanceInTransaction(
            tx(c),
            await adjustment(c, f, "100", r.reconciliationId),
          )
        ).preview.reconciliation?.differenceAfterMinor,
      ).toBe("100");
    }));
  it("backdated reversal/replacement invalidates a comparison even when the balance is unchanged", () =>
    withFixture(async (c, f) => {
      const created = await recordIncomeInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        amountMinor: "100",
        incomeClass: "earned",
        description: "Actual receipt",
      });
      await reconcileAccountInTransaction(tx(c), await comparison(c, f, "100"));
      const journal = (
        await c.query(
          "SELECT id FROM finance.journal WHERE workspace_id=$1 AND action_revision_id=$2",
          [f.workspaceId, created.actionRevisionId],
        )
      ).rows[0];
      const previous = {
        actionId: created.actionId,
        revisionId: created.actionRevisionId,
        receiptId: randomUUID(),
        journalId: journal.id as string,
        revisionNo: 1,
      };
      const revised = await action(
        c,
        f,
        "income",
        previous,
        "replace",
        "2026-10-08",
      );
      await c.query(
        "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,category_id,expense_class,income_class,cash_flow_kind,cash_flow_direction) SELECT workspace_id,$1,$2,$3,ledger_account_id,currency,line_no,amount_minor,category_id,expense_class,income_class,cash_flow_kind,cash_flow_direction FROM finance.posting WHERE workspace_id=$4 AND action_revision_id=$5",
        [
          revised.actionId,
          revised.revisionId,
          revised.journalId,
          f.workspaceId,
          created.actionRevisionId,
        ],
      );
      await c.query(
        "INSERT INTO finance.receipt_detail(workspace_id,action_id,action_revision_id,receiving_account_id,actual_received_minor) VALUES($1,$2,$3,$4,100)",
        [f.workspaceId, revised.actionId, revised.revisionId, f.accountId],
      );
      await finish(c, f, revised);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      expect((await setup(c, f)).history[0]).toMatchObject({
        calculatedMinor: "100",
        currentCalculatedMinor: "100",
        sourceJournalCount: "1",
        currentSourceJournalCount: "3",
        status: "needs_review",
      });
      const history = await getAccountHistoryInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        accountId: f.accountId,
      });
      expect(history.account.currentBalanceMinor).toBe("100");
      expect(history.entries).toHaveLength(3);
    }));
  it("rejects real foreign account/comparison references and isolates RLS evidence", () =>
    withFixture(async (c, f) => {
      const userId = randomUUID();
      await getAuthPool().query(
        "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'D11 foreign',$2,true)",
        [userId, `d11-${userId}@example.test`],
      );
      const workspace = await provisionPersonalWorkspace({
        userId,
        displayName: "D11 foreign",
      });
      const identity = { userId, workspaceId: workspace.workspaceId };
      foreignRoots.push(identity);
      await scoped(c, identity);
      const other = await fixture(c, identity);
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const observed = await reconcileAccountInTransaction(
        tx(c),
        await comparison(c, other, "100"),
      );
      await scoped(c, f);
      await expect(
        getAccountReconciliationSetupInTransaction(tx(c), {
          ...scope(f),
          financialAccountId: other.accountId,
        }),
      ).rejects.toBeInstanceOf(FinancialAccountNotFoundError);
      await expect(
        reconcileAccountInTransaction(tx(c), {
          ...(await comparison(c, f)),
          financialAccountId: other.accountId,
        }),
      ).rejects.toBeInstanceOf(FinancialAccountNotFoundError);
      await expect(
        adjustAccountBalanceInTransaction(tx(c), {
          ...(await adjustment(c, f)),
          financialAccountId: other.accountId,
        }),
      ).rejects.toBeInstanceOf(FinancialAccountNotFoundError);
      await expect(
        adjustAccountBalanceInTransaction(
          tx(c),
          await adjustment(c, f, "100", observed.reconciliationId),
        ),
      ).rejects.toThrow("unavailable");
      expect(
        (
          await c.query("SELECT id FROM finance.reconciliation WHERE id=$1", [
            observed.reconciliationId,
          ])
        ).rows,
      ).toEqual([]);
    }));
  it("database rejects a forged calculated snapshot and rolls back comparison receipt", () =>
    withFixture(async (c, f) => {
      const b = await comparison(c, f);
      await c.query("SAVEPOINT forged_comparison");
      const original = repo.insertReconciliation;
      const spy = vi
        .spyOn(repo, "insertReconciliation")
        .mockImplementationOnce((t, v) =>
          original(t, { ...v, calculatedMinor: 1n }),
        );
      try {
        await expect(
          reconcileAccountInTransaction(tx(c), b),
        ).rejects.toMatchObject({
          cause: expect.objectContaining({ code: "23514" }),
        });
      } finally {
        spy.mockRestore();
        await c.query("ROLLBACK TO SAVEPOINT forged_comparison");
      }
      expect((await setup(c, f)).history).toEqual([]);
      expect(
        (await reconcileAccountInTransaction(tx(c), b)).preview.status,
      ).toBe("verified");
    }));
  it("database rejects duplicate cash/equity pairs despite a balanced journal", () =>
    withFixture(async (c, f) => {
      const b = await adjustment(c, f);
      await c.query("SAVEPOINT duplicate_cash");
      const original = repo.insertAccountAdjustment;
      const spy = vi
        .spyOn(repo, "insertAccountAdjustment")
        .mockImplementationOnce(async (t, v) => {
          const ids = await original(t, v);
          await c.query(
            "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,cash_flow_kind,cash_flow_direction) SELECT workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no+2,amount_minor,cash_flow_kind,cash_flow_direction FROM finance.posting WHERE workspace_id=$1 AND action_revision_id=$2",
            [f.workspaceId, ids.actionRevisionId],
          );
          return ids;
        });
      try {
        await expect(
          adjustAccountBalanceInTransaction(tx(c), b),
        ).rejects.toMatchObject({
          cause: expect.objectContaining({ code: "23514" }),
        });
      } finally {
        spy.mockRestore();
        await c.query("ROLLBACK TO SAVEPOINT duplicate_cash");
      }
      expect((await setup(c, f)).account.currentBalanceMinor).toBe("0");
    }));
  it("immutable comparison and adjustment evidence deny ordinary update/delete", () =>
    withFixture(async (c, f) => {
      const r = await reconcileAccountInTransaction(
        tx(c),
        await comparison(c, f),
      );
      const a = await adjustAccountBalanceInTransaction(
        tx(c),
        await adjustment(c, f),
      );
      for (const [table, id] of [
        ["reconciliation", r.reconciliationId],
        ["adjustment_detail", a.adjustmentId],
      ]) {
        await c.query("SAVEPOINT immutable_evidence");
        await expect(
          c.query(`UPDATE finance.${table} SET id=id WHERE id=$1`, [id]),
        ).rejects.toMatchObject({ code: "42501" });
        await c.query("ROLLBACK TO SAVEPOINT immutable_evidence");
        await expect(
          c.query(`DELETE FROM finance.${table} WHERE id=$1`, [id]),
        ).rejects.toMatchObject({ code: "42501" });
        await c.query("ROLLBACK TO SAVEPOINT immutable_evidence");
      }
    }));
  it.each([
    ["0", "verified"],
    ["100", "difference"],
    ["-100", "difference"],
  ])(
    "records %s without posting or automatically adjusting",
    async (observed, status) =>
      withFixture(async (c, f) => {
        const b = await comparison(c, f, observed),
          before = await c.query(
            "SELECT count(*) FROM finance.posting WHERE workspace_id=$1",
            [f.workspaceId],
          );
        const r = await reconcileAccountInTransaction(tx(c), b);
        expect(r.preview).toMatchObject({
          status,
          differenceMinor: observed,
          calculatedMinor: "0",
          sourceJournalCount: "0",
        });
        const s = await setup(c, f);
        expect(s.financialRevision).toBe(b.expectedFinancialRevision);
        expect(s.account.currentBalanceMinor).toBe("0");
        expect(s.history[0]!.status).toBe(status);
        expect(
          (
            await c.query(
              "SELECT count(*) FROM finance.posting WHERE workspace_id=$1",
              [f.workspaceId],
            )
          ).rows,
        ).toEqual(before.rows);
      }),
  );
  it.each(["100", "-100"])(
    "posts %s against adjustment equity once; balances/history/report classifications agree",
    async (amount) =>
      withFixture(async (c, f) => {
        const r = await reconcileAccountInTransaction(
          tx(c),
          await comparison(c, f, amount),
        );
        const b = {
          ...(await adjustment(c, f, amount, r.reconciliationId)),
          acknowledgeNegativeBalance: true,
        };
        const saved = await adjustAccountBalanceInTransaction(tx(c), b);
        expect(saved.preview.reconciliation?.differenceAfterMinor).toBe("0");
        const lines = await c.query(
          "SELECT l.kind,p.amount_minor::text,p.cash_flow_kind,p.expense_class,p.income_class FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=$1 AND p.action_revision_id=$2 ORDER BY p.line_no",
          [f.workspaceId, saved.actionRevisionId],
        );
        expect(lines.rows).toEqual([
          {
            kind: "cash_asset",
            amount_minor: amount,
            cash_flow_kind: "adjustment",
            expense_class: "none",
            income_class: "none",
          },
          {
            kind: "adjustment_equity",
            amount_minor: (-BigInt(amount)).toString(),
            cash_flow_kind: "none",
            expense_class: "none",
            income_class: "none",
          },
        ]);
        const list = await listFinancialAccountsInTransaction(tx(c), {
          userId: f.userId,
          workspaceId: f.workspaceId,
        });
        const history = await getAccountHistoryInTransaction(tx(c), {
          userId: f.userId,
          workspaceId: f.workspaceId,
          accountId: f.accountId,
        });
        expect(
          list.items.find((a) => a.accountId === f.accountId)
            ?.currentBalanceMinor,
        ).toBe(amount);
        expect(history.account.currentBalanceMinor).toBe(amount);
        expect(
          history.entries.filter((e) => e.actionId === saved.actionId),
        ).toHaveLength(1);
        const s = await setup(c, f);
        expect(s.history[0]).toMatchObject({
          status: "needs_review",
          calculatedMinor: "0",
          currentCalculatedMinor: amount,
          needsReview: true,
        });
        expect(s.history[0]!.adjustments).toHaveLength(1);
        expect(await adjustAccountBalanceInTransaction(tx(c), b)).toEqual(
          saved,
        );
        const verified = await reconcileAccountInTransaction(tx(c), {
          ...(await comparison(c, f, amount)),
          supersedesReconciliationId: r.reconciliationId,
        });
        expect(verified.preview.status).toBe("verified");
        expect(
          (await setup(c, f)).history.find(
            (h) => h.reconciliationId === r.reconciliationId,
          )?.status,
        ).toBe("superseded");
      }),
  );
  it("invalidates a verified comparison on a backdated financial write", async () =>
    withFixture(async (c, f) => {
      const r = await reconcileAccountInTransaction(
        tx(c),
        await comparison(c, f),
      );
      await payment(c, f);
      expect(
        (await setup(c, f)).history.find(
          (h) => h.reconciliationId === r.reconciliationId,
        ),
      ).toMatchObject({
        status: "needs_review",
        currentCalculatedMinor: "-400",
        calculatedMinor: "0",
      });
    }));
  it("does not invalidate a cutoff for later dated activity", async () =>
    withFixture(async (c, f) => {
      await reconcileAccountInTransaction(
        tx(c),
        await comparison(c, f, "0", "2026-10-07"),
      );
      await payment(c, f);
      expect((await setup(c, f)).history[0]).toMatchObject({
        status: "verified",
        needsReview: false,
        currentCalculatedMinor: "0",
      });
    }));
  it("detects a net-zero subsequent change by source version", async () =>
    withFixture(async (c, f) => {
      await reconcileAccountInTransaction(tx(c), await comparison(c, f));
      await adjustAccountBalanceInTransaction(
        tx(c),
        await adjustment(c, f, "100"),
      );
      await adjustAccountBalanceInTransaction(
        tx(c),
        await adjustment(c, f, "-100"),
      );
      expect((await setup(c, f)).history[0]).toMatchObject({
        status: "needs_review",
        currentCalculatedMinor: "0",
        currentSourceJournalCount: "2",
      });
    }));
  it("replays the original immutable comparison after subsequent writes, rejects changed payload", async () =>
    withFixture(async (c, f) => {
      const b = await comparison(c, f),
        r = await reconcileAccountInTransaction(tx(c), b);
      await adjustAccountBalanceInTransaction(tx(c), await adjustment(c, f));
      expect(await reconcileAccountInTransaction(tx(c), b)).toEqual(r);
      await expect(
        reconcileAccountInTransaction(tx(c), { ...b, observedMinor: "1" }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
    }));
  it("rejects stale versions, missing negative acknowledgement and invalid dates", async () =>
    withFixture(async (c, f) => {
      const b = await adjustment(c, f);
      await adjustAccountBalanceInTransaction(tx(c), b);
      await expect(
        adjustAccountBalanceInTransaction(tx(c), {
          ...b,
          clientCommandId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(ReconciliationPreviewStaleError);
      await expect(
        adjustAccountBalanceInTransaction(
          tx(c),
          await adjustment(c, f, "-200"),
        ),
      ).rejects.toThrow("Acknowledge");
      await expect(
        adjustAccountBalanceInTransaction(tx(c), {
          ...(await adjustment(c, f)),
          effectiveDate: "2026-09-30",
        }),
      ).rejects.toThrow("opening cutoff");
    }));
  it("rejects stale linked comparisons even with a fresh workspace version", async () =>
    withFixture(async (c, f) => {
      const r = await reconcileAccountInTransaction(
        tx(c),
        await comparison(c, f, "100"),
      );
      await adjustAccountBalanceInTransaction(
        tx(c),
        await adjustment(c, f, "1"),
      );
      await expect(
        adjustAccountBalanceInTransaction(
          tx(c),
          await adjustment(c, f, "99", r.reconciliationId),
        ),
      ).rejects.toBeInstanceOf(ReconciliationPreviewStaleError);
    }));
  it("rolls back the entire adjustment on a failure before completion, then safely retries", async () =>
    withFixture(async (c, f) => {
      const b = await adjustment(c, f);
      await c.query("SAVEPOINT failed_adjustment");
      const spy = vi
        .spyOn(writes, "advanceWorkspaceFinancialRevision")
        .mockRejectedValueOnce(new Error("Injected rollback"));
      try {
        await expect(
          adjustAccountBalanceInTransaction(tx(c), b),
        ).rejects.toThrow("Injected rollback");
      } finally {
        spy.mockRestore();
        await c.query("ROLLBACK TO SAVEPOINT failed_adjustment");
      }
      expect((await setup(c, f)).account.currentBalanceMinor).toBe("0");
      expect(
        (
          await c.query(
            "SELECT count(*) FROM core.command_receipt WHERE workspace_id=$1 AND client_command_id=$2",
            [f.workspaceId, b.clientCommandId],
          )
        ).rows[0].count,
      ).toBe("0");
      expect(
        (await adjustAccountBalanceInTransaction(tx(c), b)).preview
          .currentBalanceAfterMinor,
      ).toBe("100");
    }));
});
