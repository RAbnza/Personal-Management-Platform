import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { afterAll, describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { readDeletionScope } from "@/modules/core/repositories/lifecycle-repository";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import {
  getAuthPool,
  getDomainPool,
  closeRuntimeDatabasePools,
} from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { listCategories } from "@/modules/core/services/list-categories";
import { recordBudgetCommand } from "@/modules/planning/services/budgets";
import {
  getBudget,
  listBudgets,
} from "@/modules/planning/services/read-budgets";
import {
  BudgetConflictError,
  BudgetUnavailableError,
} from "@/modules/planning/domain/budget";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import {
  recordExpense,
  recordCardPurchase,
} from "@/modules/finance/services/record-expense";
import { createCreditCard } from "@/modules/finance/services/credit-cards";
import { recordCardCommand } from "@/modules/finance/services/record-card-command";
import {
  getFinancialActionDetail,
  correctFinancialAction,
  reverseFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import { getFinancialReport } from "@/modules/reporting/services/get-reports";
import { getDashboard } from "@/modules/dashboard/services/get-dashboard";
import { recordRecurringCommand } from "@/modules/planning/services/recurring";
import {
  readBudgetComparisons,
  readBudgetEvidence,
} from "@/modules/planning/repositories/budget-repository";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { enforceDeferredFinancialConstraints } from "@/modules/finance/repositories/financial-write-repository";
type Owner = { userId: string; workspaceId: string };
const label = "V2-C budget fixture";
async function fixture(run: (o: Owner, other: Owner) => Promise<void>) {
  const owners: Owner[] = [];
  try {
    for (let i = 0; i < 2; i++) {
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
async function body(o: Owner) {
  const categories = await listCategories({ ...o, kind: "expense" });
  return {
    ...o,
    operation: "save" as const,
    clientCommandId: randomUUID(),
    budgetId: null,
    expectedVersion: null,
    reason: null,
    fields: {
      categoryId: categories.items[0]!.categoryId,
      startDate: "2026-10-01",
      endDateExclusive: "2026-11-01",
      limitMinor: "10000",
      basis: "net" as const,
      notes: null,
    },
  };
}
async function counts(o: Owner) {
  return withDomainTransaction(
    o,
    async (t) =>
      (
        await t.db.execute<{
          actions: string;
          journals: string;
          postings: string;
          revision: string;
          receipts: string;
          audits: string;
        }>(
          sql`SELECT (SELECT count(*)::text FROM finance.financial_action WHERE workspace_id=${o.workspaceId}::uuid) actions,(SELECT count(*)::text FROM finance.journal WHERE workspace_id=${o.workspaceId}::uuid) journals,(SELECT count(*)::text FROM finance.posting WHERE workspace_id=${o.workspaceId}::uuid) postings,(SELECT count(*)::text FROM core.command_receipt WHERE workspace_id=${o.workspaceId}::uuid) receipts,(SELECT count(*)::text FROM audit.private_revision WHERE workspace_id=${o.workspaceId}::uuid) audits,financial_revision::text revision FROM core.workspace WHERE id=${o.workspaceId}::uuid`,
        )
      ).rows[0]!,
  );
}
afterAll(closeRuntimeDatabasePools);
describe("V2-C budget command integrity", () => {
  it(
    "includes budgets and audit evidence in approved owner deletion while preserving another owner",
    () =>
      fixture(async (o, other) => {
        const b = await body(o),
          saved = await recordBudgetCommand(b),
          kept = await recordBudgetCommand(await body(other));
        const scope = await withDomainTransaction(o, (t) =>
          readDeletionScope(t, o),
        );
        expect(
          scope!.records.some(
            (r) =>
              r.area === "planning" && r.kind === "budget" && r.count === "1",
          ),
        ).toBe(true);
        await expect(
          withDomainTransaction(o, (t) =>
            t.db.execute(
              sql`DELETE FROM planning.budget WHERE workspace_id=${o.workspaceId}::uuid AND id=${saved.budgetId}::uuid`,
            ),
          ),
        ).rejects.toThrow();
        const client = await getDomainPool().connect();
        let deletion;
        try {
          deletion = await runScopedTransactionOnClient(client, o, () =>
            makeDeletionPending(client, o),
          );
        } finally {
          client.release();
        }
        const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!),
          operatorUrl = new URL(process.env.DATABASE_URL!);
        adminUrl.pathname = "/personal_management_test";
        expect(operatorUrl.pathname).toBe("/personal_management_test");
        operatorUrl.username = "lifecycle_operator";
        operatorUrl.password = parseEnv(
          readFileSync(".env.bootstrap", "utf8"),
        ).LIFECYCLE_OPERATOR_PASSWORD!;
        const admin = new Client({ connectionString: adminUrl.toString() }),
          operator = new Client({ connectionString: operatorUrl.toString() });
        await admin.connect();
        await operator.connect();
        try {
          expect(
            (
              await admin.query(
                'SELECT 1 FROM auth."user" WHERE id=$1 AND name=$2 AND email=$3',
                [o.userId, label, `${o.userId}@example.test`],
              )
            ).rowCount,
          ).toBe(1);
          await admin.query("BEGIN");
          await admin.query("SET LOCAL session_replication_role='replica'");
          await admin.query(
            "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_workspace_id=$2",
            [deletion.requestId, o.workspaceId],
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
          expect(
            (
              await admin.query(
                "SELECT id FROM planning.budget WHERE workspace_id=$1",
                [o.workspaceId],
              )
            ).rowCount,
          ).toBe(0);
          expect(
            (
              await admin.query(
                "SELECT id FROM audit.private_revision WHERE workspace_id=$1 AND subject_kind='budget'",
                [o.workspaceId],
              )
            ).rowCount,
          ).toBe(0);
          expect(
            (await getBudget({ ...other, budgetId: kept.budgetId })).budget
              .version,
          ).toBe(1);
        } finally {
          await admin.end();
          await operator.end();
        }
      }),
    15000,
  );
  it("paginates owned budgets and immutable history and rejects out-of-scope cursors", () =>
    fixture(async (o, other) => {
      const b = await body(o),
        a = await recordBudgetCommand(b),
        second = await recordBudgetCommand({
          ...b,
          clientCommandId: randomUUID(),
          fields: {
            ...b.fields,
            startDate: "2026-11-01",
            endDateExclusive: "2026-12-01",
          },
        }),
        foreign = await recordBudgetCommand(await body(other));
      const page = await listBudgets({ ...o, pageSize: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
      const next = await listBudgets({
        ...o,
        pageSize: 1,
        cursor: page.nextCursor!,
      });
      expect(next.items).toHaveLength(1);
      expect(new Set([page.items[0]!.id, next.items[0]!.id])).toEqual(
        new Set([a.budgetId, second.budgetId]),
      );
      expect(next.nextCursor).toBeNull();
      expect(
        (
          await listBudgets({
            ...o,
            startDate: "2026-10-31",
            endDate: "2026-10-31",
          })
        ).items[0]!.id,
      ).toBe(a.budgetId);
      expect(
        (
          await listBudgets({
            ...o,
            startDate: "2026-11-01",
            endDate: "2026-11-01",
          })
        ).items[0]!.id,
      ).toBe(second.budgetId);
      await recordBudgetCommand({
        ...b,
        clientCommandId: randomUUID(),
        budgetId: a.budgetId,
        expectedVersion: 1,
        reason: "Audited version two",
        fields: { ...b.fields, limitMinor: "20000" },
      });
      const detail = await getBudget({ ...o, budgetId: a.budgetId }),
        earlier = await getBudget({
          ...o,
          budgetId: a.budgetId,
          historyCursor: detail.history.items[0]!.id,
        });
      expect(earlier.history.items.map((x) => x.version)).toEqual([1]);
      const foreignHistory = (
        await getBudget({ ...other, budgetId: foreign.budgetId })
      ).history.items[0]!.id;
      expect(
        (
          await getBudget({
            ...o,
            budgetId: a.budgetId,
            historyCursor: foreignHistory,
          })
        ).history.items,
      ).toHaveLength(0);
      const catalog = await withDomainTransaction(o, (t) =>
        t.db.execute<{
          forced: boolean;
          enabled: boolean;
          auth: boolean;
          worker: boolean;
          queue: boolean;
          appDelete: boolean;
        }>(
          sql`SELECT relforcerowsecurity forced,relrowsecurity enabled,has_table_privilege('auth_adapter','planning.budget','SELECT') auth,has_table_privilege('worker_domain','planning.budget','SELECT') worker,has_table_privilege('queue_broker','planning.budget','SELECT') queue,has_table_privilege('app_domain','planning.budget','DELETE') AS "appDelete" FROM pg_class WHERE oid='planning.budget'::regclass`,
        ),
      );
      expect(catalog.rows[0]).toEqual({
        forced: true,
        enabled: true,
        auth: false,
        worker: false,
        queue: false,
        appDelete: false,
      });
    }));
  it("rejects a stale repeatable-read SQL writer after a competing budget commits", () =>
    fixture(async (o) => {
      const b = await body(o),
        c = await getDomainPool().connect();
      try {
        await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await c.query(
          "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
          [o.userId, o.workspaceId],
        );
        await c.query(
          "SELECT financial_revision FROM core.workspace WHERE id=$1",
          [o.workspaceId],
        );
        await recordBudgetCommand(b);
        const receipt = randomUUID();
        await expect(
          (async () => {
            await c.query(
              "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,'planning.budget.save',$4)",
              [receipt, o.workspaceId, randomUUID(), Buffer.alloc(32, 8)],
            );
            return c.query(
              "INSERT INTO planning.budget(workspace_id,category_id,start_date,end_date_exclusive,limit_minor,command_receipt_id,recorded_by_user_id) VALUES($1,$2,'2026-10-01','2026-11-01',0,$3,$4)",
              [o.workspaceId, b.fields.categoryId, receipt, o.userId],
            );
          })(),
        ).rejects.toMatchObject({ code: "40001" });
      } finally {
        await c.query("ROLLBACK");
        c.release();
      }
      expect((await listBudgets(o)).items).toHaveLength(1);
    }));
  it("preserves expense-category membership and retains renamed/archived comparison evidence", () =>
    fixture(async (o) => {
      const b = await body(o),
        saved = await recordBudgetCommand(b),
        before = await counts(o);
      await expect(
        withDomainTransaction(o, (t) =>
          t.db.execute(
            sql`UPDATE core.category SET kind='income' WHERE workspace_id=${o.workspaceId}::uuid AND id=${b.fields.categoryId}::uuid`,
          ),
        ),
      ).rejects.toThrow();
      expect(await counts(o)).toEqual(before);
      await withDomainTransaction(o, (t) =>
        t.db.execute(
          sql`UPDATE core.category SET name='Renamed historical category',archived_at=clock_timestamp() WHERE workspace_id=${o.workspaceId}::uuid AND id=${b.fields.categoryId}::uuid`,
        ),
      );
      const view = await getBudget({ ...o, budgetId: saved.budgetId });
      expect(view.budget.categoryName).toBe("Renamed historical category");
      expect(view.budget.categoryArchived).toBe(true);
      expect(view.history.items).toHaveLength(1);
      await expect(
        recordBudgetCommand({
          ...b,
          clientCommandId: randomUUID(),
          fields: {
            ...b.fields,
            startDate: "2026-11-01",
            endDateExclusive: "2026-12-01",
          },
        }),
      ).rejects.toBeInstanceOf(BudgetUnavailableError);
      await recordBudgetCommand({
        ...b,
        clientCommandId: randomUUID(),
        budgetId: saved.budgetId,
        expectedVersion: 1,
        reason: "Adjust retained historical category",
        fields: { ...b.fields, limitMinor: "20000" },
      });
      expect(
        (await getBudget({ ...o, budgetId: saved.budgetId })).budget
          .limit_minor,
      ).toBe("20000");
    }));
  it(
    "derives purchase/charge/refund comparisons by actual transaction date and follows corrections without rewriting budgets",
    () =>
      fixture(async (o) => {
        const b = await body(o),
          categoryId = b.fields.categoryId,
          otherCategory = (
            await listCategories({ ...o, kind: "expense" })
          ).items.find((c) => c.categoryId !== categoryId)!.categoryId,
          account = await openFinancialAccount({
            ...o,
            clientCommandId: randomUUID(),
            name: "Budget cash",
            accountType: "checking",
            openingCutoffDate: "2026-09-01",
            openingBalanceMinor: "1000000",
          }),
          card = await createCreditCard({
            ...o,
            clientCommandId: randomUUID(),
            name: "Budget Visa",
            issuerName: "Provider",
          }),
          cash = await recordExpense({
            ...o,
            clientCommandId: randomUUID(),
            fundingAccountId: account.accountId,
            effectiveDate: "2026-10-03",
            purchaseMinor: "2000",
            splits: [
              { amountMinor: "1000", categoryId },
              { amountMinor: "1000", categoryId: otherCategory },
            ],
            description: "Split cash purchase",
          }),
          earlier = await recordCardPurchase({
            ...o,
            clientCommandId: randomUUID(),
            cardId: card.cardId,
            effectiveDate: "2026-09-30",
            postingDate: "2026-10-01",
            purchaseMinor: "5000",
            splits: [{ amountMinor: "5000", categoryId }],
            description: "Previous-period purchase",
          }),
          current = await recordCardPurchase({
            ...o,
            clientCommandId: randomUUID(),
            cardId: card.cardId,
            effectiveDate: "2026-10-05",
            postingDate: "2026-10-06",
            purchaseMinor: "3000",
            splits: [{ amountMinor: "3000", categoryId }],
            description: "Current card purchase",
          });
        for (const actionKind of ["card_fee", "card_interest"] as const)
          await recordCardCommand({
            ...o,
            clientCommandId: randomUUID(),
            actionKind,
            cardId: card.cardId,
            effectiveDate: "2026-10-07",
            postingDate: "2026-10-08",
            amountMinor: actionKind === "card_fee" ? "100" : "200",
            categoryId,
            description: actionKind,
            providerConfirmed: true,
            confirmationSource: "Recorded provider charge",
          });
        await recordCardCommand({
          ...o,
          clientCommandId: randomUUID(),
          actionKind: "card_payment",
          cardId: card.cardId,
          payingAccountId: account.accountId,
          effectiveDate: "2026-10-10",
          postingDate: "2026-10-10",
          amountMinor: "10000",
          description: "Actual liability transfer",
          providerConfirmed: true,
          confirmationSource: "Provider payment",
        });
        const original = await withDomainTransaction(
          o,
          async (t) =>
            (
              await t.db.execute<{ id: string }>(
                sql`SELECT id FROM finance.posting WHERE workspace_id=${o.workspaceId}::uuid AND action_revision_id=${earlier.actionRevisionId}::uuid AND expense_class='gross'`,
              )
            ).rows[0]!,
        );
        await recordCardCommand({
          ...o,
          clientCommandId: randomUUID(),
          actionKind: "card_refund",
          cardId: card.cardId,
          effectiveDate: "2026-10-12",
          postingDate: "2026-10-12",
          amountMinor: "1000",
          purchaseActionId: earlier.actionId,
          refundParts: [
            { originalPurchasePostingId: original.id, amountMinor: "1000" },
          ],
          description: "Actual-period refund",
          providerConfirmed: true,
          confirmationSource: "Provider refund",
        });
        const saved = await recordBudgetCommand(b),
          september = await recordBudgetCommand({
            ...b,
            clientCommandId: randomUUID(),
            fields: {
              ...b.fields,
              startDate: "2026-09-01",
              endDateExclusive: "2026-10-01",
            },
          });
        await recordRecurringCommand({
          ...o,
          operation: "definition",
          clientCommandId: randomUUID(),
          obligationId: null,
          expectedVersion: null,
          reason: null,
          name: "Expected category bill",
          kind: "bill",
          rule: {
            effectiveFrom: "2026-10-01",
            frequency: "monthly",
            intervalCount: 1,
            weekdays: null,
            dayOfMonth: 10,
            shortMonthPolicy: "last_valid_day",
            endsOn: null,
            occurrenceLimit: null,
            expectedMinor: "90000000",
            currency: "PHP",
            categoryId,
            defaultAccountId: account.accountId,
            timezone: "Asia/Manila",
          },
          window: { from: "2026-10-01", through: "2026-10-31" },
        });
        let view = await getBudget({ ...o, budgetId: saved.budgetId });
        expect(view.budget).toMatchObject({
          grossMinor: "4300",
          offsetsMinor: "1000",
          netMinor: "3300",
          remainingMinor: "6700",
        });
        expect(
          (await getBudget({ ...o, budgetId: september.budgetId })).budget
            .netMinor,
        ).toBe("5000");
        const query = {
            period: "custom" as const,
            startDate: "2026-10-01",
            endDate: "2026-10-31",
          },
          report = await getFinancialReport({ ...o, query }),
          dashboard = await getDashboard({ ...o, query });
        expect(report.metrics.net).toBe("4300");
        expect(
          report.budgets.items.find((x) => x.id === saved.budgetId)!.netMinor,
        ).toBe("3300");
        expect(
          dashboard.finance.budgets.items.find((x) => x.id === saved.budgetId)!
            .spendingMinor,
        ).toBe("3300");
        const gross = await recordBudgetCommand({
          ...b,
          clientCommandId: randomUUID(),
          budgetId: saved.budgetId,
          expectedVersion: 1,
          reason: "Explicit gross comparison",
          fields: { ...b.fields, basis: "gross" },
        });
        expect(
          (await getBudget({ ...o, budgetId: saved.budgetId })).budget
            .spendingMinor,
        ).toBe("4300");
        await recordBudgetCommand({
          ...b,
          clientCommandId: randomUUID(),
          budgetId: saved.budgetId,
          expectedVersion: gross.version,
          reason: "Return to net comparison",
        });
        const detail = await getFinancialActionDetail({
          ...o,
          actionId: cash.actionId,
        });
        await correctFinancialAction({
          ...o,
          actionId: cash.actionId,
          clientCommandId: randomUUID(),
          expectedActionRevisionId: detail.current.actionRevisionId,
          expectedFinancialRevision: detail.current.financialRevision,
          reason: "Correct category and historical transaction date",
          replacement: {
            ...detail.replacement!,
            effectiveDate: "2026-09-30",
            splits: [{ amountMinor: "2000", categoryId: otherCategory }],
          } as NonNullable<typeof detail.replacement>,
        });
        view = await getBudget({ ...o, budgetId: saved.budgetId });
        expect(view.budget.netMinor).toBe("2300");
        expect(view.history.items).toHaveLength(3);
        const c = await getFinancialActionDetail({
          ...o,
          actionId: current.actionId,
        });
        await reverseFinancialAction({
          ...o,
          actionId: current.actionId,
          clientCommandId: randomUUID(),
          expectedActionRevisionId: c.current.actionRevisionId,
          expectedFinancialRevision: c.current.financialRevision,
          reason: "Reverse duplicated source purchase",
        });
        view = await getBudget({ ...o, budgetId: saved.budgetId });
        expect(view.budget).toMatchObject({
          grossMinor: "300",
          offsetsMinor: "1000",
          netMinor: "-700",
          remainingMinor: "10700",
          overspentMinor: "0",
          progressBasisPoints: "0",
        });
        expect(view.history.items).toHaveLength(3);
      }),
    20000,
  );
  it("uses complete labelled budget periods for intersecting Reports filters and one repeatable financial snapshot", () =>
    fixture(async (o) => {
      const b = await body(o),
        saved = await recordBudgetCommand(b),
        account = await openFinancialAccount({
          ...o,
          clientCommandId: randomUUID(),
          name: "Snapshot cash",
          accountType: "checking",
          openingCutoffDate: "2026-09-30",
          openingBalanceMinor: "100000",
        });
      const expense = () =>
        recordExpense({
          ...o,
          clientCommandId: randomUUID(),
          fundingAccountId: account.accountId,
          effectiveDate: "2026-10-20",
          purchaseMinor: "1000",
          splits: [{ amountMinor: "1000", categoryId: b.fields.categoryId }],
          description: "Later actual evidence",
        });
      await expense();
      const report = await getFinancialReport({
        ...o,
        query: {
          period: "custom",
          startDate: "2026-10-01",
          endDate: "2026-10-05",
        },
      });
      expect(report.metrics.net).toBe("0");
      expect(report.budgets.items[0]!.spendingMinor).toBe("1000");
      expect(report.budgets.items[0]!.end_date_exclusive).toBe("2026-11-01");
      await withDomainTransaction(
        o,
        async (t) => {
          const first = await readBudgetComparisons(t, o.workspaceId, {
            budgetId: saved.budgetId,
          });
          await expense();
          const second = await readBudgetComparisons(t, o.workspaceId, {
            budgetId: saved.budgetId,
          });
          expect(second.items[0]!.spendingMinor).toBe(
            first.items[0]!.spendingMinor,
          );
        },
        { readOnlySnapshot: true },
      );
      expect(
        (await getBudget({ ...o, budgetId: saved.budgetId })).budget
          .spendingMinor,
      ).toBe("2000");
    }));
  it("independently finalizes valid runtime SQL and rolls back unfinished, nullable or forged audit results", () =>
    fixture(async (o, other) => {
      const b = await body(o),
        before = await counts(o);
      const incomeCategory = (await listCategories({ ...o, kind: "income" }))
          .items[0]!.categoryId,
        foreignCategory = (await body(other)).fields.categoryId;
      async function raw(
        mode: string,
        start = "2026-10-01",
        end = "2026-11-01",
      ) {
        return withDomainTransaction(o, async (t) => {
          const id = randomUUID(),
            receipt = await claimFinancialCommandReceipt(t, {
              workspaceId: o.workspaceId,
              clientCommandId: randomUUID(),
              commandType: "planning.budget.save",
              payloadHash: Buffer.alloc(32, 7),
            });
          if (receipt.kind !== "claimed") throw Error("Unexpected replay");
          await t.db.execute(
            sql`INSERT INTO planning.budget(id,workspace_id,category_id,start_date,end_date_exclusive,limit_minor,basis,command_receipt_id,recorded_by_user_id) VALUES(${id}::uuid,${o.workspaceId}::uuid,${mode === "income-category" ? incomeCategory : mode === "foreign-category" ? foreignCategory : b.fields.categoryId}::uuid,${start}::date,${mode === "empty-period" ? start : end}::date,${mode === "negative-limit" ? -1 : 0},${mode === "invalid-basis" ? "available" : "net"},${receipt.receiptId}::uuid,${mode === "foreign-actor" ? other.userId : o.userId}::uuid)`,
          );
          const after = await readBudgetEvidence(t, o.workspaceId, id);
          if (mode !== "no-audit")
            await createPrivateRevision(t, {
              id: randomUUID(),
              workspaceId: o.workspaceId,
              commandReceiptId: receipt.receiptId,
              subjectKind: "budget",
              subjectId: id,
              subjectVersion: 1,
              operation: "create",
              beforeJson: null,
              afterJson:
                mode === "forged-audit"
                  ? { ...after, limit_minor: "1" }
                  : after,
              reason: null,
              effectiveDate: start,
              recordedByUserId: o.userId,
              actorKind: "user",
              requestId: null,
            });
          if (mode !== "unfinished")
            await completeFinancialCommandReceipt(t, {
              workspaceId: o.workspaceId,
              receiptId: receipt.receiptId,
              result: {
                budgetId: id,
                version: 1,
                reason: null,
                financialRevision:
                  mode === "null-result"
                    ? null
                    : mode === "forged-revision"
                      ? "999999"
                      : mode === "numeric-result"
                        ? Number(after.write_revision)
                        : after.write_revision,
              },
            });
          await enforceDeferredFinancialConstraints(t);
          return id;
        });
      }
      for (const mode of [
        "unfinished",
        "no-audit",
        "forged-audit",
        "null-result",
        "forged-revision",
        "numeric-result",
        "income-category",
        "foreign-category",
        "empty-period",
        "negative-limit",
        "invalid-basis",
        "foreign-actor",
      ])
        await expect(raw(mode)).rejects.toThrow();
      expect(await counts(o)).toEqual(before);
      expect((await listBudgets(o)).items).toHaveLength(0);
      const id = await raw("valid");
      expect((await getBudget({ ...o, budgetId: id })).budget.limit_minor).toBe(
        "0",
      );
      const concurrent = await Promise.allSettled([
        raw("valid", "2026-11-01", "2026-12-01"),
        raw("valid", "2026-11-01", "2026-12-01"),
      ]);
      expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(
        1,
      );
      expect(concurrent.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect((await listBudgets(o)).items).toHaveLength(2);
    }));
  it("stores zero/large limits, permanent replay and immutable audited changes without financial effects", () =>
    fixture(async (o) => {
      const b = await body(o),
        before = await counts(o),
        created = await recordBudgetCommand(b);
      expect(await recordBudgetCommand(b)).toEqual(created);
      const changed = await recordBudgetCommand({
        ...b,
        clientCommandId: randomUUID(),
        budgetId: created.budgetId,
        expectedVersion: 1,
        reason: "Explicit zero limit",
        fields: { ...b.fields, limitMinor: "0" },
      });
      const view = await getBudget({ ...o, budgetId: created.budgetId });
      expect(view.budget.remainingMinor).toBe("0");
      expect(view.budget.progressBasisPoints).toBeNull();
      expect(view.history.items).toHaveLength(2);
      expect(view.history.items[0]!.before!.limit_minor).toBe("10000");
      await recordBudgetCommand({
        ...b,
        clientCommandId: randomUUID(),
        budgetId: created.budgetId,
        expectedVersion: changed.version,
        reason: "Supported large allowance",
        fields: { ...b.fields, limitMinor: "9223372036854775807" },
      });
      const after = await counts(o);
      expect({
        actions: after.actions,
        journals: after.journals,
        postings: after.postings,
      }).toEqual({
        actions: before.actions,
        journals: before.journals,
        postings: before.postings,
      });
      expect(BigInt(after.revision) - BigInt(before.revision)).toBe(3n);
    }));
  it("rejects exact/partial/containing overlaps, allows adjacency, and retains archived period integrity", () =>
    fixture(async (o) => {
      const b = await body(o),
        saved = await recordBudgetCommand(b);
      for (const f of [
        {},
        { startDate: "2026-10-15", endDateExclusive: "2026-11-15" },
        { startDate: "2026-09-01", endDateExclusive: "2026-12-01" },
      ])
        await expect(
          recordBudgetCommand({
            ...b,
            clientCommandId: randomUUID(),
            fields: { ...b.fields, ...f },
          }),
        ).rejects.toBeInstanceOf(BudgetConflictError);
      await recordBudgetCommand({
        ...b,
        clientCommandId: randomUUID(),
        fields: {
          ...b.fields,
          startDate: "2026-11-01",
          endDateExclusive: "2026-12-01",
        },
      });
      await recordBudgetCommand({
        ...o,
        operation: "archive",
        clientCommandId: randomUUID(),
        budgetId: saved.budgetId,
        expectedVersion: 1,
        reason: "Hide this comparison",
      });
      expect((await listBudgets(o)).items).toHaveLength(1);
      expect(
        (await listBudgets({ ...o, includeArchived: "true" })).items,
      ).toHaveLength(2);
      await expect(
        recordBudgetCommand({ ...b, clientCommandId: randomUUID() }),
      ).rejects.toBeInstanceOf(BudgetConflictError);
      await recordBudgetCommand({
        ...o,
        operation: "restore",
        clientCommandId: randomUUID(),
        budgetId: saved.budgetId,
        expectedVersion: 2,
        reason: "Use this comparison again",
      });
      expect(
        (await getBudget({ ...o, budgetId: saved.budgetId })).history.items,
      ).toHaveLength(3);
    }));
  it("serializes competing periods, repeated commands and stale version races", () =>
    fixture(async (o) => {
      const b = await body(o),
        r = await Promise.allSettled([
          recordBudgetCommand(b),
          recordBudgetCommand({ ...b, clientCommandId: randomUUID() }),
        ]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
      const view = (await listBudgets(o)).items[0]!,
        change = {
          ...b,
          budgetId: view.id,
          expectedVersion: 1,
          reason: "Reviewed allowance",
          clientCommandId: randomUUID(),
          fields: { ...b.fields, limitMinor: "20000" },
        };
      const replay = await Promise.all([
        recordBudgetCommand(change),
        recordBudgetCommand(change),
      ]);
      expect(replay[0]).toEqual(replay[1]);
      const stale = {
          ...change,
          expectedVersion: 2,
          clientCommandId: randomUUID(),
        },
        versions = await Promise.allSettled([
          recordBudgetCommand(stale),
          recordBudgetCommand({
            ...stale,
            clientCommandId: randomUUID(),
            fields: { ...b.fields, limitMinor: "30000" },
          }),
        ]);
      expect(versions.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    }));
  it("enforces forced RLS, foreign category/detail isolation and restricted roles", () =>
    fixture(async (o, other) => {
      const b = await body(o),
        saved = await recordBudgetCommand(b),
        foreign = await body(other);
      await expect(
        recordBudgetCommand({
          ...b,
          clientCommandId: randomUUID(),
          fields: foreign.fields,
        }),
      ).rejects.toBeInstanceOf(BudgetUnavailableError);
      await expect(
        getBudget({ ...other, budgetId: saved.budgetId }),
      ).rejects.toBeInstanceOf(BudgetUnavailableError);
      expect(
        (await getDomainPool().query("SELECT id FROM planning.budget")).rows,
      ).toHaveLength(0);
      await expect(
        getAuthPool().query("SELECT id FROM planning.budget"),
      ).rejects.toThrow();
      expect((await listBudgets(other)).items).toHaveLength(0);
    }));
});
