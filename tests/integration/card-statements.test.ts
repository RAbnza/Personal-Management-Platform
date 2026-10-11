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
import { createCreditCard } from "@/modules/finance/services/credit-cards";
import { updateCreditCard } from "@/modules/finance/services/credit-cards";
import { recordCardPurchase } from "@/modules/finance/services/record-expense";
import {
  recordCardStatement,
  recordCardStatementInTransaction,
} from "@/modules/finance/services/card-statements";
import {
  getCardStatement,
  listCardStatements,
  getStatementEntrySetup,
} from "@/modules/finance/services/read-card-statements";
import { getCreditCardDetail } from "@/modules/finance/services/read-credit-cards";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import {
  StatementConflictError,
  StatementUnavailableError,
} from "@/modules/finance/domain/card-statement";
import {
  getFinancialActionDetail,
  correctFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import { getFinancialReport } from "@/modules/reporting/services/get-reports";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { completeFinancialCommandReceipt } from "@/modules/finance/repositories/command-receipt-repository";
import { advanceWorkspaceFinancialRevision } from "@/modules/finance/repositories/financial-write-repository";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
type Owner = { userId: string; workspaceId: string };
const label = "V2-A3 statement fixture" as const;
async function fixture(run: (owner: Owner, other: Owner) => Promise<void>) {
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
async function card(o: Owner) {
  return createCreditCard({
    ...o,
    clientCommandId: randomUUID(),
    name: "Statement Visa",
    issuerName: "Provider",
  });
}
function command(o: Owner, cardId: string) {
  return {
    ...o,
    cardId,
    clientCommandId: randomUUID(),
    cycleStart: "2026-10-01",
    cycleEnd: "2026-10-31",
    statementDate: "2026-11-01",
    dueDate: "2026-11-20",
    balanceMinor: "300001",
    minimumDueMinor: "10000",
    openingBalanceMinor: "0",
    verificationSource: "Provider PDF reviewed",
    verifiedDate: "2026-11-02",
    providerReference: "October statement",
    entries: [],
  };
}
async function purchase(o: Owner, cardId: string) {
  return recordCardPurchase({
    ...o,
    cardId,
    clientCommandId: randomUUID(),
    effectiveDate: "2026-10-10",
    postingDate: "2026-10-12",
    purchaseMinor: "300001",
    splits: [{ amountMinor: "300001", categoryId: null }],
    description: "Recognized groceries",
    providerReference: "Provider purchase",
  });
}
async function scoped<T>(
  o: Owner,
  run: (
    c: import("pg").PoolClient,
    t: import("@/platform/db").ScopedTransaction,
  ) => Promise<T>,
) {
  const c = await getDomainPool().connect();
  try {
    return await runScopedTransactionOnClient(c, o, (t) => run(c, t));
  } finally {
    c.release();
  }
}
afterAll(closeRuntimeDatabasePools);
async function rawStatement(
  o: Owner,
  cardId: string,
  mode: string,
  sourceId?: string,
) {
  return scoped(o, async (c, t) => {
    const receipt = randomUUID(),
      statement = randomUUID(),
      revision = randomUUID();
    await c.query(
      "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,$4,$5)",
      [
        receipt,
        o.workspaceId,
        randomUUID(),
        mode === "wrong command"
          ? "finance.record_expense"
          : "finance.record_card_statement",
        Buffer.alloc(32, 8),
      ],
    );
    await c.query(
      "INSERT INTO finance.card_statement(id,workspace_id,card_id) VALUES($1,$2,$3)",
      [statement, o.workspaceId, cardId],
    );
    await c.query(
      "INSERT INTO finance.card_statement_revision(id,workspace_id,statement_id,revision_no,command_receipt_id,cycle_start,cycle_end,statement_date,due_date,balance_minor,minimum_due_minor,opening_balance_minor,verification_source,verified_date,recorded_by_user_id,state) VALUES($1,$2,$3,1,$4,'2026-10-01','2026-10-31','2026-11-01','2026-11-20',300001,0,0,'Raw provider statement','2026-11-02',$5,$6)",
      [
        revision,
        o.workspaceId,
        statement,
        receipt,
        mode === "wrong actor" ? randomUUID() : o.userId,
        mode === "pre-finalized" ? "verified" : "building",
      ],
    );
    if (sourceId)
      await c.query(
        "INSERT INTO finance.card_statement_entry(workspace_id,statement_revision_id,line_no,description,posting_date,amount_minor,action_revision_id) VALUES($1,$2,$6,'Provider purchase',$3,$4,$5)",
        [
          o.workspaceId,
          revision,
          mode === "wrong date" ? "2026-10-13" : "2026-10-12",
          mode === "wrong amount" ? "300002" : "300001",
          sourceId,
          mode === "line gap" ? 2 : 1,
        ],
      );
    const snapshot = (
      await c.query(
        "SELECT finance.card_statement_snapshot($1,$2) AS evidence",
        [o.workspaceId, revision],
      )
    ).rows[0].evidence;
    if (mode !== "missing audit")
      await createPrivateRevision(t, {
        id: randomUUID(),
        workspaceId: o.workspaceId,
        commandReceiptId: receipt,
        subjectKind: "card_statement",
        subjectId: statement,
        subjectVersion: 1,
        operation: "create",
        beforeJson: mode === "invented before" ? {} : null,
        afterJson:
          mode === "wrong audit"
            ? { ...snapshot, balanceMinor: "5" }
            : snapshot,
        reason: null,
        effectiveDate: "2026-11-01",
        recordedByUserId: o.userId,
        actorKind: "user",
        requestId: null,
      });
    if (mode !== "unfinished")
      await c.query(
        "UPDATE finance.card_statement_revision SET state='verified',finalized_at=clock_timestamp() WHERE id=$1 AND workspace_id=$2",
        [revision, o.workspaceId],
      );
    await c.query(
      "UPDATE finance.card_statement SET current_revision_id=$1 WHERE id=$2 AND workspace_id=$3",
      [revision, statement, o.workspaceId],
    );
    const financialRevision = await advanceWorkspaceFinancialRevision(
      t,
      o.workspaceId,
    );
    if (mode !== "incomplete receipt")
      await completeFinancialCommandReceipt(t, {
        workspaceId: o.workspaceId,
        receiptId: receipt,
        result: {
          statementId: statement,
          revisionId: revision,
          version: mode === "wrong result" ? 2 : 1,
          financialRevision,
        },
      });
    await c.query("SET CONSTRAINTS ALL IMMEDIATE");
    return { statementId: statement, revisionId: revision };
  });
}
describe("V2-A3 statements", () => {
  it("canonicalizes case-insensitive UUID references before immutable snapshot/audit comparison and replay", () =>
    fixture(async (o) => {
      const c = await card(o),
        p = await purchase(o, c.cardId),
        base = command(o, c.cardId);
      const upper = {
        ...base,
        cardId: c.cardId.toUpperCase(),
        clientCommandId: base.clientCommandId.toUpperCase(),
        entries: [
          {
            description: "Provider purchase",
            postingDate: "2026-10-12",
            amountMinor: "300001",
            actionRevisionId: p.actionRevisionId.toUpperCase(),
          },
        ],
      };
      const result = await recordCardStatement(upper);
      expect(
        await recordCardStatement({
          ...upper,
          cardId: c.cardId,
          clientCommandId: base.clientCommandId,
          entries: [
            { ...upper.entries[0]!, actionRevisionId: p.actionRevisionId },
          ],
        }),
      ).toEqual(result);
      const detail = await getCardStatement({
        ...o,
        cardId: c.cardId.toUpperCase(),
        statementId: result.statementId.toUpperCase(),
        revisionId: result.revisionId.toUpperCase(),
      });
      expect(detail.snapshot.entries[0]?.actionRevisionId).toBe(
        p.actionRevisionId,
      );
      const revised = await recordCardStatement({
        ...upper,
        clientCommandId: randomUUID(),
        statementId: result.statementId.toUpperCase(),
        expectedVersion: 1,
        reason: "Provider reference confirmed",
      });
      expect(revised.version).toBe(2);
    }));
  it("retains archived-card statements, exact provider bigint credit evidence and explicit out-of-cycle membership", () =>
    fixture(async (o) => {
      const c = await card(o),
        p = await purchase(o, c.cardId);
      await updateCreditCard({
        ...o,
        clientCommandId: randomUUID(),
        cardId: c.cardId,
        expectedVersion: 1,
        name: "Archived statement card",
        issuerName: "Provider",
        archived: true,
      });
      const input = {
        ...command(o, c.cardId),
        cycleStart: "2026-11-01",
        cycleEnd: "2026-11-30",
        statementDate: "2026-12-01",
        dueDate: "2026-12-20",
        balanceMinor: "-9007199254740993",
        minimumDueMinor: "0",
        entries: [
          {
            description: "Provider confirmed cycle exception",
            postingDate: "2026-10-12",
            amountMinor: "300001",
            actionRevisionId: p.actionRevisionId,
          },
        ],
      };
      const s = await recordCardStatement(input);
      expect(await recordCardStatement(input)).toEqual(s);
      const d = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: s.statementId,
      });
      expect(d.card.archived).toBe(true);
      expect(d.snapshot.balanceMinor).toBe("-9007199254740993");
      expect(d.snapshot.entries[0]?.postingDate).toBe("2026-10-12");
      expect(d.reconciliation.recordedRemainingDueMinor).toBe("0");
      expect(d.reconciliation.unexplainedDifferenceMinor).toBe(
        "-9007199255040994",
      );
      expect(d.card.postedOutstandingMinor).toBe("300001");
    }));
  it("keeps corrected-card ownership explicit and prevents one logical purchase appearing in two current statements across cards", () =>
    fixture(async (o) => {
      const c = await card(o),
        second = await card(o),
        p = await purchase(o, c.cardId),
        base = command(o, c.cardId),
        first = await recordCardStatement({
          ...base,
          entries: [
            {
              description: "Provider purchase",
              amountMinor: "300001",
              postingDate: "2026-10-12",
              actionRevisionId: p.actionRevisionId,
            },
          ],
        });
      const detail = await getFinancialActionDetail({
          ...o,
          actionId: p.actionId,
        }),
        moved = await correctFinancialAction({
          ...o,
          actionId: p.actionId,
          clientCommandId: randomUUID(),
          expectedActionRevisionId: p.actionRevisionId,
          expectedFinancialRevision: detail.current.financialRevision,
          reason: "Correct funding card",
          replacement: {
            ...detail.replacement!,
            cardId: second.cardId,
          } as NonNullable<typeof detail.replacement>,
        });
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: first.statementId,
          })
        ).reconciliation.changedLinkedCount,
      ).toBe(1);
      const newInput = {
        ...command(o, second.cardId),
        entries: [
          {
            description: "Provider confirmed correct card",
            amountMinor: "300001",
            postingDate: "2026-10-12",
            actionRevisionId: moved.actionRevisionId,
          },
        ],
      };
      await expect(recordCardStatement(newInput)).rejects.toBeInstanceOf(
        StatementConflictError,
      );
      await recordCardStatement({
        ...base,
        clientCommandId: randomUUID(),
        statementId: first.statementId,
        expectedVersion: 1,
        reason: "Provider confirms purchase was not on this card statement",
        balanceMinor: "0",
        minimumDueMinor: "0",
        entries: [],
      });
      const next = await recordCardStatement(newInput);
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: second.cardId,
            statementId: next.statementId,
          })
        ).reconciliation.linkedCount,
      ).toBe(1);
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: first.statementId,
            revisionId: first.revisionId,
          })
        ).snapshot.balanceMinor,
      ).toBe("300001");
    }));
  it.each([
    "missing audit",
    "wrong audit",
    "invented before",
    "unfinished",
    "incomplete receipt",
    "wrong command",
    "wrong result",
    "wrong actor",
    "pre-finalized",
    "wrong date",
    "wrong amount",
    "line gap",
  ])("rejects raw %s without disabling database constraints", (mode) =>
    fixture(async (o) => {
      const c = await card(o),
        p = await purchase(o, c.cardId);
      await expect(
        rawStatement(o, c.cardId, mode, p.actionRevisionId),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (await listCardStatements({ ...o, cardId: c.cardId })).items,
      ).toHaveLength(0);
    }),
  );
  it("accepts a complete raw snapshot and rejects direct mutation, extension, root rebinding, deletion and receipt reuse", () =>
    fixture(async (o) => {
      const c = await card(o),
        c2 = await card(o),
        p = await purchase(o, c.cardId),
        s = await rawStatement(o, c.cardId, "valid", p.actionRevisionId);
      await scoped(o, async (client) => {
        const receipt = (
          await client.query(
            "SELECT command_receipt_id FROM finance.card_statement_revision WHERE id=$1",
            [s.revisionId],
          )
        ).rows[0].command_receipt_id;
        for (const [query, values, code] of [
          [
            "UPDATE finance.card_statement_revision SET balance_minor=1 WHERE id=$1",
            [s.revisionId],
            "23514",
          ],
          [
            "INSERT INTO finance.card_statement_entry(workspace_id,statement_revision_id,line_no,description) VALUES($1,$2,2,'Late provider line')",
            [o.workspaceId, s.revisionId],
            "23514",
          ],
          [
            "UPDATE finance.card_statement SET card_id=$1 WHERE id=$2",
            [c2.cardId, s.statementId],
            "23514",
          ],
          [
            "UPDATE finance.card_statement SET version=version+1 WHERE id=$1",
            [s.statementId],
            "23514",
          ],
          [
            "DELETE FROM finance.card_statement WHERE id=$1",
            [s.statementId],
            "42501",
          ],
          [
            "DELETE FROM finance.card_statement_revision WHERE id=$1",
            [s.revisionId],
            "42501",
          ],
          [
            "UPDATE finance.card_statement_entry SET amount_minor=1 WHERE statement_revision_id=$1",
            [s.revisionId],
            "42501",
          ],
          [
            "INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,previous_revision_id,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,recorded_by_user_id,actor_kind,reason) VALUES($1,$2,$3,2,$4,$5,'replace','card_purchase','2026-10-10','PHP',$6,'user','Reuse statement receipt')",
            [
              randomUUID(),
              o.workspaceId,
              p.actionId,
              p.actionRevisionId,
              receipt,
              o.userId,
            ],
            "23514",
          ],
        ] as Array<[string, unknown[], string]>) {
          await client.query("SAVEPOINT rejected_statement_write");
          try {
            await expect(client.query(query, values)).rejects.toMatchObject({
              code,
            });
          } finally {
            await client.query(
              "ROLLBACK TO SAVEPOINT rejected_statement_write",
            );
            await client.query("RELEASE SAVEPOINT rejected_statement_write");
          }
        }
      });
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: s.statementId,
          })
        ).snapshot.balanceMinor,
      ).toBe("300001");
    }));
  it("forces RLS and rejects spoofed scope, foreign insert roots and bypass settings", () =>
    fixture(async (o, other) => {
      const c = await card(o),
        foreign = await card(other),
        s = await recordCardStatement(command(other, foreign.cardId));
      await scoped(o, async (client) => {
        const protectedTables = (
          await client.query(
            "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['finance.card_statement'::regclass,'finance.card_statement_revision'::regclass,'finance.card_statement_entry'::regclass])",
          )
        ).rows;
        expect(protectedTables).toHaveLength(3);
        expect(
          protectedTables.every(
            (r) => r.relrowsecurity && r.relforcerowsecurity,
          ),
        ).toBe(true);
        await client.query("SELECT set_config('app.workspace_id',$1,true)", [
          other.workspaceId,
        ]);
        expect(
          (
            await client.query(
              "SELECT id FROM finance.card_statement WHERE id=$1",
              [s.statementId],
            )
          ).rows,
        ).toHaveLength(0);
        await client.query("SAVEPOINT foreign_statement");
        await expect(
          client.query(
            "INSERT INTO finance.card_statement(workspace_id,card_id) VALUES($1,$2)",
            [other.workspaceId, foreign.cardId],
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT foreign_statement");
        await client.query("SELECT set_config('app.workspace_id',$1,true)", [
          o.workspaceId,
        ]);
        await client.query("SAVEPOINT bypass_statement");
        await client.query("SET LOCAL row_security=off");
        await expect(
          client.query("SELECT * FROM finance.card_statement"),
        ).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT bypass_statement");
      });
      await expect(
        recordCardStatement({
          ...command(o, foreign.cardId),
          workspaceId: other.workspaceId,
        }),
      ).rejects.toBeInstanceOf(FinancialWriteWorkspaceUnavailableError);
      expect(
        (await listCardStatements({ ...o, cardId: c.cardId })).items,
      ).toHaveLength(0);
    }));
  it("serializes distinct creates for one provider cycle and rejects duplicate current membership in raw SQL", () =>
    fixture(async (o) => {
      const c = await card(o),
        base = command(o, c.cardId);
      const results = await Promise.allSettled([
        recordCardStatement(base),
        recordCardStatement({ ...base, clientCommandId: randomUUID() }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      await expect(rawStatement(o, c.cardId, "valid")).rejects.toMatchObject({
        code: "23514",
      });
    }));
  it("blocks deletion-pending reads/writes and purges the complete statement revision graph only for the approved owner", () =>
    fixture(async (o, other) => {
      const c = await card(o),
        oc = await card(other),
        p = await purchase(o, c.cardId),
        base = {
          ...command(o, c.cardId),
          entries: [
            {
              description: "Provider purchase",
              postingDate: "2026-10-12",
              amountMinor: "300001",
              actionRevisionId: p.actionRevisionId,
            },
          ],
        },
        s = await recordCardStatement(base),
        os = await recordCardStatement(command(other, oc.cardId));
      await recordCardStatement({
        ...base,
        statementId: s.statementId,
        expectedVersion: 1,
        reason: "Confirm provider reference",
        clientCommandId: randomUUID(),
        providerReference: "Provider corrected reference",
      });
      const requestId = await scoped(
        o,
        async (client) => (await makeDeletionPending(client, o)).requestId,
      );
      await expect(recordCardStatement(base)).rejects.toBeInstanceOf(
        FinancialWriteWorkspaceUnavailableError,
      );
      await expect(
        getCardStatement({
          ...o,
          cardId: c.cardId,
          statementId: s.statementId,
        }),
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
          [requestId, o.userId],
        );
        await admin.query("COMMIT");
        for (let i = 0; i < 10; i++)
          if (
            (await purgeDeletionStep(operator, requestId)).state === "completed"
          )
            break;
        expect((await purgeDeletionStep(operator, requestId)).state).toBe(
          "completed",
        );
        for (const table of [
          "card_statement",
          "card_statement_revision",
          "card_statement_entry",
        ])
          expect(
            (
              await admin.query(
                `SELECT id FROM finance.${table} WHERE workspace_id=$1`,
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
          await getCardStatement({
            ...other,
            cardId: oc.cardId,
            statementId: os.statementId,
          })
        ).snapshot.balanceMinor,
      ).toBe("300001");
    }));
  it("verifies explicit membership once, audits provider evidence, and leaves every ledger total unchanged", () =>
    fixture(async (o) => {
      const c = await card(o),
        p = await purchase(o, c.cardId),
        before = await getFinancialReport({
          ...o,
          query: {
            period: "custom",
            startDate: "2026-10-01",
            endDate: "2026-10-31",
          },
        });
      const input = {
        ...command(o, c.cardId),
        entries: [
          {
            description: "Provider groceries",
            postingDate: "2026-10-12",
            amountMinor: "300001",
            actionRevisionId: p.actionRevisionId,
          },
        ],
      };
      const result = await recordCardStatement(input);
      expect(
        await recordCardStatement({ ...input, requestId: randomUUID() }),
      ).toEqual(result);
      const data = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: result.statementId,
      });
      expect(data.reconciliation).toMatchObject({
        recordedRemainingDueMinor: "300001",
        unexplainedDifferenceMinor: "0",
        linkedCount: 1,
        changedLinkedCount: 0,
      });
      expect(data.unlinkedRecognized).toHaveLength(0);
      expect(data.snapshot.entries[0]?.actionRevisionId).toBe(
        p.actionRevisionId,
      );
      expect(
        (await getCreditCardDetail({ ...o, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("300001");
      const after = await getFinancialReport({
        ...o,
        query: {
          period: "custom",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        },
      });
      expect(after.metrics).toEqual(before.metrics);
      expect(after.metrics).toMatchObject({
        gross: "300001",
        cash_out: "0",
        closing_liability: "300001",
      });
      await scoped(o, async (client) => {
        const rows = await client.query(
          "SELECT a.before_json,a.after_json,r.state,r.retain_until FROM audit.private_revision a JOIN core.command_receipt r ON r.workspace_id=a.workspace_id AND r.id=a.command_receipt_id WHERE a.workspace_id=$1 AND a.subject_kind='card_statement' AND a.subject_id=$2",
          [o.workspaceId, result.statementId],
        );
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]).toMatchObject({
          before_json: null,
          state: "completed",
          retain_until: null,
        });
        expect(rows.rows[0].after_json.entries).toHaveLength(1);
      });
    }));
  it("versions corrections with exact before/after evidence and preserves immutable history", () =>
    fixture(async (o) => {
      const c = await card(o),
        base = command(o, c.cardId),
        first = await recordCardStatement(base),
        input = {
          ...base,
          clientCommandId: randomUUID(),
          statementId: first.statementId,
          expectedVersion: 1,
          reason: "Correct provider balance",
          balanceMinor: "350002",
        };
      const second = await recordCardStatement(input);
      expect(second.version).toBe(2);
      expect(await recordCardStatement(input)).toEqual(second);
      const old = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: first.statementId,
        revisionId: first.revisionId,
      });
      expect(old.snapshot.balanceMinor).toBe("300001");
      expect(old.isCurrent).toBe(false);
      const latest = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: first.statementId,
      });
      expect(latest.snapshot.balanceMinor).toBe("350002");
      expect(latest.history).toHaveLength(2);
      expect(latest.reconciliation.recordedRemainingDueMinor).toBe("350002");
      await expect(
        recordCardStatement({ ...input, clientCommandId: randomUUID() }),
      ).rejects.toBeInstanceOf(StatementConflictError);
      await expect(
        recordCardStatement({
          ...input,
          balanceMinor: "5",
          minimumDueMinor: "0",
        }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
    }));
  it("keeps unknown provider lines and unexplained differences explicit without creating purchases", () =>
    fixture(async (o) => {
      const c = await card(o),
        first = await recordCardStatement({
          ...command(o, c.cardId),
          openingBalanceMinor: null,
          entries: [
            { description: "Unknown provider charge" },
            {
              description: "Provider payment not recorded",
              amountMinor: "-80000",
              postingDate: "2026-10-28",
            },
          ],
        });
      const d = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: first.statementId,
      });
      expect(d.reconciliation).toMatchObject({
        recordedRemainingDueMinor: "300001",
        effectiveAllocatedMinor: "0",
        unexplainedDifferenceMinor: null,
        unlinkedProviderCount: 2,
        incompleteProviderCount: 1,
      });
      expect(
        (await getCreditCardDetail({ ...o, cardId: c.cardId })).card
          .postedOutstandingMinor,
      ).toBe("0");
    }));
  it("rejects foreign, wrong-card, invented amount/date and duplicate associations", () =>
    fixture(async (o, other) => {
      const c = await card(o),
        c2 = await card(o),
        foreign = await card(other),
        p = await purchase(o, c.cardId),
        fp = await purchase(other, foreign.cardId);
      const base = command(o, c.cardId),
        line = {
          description: "Linked provider purchase",
          postingDate: "2026-10-12",
          amountMinor: "300001",
          actionRevisionId: p.actionRevisionId,
        };
      await expect(
        recordCardStatement({
          ...base,
          entries: [{ ...line, actionRevisionId: fp.actionRevisionId }],
        }),
      ).rejects.toBeInstanceOf(StatementUnavailableError);
      await expect(
        recordCardStatement({ ...base, cardId: c2.cardId, entries: [line] }),
      ).rejects.toBeInstanceOf(StatementUnavailableError);
      for (const change of [
        { amountMinor: "300002" },
        { postingDate: "2026-10-13" },
      ])
        await expect(
          recordCardStatement({ ...base, entries: [{ ...line, ...change }] }),
        ).rejects.toBeInstanceOf(StatementConflictError);
      const result = await recordCardStatement({ ...base, entries: [line] });
      await expect(
        getCardStatement({
          ...other,
          cardId: foreign.cardId,
          statementId: result.statementId,
        }),
      ).rejects.toBeInstanceOf(StatementUnavailableError);
      await expect(
        recordCardStatement({
          ...base,
          clientCommandId: randomUUID(),
          cycleStart: "2026-11-01",
          cycleEnd: "2026-11-30",
          statementDate: "2026-12-01",
          dueDate: "2026-12-20",
          entries: [line],
        }),
      ).rejects.toBeInstanceOf(StatementConflictError);
    }));
  it("preserves statement links after a zero-money correction and supports explicit reassociation to its recognized revision", () =>
    fixture(async (o) => {
      const c = await card(o),
        p = await purchase(o, c.cardId),
        base = command(o, c.cardId),
        first = await recordCardStatement({
          ...base,
          entries: [
            {
              description: "Purchase",
              postingDate: "2026-10-12",
              amountMinor: "300001",
              actionRevisionId: p.actionRevisionId,
            },
          ],
        });
      const action = await getFinancialActionDetail({
        ...o,
        actionId: p.actionId,
      });
      const corrected = await correctFinancialAction({
        ...o,
        actionId: p.actionId,
        clientCommandId: randomUUID(),
        expectedActionRevisionId: p.actionRevisionId,
        expectedFinancialRevision: action.current.financialRevision,
        reason: "Correct provider posting date",
        replacement: {
          ...action.replacement!,
          postingDate: "2026-10-13",
        } as NonNullable<typeof action.replacement>,
      });
      const old = await getCardStatement({
        ...o,
        cardId: c.cardId,
        statementId: first.statementId,
      });
      expect(old.reconciliation.changedLinkedCount).toBe(1);
      expect(old.snapshot.entries[0]?.postingDate).toBe("2026-10-12");
      expect(
        (await getStatementEntrySetup({ ...o, cardId: c.cardId })).items[0]
          ?.actionRevisionId,
      ).toBe(corrected.actionRevisionId);
      const revised = await recordCardStatement({
        ...base,
        clientCommandId: randomUUID(),
        statementId: first.statementId,
        expectedVersion: 1,
        reason: "Provider confirmed corrected line",
        entries: [
          {
            description: "Purchase",
            postingDate: "2026-10-13",
            amountMinor: "300001",
            actionRevisionId: corrected.actionRevisionId,
          },
        ],
      });
      expect(
        (
          await getCardStatement({
            ...o,
            cardId: c.cardId,
            statementId: revised.statementId,
          })
        ).reconciliation.changedLinkedCount,
      ).toBe(0);
    }));
  it("serializes independent retries and revision races without duplicate snapshots", () =>
    fixture(async (o) => {
      const c = await card(o),
        base = command(o, c.cardId),
        results = await Promise.all([
          recordCardStatement(base),
          recordCardStatement(base),
        ]);
      expect(results[0]).toEqual(results[1]);
      const revise = {
        ...base,
        statementId: results[0]!.statementId,
        expectedVersion: 1,
        reason: "Provider correction",
      };
      const raced = await Promise.allSettled([
        recordCardStatement({ ...revise, clientCommandId: randomUUID() }),
        recordCardStatement({ ...revise, clientCommandId: randomUUID() }),
      ]);
      expect(raced.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(raced.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        (await listCardStatements({ ...o, cardId: c.cardId })).items,
      ).toHaveLength(1);
    }));
  it("rolls back statement, entries, audit, receipt and workspace revision atomically", () =>
    fixture(async (o) => {
      const c = await card(o),
        base = command(o, c.cardId),
        before = await getCreditCardDetail({ ...o, cardId: c.cardId });
      await expect(
        scoped(o, async (_client, t) => {
          await recordCardStatementInTransaction(t, base);
          throw Error("Abort statement fixture");
        }),
      ).rejects.toThrow("Abort statement fixture");
      expect(
        (await listCardStatements({ ...o, cardId: c.cardId })).items,
      ).toHaveLength(0);
      expect(
        (await getCreditCardDetail({ ...o, cardId: c.cardId }))
          .financialRevision,
      ).toBe(before.financialRevision);
      expect((await recordCardStatement(base)).version).toBe(1);
    }));
});
