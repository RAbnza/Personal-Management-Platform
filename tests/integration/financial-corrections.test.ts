import { projectReplacementIntent } from "@/modules/finance/domain/financial-correction";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import type { ScopedTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools } from "@/platform/db/pools";
import { withFixture } from "./helpers/debt-payment-fixture";
import { recordExpenseInTransaction } from "@/modules/finance/services/record-expense";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
import { recordTransferInTransaction } from "@/modules/finance/services/record-transfer";
import { recordRefundInTransaction } from "@/modules/finance/services/record-refund";
import {
  correctFinancialActionInTransaction,
  getFinancialActionDetailInTransaction,
  reverseFinancialActionInTransaction,
} from "@/modules/finance/services/correct-financial-action";
import { recordDebtPaymentInTransaction } from "@/modules/finance/services/record-debt-payment";
import { recordBorrowingInTransaction } from "@/modules/finance/services/record-borrowing";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import {
  reconcileAccountInTransaction,
  adjustAccountBalanceInTransaction,
} from "@/modules/finance/services/reconcile-account";
import {
  readAccountBalanceAt,
  readReconciliationHistory,
} from "@/modules/finance/repositories/reconciliation-repository";
import { resolvePaymentClearingInTransaction } from "@/modules/finance/services/resolve-payment-clearing";
import { reviseDebtScheduleInTransaction } from "@/modules/finance/services/revise-debt-schedule";
import { reviseDebtScheduleBodySchema } from "@/modules/finance/domain/debt-schedule-revision";
import { getDebtDetailInTransaction } from "@/modules/finance/services/read-debts";
import { fixture } from "./helpers/debt-payment-fixture";
import { getAuthPool } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";
const tx = (c: PoolClient) =>
  ({ db: drizzle({ client: c }) }) as ScopedTransaction;
afterAll(closeRuntimeDatabasePools);
describe("D12 explicit corrections and refunds", () => {
  it("reviews the historical gap when income is moved to a later date", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const income = await recordIncomeInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-02",
        amountMinor: "1000",
        incomeClass: "earned",
        description: "Income",
      });
      const expense = await recordExpenseInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        purchaseMinor: "500",
        splits: [{ amountMinor: "500" }],
        description: "Purchase",
      });
      const correction = {
        ...actor,
        actionId: income.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: income.actionRevisionId,
        expectedFinancialRevision: expense.financialRevision,
        reason: "Correct income date",
        replacement: {
          actionKind: "income" as const,
          receivingAccountId: f.accountId,
          effectiveDate: "2026-10-10",
          amountMinor: "1000",
          incomeClass: "earned" as const,
          description: "Income",
        },
      };
      await c.query("SAVEPOINT gap_ack");
      await expect(
        correctFinancialActionInTransaction(tx(c), correction),
      ).rejects.toThrow("explicitly acknowledge");
      await c.query("ROLLBACK TO SAVEPOINT gap_ack");
      const corrected = await correctFinancialActionInTransaction(tx(c), {
        ...correction,
        replacement: {
          ...correction.replacement,
          acknowledgeNegativeBalance: true,
        },
      });
      const evidence = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: corrected.actionId,
      });
      expect(evidence.current.evidence.negativeBalanceWarnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            effectiveDate: "2026-10-08",
            afterMinor: "-500",
          }),
        ]),
      );
      const balance = await readAccountBalanceAt(tx(c), {
        workspaceId: f.workspaceId,
        financialAccountId: f.accountId,
        cutoffDate: "2026-10-08",
      });
      expect(balance.calculatedMinor).toBe("-500");
    }));
  it("rebuilds immutable allocation maps after a mapped payment correction and reversal", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const opening = await getDebtDetailInTransaction(tx(c), {
        ...actor,
        debtId: f.debtId,
      });
      const payment = await recordDebtPaymentInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        debtId: f.debtId,
        payingAccountId: f.accountId,
        paymentDate: "2026-10-08",
        scheduleVersionId: f.scheduleId,
        expectedFinancialRevision: opening.financialRevision,
        actualPaidMinor: "400",
        contractualMinor: "400",
        externalFeeMinor: "0",
        allocationCertainty: "known_components",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "unclassified",
            amountMinor: "400",
            label: "Principal",
          },
        ],
        dueAllocations: [
          { installmentId: f.installmentId, amountMinor: "400" },
        ],
        unappliedContractualMinor: "0",
        dueAllocationConfirmed: true,
        confirmationSource: "user",
        description: "Partial payment",
        acknowledgeNegativeBalance: true,
      });
      const detail = await getDebtDetailInTransaction(tx(c), {
        ...actor,
        debtId: f.debtId,
      });
      const prior = detail.installments[0]!;
      const entryKey = randomUUID();
      const allocation = await c.query<{
        id: string;
        payment_revision_id: string;
      }>(
        `SELECT id,payment_revision_id FROM finance.payment_due_allocation WHERE workspace_id=$1`,
        [f.workspaceId],
      );
      const revised = await reviseDebtScheduleInTransaction(tx(c), {
        ...actor,
        ...reviseDebtScheduleBodySchema.parse({
          clientCommandId: randomUUID(),
          debtId: f.debtId,
          expectedDebtVersion: detail.debt.version,
          expectedScheduleVersionId: f.scheduleId,
          expectedFinancialRevision: detail.financialRevision,
          effectiveDate: "2026-10-09",
          revisionKind: "date_correction",
          reason: "Correct due date",
          frequency: "manual",
          entries: [
            {
              entryKey,
              obligationId: prior.obligationId,
              dueDate: "2026-11-20",
              contractualMinor: prior.contractualMinor,
              knownPrincipalMinor: prior.knownPrincipalMinor,
              knownInterestMinor: prior.knownInterestMinor,
              knownFeeMinor: prior.knownFeeMinor,
              breakdownComplete: prior.breakdownComplete,
            },
          ],
          mappings: [
            {
              paymentRevisionId: allocation.rows[0]!.payment_revision_id,
              sourceAllocationId: allocation.rows[0]!.id,
              targetEntryKey: entryKey,
              amountMinor: "400",
            },
          ],
          allocationMappingConfirmed: true,
        }),
      });
      const oldMaps = (
        await c.query(
          `SELECT id,amount_minor::text FROM finance.schedule_allocation_map WHERE workspace_id=$1 AND target_schedule_version_id=$2 ORDER BY id`,
          [f.workspaceId, revised.scheduleVersionId],
        )
      ).rows;
      const proposal = (
        await getFinancialActionDetailInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          actionId: payment.actionId,
        })
      ).replacement;
      if (proposal?.actionKind !== "debt_payment")
        throw new Error("Expected payment proposal");
      const command = {
        ...actor,
        actionId: payment.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: payment.actionRevisionId,
        expectedFinancialRevision: revised.financialRevision,
        reason: "Correct paid amount",
        replacement: {
          ...proposal,
          actualPaidMinor: "300",
          contractualMinor: "300",
          components: [
            {
              disposition: "liability_reduction" as const,
              liabilityComponent: "unclassified" as const,
              amountMinor: "300",
              label: "Principal",
            },
          ],
          dueAllocations: [
            { ...proposal.dueAllocations[0]!, amountMinor: "300" },
          ],
          acknowledgeNegativeBalance: true,
        },
      };
      const corrected = await correctFinancialActionInTransaction(
        tx(c),
        command,
      );
      expect(await correctFinancialActionInTransaction(tx(c), command)).toEqual(
        corrected,
      );
      const after = await getDebtDetailInTransaction(tx(c), {
        ...actor,
        debtId: f.debtId,
      });
      expect(after.debt.scheduleVersionId).not.toBe(revised.scheduleVersionId);
      expect(after.installments[0]).toMatchObject({
        obligationId: prior.obligationId,
        openingSatisfiedMinor: prior.openingSatisfiedMinor,
        paymentSatisfiedMinor: "300",
        remainingMinor: "700",
      });
      expect(
        (
          await c.query(
            `SELECT id,amount_minor::text FROM finance.schedule_allocation_map WHERE workspace_id=$1 AND target_schedule_version_id=$2 ORDER BY id`,
            [f.workspaceId, revised.scheduleVersionId],
          )
        ).rows,
      ).toEqual(oldMaps);
      expect(
        (
          await c.query(
            `SELECT revision_kind FROM finance.debt_schedule_version WHERE workspace_id=$1 AND id=$2`,
            [f.workspaceId, after.debt.scheduleVersionId],
          )
        ).rows[0].revision_kind,
      ).toBe("allocation_correction");
      await reverseFinancialActionInTransaction(tx(c), {
        ...actor,
        actionId: payment.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: corrected.actionRevisionId,
        expectedFinancialRevision: corrected.financialRevision,
        reason: "Payment never occurred",
        acknowledgeNegativeBalance: true,
      });
      const reversed = await getDebtDetailInTransaction(tx(c), {
        ...actor,
        debtId: f.debtId,
      });
      expect(reversed.installments[0]?.remainingMinor).toBe("1000");
      expect(
        (
          await c.query(
            `SELECT sum(amount_minor::numeric)::text AS amount FROM finance.posting WHERE workspace_id=$1 AND ledger_account_id=$2`,
            [f.workspaceId, f.cashId],
          )
        ).rows[0].amount,
      ).toBe("0");
    }));
  it("limits repeated refunds per original line as well as current category budget", () =>
    withFixture(async (c, f) => {
      const actor = { userId: f.userId, workspaceId: f.workspaceId };
      const purchase = await recordExpenseInTransaction(tx(c), {
        ...actor,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-02",
        purchaseMinor: "1000",
        splits: [{ amountMinor: "500" }, { amountMinor: "500" }],
        description: "Two same-category portions",
        acknowledgeNegativeBalance: true,
      });
      const source = (
        await getFinancialActionDetailInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          actionId: purchase.actionId,
        })
      ).refundSources[0]!;
      const command = {
        ...actor,
        clientCommandId: randomUUID(),
        purchaseActionId: purchase.actionId,
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        allocations: [
          {
            originalPurchasePostingId: source.postingId,
            amountMinor: "100",
            allocationKind: "purchase" as const,
          },
        ],
        description: "Partial refund",
        acknowledgeNegativeBalance: true,
      };
      const refund = await recordRefundInTransaction(tx(c), command);
      const remaining = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: purchase.actionId,
      });
      expect(
        remaining.refundSources.find((s) => s.postingId === source.postingId)
          ?.remainingMinor,
      ).toBe("400");
      expect(remaining.refundSources[0]?.groupRemainingMinor).toBe("900");
      await c.query("SAVEPOINT excess_line");
      await expect(
        recordRefundInTransaction(tx(c), {
          ...command,
          clientCommandId: randomUUID(),
          allocations: [{ ...command.allocations[0]!, amountMinor: "500" }],
        }),
      ).rejects.toThrow("eligible");
      await c.query("ROLLBACK TO SAVEPOINT excess_line");
      // A compatible purchase correction preserves the refund's historic posting.
      const correctedPurchase = await correctFinancialActionInTransaction(
        tx(c),
        {
          ...actor,
          actionId: purchase.actionId,
          clientCommandId: randomUUID(),
          expectedActionRevisionId: purchase.actionRevisionId,
          expectedFinancialRevision: refund.financialRevision,
          reason: "Correct purchase total",
          replacement: {
            actionKind: "expense",
            fundingAccountId: f.accountId,
            effectiveDate: "2026-10-02",
            purchaseMinor: "900",
            splits: [{ amountMinor: "900" }],
            description: "Purchase",
            acknowledgeNegativeBalance: true,
          },
        },
      );
      const correctedRefund = await correctFinancialActionInTransaction(tx(c), {
        ...actor,
        actionId: refund.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: refund.actionRevisionId,
        expectedFinancialRevision: correctedPurchase.financialRevision,
        reason: "Correct actual refunded amount",
        replacement: {
          actionKind: "refund",
          purchaseActionId: purchase.actionId,
          receivingAccountId: f.accountId,
          effectiveDate: "2026-10-09",
          allocations: [{ ...command.allocations[0]!, amountMinor: "120" }],
          description: "Corrected refund",
          acknowledgeNegativeBalance: true,
        },
      });
      expect(correctedRefund.actionId).toBe(refund.actionId);
    }));
  it("keeps a previously used archived category available for historical correction", () =>
    withFixture(async (c, f) => {
      const category = await c.query<{ id: string }>(
        `INSERT INTO core.category(workspace_id,name,kind) VALUES($1,'Archived historical category','expense') RETURNING id`,
        [f.workspaceId],
      );
      const categoryId = category.rows[0]!.id;
      const original = await recordExpenseInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-02",
        purchaseMinor: "100",
        splits: [{ amountMinor: "100", categoryId }],
        description: "Historical purchase",
        acknowledgeNegativeBalance: true,
      });
      await c.query(
        `UPDATE core.category SET archived_at=now() WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, categoryId],
      );
      const corrected = await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: original.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: original.actionRevisionId,
        expectedFinancialRevision: original.financialRevision,
        reason: "Fix historical amount",
        replacement: {
          actionKind: "expense",
          fundingAccountId: f.accountId,
          effectiveDate: "2026-10-02",
          purchaseMinor: "80",
          splits: [{ amountMinor: "80", categoryId }],
          description: "Historical purchase",
          acknowledgeNegativeBalance: true,
        },
      });
      expect(corrected.actionId).toBe(original.actionId);
      await c.query("SAVEPOINT archived_new");
      await expect(
        recordExpenseInTransaction(tx(c), {
          userId: f.userId,
          workspaceId: f.workspaceId,
          clientCommandId: randomUUID(),
          fundingAccountId: f.accountId,
          effectiveDate: "2026-10-08",
          purchaseMinor: "10",
          splits: [{ amountMinor: "10", categoryId }],
          description: "New purchase",
          acknowledgeNegativeBalance: true,
        }),
      ).rejects.toThrow("category");
      await c.query("ROLLBACK TO SAVEPOINT archived_new");
    }));
  it("backdates reversal and replacement, preserves classifications and counts one logical action", () =>
    withFixture(async (c, f) => {
      const input = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        purchaseMinor: "1000",
        splits: [{ amountMinor: "1000", categoryId: null }],
        description: "Purchase",
        acknowledgeNegativeBalance: true,
      };
      const actor = input;
      const original = await recordExpenseInTransaction(tx(c), actor);
      const detail = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: original.actionId,
      });
      const corrected = await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: original.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: original.actionRevisionId,
        expectedFinancialRevision: detail.current.financialRevision,
        reason: "Wrong amount and purchase date",
        replacement: {
          actionKind: "expense",
          fundingAccountId: f.accountId,
          effectiveDate: "2026-10-02",
          purchaseMinor: "800",
          splits: [{ amountMinor: "800", categoryId: null }],
          description: "Corrected purchase",
          acknowledgeNegativeBalance: true,
        },
      });
      expect(corrected.actionId).toBe(original.actionId);
      const sums = await c.query(
        `SELECT j.effective_date::text AS date,sum(p.amount_minor::numeric)::text AS amount FROM finance.posting p JOIN finance.journal j ON j.id=p.journal_id AND j.workspace_id=p.workspace_id WHERE p.workspace_id=$1 AND p.ledger_account_id=$2 GROUP BY j.effective_date ORDER BY j.effective_date`,
        [f.workspaceId, f.cashId],
      );
      expect(sums.rows).toEqual([
        { date: "2026-10-02", amount: "-800" },
        { date: "2026-10-08", amount: "0" },
      ]);
      const gross = await c.query(
        `SELECT sum(amount_minor::numeric)::text AS amount FROM finance.posting WHERE workspace_id=$1 AND expense_class='gross'`,
        [f.workspaceId],
      );
      expect(gross.rows[0].amount).toBe("800");
      const history = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: original.actionId,
      });
      expect(history.history).toHaveLength(2);
      expect(history.current.revisionNo).toBe(2);
    }));
  it("corrects category splits exactly without duplicated cash", () =>
    withFixture(async (c, f) => {
      await c.query(
        `INSERT INTO core.category(workspace_id,name,kind) VALUES ($1,'First category','expense'),($1,'Second category','expense')`,
        [f.workspaceId],
      );
      const cats = await c.query<{ id: string }>(
        `SELECT id FROM core.category WHERE workspace_id=$1 AND kind='expense' LIMIT 2`,
        [f.workspaceId],
      );
      const original = await recordExpenseInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        purchaseMinor: "1000",
        splits: [{ amountMinor: "1000", categoryId: cats.rows[0]!.id }],
        description: "Split purchase",
        acknowledgeNegativeBalance: true,
      });
      await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: original.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: original.actionRevisionId,
        expectedFinancialRevision: original.financialRevision,
        reason: "Correct category portions",
        replacement: {
          actionKind: "expense",
          fundingAccountId: f.accountId,
          effectiveDate: "2026-10-08",
          purchaseMinor: "1000",
          splits: [
            { amountMinor: "400", categoryId: cats.rows[0]!.id },
            { amountMinor: "600", categoryId: cats.rows[1]!.id },
          ],
          description: "Split purchase",
          acknowledgeNegativeBalance: true,
        },
      });
      const r = await c.query(
        `SELECT category_id,sum(amount_minor::numeric)::text AS amount FROM finance.posting WHERE workspace_id=$1 AND expense_class='gross' GROUP BY category_id ORDER BY amount`,
        [f.workspaceId],
      );
      expect(r.rows.map((r) => r.amount).sort()).toEqual(["400", "600"]);
    }));
  it("requires durable acknowledgement, rejects omission, and binds it to replay payload", () =>
    withFixture(async (c, f) => {
      const input = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        purchaseMinor: "1000",
        splits: [{ amountMinor: "1000" }],
        description: "Genuine purchase",
      };
      await c.query("SAVEPOINT missing_ack");
      await expect(recordExpenseInTransaction(tx(c), input)).rejects.toThrow(
        "explicitly acknowledge",
      );
      await c.query("ROLLBACK TO SAVEPOINT missing_ack");
      const result = await recordExpenseInTransaction(tx(c), {
        ...input,
        acknowledgeNegativeBalance: true,
      });
      expect(
        await recordExpenseInTransaction(tx(c), {
          ...input,
          acknowledgeNegativeBalance: true,
        }),
      ).toEqual(result);
      await expect(
        recordExpenseInTransaction(tx(c), {
          ...input,
          acknowledgeNegativeBalance: false,
        }),
      ).rejects.toThrow("different financial command payload");
      const audit = await c.query(
        `SELECT after_json FROM audit.private_revision WHERE workspace_id=$1 AND subject_id=$2`,
        [f.workspaceId, result.actionId],
      );
      expect(audit.rows[0].after_json.acknowledgeNegativeBalance).toBe(true);
      expect(
        audit.rows[0].after_json.negativeBalanceWarnings[0].afterMinor,
      ).toBe("-1000");
    }));
  it("records a real partial refund on its later date without income or erasing purchase", () =>
    withFixture(async (c, f) => {
      const original = await recordExpenseInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-02",
        purchaseMinor: "1000",
        splits: [{ amountMinor: "1000" }],
        description: "Original purchase",
        acknowledgeNegativeBalance: true,
      });
      const setup = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: original.actionId,
      });
      const command = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        purchaseActionId: original.actionId,
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        allocations: [
          {
            originalPurchasePostingId: setup.refundSources[0]!.postingId,
            amountMinor: "400",
            allocationKind: "purchase" as const,
          },
        ],
        description: "Provider refund",
        acknowledgeNegativeBalance: true,
      };
      const refund = await recordRefundInTransaction(tx(c), command);
      expect(await recordRefundInTransaction(tx(c), command)).toEqual(refund);
      const r = await c.query(
        `SELECT expense_class,income_class,cash_flow_kind,sum(amount_minor::numeric)::text AS amount FROM finance.posting WHERE workspace_id=$1 GROUP BY expense_class,income_class,cash_flow_kind`,
        [f.workspaceId],
      );
      expect(r.rows).toContainEqual({
        expense_class: "refund_offset",
        income_class: "none",
        cash_flow_kind: "none",
        amount: "-400",
      });
      expect(r.rows).toContainEqual({
        expense_class: "none",
        income_class: "none",
        cash_flow_kind: "refund",
        amount: "400",
      });
      expect(
        (
          await getFinancialActionDetailInTransaction(tx(c), {
            workspaceId: f.workspaceId,
            actionId: original.actionId,
          })
        ).current.actionRevisionId,
      ).toBe(original.actionRevisionId);
      await c.query("SAVEPOINT excess_refund");
      await expect(
        recordRefundInTransaction(tx(c), {
          ...command,
          clientCommandId: randomUUID(),
          allocations: [{ ...command.allocations[0]!, amountMinor: "700" }],
        }),
      ).rejects.toThrow("eligible");
      await c.query("ROLLBACK TO SAVEPOINT excess_refund");
    }));
  it("rejects dependent recategorization and rolls all correction evidence back", () =>
    withFixture(async (c, f) => {
      const original = await recordExpenseInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-02",
        purchaseMinor: "1000",
        splits: [{ amountMinor: "1000" }],
        description: "Purchase",
        acknowledgeNegativeBalance: true,
      });
      const source = (
        await getFinancialActionDetailInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          actionId: original.actionId,
        })
      ).refundSources[0]!;
      const refund = await recordRefundInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        purchaseActionId: original.actionId,
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        allocations: [
          {
            originalPurchasePostingId: source.postingId,
            amountMinor: "400",
            allocationKind: "purchase",
          },
        ],
        description: "Refund",
        acknowledgeNegativeBalance: true,
      });
      await c.query("SAVEPOINT correction");
      await expect(
        correctFinancialActionInTransaction(tx(c), {
          userId: f.userId,
          workspaceId: f.workspaceId,
          actionId: original.actionId,
          clientCommandId: randomUUID(),
          expectedActionRevisionId: original.actionRevisionId,
          expectedFinancialRevision: refund.financialRevision,
          reason: "Wrong purchase amount",
          replacement: {
            actionKind: "expense",
            fundingAccountId: f.accountId,
            effectiveDate: "2026-10-02",
            purchaseMinor: "200",
            splits: [{ amountMinor: "200" }],
            description: "Purchase",
            acknowledgeNegativeBalance: true,
          },
        }),
      ).rejects.toThrow();
      await c.query("ROLLBACK TO SAVEPOINT correction");
      expect(
        (
          await getFinancialActionDetailInTransaction(tx(c), {
            workspaceId: f.workspaceId,
            actionId: original.actionId,
          })
        ).history,
      ).toHaveLength(1);
    }));
  it("rejects stale and foreign action references and changed-payload replay", () =>
    withFixture(async (c, f) => {
      const original = await recordIncomeInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-02",
        amountMinor: "1000",
        incomeClass: "earned",
        description: "Income",
      });
      const command = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: original.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: original.actionRevisionId,
        expectedFinancialRevision: original.financialRevision,
        reason: "Wrong income",
        replacement: {
          actionKind: "income" as const,
          receivingAccountId: f.accountId,
          effectiveDate: "2026-10-02",
          amountMinor: "900",
          incomeClass: "earned" as const,
          description: "Income",
        },
      };
      const result = await correctFinancialActionInTransaction(tx(c), command);
      expect(await correctFinancialActionInTransaction(tx(c), command)).toEqual(
        result,
      );
      await expect(
        correctFinancialActionInTransaction(tx(c), {
          ...command,
          reason: "Changed reason",
        }),
      ).rejects.toThrow("different financial command payload");
      await expect(
        correctFinancialActionInTransaction(tx(c), {
          ...command,
          clientCommandId: randomUUID(),
        }),
      ).rejects.toThrow("Financial evidence changed");
      await expect(
        getFinancialActionDetailInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          actionId: randomUUID(),
        }),
      ).rejects.toThrow("unavailable");
    }));
  it("corrects payment accounting and due amounts with stable payment identity and no principal expense", () =>
    withFixture(async (c, f) => {
      const payment = await recordDebtPaymentInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        debtId: f.debtId,
        scheduleVersionId: f.scheduleId,
        expectedFinancialRevision: (
          await c.query(
            `SELECT financial_revision::text AS v FROM core.workspace WHERE id=$1`,
            [f.workspaceId],
          )
        ).rows[0].v,
        payingAccountId: f.accountId,
        paymentDate: "2026-10-08",
        actualPaidMinor: "400",
        contractualMinor: "400",
        components: [
          {
            disposition: "liability_reduction",
            amountMinor: "400",
            liabilityComponent: "unclassified",
            label: "Provider confirms debt reduction",
          },
        ],
        dueAllocations: [
          { installmentId: f.installmentId, amountMinor: "400" },
        ],
        unappliedContractualMinor: "0",
        allocationCertainty: "confirmed_total",
        confirmationSource: "provider",
        confirmationNote: "Provider receipt",
        dueAllocationConfirmed: true,
        acknowledgeNegativeBalance: true,
        description: "Debt payment",
      });
      const d = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: payment.actionId,
      });
      const evidence = projectReplacementIntent(d.current);
      if (evidence?.actionKind !== "debt_payment")
        throw new Error("Payment read model is incomplete");
      const corrected = await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: payment.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: payment.actionRevisionId,
        expectedFinancialRevision: payment.financialRevision,
        reason: "Payment receipt was 300",
        replacement: {
          ...evidence,
          actionKind: "debt_payment",
          actualPaidMinor: "300",
          contractualMinor: "300",
          components: [
            {
              disposition: "liability_reduction",
              amountMinor: "300",
              liabilityComponent: "unclassified",
              label: "Confirmed reduction",
            },
          ],
          dueAllocations: [
            { installmentId: f.installmentId, amountMinor: "300" },
          ],
          expectedFinancialRevision: payment.financialRevision,
        },
      });
      expect(corrected.actionId).toBe(payment.actionId);
      const pools = await c.query(
        `SELECT p.id,r.id AS payment_revision_id FROM finance.debt_payment p JOIN finance.debt_payment_revision r ON r.payment_id=p.id JOIN finance.financial_action a ON a.current_revision_id=r.action_revision_id WHERE p.workspace_id=$1`,
        [f.workspaceId],
      );
      expect(pools.rows[0].id).toBe(payment.paymentId);
      const due = await c.query(
        `SELECT remaining_minor::text FROM finance.current_installment_due_v WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, f.installmentId],
      );
      expect(due.rows[0].remaining_minor).toBe("700");
      expect(
        (
          await c.query(
            `SELECT count(*)::integer AS n FROM finance.posting WHERE workspace_id=$1 AND expense_class='gross'`,
            [f.workspaceId],
          )
        ).rows[0].n,
      ).toBe(0);
    }));
  it("explicit reversal cancels a purchase using inherited classes", () =>
    withFixture(async (c, f) => {
      const p = await recordExpenseInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        fundingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        purchaseMinor: "1000",
        splits: [{ amountMinor: "1000" }],
        description: "Duplicate purchase",
        acknowledgeNegativeBalance: true,
      });
      const input = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: p.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: p.actionRevisionId,
        expectedFinancialRevision: p.financialRevision,
        reason: "Duplicate entry",
      };
      const reversed = await reverseFinancialActionInTransaction(tx(c), input);
      expect(await reverseFinancialActionInTransaction(tx(c), input)).toEqual(
        reversed,
      );
      const cash = await c.query(
        `SELECT sum(amount_minor::numeric)::text AS amount FROM finance.posting WHERE workspace_id=$1 AND ledger_account_id=$2`,
        [f.workspaceId, f.cashId],
      );
      expect(cash.rows[0].amount).toBe("0");
    }));
  it("corrects transfer fees and supports an explicit fee refund without duplicate principal cash", () =>
    withFixture(async (c, f) => {
      const destination = await openFinancialAccountInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        name: "Destination",
        accountType: "checking",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "0",
      });
      const source = await recordTransferInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        sourceAccountId: f.accountId,
        destinationAccountId: destination.accountId,
        effectiveDate: "2026-10-02",
        destinationPrincipalMinor: "1000",
        fees: [
          {
            amountMinor: "100",
            label: "Transfer fee",
            treatment: "source_additional",
          },
        ],
        description: "Transfer",
        acknowledgeNegativeBalance: true,
      });
      const corrected = await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: source.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: source.actionRevisionId,
        expectedFinancialRevision: source.financialRevision,
        reason: "Provider fee was 80",
        replacement: {
          actionKind: "transfer",
          sourceAccountId: f.accountId,
          destinationAccountId: destination.accountId,
          effectiveDate: "2026-10-02",
          destinationPrincipalMinor: "1000",
          fees: [
            {
              amountMinor: "80",
              label: "Transfer fee",
              treatment: "source_additional",
            },
          ],
          description: "Transfer",
          acknowledgeNegativeBalance: true,
        },
      });
      const detail = await getFinancialActionDetailInTransaction(tx(c), {
        workspaceId: f.workspaceId,
        actionId: corrected.actionId,
      });
      expect(detail.refundSources[0]!.allocationKind).toBe("fee");
      await recordRefundInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        purchaseActionId: source.actionId,
        receivingAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        allocations: [
          {
            originalPurchasePostingId: detail.refundSources[0]!.postingId,
            amountMinor: "20",
            allocationKind: "fee",
          },
        ],
        description: "Explicit fee refund",
        acknowledgeNegativeBalance: true,
      });
      const balance = await readAccountBalanceAt(tx(c), {
        workspaceId: f.workspaceId,
        financialAccountId: f.accountId,
        cutoffDate: "2026-10-08",
      });
      expect(balance.currentBalanceMinor).toBe("-1060");
      expect(
        (
          await readAccountBalanceAt(tx(c), {
            workspaceId: f.workspaceId,
            financialAccountId: destination.accountId,
            cutoffDate: "2026-10-08",
          })
        ).currentBalanceMinor,
      ).toBe("1000");
    }));
  it("corrects capitalized borrowing fees while preserving debt and immutable schedule identity", () =>
    withFixture(async (c, f) => {
      const loan = await recordBorrowingInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        name: "Loan",
        lenderName: "Provider",
        debtType: "personal_loan",
        borrowingDate: "2026-10-02",
        receivingAccountId: f.accountId,
        principalMinor: "1000",
        actualReceivedMinor: "1000",
        fees: [
          {
            label: "Provider fee",
            amountMinor: "100",
            treatment: "capitalized",
          },
        ],
        scheduleReason: "No due dates supplied",
        description: "Borrowing",
      });
      const corrected = await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: loan.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: loan.actionRevisionId,
        expectedFinancialRevision: loan.financialRevision,
        reason: "Fee confirmation corrected",
        replacement: {
          actionKind: "borrowing",
          receivingAccountId: f.accountId,
          effectiveDate: "2026-10-02",
          principalMinor: "1000",
          actualReceivedMinor: "1000",
          fees: [
            {
              label: "Provider fee",
              amountMinor: "80",
              treatment: "capitalized",
            },
          ],
          description: "Borrowing",
        },
      });
      const d = await c.query(
        `SELECT current_schedule_version_id FROM finance.debt WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, loan.debtId],
      );
      expect(d.rows[0].current_schedule_version_id).toBe(
        loan.scheduleVersionId,
      );
      expect(corrected.actionId).toBe(loan.actionId);
      expect(
        (
          await readAccountBalanceAt(tx(c), {
            workspaceId: f.workspaceId,
            financialAccountId: f.accountId,
            cutoffDate: "2026-10-08",
          })
        ).currentBalanceMinor,
      ).toBe("1000");
      expect(
        (
          await c.query(
            `SELECT sum(amount_minor::numeric)::text AS amount FROM finance.posting WHERE workspace_id=$1 AND action_id=$2 AND expense_class='gross'`,
            [f.workspaceId, loan.actionId],
          )
        ).rows[0].amount,
      ).toBe("80");
    }));
  it("corrects opening cash with before/after reconciliation evidence and invalidates the old verified comparison", () =>
    withFixture(async (c, f) => {
      const opened = await openFinancialAccountInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        name: "Baseline",
        accountType: "checking",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "1000",
      });
      const before = await readAccountBalanceAt(tx(c), {
        workspaceId: f.workspaceId,
        financialAccountId: opened.accountId,
        cutoffDate: "2026-10-08",
      });
      const comparison = await reconcileAccountInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        financialAccountId: opened.accountId,
        cutoffDate: "2026-10-08",
        observedMinor: "1000",
        expectedFinancialRevision: before.financialRevision,
        expectedAccountVersion: before.version,
      });
      await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: opened.openingActionId!,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: (
          await getFinancialActionDetailInTransaction(tx(c), {
            workspaceId: f.workspaceId,
            actionId: opened.openingActionId!,
          })
        ).current.actionRevisionId,
        expectedFinancialRevision: comparison.financialRevision,
        reason: "Opening statement was 800",
        replacement: {
          actionKind: "opening_cash",
          financialAccountId: opened.accountId,
          effectiveDate: "2026-09-30",
          amountMinor: "800",
          description: "Corrected opening balance",
        },
      });
      const history = await readReconciliationHistory(tx(c), {
        workspaceId: f.workspaceId,
        financialAccountId: opened.accountId,
      });
      expect(history[0]!.needsReview).toBe(true);
      expect(history[0]!.calculatedMinor).toBe("1000");
      expect(history[0]!.currentCalculatedMinor).toBe("800");
    }));
  it("corrects adjustment equity without recognizing income", () =>
    withFixture(async (c, f) => {
      const account = await readAccountBalanceAt(tx(c), {
        workspaceId: f.workspaceId,
        financialAccountId: f.accountId,
        cutoffDate: "2026-10-08",
      });
      const adjustment = await adjustAccountBalanceInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        financialAccountId: f.accountId,
        effectiveDate: "2026-10-08",
        signedAdjustmentMinor: "100",
        reason: "Manual difference",
        expectedFinancialRevision: account.financialRevision,
        expectedAccountVersion: account.version,
      });
      await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: adjustment.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: adjustment.actionRevisionId,
        expectedFinancialRevision: adjustment.financialRevision,
        reason: "Difference was 80",
        replacement: {
          actionKind: "balance_adjustment",
          financialAccountId: f.accountId,
          effectiveDate: "2026-10-02",
          signedAdjustmentMinor: "80",
          description: "Corrected explicit adjustment",
        },
      });
      expect(
        (
          await readAccountBalanceAt(tx(c), {
            workspaceId: f.workspaceId,
            financialAccountId: f.accountId,
            cutoffDate: "2026-10-08",
          })
        ).currentBalanceMinor,
      ).toBe("80");
      expect(
        (
          await c.query(
            `SELECT count(*)::integer AS n FROM finance.posting WHERE workspace_id=$1 AND income_class<>'none'`,
            [f.workspaceId],
          )
        ).rows[0].n,
      ).toBe(0);
    }));
  it("later clearing resolution and its correction recognize costs once with zero further cash", () =>
    withFixture(async (c, f) => {
      const payment = await recordDebtPaymentInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        debtId: f.debtId,
        scheduleVersionId: f.scheduleId,
        expectedFinancialRevision: (
          await c.query(
            `SELECT financial_revision::text AS v FROM core.workspace WHERE id=$1`,
            [f.workspaceId],
          )
        ).rows[0].v,
        payingAccountId: f.accountId,
        paymentDate: "2026-10-08",
        actualPaidMinor: "200",
        contractualMinor: "200",
        components: [
          {
            disposition: "clearing",
            amountMinor: "200",
            label: "Pending provider classification",
          },
        ],
        dueAllocations: [
          { installmentId: f.installmentId, amountMinor: "200" },
        ],
        unappliedContractualMinor: "0",
        allocationCertainty: "unresolved",
        confirmationSource: "user",
        dueAllocationConfirmed: true,
        acknowledgeNegativeBalance: true,
        description: "Pending payment",
      });
      const source = (
        await getFinancialActionDetailInTransaction(tx(c), {
          workspaceId: f.workspaceId,
          actionId: payment.actionId,
        })
      ).clearingSources[0]!;
      const input = {
        userId: f.userId,
        workspaceId: f.workspaceId,
        clientCommandId: randomUUID(),
        expectedFinancialRevision: payment.financialRevision,
        sourceComponentId: source.sourceComponentId,
        effectiveDate: "2026-10-09",
        providerConfirmed: true as const,
        reason: "Provider confirms accounting",
        description: "Classify pending payment",
        components: [
          {
            disposition: "liability_reduction" as const,
            amountMinor: "180",
            liabilityComponent: "unclassified" as const,
            label: "Recognized debt reduction",
          },
          {
            disposition: "new_fee" as const,
            amountMinor: "20",
            label: "New confirmed fee",
          },
        ],
      };
      const resolution = await resolvePaymentClearingInTransaction(
        tx(c),
        input,
      );
      expect(await resolvePaymentClearingInTransaction(tx(c), input)).toEqual(
        resolution,
      );
      const result = await correctFinancialActionInTransaction(tx(c), {
        userId: f.userId,
        workspaceId: f.workspaceId,
        actionId: resolution.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: resolution.actionRevisionId,
        expectedFinancialRevision: resolution.financialRevision,
        reason: "Provider fee classification corrected",
        replacement: {
          actionKind: "payment_reclassification",
          sourceComponentId: source.sourceComponentId,
          effectiveDate: "2026-10-09",
          providerConfirmed: true,
          description: "Corrected classification",
          components: [
            {
              disposition: "liability_reduction",
              amountMinor: "190",
              liabilityComponent: "unclassified",
              label: "Recognized debt reduction",
            },
            {
              disposition: "new_fee",
              amountMinor: "10",
              label: "Confirmed fee",
            },
          ],
        },
      });
      expect(result.actionId).toBe(resolution.actionId);
      expect(
        (
          await readAccountBalanceAt(tx(c), {
            workspaceId: f.workspaceId,
            financialAccountId: f.accountId,
            cutoffDate: "2026-10-09",
          })
        ).currentBalanceMinor,
      ).toBe("-200");
      expect(
        (
          await c.query(
            `SELECT sum(amount_minor::numeric)::text AS amount FROM finance.posting WHERE workspace_id=$1 AND expense_class='gross'`,
            [f.workspaceId],
          )
        ).rows[0].amount,
      ).toBe("10");
    }));
  it("isolates real foreign actions, accounts and refund posting references", () =>
    withFixture(async (c, f) => {
      const userId = randomUUID();
      await getAuthPool().query(
        `INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,'Other',$2,true)`,
        [userId, `correction-foreign-${userId}@example.test`],
      );
      const workspace = await provisionPersonalWorkspace({
          userId,
          displayName: "Other",
        }),
        other = { userId, workspaceId: workspace.workspaceId };
      try {
        await c.query(
          `SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)`,
          [other.userId, other.workspaceId],
        );
        const foreign = await fixture(c, other);
        await c.query("SET CONSTRAINTS ALL IMMEDIATE");
        await c.query("SET CONSTRAINTS ALL DEFERRED");
        const purchase = await recordExpenseInTransaction(tx(c), {
          ...other,
          clientCommandId: randomUUID(),
          fundingAccountId: foreign.accountId,
          effectiveDate: "2026-10-08",
          purchaseMinor: "100",
          splits: [{ amountMinor: "100" }],
          description: "Foreign purchase",
          acknowledgeNegativeBalance: true,
        });
        const source = (
          await getFinancialActionDetailInTransaction(tx(c), {
            workspaceId: other.workspaceId,
            actionId: purchase.actionId,
          })
        ).refundSources[0]!;
        await c.query(
          `SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)`,
          [f.userId, f.workspaceId],
        );
        await expect(
          getFinancialActionDetailInTransaction(tx(c), {
            workspaceId: f.workspaceId,
            actionId: purchase.actionId,
          }),
        ).rejects.toThrow("unavailable");
        await c.query("SAVEPOINT foreign_ref");
        await expect(
          recordExpenseInTransaction(tx(c), {
            userId: f.userId,
            workspaceId: f.workspaceId,
            clientCommandId: randomUUID(),
            fundingAccountId: foreign.accountId,
            effectiveDate: "2026-10-08",
            purchaseMinor: "100",
            splits: [{ amountMinor: "100" }],
            description: "Invalid reference",
            acknowledgeNegativeBalance: true,
          }),
        ).rejects.toThrow("unavailable");
        await c.query("ROLLBACK TO SAVEPOINT foreign_ref");
        await expect(
          recordRefundInTransaction(tx(c), {
            userId: f.userId,
            workspaceId: f.workspaceId,
            clientCommandId: randomUUID(),
            purchaseActionId: purchase.actionId,
            receivingAccountId: f.accountId,
            effectiveDate: "2026-10-09",
            allocations: [
              {
                originalPurchasePostingId: source.postingId,
                amountMinor: "100",
                allocationKind: "purchase",
              },
            ],
            description: "Invalid refund",
          }),
        ).rejects.toThrow("eligible");
      } finally {
        await c.query("ROLLBACK");
        await removeProvisionedTestUser(other, "pmp-d12-foreign-cleanup");
      }
    }));
});
