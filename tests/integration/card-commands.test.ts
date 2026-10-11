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
import { recordCardPurchase } from "@/modules/finance/services/record-expense";
import {
  recordCardCommand,
  type RecordCardCommandInput,
} from "@/modules/finance/services/record-card-command";
import {
  recordCardAllocation,
  reverseCardAllocation,
} from "@/modules/finance/services/card-allocations";
import { recordCardStatement } from "@/modules/finance/services/card-statements";
import {
  getCardStatement,
  getStatementEntrySetup,
} from "@/modules/finance/services/read-card-statements";
import { getCreditCardDetail } from "@/modules/finance/services/read-credit-cards";
import { getCardActivity } from "@/modules/finance/services/read-card-activity";
import {
  getFinancialActionDetail,
  correctFinancialAction,
  reverseFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import { getFinancialReport } from "@/modules/reporting/services/get-reports";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import { recordCardCommandBodySchema } from "@/modules/finance/domain/card-command";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
type Owner = { userId: string; workspaceId: string };
const label = "V2-A4 card fixture" as const;
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
    name: "A4 Visa",
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
    description: "Original purchase",
  });
  return { c, cash, purchase };
}
function body(
  o: Owner,
  cardId: string,
  actionKind: RecordCardCommandInput["actionKind"] = "card_fee",
): RecordCardCommandInput {
  return {
    ...o,
    cardId,
    actionKind,
    clientCommandId: randomUUID(),
    effectiveDate: "2026-11-05",
    postingDate: "2026-11-06",
    amountMinor: "10000",
    description: "Confirmed card evidence",
    providerConfirmed: true,
    confirmationSource: "Actual provider record",
  };
}
function statement(o: Owner, cardId: string) {
  return {
    ...o,
    cardId,
    clientCommandId: randomUUID(),
    cycleStart: "2026-10-01",
    cycleEnd: "2026-10-31",
    statementDate: "2026-11-01",
    dueDate: "2026-11-20",
    balanceMinor: "300000",
    minimumDueMinor: "10000",
    openingBalanceMinor: "0",
    verificationSource: "Provider PDF",
    verifiedDate: "2026-11-02",
    entries: [],
  };
}
function allocation(
  o: Owner,
  cardId: string,
  statementRevisionId: string,
  sourceActionRevisionId: string,
  amountMinor = "5000",
) {
  return {
    ...o,
    cardId,
    clientCommandId: randomUUID(),
    statementRevisionId,
    sourceActionRevisionId,
    amountMinor,
    confirmationKind: "user" as const,
    confirmationSource: "Confirmed applicable to October",
    confirmedDate: "2026-11-07",
  };
}
async function correct(
  o: Owner,
  actionId: string,
  changes: Record<string, unknown>,
) {
  const d = await getFinancialActionDetail({ ...o, actionId });
  expect(d.replacement).not.toBeNull();
  return correctFinancialAction({
    ...o,
    actionId,
    clientCommandId: randomUUID(),
    expectedActionRevisionId: d.current.actionRevisionId,
    expectedFinancialRevision: d.current.financialRevision,
    reason: "Correct actual evidence",
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
    reason: "Reverse mistaken evidence",
  });
}
afterAll(closeRuntimeDatabasePools);
async function rawCommand(
  o: Owner,
  kind: RecordCardCommandInput["actionKind"],
  mode = "valid",
) {
  const { c, cash, purchase } = await setup(o),
    second = await createCreditCard({
      ...o,
      clientCommandId: randomUUID(),
      name: "Other card",
      issuerName: "Provider",
    });
  return scoped(o, async (q) => {
    const receipt = randomUUID(),
      action = randomUUID(),
      revision = randomUUID(),
      journal = randomUUID();
    const {
      userId: _user,
      workspaceId: _workspace,
      ...raw
    } = body(o, c.cardId, kind);
    void _user;
    void _workspace;
    const b = recordCardCommandBodySchema.parse({
        ...raw,
        ...(kind === "card_payment" ? { payingAccountId: cash.accountId } : {}),
      }),
      { clientCommandId, ...intent } = b;
    const expense = (
      await q.query(
        "SELECT ledger_account_id FROM finance.posting WHERE workspace_id=$1 AND action_revision_id=$2 AND expense_class='gross'",
        [o.workspaceId, purchase.actionRevisionId],
      )
    ).rows[0].ledger_account_id;
    await q.query(
      "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,$4,$5)",
      [
        receipt,
        o.workspaceId,
        clientCommandId,
        `finance.record_${kind}`,
        Buffer.alloc(32, 3),
      ],
    );
    await q.query(
      "INSERT INTO finance.financial_action(id,workspace_id,original_command_receipt_id,current_revision_id,description,recorded_by_user_id,actor_kind) VALUES($1,$2,$3,$4,$5,$6,'user')",
      [action, o.workspaceId, receipt, revision, b.description, o.userId],
    );
    await q.query(
      "INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,recorded_by_user_id,actor_kind) VALUES($1,$2,$3,1,$4,'create',$5,$6,'PHP',$7,'user')",
      [
        revision,
        o.workspaceId,
        action,
        receipt,
        kind,
        b.effectiveDate,
        o.userId,
      ],
    );
    await q.query(
      "INSERT INTO finance.card_action_detail(workspace_id,action_id,action_revision_id,card_id,amount_minor,posting_date,provider_reference,confirmation_source,paying_account_id) VALUES($1,$2,$3,$4,10000,$5,NULL,$6,$7)",
      [
        o.workspaceId,
        action,
        revision,
        c.cardId,
        b.postingDate,
        b.confirmationSource,
        b.payingAccountId,
      ],
    );
    await q.query(
      "INSERT INTO finance.journal(id,workspace_id,action_id,action_revision_id,sequence_no,effective_date,currency,role) VALUES($1,$2,$3,$4,1,$5,'PHP','economic')",
      [journal, o.workspaceId, action, revision, b.effectiveDate],
    );
    const sign = kind === "card_payment" || kind === "card_refund" ? 1 : -1;
    await q.query(
      "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor) VALUES($1,$2,$3,$4,$5,'PHP',1,$6)",
      [
        o.workspaceId,
        action,
        revision,
        journal,
        mode === "wrong-card"
          ? second.liabilityLedgerAccountId
          : c.liabilityLedgerAccountId,
        sign * 10000,
      ],
    );
    await q.query(
      "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor,expense_class,cash_flow_kind,cash_flow_direction) VALUES($1,$2,$3,$4,$5,'PHP',2,$6,$7,$8,$9)",
      [
        o.workspaceId,
        action,
        revision,
        journal,
        kind === "card_payment" && mode !== "spending"
          ? cash.ledgerAccountId
          : expense,
        -sign * (mode === "unbalanced" ? 9000 : 10000),
        kind === "card_payment" && mode !== "spending"
          ? "none"
          : sign === 1
            ? "refund_offset"
            : "gross",
        kind === "card_payment" && mode !== "spending" ? "transfer" : "none",
        kind === "card_payment" && mode !== "spending" ? "out" : "none",
      ],
    );
    if (mode !== "missing-activity")
      await q.query(
        "INSERT INTO finance.card_activity(workspace_id,action_id,action_revision_id,card_id,activity_kind,transaction_date,posting_date,signed_liability_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          o.workspaceId,
          action,
          revision,
          c.cardId,
          kind.replace("card_", ""),
          b.effectiveDate,
          mode === "invented-date" ? "2026-12-31" : b.postingDate,
          -sign * 10000,
        ],
      );
    await q.query(
      "INSERT INTO audit.private_revision(workspace_id,command_receipt_id,subject_kind,subject_id,subject_version,operation,after_json,effective_date,recorded_by_user_id,actor_kind) VALUES($1,$2,'financial_action',$3,1,'create',$4::jsonb,$5,$6,'user')",
      [
        o.workspaceId,
        receipt,
        action,
        JSON.stringify({
          ...intent,
          actionRevisionId: revision,
          ...(mode === "wrong-audit" ? { amountMinor: "1" } : {}),
          ...(mode === "unconfirmed" ? { providerConfirmed: false } : {}),
        }),
        b.effectiveDate,
        o.userId,
      ],
    );
    await q.query(
      "UPDATE finance.journal SET state='posted',finalized_at=clock_timestamp() WHERE id=$1",
      [journal],
    );
    await q.query(
      "UPDATE finance.action_revision SET state='posted',finalized_at=clock_timestamp() WHERE id=$1",
      [revision],
    );
    const financialRevision = (
      await q.query(
        "UPDATE core.workspace SET financial_revision=financial_revision+1 WHERE id=$1 RETURNING financial_revision::text",
        [o.workspaceId],
      )
    ).rows[0].financial_revision;
    await q.query(
      "UPDATE core.command_receipt SET state='completed',result_json=$2::jsonb,completed_at=clock_timestamp() WHERE id=$1",
      [
        receipt,
        JSON.stringify({
          actionId: action,
          actionRevisionId: revision,
          financialRevision,
        }),
      ],
    );
    await q.query("SET CONSTRAINTS ALL IMMEDIATE");
    return { action, revision };
  });
}
async function rawAllocation(
  o: Owner,
  cardId: string,
  statementRevisionId: string,
  sourceActionRevisionId: string,
  amountMinor: string,
  wrongAudit = false,
) {
  return scoped(o, async (q) => {
    const receipt = randomUUID(),
      allocationId = randomUUID(),
      intent = {
        allocationId,
        cardId,
        statementRevisionId,
        sourceActionRevisionId,
        amountMinor,
        confirmationKind: "provider",
        confirmationSource: "Independent provider allocation",
        confirmedDate: "2026-11-07",
        reversesAllocationId: null,
      };
    await q.query(
      "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,'finance.record_card_allocation',$4)",
      [receipt, o.workspaceId, randomUUID(), Buffer.alloc(32, 4)],
    );
    await q.query(
      "INSERT INTO finance.card_statement_allocation(id,workspace_id,statement_revision_id,source_action_revision_id,amount_minor,command_receipt_id,confirmation_kind,confirmation_source,confirmed_date,recorded_by_user_id) VALUES($1,$2,$3,$4,$5,$6,'provider','Independent provider allocation','2026-11-07',$7)",
      [
        allocationId,
        o.workspaceId,
        statementRevisionId,
        sourceActionRevisionId,
        amountMinor,
        receipt,
        o.userId,
      ],
    );
    await q.query(
      "INSERT INTO audit.private_revision(workspace_id,command_receipt_id,subject_kind,subject_id,subject_version,operation,after_json,effective_date,recorded_by_user_id,actor_kind) VALUES($1,$2,'card_allocation',$3,1,'create',$4::jsonb,'2026-11-07',$5,'user')",
      [
        o.workspaceId,
        receipt,
        allocationId,
        JSON.stringify({
          ...intent,
          ...(wrongAudit ? { confirmationSource: "fabricated" } : {}),
        }),
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
      [receipt, JSON.stringify({ allocationId, financialRevision: version })],
    );
    await q.query("SET CONSTRAINTS ALL IMMEDIATE");
    return allocationId;
  });
}
describe("V2-A4 card financial commands and allocations", () => {
  it("independent allocation SQL enforces total source capacity and exact confirmation audit", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        s = await recordCardStatement(statement(o, c.cardId));
      await expect(
        rawAllocation(o, c.cardId, s.revisionId, p.actionRevisionId, "3000"),
      ).resolves.toBeTypeOf("string");
      await expect(
        rawAllocation(o, c.cardId, s.revisionId, p.actionRevisionId, "8000"),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        rawAllocation(o, c.cardId, s.revisionId, p.actionRevisionId, "1", true),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.effectiveAllocatedMinor,
      ).toBe("3000");
    }));
  it("partial allocations across statements share one source pool; foreign-card/excess statement targets fail", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        s = await recordCardStatement(statement(o, c.cardId)),
        next = await recordCardStatement({
          ...statement(o, c.cardId),
          cycleStart: "2026-11-01",
          cycleEnd: "2026-11-30",
          statementDate: "2026-12-01",
          dueDate: "2026-12-20",
          verifiedDate: "2026-12-02",
        });
      await recordCardAllocation(
        allocation(o, c.cardId, s.revisionId, p.actionRevisionId, "6000"),
      );
      await recordCardAllocation(
        allocation(o, c.cardId, next.revisionId, p.actionRevisionId, "4000"),
      );
      await expect(
        recordCardAllocation(
          allocation(o, c.cardId, next.revisionId, p.actionRevisionId, "1"),
        ),
      ).rejects.toThrow();
      const second = await createCreditCard({
          ...o,
          clientCommandId: randomUUID(),
          name: "Second Visa",
          issuerName: "Provider",
        }),
        s2 = await recordCardStatement({
          ...statement(o, second.cardId),
          balanceMinor: "100",
          minimumDueMinor: "0",
        });
      await expect(
        rawAllocation(o, second.cardId, s2.revisionId, p.actionRevisionId, "1"),
      ).rejects.toMatchObject({ code: "23514" });
      const credit = await recordCardCommand({
        ...body(o, second.cardId, "card_refund"),
        amountMinor: "1000",
      });
      await expect(
        rawAllocation(
          o,
          second.cardId,
          s2.revisionId,
          credit.actionRevisionId,
          "101",
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }));
  it("refund credits allocate without becoming income, and eligible zero-due statements reject additional application", () =>
    fixture(async (o) => {
      const { c } = await setup(o),
        refund = await recordCardCommand(body(o, c.cardId, "card_refund")),
        s = await recordCardStatement({
          ...statement(o, c.cardId),
          balanceMinor: "10000",
          minimumDueMinor: "0",
        });
      await recordCardAllocation(
        allocation(o, c.cardId, s.revisionId, refund.actionRevisionId, "10000"),
      );
      const d = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: s.statementId,
      });
      expect(d.reconciliation.recordedRemainingDueMinor).toBe("0");
      expect(d.snapshot.balanceMinor).toBe("10000");
      await expect(
        recordCardAllocation(
          allocation(o, c.cardId, s.revisionId, refund.actionRevisionId, "1"),
        ),
      ).rejects.toThrow();
    }));
  it("payment replacement can change owned cash/card references while preserving history and invalidating old allocations", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        s = await recordCardStatement(statement(o, c.cardId));
      await recordCardAllocation(
        allocation(o, c.cardId, s.revisionId, p.actionRevisionId),
      );
      const newCard = await createCreditCard({
          ...o,
          clientCommandId: randomUUID(),
          name: "Replacement card",
          issuerName: "Provider",
        }),
        newCash = await openFinancialAccount({
          ...o,
          clientCommandId: randomUUID(),
          name: "Replacement bank",
          accountType: "cash",
          openingCutoffDate: "2026-09-30",
          openingBalanceMinor: "100000",
        });
      await correct(o, p.actionId, {
        cardId: newCard.cardId,
        payingAccountId: newCash.accountId,
        amountMinor: "20000",
      });
      expect(
        (await getCreditCardDetail({ ...o, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("300000");
      expect(
        (await getCreditCardDetail({ ...o, cardId: newCard.cardId })).card
          .cardCreditMinor,
      ).toBe("20000");
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.unresolvedAllocationMinor,
      ).toBe("5000");
      await reverse(o, p.actionId);
      expect(
        (await getCreditCardDetail({ ...o, cardId: newCard.cardId })).card
          .cardCreditMinor,
      ).toBe("0");
    }));
  it("linked refund corrections preserve historical purchase portions after a compatible purchase replacement", () =>
    fixture(async (o) => {
      const { c, purchase } = await setup(o),
        source = await scoped(
          o,
          async (q) =>
            (
              await q.query(
                "SELECT id FROM finance.posting WHERE workspace_id=$1 AND action_revision_id=$2 AND expense_class='gross'",
                [o.workspaceId, purchase.actionRevisionId],
              )
            ).rows[0].id,
        ),
        refund = await recordCardCommand({
          ...body(o, c.cardId, "card_refund"),
          purchaseActionId: purchase.actionId,
          refundParts: [
            { originalPurchasePostingId: source, amountMinor: "10000" },
          ],
        });
      await correct(o, purchase.actionId, { postingDate: "2026-10-12" });
      await correct(o, refund.actionId, {
        amountMinor: "8000",
        refundParts: [
          { originalPurchasePostingId: source, amountMinor: "8000" },
        ],
      });
      expect(
        (await getCreditCardDetail({ ...o, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("292000");
    }));
  it("new tables and invoker views resist spoofed owner settings and retain forced RLS", () =>
    fixture(async (o, other) => {
      await setup(o);
      await scoped(o, async (q) => {
        await q.query("SELECT set_config('app.user_id',$1,true)", [
          other.userId,
        ]);
        for (const table of [
          "card_action_detail",
          "card_refund_part",
          "card_statement_allocation",
          "card_recognized_evidence_v",
          "effective_card_allocation_v",
        ])
          expect(
            (
              await q.query(
                `SELECT workspace_id FROM finance.${table} WHERE workspace_id=$1`,
                [o.workspaceId],
              )
            ).rows,
          ).toHaveLength(0);
      });
      const catalog = await scoped(
        o,
        async (q) =>
          (
            await q.query(
              "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='finance'::regnamespace AND relname IN('card_action_detail','card_refund_part','card_statement_allocation')",
            )
          ).rows,
      );
      expect(catalog).toHaveLength(3);
      expect(
        catalog.every((r) => r.relrowsecurity && r.relforcerowsecurity),
      ).toBe(true);
    }));
  it.each([
    "card_payment",
    "card_fee",
    "card_interest",
    "card_refund",
  ] as const)("accepts independently constructed app-role %s recipe", (kind) =>
    fixture(async (o) => {
      await expect(rawCommand(o, kind)).resolves.toHaveProperty("revision");
    }),
  );
  it.each([
    "spending",
    "wrong-card",
    "missing-activity",
    "invented-date",
    "wrong-audit",
    "unconfirmed",
    "unbalanced",
  ])("rejects direct app-role payment recipe with %s", (mode) =>
    fixture(async (o) => {
      await expect(rawCommand(o, "card_payment", mode)).rejects.toMatchObject({
        code: "23514",
      });
    }),
  );
  it("blocks writes/reads during deletion and purges immutable allocations with the whole approved graph", () =>
    fixture(async (o, other) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        s = await recordCardStatement(statement(o, c.cardId));
      const a = await recordCardAllocation(
        allocation(o, c.cardId, s.revisionId, p.actionRevisionId),
      );
      await reverseCardAllocation({
        ...o,
        cardId: c.cardId,
        clientCommandId: randomUUID(),
        allocationId: a.allocationId,
        reason: "Preserve reversal evidence",
      });
      const keep = await setup(other);
      const requestId = await scoped(
        o,
        async (client) => (await makeDeletionPending(client, o)).requestId,
      );
      await expect(recordCardCommand(body(o, c.cardId))).rejects.toThrow();
      await expect(
        getCardStatement({
          ...o,
          cardId: c.cardId,
          statementId: s.statementId,
        }),
      ).rejects.toThrow();
      const env = parseEnv(readFileSync(".env.bootstrap", "utf8")),
        operatorUrl = new URL(process.env.DATABASE_URL!);
      operatorUrl.username = "lifecycle_operator";
      operatorUrl.password = env.LIFECYCLE_OPERATOR_PASSWORD!;
      const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
      adminUrl.pathname = "/personal_management_test";
      const operator = new Client({ connectionString: operatorUrl.toString() }),
        admin = new Client({ connectionString: adminUrl.toString() });
      await operator.connect();
      await admin.connect();
      try {
        await admin.query("BEGIN");
        await admin.query("SET LOCAL session_replication_role='replica'");
        await admin.query(
          "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_user_id=$2",
          [requestId, o.userId],
        );
        await admin.query("COMMIT");
        for (let n = 0; n < 12; n++) {
          if (
            (await purgeDeletionStep(operator, requestId)).state === "completed"
          )
            break;
        }
        expect((await purgeDeletionStep(operator, requestId)).state).toBe(
          "completed",
        );
        for (const table of [
          "card_action_detail",
          "card_refund_part",
          "card_statement_allocation",
        ])
          expect(
            (
              await admin.query(
                `SELECT workspace_id FROM finance.${table} WHERE workspace_id=$1`,
                [o.workspaceId],
              )
            ).rows,
          ).toHaveLength(0);
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
        (await getCreditCardDetail({ ...other, cardId: keep.c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("300000");
    }));
  it("payments reduce cash/liability once, never spending; fees/interest/refunds classify and overpayment is card credit", () =>
    fixture(async (o) => {
      const { c, cash, purchase } = await setup(o);
      const pay = {
        ...body(o, c.cardId, "card_payment"),
        payingAccountId: cash.accountId,
        amountMinor: "400000",
      };
      const p = await recordCardCommand(pay);
      expect(await recordCardCommand(pay)).toEqual(p);
      await recordCardCommand(body(o, c.cardId));
      await recordCardCommand(body(o, c.cardId, "card_interest"));
      const sources = await scoped(
        o,
        async (q) =>
          (
            await q.query(
              "SELECT id FROM finance.posting WHERE workspace_id=$1 AND action_revision_id=$2 AND expense_class='gross'",
              [o.workspaceId, purchase.actionRevisionId],
            )
          ).rows,
      );
      await recordCardCommand({
        ...body(o, c.cardId, "card_refund"),
        purchaseActionId: purchase.actionId,
        refundParts: [
          { originalPurchasePostingId: sources[0].id, amountMinor: "10000" },
        ],
      });
      const d = await getCreditCardDetail({ ...o, cardId: c.cardId });
      expect(d.card.postedOutstandingMinor).toBe("0");
      expect(d.card.cardCreditMinor).toBe("90000");
      const totals = await scoped(
        o,
        async (q) =>
          (
            await q.query(
              "SELECT l.kind,COALESCE(sum(p.amount_minor),0)::text AS total FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=$1 GROUP BY l.kind",
              [o.workspaceId],
            )
          ).rows,
      );
      expect(totals.find((x) => x.kind === "cash_asset").total).toBe("500000");
      expect(totals.find((x) => x.kind === "expense").total).toBe("310000");
      const report = await getFinancialReport({
        ...o,
        query: {
          period: "custom",
          startDate: "2026-10-01",
          endDate: "2026-11-30",
        },
      });
      expect(report.metrics).toMatchObject({
        gross: "320000",
        offsets: "10000",
        net: "310000",
        income: "0",
        fees: "10000",
        interest: "10000",
        cash_out: "400000",
        closing_cash: "500000",
      });
      expect(
        (await getCardActivity({ ...o, cardId: c.cardId })).items,
      ).toHaveLength(5);
    }));
  it.each(["card_fee", "card_interest", "card_refund"] as const)(
    "%s preserves provider-only corrections and full reversals",
    (kind) =>
      fixture(async (o) => {
        const { c } = await setup(o),
          p = await recordCardCommand(body(o, c.cardId, kind));
        const corrected = await correct(o, p.actionId, {
          postingDate: "2026-11-08",
        });
        const h = await getCardActivity({ ...o, cardId: c.cardId });
        expect(
          h.items.find((i) => i.actionRevisionId === corrected.actionRevisionId)
            ?.signedLiabilityMinor,
        ).toBe("0");
        expect(
          (await getStatementEntrySetup({ ...o, cardId: c.cardId })).items.find(
            (i) => i.actionRevisionId === corrected.actionRevisionId,
          )?.postingDate,
        ).toBe("2026-11-08");
        await reverse(o, p.actionId);
        expect(
          (await getCreditCardDetail({ ...o, cardId: c.cardId })).card
            .postedOutstandingMinor,
        ).toBe("300000");
      }),
  );
  it("partial confirmed allocations change due without changing snapshots or financial postings; reversal restores due", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        s = await recordCardStatement(statement(o, c.cardId));
      const input = allocation(o, c.cardId, s.revisionId, p.actionRevisionId),
        a = await recordCardAllocation(input);
      expect(await recordCardAllocation(input)).toEqual(a);
      const d = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: s.statementId,
      });
      expect(d.reconciliation.recordedRemainingDueMinor).toBe("295000");
      expect(d.snapshot.balanceMinor).toBe("300000");
      expect(d.allocations.items[0]?.status).toBe("effective");
      const rev = {
        ...o,
        cardId: c.cardId,
        clientCommandId: randomUUID(),
        allocationId: a.allocationId,
        reason: "Incorrect application",
      };
      const r = await reverseCardAllocation(rev);
      expect(await reverseCardAllocation(rev)).toEqual(r);
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.recordedRemainingDueMinor,
      ).toBe("300000");
      await expect(
        reverseCardAllocation({ ...rev, clientCommandId: randomUUID() }),
      ).rejects.toThrow(/already reversed/);
      await expect(
        reverseCardAllocation({
          ...rev,
          clientCommandId: randomUUID(),
          allocationId: r.allocationId,
        }),
      ).rejects.toThrow(/cannot be reversed/);
      expect(
        await scoped(
          o,
          async (q) =>
            (
              await q.query(
                "SELECT count(*)::int AS n FROM finance.action_revision r JOIN core.command_receipt c ON c.workspace_id=r.workspace_id AND c.id=r.command_receipt_id WHERE r.workspace_id=$1 AND c.command_type LIKE '%card_allocation'",
                [o.workspaceId],
              )
            ).rows[0].n,
        ),
      ).toBe(0);
    }));
  it("source corrections invalidate allocations and require fresh confirmation without deleting evidence", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        s = await recordCardStatement(statement(o, c.cardId));
      await recordCardAllocation(
        allocation(o, c.cardId, s.revisionId, p.actionRevisionId),
      );
      const replacement = await correct(o, p.actionId, { amountMinor: "6000" });
      const d = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: s.statementId,
      });
      expect(d.reconciliation.effectiveAllocatedMinor).toBe("0");
      expect(d.reconciliation.unresolvedAllocationMinor).toBe("5000");
      await expect(
        recordCardAllocation(
          allocation(o, c.cardId, s.revisionId, p.actionRevisionId),
        ),
      ).rejects.toThrow();
      await recordCardAllocation(
        allocation(o, c.cardId, s.revisionId, replacement.actionRevisionId),
      );
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.effectiveAllocatedMinor,
      ).toBe("5000");
      await reverse(o, p.actionId);
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.effectiveAllocatedMinor,
      ).toBe("0");
    }));
  it("statement revisions invalidate prior allocations; historical amounts and confirmation evidence stay intact", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        input = statement(o, c.cardId),
        s = await recordCardStatement(input);
      await recordCardAllocation(
        allocation(o, c.cardId, s.revisionId, p.actionRevisionId),
      );
      const next = await recordCardStatement({
        ...input,
        clientCommandId: randomUUID(),
        statementId: s.statementId,
        expectedVersion: 1,
        reason: "Provider corrected balance",
        balanceMinor: "200000",
      });
      const old = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: s.statementId,
        revisionId: s.revisionId,
      });
      expect(old.snapshot.balanceMinor).toBe("300000");
      expect(old.reconciliation.unresolvedAllocationMinor).toBe("5000");
      await expect(
        recordCardAllocation(
          allocation(o, c.cardId, s.revisionId, p.actionRevisionId),
        ),
      ).rejects.toThrow();
      await recordCardAllocation(
        allocation(o, c.cardId, next.revisionId, p.actionRevisionId),
      );
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.recordedRemainingDueMinor,
      ).toBe("195000");
    }));
  it("independent concurrent identical payments and allocations replay one command", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        input = {
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        };
      const [a, b] = await Promise.all([
        recordCardCommand(input),
        recordCardCommand(input),
      ]);
      expect(a).toEqual(b);
      const s = await recordCardStatement(statement(o, c.cardId)),
        i = allocation(o, c.cardId, s.revisionId, a.actionRevisionId);
      const [x, y] = await Promise.all([
        recordCardAllocation(i),
        recordCardAllocation(i),
      ]);
      expect(x).toEqual(y);
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.effectiveAllocatedMinor,
      ).toBe("5000");
    }));
  it("concurrent distinct allocations cannot exceed the supported source", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        s = await recordCardStatement(statement(o, c.cardId));
      const results = await Promise.allSettled([
        recordCardAllocation(
          allocation(o, c.cardId, s.revisionId, p.actionRevisionId, "7000"),
        ),
        recordCardAllocation(
          allocation(o, c.cardId, s.revisionId, p.actionRevisionId, "7000"),
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).reconciliation.effectiveAllocatedMinor,
      ).toBe("7000");
    }));
  it("rejects changed command intent, foreign references and invalid same-owner sources", () =>
    fixture(async (o, other) => {
      const { c, cash } = await setup(o),
        foreign = await setup(other),
        input = {
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        },
        p = await recordCardCommand(input),
        s = await recordCardStatement(statement(o, c.cardId));
      await expect(
        recordCardCommand({ ...input, amountMinor: "9000" }),
      ).rejects.toThrow(/command ID/);
      await expect(
        recordCardCommand({
          ...input,
          clientCommandId: randomUUID(),
          cardId: foreign.c.cardId,
        }),
      ).rejects.toThrow(/unavailable/);
      await expect(
        recordCardCommand({
          ...input,
          clientCommandId: randomUUID(),
          payingAccountId: foreign.cash.accountId,
        }),
      ).rejects.toThrow();
      await expect(
        recordCardAllocation(
          allocation(other, foreign.c.cardId, s.revisionId, p.actionRevisionId),
        ),
      ).rejects.toThrow(/unavailable/);
      const fee = await recordCardCommand(body(o, c.cardId));
      await expect(
        recordCardAllocation(
          allocation(o, c.cardId, s.revisionId, fee.actionRevisionId),
        ),
      ).rejects.toThrow();
      await expect(
        recordCardAllocation(
          allocation(o, c.cardId, s.revisionId, p.actionRevisionId, "10001"),
        ),
      ).rejects.toThrow();
      expect(
        await scoped(
          other,
          async (q) =>
            (
              await q.query(
                "SELECT count(*)::int AS n FROM finance.card_action_detail WHERE workspace_id=$1",
                [o.workspaceId],
              )
            ).rows[0].n,
        ),
      ).toBe(0);
    }));
  it("supports signed A4 statement links without creating payments or additional recognition", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o);
      const commands = await Promise.all([
        recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        recordCardCommand(body(o, c.cardId)),
        recordCardCommand(body(o, c.cardId, "card_interest")),
        recordCardCommand(body(o, c.cardId, "card_refund")),
      ]);
      const entries = commands.map((p, i) => ({
        description: `Provider line ${i}`,
        postingDate: "2026-11-06",
        amountMinor: i === 0 || i === 3 ? "-10000" : "10000",
        providerReference: null,
        actionRevisionId: p.actionRevisionId,
      }));
      const s = await recordCardStatement({
        ...statement(o, c.cardId),
        entries,
      });
      const d = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: s.statementId,
      });
      expect(d.reconciliation.linkedCount).toBe(4);
      expect(d.reconciliation.effectiveAllocatedMinor).toBe("0");
      expect(
        (await getCreditCardDetail({ ...o, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("300000");
    }));
  it("linked refunds cannot exceed or orphan corrected purchase classifications", () =>
    fixture(async (o) => {
      const { c, purchase } = await setup(o),
        sources = await scoped(
          o,
          async (q) =>
            (
              await q.query(
                "SELECT id FROM finance.posting WHERE workspace_id=$1 AND action_revision_id=$2 AND expense_class='gross'",
                [o.workspaceId, purchase.actionRevisionId],
              )
            ).rows,
        );
      const input = {
        ...body(o, c.cardId, "card_refund"),
        amountMinor: "200000",
        purchaseActionId: purchase.actionId,
        refundParts: [
          { originalPurchasePostingId: sources[0].id, amountMinor: "200000" },
        ],
      };
      const refund = await recordCardCommand(input);
      await expect(
        recordCardCommand({ ...input, clientCommandId: randomUUID() }),
      ).rejects.toThrow();
      await expect(
        correct(o, purchase.actionId, {
          purchaseMinor: "100000",
          splits: [{ amountMinor: "100000", categoryId: null }],
        }),
      ).rejects.toThrow(/refund/);
      await expect(reverse(o, purchase.actionId)).rejects.toThrow(/refund/);
      await reverse(o, refund.actionId);
      await correct(o, purchase.actionId, {
        purchaseMinor: "100000",
        splits: [{ amountMinor: "100000", categoryId: null }],
      });
    }));
  it("database rejects mutation/deletion of financial and allocation evidence", () =>
    fixture(async (o) => {
      const { c, cash } = await setup(o),
        p = await recordCardCommand({
          ...body(o, c.cardId, "card_payment"),
          payingAccountId: cash.accountId,
        }),
        s = await recordCardStatement(statement(o, c.cardId)),
        a = await recordCardAllocation(
          allocation(o, c.cardId, s.revisionId, p.actionRevisionId),
        );
      for (const query of [
        "UPDATE finance.card_action_detail SET amount_minor=1 WHERE workspace_id=$1",
        "DELETE FROM finance.card_statement_allocation WHERE workspace_id=$1",
        "UPDATE finance.card_statement_allocation SET amount_minor=1 WHERE workspace_id=$1",
      ]) {
        await expect(
          scoped(o, (q) => q.query(query, [o.workspaceId])),
        ).rejects.toThrow();
      }
      await expect(
        scoped(o, (q) =>
          q.query(
            "INSERT INTO finance.card_statement_allocation(workspace_id,statement_revision_id,source_action_revision_id,amount_minor,command_receipt_id,confirmation_kind,confirmation_source,confirmed_date,recorded_by_user_id,reverses_allocation_id) SELECT workspace_id,statement_revision_id,source_action_revision_id,amount_minor-1,command_receipt_id,'user','forged reversal',confirmed_date,recorded_by_user_id,id FROM finance.card_statement_allocation WHERE id=$1",
            [a.allocationId],
          ),
        ),
      ).rejects.toThrow(/reversal/);
    }));
  it("archived-card retries replay; new financial commands are rejected", () =>
    fixture(async (o) => {
      const { c } = await setup(o),
        input = body(o, c.cardId),
        p = await recordCardCommand(input);
      await updateCreditCard({
        ...o,
        cardId: c.cardId,
        clientCommandId: randomUUID(),
        expectedVersion: 1,
        name: "A4 Visa",
        issuerName: "Provider",
        archived: true,
      });
      expect(await recordCardCommand(input)).toEqual(p);
      await expect(
        recordCardCommand({ ...input, clientCommandId: randomUUID() }),
      ).rejects.toThrow(/active card/);
      await correct(o, p.actionId, { postingDate: "2026-11-09" });
    }));
});
