import { recordTrackerCommand } from "@/modules/trackers/services/commands";
import { presets as trackerPresets } from "@/modules/trackers/domain/presets";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import {
  getAuthPool,
  closeRuntimeDatabasePools,
  getDomainPool,
} from "@/platform/db/pools";
import { withDomainTransaction } from "@/platform/db";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  recordGroupCommand,
  finishGroupCommand,
  lockGroup,
  executeGroupCommand,
  type SharingActor,
} from "@/modules/sharing/services/groups";
import {
  getGroup,
  getBill,
  type InvitationReview,
} from "@/modules/sharing/services/read-groups";
import { invitationCommand } from "@/modules/sharing/services/invitations";
import {
  adoptGroupExpense,
  getAdoptionPreview,
  recordIntegratedSharedExpense,
} from "@/modules/finance/services/adopt-group-expense";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import {
  recordExpense,
  recordCardPurchase,
} from "@/modules/finance/services/record-expense";
import { createCreditCard } from "@/modules/finance/services/credit-cards";
import { getFinancialReport } from "@/modules/reporting/services/get-reports";
import {
  adoptGroupEffect,
  getGroupEffectPreview,
} from "@/modules/finance/services/adopt-group-effect";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import {
  prepareWorkspaceExport,
  downloadWorkspaceExport,
  downloadWorkspaceRecovery,
  previewWorkspaceRestore,
  restoreWorkspace,
} from "@/modules/portability/services/workspace-bundles";
import { previewDigest } from "@/modules/portability/domain/csv-preview";
const label = "V2-I sharing fixture" as const;
import { reviewGroupSource } from "@/modules/finance/services/review-group-source";
import { getDashboard } from "@/modules/dashboard/services/get-dashboard";
async function admin() {
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  url.pathname = "/personal_management_test";
  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  if (
    (await c.query("SELECT current_database() name")).rows[0].name !==
    "personal_management_test"
  )
    throw new Error("Synthetic test database required");
  return c;
}
async function fixture(
  run: (
    a: SharingActor,
    b: SharingActor,
    outsider: SharingActor,
    groupId: string,
  ) => Promise<void>,
) {
  const owners: SharingActor[] = [];
  let createdGroup: string | undefined;
  try {
    for (let n = 0; n < 3; n++) {
      const userId = randomUUID(),
        sessionId = randomUUID();
      await getAuthPool().query(
        'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
        [userId, label, `${userId}@example.test`],
      );
      const { workspaceId } = await provisionPersonalWorkspace({
        userId,
        displayName: label,
      });
      owners.push({ userId, workspaceId, sessionId });
      await getAuthPool().query(
        "INSERT INTO auth.session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp())",
        [sessionId, userId, randomUUID()],
      );
      await getAuthPool().query(
        "INSERT INTO auth.session_assurance(session_id,verified_at,method) VALUES($1,clock_timestamp(),'password')",
        [sessionId],
      );
    }
    const groupId = randomUUID();
    createdGroup = groupId;
    await recordGroupCommand(owners[0]!, {
      kind: "create",
      groupId,
      clientCommandId: randomUUID(),
      name: "Shared fixture",
      displayName: "A",
    });
    await run(owners[0]!, owners[1]!, owners[2]!, groupId);
  } finally {
    const c = await admin();
    try {
      const groups = (
        await c.query(
          "SELECT id FROM sharing.expense_group WHERE created_by_user_id=ANY($1::uuid[]) OR id=$2",
          [owners.map((o) => o.userId), createdGroup],
        )
      ).rows;
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role='replica'");
      for (const { id } of groups) {
        const tables = (
          await c.query(
            "SELECT table_name FROM information_schema.columns WHERE table_schema='sharing' AND column_name='group_id'",
          )
        ).rows;
        for (const t of tables)
          await c.query(
            `DELETE FROM sharing."${t.table_name}" WHERE group_id=$1`,
            [id],
          );
        await c.query("DELETE FROM audit.group_revision WHERE group_id=$1", [
          id,
        ]);
        await c.query("DELETE FROM sharing.expense_group WHERE id=$1", [id]);
      }
      await c.query("COMMIT");
    } finally {
      await c.end();
    }
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
async function command(
  a: SharingActor,
  g: string,
  body: Record<string, unknown>,
) {
  const { group } = await getGroup(a, g);
  return recordGroupCommand(a, {
    clientCommandId: randomUUID(),
    groupId: g,
    expectedVersion: group.version,
    ...body,
  });
}
async function invite(
  a: SharingActor,
  b: SharingActor,
  g: string,
  claimParticipantId: string | null = null,
) {
  const token = randomBytes(32).toString("hex");
  await command(a, g, {
    kind: "invite",
    email: `${b.userId}@example.test`,
    token,
    claimParticipantId,
  });
  const review = (await invitationCommand(b, {
    kind: "review",
    token,
  })) as InvitationReview;
  const accept = {
    kind: "accept",
    token,
    clientCommandId: randomUUID(),
    expectedVersion: review.version,
    consent: true,
    displayName: "B",
  };
  await invitationCommand(b, accept);
  return { token, accept, review };
}
async function bill(a: SharingActor, g: string, amount = "120000") {
  const d = await getGroup(a, g),
    payer = d.group.participantId;
  const people = d.participants.filter(
    (p) => p.active || p.identityKind === "manual",
  );
  return command(a, g, {
    kind: "bill",
    bill: {
      description: "Dinner",
      expenseDate: "2026-10-10",
      totalMinor: amount,
      splitMethod: "equal",
      contributions: [{ participantId: payer, amountMinor: amount }],
      shares: people.map((p) => ({ participantId: p.id })),
    },
  });
}
const privateScope = (a: SharingActor) => ({
  userId: a.userId,
  workspaceId: a.workspaceId,
});
async function cash(a: SharingActor) {
  return openFinancialAccount({
    ...privateScope(a),
    clientCommandId: randomUUID(),
    name: "Private wallet",
    accountType: "cash",
    openingCutoffDate: "2026-10-01",
    openingBalanceMinor: "1000000",
  });
}
afterAll(closeRuntimeDatabasePools);
describe("V2-I settlements, refunds and exact history", () => {
  it("lets a former member review or reconcile private differences without changing shared history or posting during a retained-evidence decision", async () => {
    vi.stubEnv("SHARED_EXPENSES_ENABLED", "true");
    try {
      await fixture(async (a, b, _o, g) => {
        await invite(a, b, g);
        const expense = await bill(a, g, "2000");
        let p = await getAdoptionPreview(b, g, expense.subjectId);
        await adoptGroupExpense(b, {
          clientCommandId: randomUUID(),
          groupId: g,
          expenseId: expense.subjectId,
          expectedSourceRevisionId: p.revisionId,
          expectedSourceHash: p.sourceHash,
          expectedFinancialRevision: p.financialRevision,
          approved: true,
          funding: { kind: "none" },
        });
        const own = (await getGroup(a, g)).group.participantId,
          former = (await getGroup(b, g)).group.participantId,
          rev = (await getBill(a, g, expense.subjectId))[0]!;
        await command(a, g, {
          kind: "bill",
          expenseId: expense.subjectId,
          expectedRevisionId: rev.revisionId,
          reason: "Different group shares",
          bill: {
            description: rev.description,
            expenseDate: rev.expenseDate,
            totalMinor: "2000",
            splitMethod: "exact",
            contributions: rev.contributions,
            shares: [
              { participantId: own, amountMinor: "500" },
              { participantId: former, amountMinor: "1500" },
            ],
          },
        });
        await command(a, g, {
          kind: "membership",
          participantId: former,
          operation: "remove",
        });
        p = await getAdoptionPreview(b, g, expense.subjectId);
        expect(p.needsPrivateCorrection).toBe(true);
        expect(p.retainedAmounts!.spendingMinor).toBe("1000");
        const before = await withDomainTransaction(
          b,
          async (t) =>
            (
              await t.db.execute<{
                revision: string;
                postings: number;
                actions: number;
              }>(
                sql`SELECT financial_revision::text revision,(SELECT count(*)::int FROM finance.posting) postings,(SELECT count(*)::int FROM finance.financial_action) actions FROM core.workspace`,
              )
            ).rows[0]!,
        );
        expect(
          (
            await getDashboard({ ...b, query: { period: "month" } })
          ).attention.some((x) => x.key === `shared-review:${p.link!.id}`),
        ).toBe(true);
        const c = {
          clientCommandId: randomUUID(),
          groupId: g,
          linkId: p.link!.id,
          expectedLinkRevisionId: p.link!.linkRevisionId,
          expectedSourceHash: p.sourceHash,
          expectedFinancialRevision: p.financialRevision,
          approved: true,
          reason: "I retain my independently verified private amounts",
        };
        const reviewed = await reviewGroupSource(b, c);
        expect(await reviewGroupSource(b, c)).toEqual(reviewed);
        await expect(
          reviewGroupSource(a, { ...c, clientCommandId: randomUUID() }),
        ).rejects.toThrow();
        const after = await withDomainTransaction(
          b,
          async (t) =>
            (
              await t.db.execute<{
                revision: string;
                postings: number;
                actions: number;
              }>(
                sql`SELECT financial_revision::text revision,(SELECT count(*)::int FROM finance.posting) postings,(SELECT count(*)::int FROM finance.financial_action) actions FROM core.workspace`,
              )
            ).rows[0]!,
        );
        expect(after).toEqual(before);
        p = await getAdoptionPreview(b, g, expense.subjectId);
        expect(p.needsPrivateCorrection).toBe(true);
        expect(p.review?.reason).toBe(c.reason);
        expect(
          (
            await getDashboard({ ...b, query: { period: "month" } })
          ).attention.some((x) => x.key === `shared-review:${p.link!.id}`),
        ).toBe(false);
        expect(
          await withDomainTransaction(
            a,
            async (t) =>
              (
                await t.db.execute(
                  sql`SELECT id FROM finance.private_group_review`,
                )
              ).rows,
          ),
        ).toEqual([]);
        const groupVersion = (await getGroup(b, g)).group.version;
        await adoptGroupExpense(b, {
          clientCommandId: randomUUID(),
          groupId: g,
          expenseId: expense.subjectId,
          expectedSourceRevisionId: p.revisionId,
          expectedSourceHash: p.sourceHash,
          expectedFinancialRevision: p.financialRevision,
          approved: true,
          funding: { kind: "keep" },
        });
        p = await getAdoptionPreview(b, g, expense.subjectId);
        expect(p.needsPrivateCorrection).toBe(false);
        expect(p.retainedAmounts!.spendingMinor).toBe("1500");
        expect((await getGroup(b, g)).group.version).toBe(groupVersion);
        await expect(
          command(b, g, {
            kind: "manual",
            displayName: "Forbidden shared write",
          }),
        ).rejects.toThrow();
      });
    } finally {
      vi.unstubAllEnvs();
    }
  }, 25000);
  it(
    "nets reciprocal bills, replays racing full reports and confirmations once, and preserves a later correction to settled sources",
    async () =>
      fixture(async (a, b, _o, g) => {
        await invite(a, b, g);
        const first = await bill(a, g, "2000");
        await bill(b, g, "1600");
        let d = await getGroup(b, g);
        const pa = (await getGroup(a, g)).group.participantId,
          pb = d.group.participantId;
        expect(d.participants.find((p) => p.id === pb)!.netMinor).toBe("-200");
        expect(d.ledger!.suggestions).toEqual([
          { senderId: pb, recipientId: pa, amountMinor: "200" },
        ]);
        const report = {
          kind: "settlement",
          groupId: g,
          expectedVersion: d.group.version,
          clientCommandId: randomUUID(),
          recipientId: pa,
          mode: "full",
          amountMinor: "200",
          paymentDate: "2026-10-15",
          allocations: [],
        };
        const results = await Promise.all([
          recordGroupCommand(b, report),
          recordGroupCommand(b, report),
        ]);
        expect(results[0]).toEqual(results[1]);
        d = await getGroup(a, g);
        expect(d.ledger!.settlements).toHaveLength(1);
        expect(d.participants.find((p) => p.id === pa)!.netMinor).toBe("200");
        const confirm = {
          kind: "settlement_transition",
          groupId: g,
          expectedVersion: d.group.version,
          clientCommandId: randomUUID(),
          settlementId: results[0]!.subjectId,
          expectedSettlementVersion: 1,
          operation: "confirm",
          reason: "Full current relationship received",
        };
        expect(
          (
            await Promise.all([
              recordGroupCommand(a, confirm),
              recordGroupCommand(a, confirm),
            ])
          )[0],
        ).toEqual(await recordGroupCommand(a, confirm));
        d = await getGroup(a, g);
        expect(d.participants.every((p) => p.netMinor === "0")).toBe(true);
        expect(d.bills).toHaveLength(2);
        const rev = (await getBill(a, g, first.subjectId))[0]!;
        await command(a, g, {
          kind: "bill",
          expenseId: first.subjectId,
          expectedRevisionId: rev.revisionId,
          reason: "Correct shares after settlement",
          bill: {
            description: rev.description,
            expenseDate: rev.expenseDate,
            totalMinor: "2000",
            splitMethod: "exact",
            contributions: rev.contributions,
            shares: [
              { participantId: pa, amountMinor: "500" },
              { participantId: pb, amountMinor: "1500" },
            ],
          },
        });
        d = await getGroup(a, g);
        expect(d.participants.find((p) => p.id === pa)!.netMinor).toBe("500");
        expect(d.ledger!.settlements[0]!.state).toBe("confirmed");
        expect(await getBill(a, g, first.subjectId)).toHaveLength(2);
        expect(
          await withDomainTransaction(
            b,
            async (t) =>
              (
                await t.db.execute<{ n: string }>(
                  sql`SELECT sharing.obligation(${g}::uuid,${pb}::uuid,${pa}::uuid,NULL)::text n`,
                )
              ).rows[0]!.n,
          ),
        ).toBe("500");
      }),
    20000,
  );
  it(
    "shows late resolution of entitled bills while hiding unrelated settlements even when their transaction began before exit",
    async () =>
      fixture(async (a, b, o, g) => {
        await invite(a, b, g);
        await invite(a, o, g);
        await bill(b, g, "3000");
        const pa = (await getGroup(a, g)).group.participantId,
          pb = (await getGroup(b, g)).group.participantId,
          po = (await getGroup(o, g)).group.participantId;
        await command(a, g, {
          kind: "membership",
          participantId: pb,
          operation: "owner",
        });
        let begin!: () => void, resume!: () => void;
        const started = new Promise<void>((r) => (begin = r)),
          continueAfterExit = new Promise<void>((r) => (resume = r));
        const olderTransaction = withDomainTransaction(b, async (t) => {
          await t.db.execute(sql`SELECT transaction_timestamp()`);
          begin();
          await continueAfterExit;
          let current = await lockGroup(t, g);
          await executeGroupCommand(t, b, {
            kind: "bill",
            groupId: g,
            expectedVersion: current.version,
            clientCommandId: randomUUID(),
            bill: {
              description: "Unrelated later bill",
              expenseDate: "2026-10-15",
              totalMinor: "600",
              splitMethod: "equal",
              contributions: [{ participantId: po, amountMinor: "600" }],
              shares: [{ participantId: pb }, { participantId: po }],
            },
          });
          current = await lockGroup(t, g);
          return executeGroupCommand(t, b, {
            kind: "settlement",
            groupId: g,
            expectedVersion: current.version,
            clientCommandId: randomUUID(),
            recipientId: po,
            mode: "custom",
            amountMinor: "500",
            paymentDate: "2026-10-15",
            allocations: [],
            acknowledgeAdvance: true,
          });
        });
        await started;
        try {
          await command(a, g, {
            kind: "membership",
            participantId: pa,
            operation: "leave",
          });
        } finally {
          resume();
        }
        const hidden = await olderTransaction;
        const before = await getGroup(a, g);
        expect(before.bills).toHaveLength(1);
        expect(
          before.ledger!.settlements.some((s) => s.id === hidden.subjectId),
        ).toBe(false);
        const visible = await command(o, g, {
          kind: "settlement",
          recipientId: pb,
          mode: "custom",
          amountMinor: "500",
          paymentDate: "2026-10-15",
          allocations: [],
        });
        await command(b, g, {
          kind: "settlement_transition",
          settlementId: visible.subjectId,
          expectedSettlementVersion: 1,
          operation: "confirm",
          reason: "Received on historical source",
        });
        const after = await getGroup(a, g);
        expect(after.group.active).toBe(false);
        expect(after.ledger!.settlements.map((s) => s.id)).toEqual([
          visible.subjectId,
        ]);
        expect(
          after.participants.reduce((n, p) => n + BigInt(p.netMinor), 0n),
        ).toBe(0n);
      }),
    20000,
  );
  it(
    "relinks one actual private payment from a cancelled report to reviewed corrected allocations without another cash deduction",
    async () =>
      fixture(async (a, b, _o, g) => {
        await invite(a, b, g);
        const account = await cash(b);
        await bill(a, g, "2000");
        const recipient = (await getGroup(a, g)).group.participantId;
        const report = async () =>
          command(b, g, {
            kind: "settlement",
            recipientId: recipient,
            mode: "custom",
            amountMinor: "400",
            paymentDate: "2026-10-15",
            allocations: [],
          });
        const old = await report(),
          ref = {
            groupId: g,
            sourceKind: "settlement",
            sourceId: old.subjectId,
          };
        let p = await getGroupEffectPreview(b, ref);
        const original = (await adoptGroupEffect(b, {
          ...ref,
          clientCommandId: randomUUID(),
          expectedSourceHash: p.sourceHash,
          expectedFinancialRevision: p.financialRevision,
          approved: true,
          funding: { kind: "cash", accountId: account.accountId },
        })) as { actionId: string; actionRevisionId: string };
        await command(a, g, {
          kind: "settlement_transition",
          settlementId: old.subjectId,
          expectedSettlementVersion: 1,
          operation: "dispute",
          reason: "Please review allocation evidence",
        });
        await command(b, g, {
          kind: "settlement_transition",
          settlementId: old.subjectId,
          expectedSettlementVersion: 2,
          operation: "cancel",
          reason: "Superseded by reviewed report",
        });
        const next = await report(),
          nextRef = { ...ref, sourceId: next.subjectId };
        p = await getGroupEffectPreview(b, nextRef);
        expect(
          p.existingMovements.some((m) => m.id === original.actionId),
        ).toBe(true);
        const result = (await adoptGroupEffect(b, {
          ...nextRef,
          clientCommandId: randomUUID(),
          expectedSourceHash: p.sourceHash,
          expectedFinancialRevision: p.financialRevision,
          approved: true,
          funding: {
            kind: "existing",
            actionId: original.actionId,
            expectedActionRevisionId: original.actionRevisionId,
          },
        })) as { actionId: string };
        expect(result.actionId).toBe(original.actionId);
        const totals = await withDomainTransaction(
          b,
          async (t) =>
            (
              await t.db.execute<{
                cash: string;
                links: number;
                revisions: number;
              }>(
                sql`SELECT (SELECT sum(p.amount_minor::numeric)::text FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE l.kind='cash_asset') cash,(SELECT count(*)::int FROM finance.private_group_link) links,(SELECT count(*)::int FROM finance.private_group_link_revision) revisions`,
              )
            ).rows[0]!,
        );
        expect(totals).toEqual({ cash: "999600", links: 1, revisions: 2 });
        expect((await getGroup(b, g)).ledger!.settlements).toHaveLength(2);
      }),
    20000,
  );
  it(
    "rejects unfinished raw transitions and mismatched allocation totals under the restricted domain role",
    async () =>
      fixture(async (a, b, o, g) => {
        await invite(a, b, g);
        const expense = await bill(a, g, "2000"),
          rev = (await getBill(a, g, expense.subjectId))[0]!,
          sender = (await getGroup(b, g)).group.participantId,
          recipient = (await getGroup(a, g)).group.participantId;
        const r = await command(b, g, {
          kind: "settlement",
          recipientId: recipient,
          mode: "custom",
          amountMinor: "500",
          paymentDate: "2026-10-15",
          allocations: [],
        });
        await expect(
          withDomainTransaction(b, async (t) => {
            await lockGroup(t, g);
            await t.db.execute(
              sql`UPDATE sharing.settlement SET state='confirmed',version=2 WHERE group_id=${g}::uuid AND id=${r.subjectId}::uuid`,
            );
          }),
        ).rejects.toThrow();
        expect((await getGroup(a, g)).ledger!.settlements[0]!.state).toBe(
          "pending",
        );
        await expect(
          withDomainTransaction(b, async (t) => {
            const group = await lockGroup(t, g),
              receipt = randomUUID(),
              settlement = randomUUID();
            await t.db.execute(
              sql`UPDATE sharing.expense_group SET version=version+1 WHERE id=${g}::uuid`,
            );
            await t.db.execute(
              sql`INSERT INTO sharing.group_command_receipt(id,group_id,client_command_id,actor_participant_id,command_type,payload_hash) VALUES(${receipt}::uuid,${g}::uuid,${randomUUID()}::uuid,${sender}::uuid,'settlement',${"ab".repeat(32)})`,
            );
            await t.db.execute(
              sql`INSERT INTO sharing.settlement(id,group_id,sender_id,recipient_id,reported_by,amount_minor,advance_minor,mode,payment_date,original_receipt_id) VALUES(${settlement}::uuid,${g}::uuid,${sender}::uuid,${recipient}::uuid,${sender}::uuid,1000,0,'custom','2026-10-15',${receipt}::uuid)`,
            );
            await t.db.execute(
              sql`INSERT INTO sharing.settlement_allocation(group_id,settlement_id,expense_id,source_revision_id,amount_minor) VALUES(${g}::uuid,${settlement}::uuid,${expense.subjectId}::uuid,${rev.revisionId}::uuid,500)`,
            );
            await t.db.execute(
              sql`INSERT INTO sharing.settlement_event(group_id,settlement_id,version,actor_id,receipt_id,to_state,confirmation_type,reason) VALUES(${g}::uuid,${settlement}::uuid,1,${sender}::uuid,${receipt}::uuid,'pending','reported','Reported actual payment')`,
            );
            await finishGroupCommand(
              t,
              { id: g, version: group.version + 1 },
              receipt,
              sender,
              "settlement",
              settlement,
              "settlement",
              { after: { settlementId: settlement, state: "pending" } },
            );
          }),
        ).rejects.toThrow(/allocation total mismatch/);
        const foreign = await withDomainTransaction(
          o,
          async (t) =>
            (
              await t.db.execute(
                sql`SELECT id FROM sharing.settlement UNION ALL SELECT id FROM sharing.refund UNION ALL SELECT id FROM sharing.settlement_event`,
              )
            ).rows,
        );
        expect(foreign).toEqual([]);
      }),
    20000,
  );
  it.each(["cash", "card"])(
    "reviews changed %s funding and removal of a previously adopted allocation without duplicating funds",
    async (mode) =>
      fixture(async (a, b, _o, g) => {
        await invite(a, b, g);
        const account = await cash(a),
          card = await createCreditCard({
            ...privateScope(a),
            clientCommandId: randomUUID(),
            name: "Private correction card",
            issuerName: "Private issuer",
          }),
          expense = await bill(a, g, "2000");
        const funding =
          mode === "cash"
            ? { kind: "cash", accountId: account.accountId }
            : { kind: "card", cardId: card.cardId, postingDate: "2026-10-11" };
        const adopt = async (
          funding: unknown,
          acknowledgeFundingCorrection?: boolean,
        ) => {
          const p = await getAdoptionPreview(a, g, expense.subjectId);
          return adoptGroupExpense(a, {
            clientCommandId: randomUUID(),
            groupId: g,
            expenseId: expense.subjectId,
            expectedSourceRevisionId: p.revisionId,
            expectedSourceHash: p.sourceHash,
            expectedFinancialRevision: p.financialRevision,
            approved: true,
            funding,
            ...(acknowledgeFundingCorrection === undefined
              ? {}
              : { acknowledgeFundingCorrection }),
          });
        };
        await adopt(funding);
        let rev = (await getBill(a, g, expense.subjectId))[0]!;
        const pa = (await getGroup(a, g)).group.participantId,
          pb = (await getGroup(b, g)).group.participantId;
        await command(a, g, {
          kind: "bill",
          expenseId: expense.subjectId,
          expectedRevisionId: rev.revisionId,
          reason: "Correct actual amount",
          bill: {
            description: rev.description,
            expenseDate: rev.expenseDate,
            totalMinor: "3000",
            splitMethod: "equal",
            contributions: [{ participantId: pa, amountMinor: "3000" }],
            shares: [{ participantId: pa }, { participantId: pb }],
          },
        });
        await expect(adopt({ kind: "keep" })).rejects.toThrow(
          /actual funding/i,
        );
        await expect(adopt(funding)).rejects.toThrow(/explicitly approve/i);
        await adopt(funding, true);
        const totals = () =>
          withDomainTransaction(
            a,
            async (t) =>
              (
                await t.db.execute<{ kind: string; n: string }>(
                  sql`SELECT l.kind,sum(p.amount_minor::numeric)::text n FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id GROUP BY l.kind`,
                )
              ).rows,
          );
        expect(
          (await totals()).find(
            (p) =>
              p.kind === (mode === "cash" ? "cash_asset" : "card_liability"),
          )!.n,
        ).toBe(mode === "cash" ? "997000" : "-3000");
        rev = (await getBill(a, g, expense.subjectId))[0]!;
        await command(a, g, {
          kind: "bill",
          expenseId: expense.subjectId,
          expectedRevisionId: rev.revisionId,
          reason: "Correct payer and participation",
          bill: {
            description: rev.description,
            expenseDate: rev.expenseDate,
            totalMinor: "3000",
            splitMethod: "exact",
            contributions: [{ participantId: pb, amountMinor: "3000" }],
            shares: [{ participantId: pb, amountMinor: "3000" }],
          },
        });
        await adopt({ kind: "none" }, true);
        expect(
          (await totals()).find(
            (p) =>
              p.kind === (mode === "cash" ? "cash_asset" : "card_liability"),
          )!.n,
        ).toBe(mode === "cash" ? "1000000" : "0");
        expect(
          (await getAdoptionPreview(a, g, expense.subjectId))
            .needsPrivateCorrection,
        ).toBe(false);
      }),
    20000,
  );
  it(
    "keeps a card refund exact through independent bill and clearing review",
    async () =>
      fixture(async (a, b, _o, g) => {
        await invite(a, b, g);
        const card = await createCreditCard({
            ...privateScope(a),
            clientCommandId: randomUUID(),
            name: "Private refund card",
            issuerName: "Private issuer",
          }),
          expense = await bill(a, g, "2000"),
          pa = (await getGroup(a, g)).group.participantId,
          pb = (await getGroup(b, g)).group.participantId;
        const adopt = async (funding: unknown) => {
          const p = await getAdoptionPreview(a, g, expense.subjectId);
          return adoptGroupExpense(a, {
            clientCommandId: randomUUID(),
            groupId: g,
            expenseId: expense.subjectId,
            expectedSourceRevisionId: p.revisionId,
            expectedSourceHash: p.sourceHash,
            expectedFinancialRevision: p.financialRevision,
            approved: true,
            funding,
          });
        };
        await adopt({
          kind: "card",
          cardId: card.cardId,
          postingDate: "2026-10-11",
        });
        const rev = (await getBill(a, g, expense.subjectId))[0]!;
        const refund = await command(a, g, {
            kind: "refund",
            expenseId: expense.subjectId,
            expectedRevisionId: rev.revisionId,
            totalMinor: "400",
            refundDate: "2026-10-15",
            reason: "Actual card refund",
            received: [{ participantId: pa, amountMinor: "400" }],
            shareCredits: [
              { participantId: pa, amountMinor: "100" },
              { participantId: pb, amountMinor: "300" },
            ],
          }),
          ref = {
            groupId: g,
            sourceKind: "refund",
            sourceId: refund.subjectId,
          };
        const accept = async (funding: unknown) => {
          const p = await getGroupEffectPreview(a, ref);
          return adoptGroupEffect(a, {
            ...ref,
            clientCommandId: randomUUID(),
            expectedSourceHash: p.sourceHash,
            expectedFinancialRevision: p.financialRevision,
            approved: true,
            funding,
          });
        };
        await accept({
          kind: "card",
          cardId: card.cardId,
          postingDate: "2026-10-16",
        });
        await command(a, g, {
          kind: "bill",
          expenseId: expense.subjectId,
          expectedRevisionId: rev.revisionId,
          reason: "Correct own shares after refund",
          bill: {
            description: rev.description,
            expenseDate: rev.expenseDate,
            totalMinor: "2000",
            splitMethod: "exact",
            contributions: rev.contributions,
            shares: [
              { participantId: pa, amountMinor: "500" },
              { participantId: pb, amountMinor: "1500" },
            ],
          },
        });
        await accept({ kind: "keep" });
        await adopt({ kind: "keep" });
        await accept({ kind: "keep" });
        const rows = await withDomainTransaction(
          a,
          async (t) =>
            (
              await t.db.execute<{ liability: string; refunds: number }>(
                sql`SELECT (SELECT sum(amount_minor::numeric)::text FROM finance.posting WHERE ledger_account_id IN(SELECT liability_ledger_account_id FROM finance.credit_card)) liability,(SELECT count(*)::int FROM finance.card_activity WHERE activity_kind='refund') refunds`,
              )
            ).rows[0]!,
        );
        expect(rows).toEqual({ liability: "-1600", refunds: 1 });
      }),
    20000,
  );
  it(
    "exports adopted private evidence and restores trusted historical acceptance without changing group authority or trusting edited bundles",
    async () =>
      fixture(async (a, b, o, g) => {
        await invite(a, b, g);
        const account = await cash(a),
          expense = await bill(a, g, "2000"),
          p = await getAdoptionPreview(a, g, expense.subjectId);
        await adoptGroupExpense(a, {
          clientCommandId: randomUUID(),
          groupId: g,
          expenseId: expense.subjectId,
          expectedSourceRevisionId: p.revisionId,
          expectedSourceHash: p.sourceHash,
          expectedFinancialRevision: p.financialRevision,
          approved: true,
          funding: { kind: "cash", accountId: account.accountId },
        });
        const exported = (await prepareWorkspaceExport(a, randomUUID())) as {
            exportRunId: string;
          },
          bundle = await downloadWorkspaceExport(a, exported.exportRunId);
        expect(
          bundle.entities.find((e) => e.kind === "finance.private_group_link")!
            .records,
        ).toHaveLength(1);
        expect(bundle.entities.some((e) => e.kind.startsWith("sharing."))).toBe(
          false,
        );
        const foreignPreview = (await previewWorkspaceRestore(o, {
          clientCommandId: randomUUID(),
          bundle,
        })) as { runId: string; preview: { blockers: string[] } };
        expect(foreignPreview.preview.blockers).toContain(
          "SHARED_PRIVATE_HISTORY_REQUIRES_UNMODIFIED_TRUSTED_OWN_EXPORT",
        );
        await withDomainTransaction(a, async (ownerTx) => {
          await ownerTx.db.execute(
            sql`SELECT id FROM sharing.expense_group WHERE id=${g}::uuid FOR UPDATE`,
          );
          await withDomainTransaction(o, async (outsiderTx) => {
            expect(
              (
                await outsiderTx.db.execute<{ v: boolean }>(
                  sql`SELECT sharing.visible(${g}::uuid) v`,
                )
              ).rows[0]!.v,
            ).toBe(false);
            await outsiderTx.db.execute(sql`SET LOCAL lock_timeout='100ms'`);
            // Even a blocked, foreign uploaded bundle must not acquire another
            // group's mutex before restore's authorization preflight rejects it.
            await outsiderTx.db.execute(
              sql`SELECT ops.lock_shared_restore_groups(${foreignPreview.runId}::uuid)`,
            );
          });
        });
        const rev = (await getBill(a, g, expense.subjectId))[0]!,
          pb = (await getGroup(b, g)).group.participantId;
        await command(a, g, {
          kind: "bill",
          expenseId: expense.subjectId,
          expectedRevisionId: rev.revisionId,
          reason: "Changed shares after export",
          bill: {
            description: rev.description,
            expenseDate: rev.expenseDate,
            totalMinor: "2000",
            splitMethod: "exact",
            contributions: rev.contributions,
            shares: [
              {
                participantId:
                  p.revisionId === rev.revisionId
                    ? (await getGroup(a, g)).group.participantId
                    : "",
                amountMinor: "500",
              },
              { participantId: pb, amountMinor: "1500" },
            ],
          },
        });
        const groupVersion = (await getGroup(a, g)).group.version;
        const correctedPreview = await getAdoptionPreview(
          a,
          g,
          expense.subjectId,
        );
        await reviewGroupSource(a, {
          clientCommandId: randomUUID(),
          groupId: g,
          linkId: correctedPreview.link!.id,
          expectedLinkRevisionId: correctedPreview.link!.linkRevisionId,
          expectedSourceHash: correctedPreview.sourceHash,
          expectedFinancialRevision: correctedPreview.financialRevision,
          approved: true,
          reason: "Retain prior evidence pending verification",
        });
        await adoptGroupExpense(a, {
          clientCommandId: randomUUID(),
          groupId: g,
          expenseId: expense.subjectId,
          expectedSourceRevisionId: correctedPreview.revisionId,
          expectedSourceHash: correctedPreview.sourceHash,
          expectedFinancialRevision: correctedPreview.financialRevision,
          approved: true,
          funding: { kind: "keep" },
        });
        const preview = (await previewWorkspaceRestore(a, {
          clientCommandId: randomUUID(),
          bundle,
        })) as {
          runId: string;
          previewHash: string;
          preview: { blockers: string[] };
        };
        expect(preview.preview.blockers).toEqual([]);
        expect(
          await restoreWorkspace(a, {
            clientCommandId: randomUUID(),
            runId: preview.runId,
            previewHash: preview.previewHash,
            confirmation: "replace-private-workspace",
          }),
        ).toMatchObject({ restored: true });
        expect((await getGroup(a, g)).group.version).toBe(groupVersion);
        expect(
          (await getAdoptionPreview(a, g, expense.subjectId))
            .needsPrivateCorrection,
        ).toBe(true);
        const recovery = await downloadWorkspaceRecovery(a, preview.runId);
        expect(
          recovery.entities.find(
            (e) => e.kind === "finance.private_group_review",
          )!.records,
        ).toHaveLength(1);
        const recoverPreview = (await previewWorkspaceRestore(a, {
          clientCommandId: randomUUID(),
          bundle: recovery,
        })) as {
          runId: string;
          previewHash: string;
          preview: { blockers: string[] };
        };
        expect(recoverPreview.preview.blockers).toEqual([]);
        expect(
          await restoreWorkspace(a, {
            clientCommandId: randomUUID(),
            runId: recoverPreview.runId,
            previewHash: recoverPreview.previewHash,
            confirmation: "replace-private-workspace",
          }),
        ).toMatchObject({ restored: true });
        const recoveredAdoption = await getAdoptionPreview(
          a,
          g,
          expense.subjectId,
        );
        expect(recoveredAdoption.needsPrivateCorrection).toBe(false);
        expect(recoveredAdoption.retainedAmounts!.spendingMinor).toBe("500");
        expect(recoveredAdoption.review).toBeNull();
        const changed = structuredClone(bundle),
          link = changed.entities.find(
            (e) => e.kind === "finance.private_group_link_revision",
          )!.records[0]!;
        link.share_minor = "999";
        const { checksumSha256: ignored, ...unsigned } = changed;
        void ignored;
        changed.checksumSha256 = previewDigest(unsigned);
        const rejected = (await previewWorkspaceRestore(a, {
          clientCommandId: randomUUID(),
          bundle: changed,
        })) as { preview: { blockers: string[] } };
        expect(rejected.preview.blockers).toContain(
          "SHARED_PRIVATE_HISTORY_REQUIRES_UNMODIFIED_TRUSTED_OWN_EXPORT",
        );
      }),
    25000,
  );
  it(
    "preserves actual cash through pending clearing, confirmed classification and reversal, independently for each owner",
    async () =>
      fixture(async (a, b, _o, g) => {
        await invite(a, b, g);
        const ba = await cash(a),
          bb = await cash(b),
          expense = await bill(a, g, "2000");
        for (const [actor, funding] of [
          [a, { kind: "cash", accountId: ba.accountId }],
          [b, { kind: "none" }],
        ] as const) {
          const p = await getAdoptionPreview(actor, g, expense.subjectId);
          await adoptGroupExpense(actor, {
            clientCommandId: randomUUID(),
            groupId: g,
            expenseId: expense.subjectId,
            expectedSourceRevisionId: p.revisionId,
            expectedSourceHash: p.sourceHash,
            expectedFinancialRevision: p.financialRevision,
            approved: true,
            funding,
          });
        }
        const recipient = (await getGroup(a, g)).group.participantId,
          r = await command(b, g, {
            kind: "settlement",
            recipientId: recipient,
            mode: "custom",
            amountMinor: "400",
            paymentDate: "2026-10-15",
            allocations: [],
          });
        const ref = {
          groupId: g,
          sourceKind: "settlement",
          sourceId: r.subjectId,
        };
        const accept = async (actor: SharingActor, funding: unknown) => {
          const p = await getGroupEffectPreview(actor, ref);
          const c = {
            ...ref,
            clientCommandId: randomUUID(),
            expectedSourceHash: p.sourceHash,
            expectedFinancialRevision: p.financialRevision,
            approved: true,
            funding,
          };
          const result = await adoptGroupEffect(actor, c);
          expect(await adoptGroupEffect(actor, c)).toEqual(result);
          return result;
        };
        const totals = async (actor: SharingActor) =>
          withDomainTransaction(
            actor,
            async (t) =>
              (
                await t.db.execute<{ kind: string; amount: string }>(
                  sql`SELECT l.kind,sum(p.amount_minor::numeric)::text amount FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id GROUP BY l.kind ORDER BY l.kind`,
                )
              ).rows,
          );
        await accept(b, { kind: "cash", accountId: bb.accountId });
        let t = await totals(b);
        expect(t.find((p) => p.kind === "cash_asset")!.amount).toBe("999600");
        expect(t.find((p) => p.kind === "payment_clearing_asset")!.amount).toBe(
          "400",
        );
        expect(
          t.find((p) => p.kind === "group_payable_liability")!.amount,
        ).toBe("-1000");
        await command(a, g, {
          kind: "settlement_transition",
          settlementId: r.subjectId,
          expectedSettlementVersion: 1,
          operation: "confirm",
          reason: "Actual payment received",
        });
        expect((await getGroupEffectPreview(b, ref)).needsReview).toBe(true);
        await accept(b, { kind: "keep" });
        t = await totals(b);
        expect(t.find((p) => p.kind === "cash_asset")!.amount).toBe("999600");
        expect(t.find((p) => p.kind === "payment_clearing_asset")!.amount).toBe(
          "0",
        );
        expect(
          t.find((p) => p.kind === "group_payable_liability")!.amount,
        ).toBe("-600");
        await accept(a, { kind: "cash", accountId: ba.accountId });
        expect(
          (await totals(a)).find((p) => p.kind === "cash_asset")!.amount,
        ).toBe("998400");
        await command(a, g, {
          kind: "settlement_transition",
          settlementId: r.subjectId,
          expectedSettlementVersion: 2,
          operation: "reverse",
          reason: "Shared confirmation withdrawn; actual funds not returned",
        });
        await accept(b, { kind: "keep" });
        t = await totals(b);
        expect(t.find((p) => p.kind === "cash_asset")!.amount).toBe("999600");
        expect(t.find((p) => p.kind === "payment_clearing_asset")!.amount).toBe(
          "400",
        );
        expect(
          t.find((p) => p.kind === "group_payable_liability")!.amount,
        ).toBe("-1000");
      }),
    20000,
  );
  it(
    "reviews stale private adoption with immutable cash-preserving revisions and independently adopts exact refund effects",
    async () =>
      fixture(async (a, b, _o, g) => {
        await invite(a, b, g);
        const account = await cash(a),
          expense = await bill(a, g, "2000"),
          pa = (await getGroup(a, g)).group.participantId,
          pb = (await getGroup(b, g)).group.participantId;
        const adopt = async (actor: SharingActor, funding: unknown) => {
          const p = await getAdoptionPreview(actor, g, expense.subjectId);
          return adoptGroupExpense(actor, {
            clientCommandId: randomUUID(),
            groupId: g,
            expenseId: expense.subjectId,
            expectedSourceRevisionId: p.revisionId,
            expectedSourceHash: p.sourceHash,
            expectedFinancialRevision: p.financialRevision,
            approved: true,
            funding,
          });
        };
        await adopt(a, { kind: "cash", accountId: account.accountId });
        await adopt(b, { kind: "none" });
        let rev = (await getBill(a, g, expense.subjectId))[0]!;
        await command(a, g, {
          kind: "bill",
          expenseId: expense.subjectId,
          expectedRevisionId: rev.revisionId,
          reason: "Correct personal shares",
          bill: {
            description: rev.description,
            expenseDate: rev.expenseDate,
            totalMinor: "2000",
            splitMethod: "exact",
            contributions: [{ participantId: pa, amountMinor: "2000" }],
            shares: [
              { participantId: pa, amountMinor: "500" },
              { participantId: pb, amountMinor: "1500" },
            ],
          },
        });
        expect(
          (await getAdoptionPreview(a, g, expense.subjectId))
            .needsPrivateCorrection,
        ).toBe(true);
        await adopt(a, { kind: "keep" });
        expect(
          (await getAdoptionPreview(a, g, expense.subjectId))
            .needsPrivateCorrection,
        ).toBe(false);
        expect(
          (await getAdoptionPreview(b, g, expense.subjectId))
            .needsPrivateCorrection,
        ).toBe(true);
        const cashAmount = () =>
          withDomainTransaction(
            a,
            async (t) =>
              (
                await t.db.execute<{ n: string }>(
                  sql`SELECT sum(p.amount_minor::numeric)::text n FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE l.kind='cash_asset'`,
                )
              ).rows[0]!.n,
          );
        expect(await cashAmount()).toBe("998000");
        rev = (await getBill(a, g, expense.subjectId))[0]!;
        const refund = await command(a, g, {
          kind: "refund",
          expenseId: expense.subjectId,
          expectedRevisionId: rev.revisionId,
          totalMinor: "400",
          refundDate: "2026-10-15",
          reason: "Merchant partial refund",
          received: [{ participantId: pa, amountMinor: "400" }],
          shareCredits: [
            { participantId: pa, amountMinor: "100" },
            { participantId: pb, amountMinor: "300" },
          ],
        });
        const ref = {
            groupId: g,
            sourceKind: "refund",
            sourceId: refund.subjectId,
          },
          p = await getGroupEffectPreview(a, ref);
        expect(p.spendingMinor).toBe("-100");
        expect(p.groupMinor).toBe("-300");
        await adoptGroupEffect(a, {
          ...ref,
          clientCommandId: randomUUID(),
          expectedSourceHash: p.sourceHash,
          expectedFinancialRevision: p.financialRevision,
          approved: true,
          funding: { kind: "cash", accountId: account.accountId },
        });
        expect(await cashAmount()).toBe("998400");
        const report = await getFinancialReport({
          ...privateScope(a),
          query: {
            period: "custom",
            startDate: "2026-10-01",
            endDate: "2026-10-31",
          },
        });
        expect(report.metrics.gross).toBe("500");
        expect(report.metrics.offsets).toBe("100");
        expect(report.metrics.net).toBe("400");
      }),
    20000,
  );
  it("keeps partial multi-bill payments pending until the authenticated recipient confirms, then reverses with evidence", async () =>
    fixture(async (a, b, o, g) => {
      await invite(a, b, g);
      const one = await bill(a, g, "2000"),
        two = await bill(a, g, "1200");
      let d = await getGroup(b, g);
      const recipient = d.participants.find(
        (p) => p.id !== d.group.participantId,
      )!.id;
      const allocations = [
        {
          expenseId: one.subjectId,
          sourceRevisionId: (await getBill(a, g, one.subjectId))[0]!.revisionId,
          amountMinor: "400",
        },
        {
          expenseId: two.subjectId,
          sourceRevisionId: (await getBill(a, g, two.subjectId))[0]!.revisionId,
          amountMinor: "300",
        },
      ];
      const report = await command(b, g, {
        kind: "settlement",
        recipientId: recipient,
        mode: "selected",
        amountMinor: "700",
        paymentDate: "2026-10-15",
        allocations,
      });
      d = await getGroup(a, g);
      expect(d.participants.find((p) => p.id === recipient)!.netMinor).toBe(
        "1600",
      );
      expect(
        d.ledger!.projected.positions.find(
          (p) => p.participantId === recipient,
        )!.netMinor,
      ).toBe("900");
      const transition = {
        kind: "settlement_transition",
        settlementId: report.subjectId,
        expectedSettlementVersion: 1,
        operation: "confirm",
        reason: "Received exact payment",
      };
      await expect(command(b, g, transition)).rejects.toThrow();
      await expect(getGroup(o, g)).rejects.toThrow();
      await command(a, g, transition);
      d = await getGroup(a, g);
      expect(d.participants.find((p) => p.id === recipient)!.netMinor).toBe(
        "900",
      );
      expect(d.ledger!.settlements[0]!.allocations).toHaveLength(2);
      await command(a, g, {
        ...transition,
        expectedSettlementVersion: 2,
        operation: "reverse",
        reason: "Receipt entered in error; cash reviewed separately",
      });
      d = await getGroup(a, g);
      expect(d.participants.find((p) => p.id === recipient)!.netMinor).toBe(
        "1600",
      );
      expect(d.ledger!.settlements[0]!.events.map((e) => e.toState)).toEqual([
        "pending",
        "confirmed",
        "reversed",
      ]);
    }));
  it("rejects a late allocation after the complete parent constraints have already run", async () =>
    fixture(async (a, b, _o, g) => {
      await invite(a, b, g);
      const one = await bill(a, g, "2000");
      const two = await bill(a, g, "2000");
      const snapshot = await getGroup(b, g);
      const recipientId = snapshot.participants.find(
        (p) => p.id !== snapshot.group.participantId,
      )!.id;
      const revisionOne = (await getBill(a, g, one.subjectId))[0]!.revisionId;
      const revisionTwo = (await getBill(a, g, two.subjectId))[0]!.revisionId;
      const failure = await withDomainTransaction(b, async (t) => {
        const report = await executeGroupCommand(t, b, {
          kind: "settlement",
          clientCommandId: randomUUID(),
          groupId: g,
          expectedVersion: snapshot.group.version,
          recipientId,
          mode: "selected",
          amountMinor: "500",
          paymentDate: "2026-10-15",
          allocations: [
            {
              expenseId: one.subjectId,
              sourceRevisionId: revisionOne,
              amountMinor: "500",
            },
          ],
        });
        await t.db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
        await t.db.execute(
          sql`INSERT INTO sharing.settlement_allocation(group_id,settlement_id,expense_id,source_revision_id,amount_minor) VALUES(${g}::uuid,${report.subjectId}::uuid,${two.subjectId}::uuid,${revisionTwo}::uuid,500)`,
        );
      }).then(
        () => undefined,
        (error: unknown) => (error as { cause?: unknown })?.cause ?? error,
      );
      expect(failure).toMatchObject({
        code: "23514",
        message: expect.stringContaining("allocation total mismatch"),
      });
      expect((await getGroup(b, g)).ledger!.settlements).toHaveLength(0);
    }));
  it("records full and custom payments, explicit overpayments, disputes and cancellation without false clearing", async () =>
    fixture(async (a, b, _o, g) => {
      await invite(a, b, g);
      await bill(a, g, "2000");
      let d = await getGroup(b, g);
      const recipient = d.participants.find(
        (p) => p.id !== d.group.participantId,
      )!.id;
      const body = {
        kind: "settlement",
        recipientId: recipient,
        mode: "custom",
        amountMinor: "1200",
        paymentDate: "2026-10-15",
        allocations: [],
      };
      await expect(command(b, g, body)).rejects.toThrow(/acknowledge/i);
      const r = await command(b, g, { ...body, acknowledgeAdvance: true });
      d = await getGroup(a, g);
      expect(d.ledger!.settlements[0]!.advanceMinor).toBe("200");
      await command(a, g, {
        kind: "settlement_transition",
        settlementId: r.subjectId,
        expectedSettlementVersion: 1,
        operation: "confirm",
        reason: "Received, including acknowledged advance",
      });
      d = await getGroup(a, g);
      expect(d.participants.find((p) => p.id === recipient)!.netMinor).toBe(
        "-200",
      );
      const reverseDue = await command(a, g, {
        kind: "settlement",
        recipientId: (await getGroup(b, g)).group.participantId,
        mode: "full",
        amountMinor: "200",
        paymentDate: "2026-10-15",
        allocations: [],
        acknowledgeAdvance: true,
      });
      await command(b, g, {
        kind: "settlement_transition",
        settlementId: reverseDue.subjectId,
        expectedSettlementVersion: 1,
        operation: "dispute",
        reason: "No new receipt",
      });
      expect(
        (await getGroup(a, g)).participants.find((p) => p.id === recipient)!
          .netMinor,
      ).toBe("-200");
      await command(a, g, {
        kind: "settlement_transition",
        settlementId: reverseDue.subjectId,
        expectedSettlementVersion: 2,
        operation: "cancel",
        reason: "Cancelled disputed report",
      });
      expect(
        (await getGroup(a, g)).ledger!.settlements.find(
          (s) => s.id === reverseDue.subjectId,
        )!.events,
      ).toHaveLength(3);
    }));
  it("requires explicit manual limitations and records a refund after settlement without changing the original bill", async () =>
    fixture(async (a, b, _o, g) => {
      const manual = await command(a, g, {
        kind: "manual",
        displayName: "Manual participant",
      });
      let d = await getGroup(a, g);
      const own = d.group.participantId;
      const expense = await command(a, g, {
        kind: "bill",
        bill: {
          description: "Manual payer",
          expenseDate: "2026-10-10",
          totalMinor: "2000",
          splitMethod: "equal",
          contributions: [
            { participantId: manual.subjectId, amountMinor: "2000" },
          ],
          shares: [{ participantId: own }, { participantId: manual.subjectId }],
        },
      });
      const report = await command(a, g, {
        kind: "settlement",
        recipientId: manual.subjectId,
        mode: "full",
        amountMinor: "1000",
        paymentDate: "2026-10-15",
        allocations: [],
      });
      const transition = {
        kind: "settlement_transition",
        settlementId: report.subjectId,
        expectedSettlementVersion: 1,
        operation: "manual_confirm",
        reason: "Owner recorded manual cash receipt",
      };
      await expect(command(a, g, transition)).rejects.toThrow();
      await command(a, g, { ...transition, acknowledgeManualLimitation: true });
      d = await getGroup(a, g);
      expect(d.participants.find((p) => p.id === own)!.netMinor).toBe("0");
      const rev = (await getBill(a, g, expense.subjectId))[0]!;
      await command(a, g, {
        kind: "refund",
        expenseId: expense.subjectId,
        expectedRevisionId: rev.revisionId,
        totalMinor: "600",
        refundDate: "2026-10-15",
        reason: "Partial merchant refund",
        received: [{ participantId: manual.subjectId, amountMinor: "600" }],
        shareCredits: [
          { participantId: own, amountMinor: "300" },
          { participantId: manual.subjectId, amountMinor: "300" },
        ],
      });
      d = await getGroup(a, g);
      expect(d.participants.find((p) => p.id === own)!.netMinor).toBe("300");
      expect(d.ledger!.settlements[0]!.state).toBe("confirmed");
      expect(d.ledger!.settlements[0]!.events[1]!.confirmationType).toBe(
        "manual_entry",
      );
      expect((await getBill(a, g, expense.subjectId))[0]!.totalMinor).toBe(
        "2000",
      );
      const accepted = await invite(a, b, g, manual.subjectId);
      expect(accepted.review.netMinor).toBe("-300");
      expect(accepted.review.refunds).toHaveLength(1);
      expect(accepted.review.settlements[0]!.events[1]!.confirmationType).toBe(
        "manual_entry",
      );
      expect((await getGroup(b, g)).group.participantId).toBe(manual.subjectId);
    }));
});
describe("V2-I focused group and private boundary", () => {
  it(
    "replays concurrent group creation and rejects an existing group under a new creation command",
    () =>
      fixture(async (a, b, o, g) => {
        void b;
        void o;
        void g;
        const c = {
          kind: "create",
          groupId: randomUUID(),
          clientCommandId: randomUUID(),
          name: "Concurrent creation",
          displayName: "A",
        };
        const [first, second] = await Promise.all([
          recordGroupCommand(a, c),
          recordGroupCommand(a, c),
        ]);
        expect(second).toEqual(first);
        await expect(
          recordGroupCommand(a, {
            ...c,
            clientCommandId: randomUUID(),
            name: "Changed creation",
          }),
        ).rejects.toThrow();
        expect((await getGroup(a, c.groupId)).group.name).toBe(
          "Concurrent creation",
        );
      }),
    20000,
  );
  it("forces RLS and denies new table access to authentication, queue and worker roles", async () => {
    const c = await admin();
    try {
      const tables = (
        await c.query(
          "SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND (n.nspname='sharing' OR n.nspname='finance' AND c.relname IN('group_ledger_binding','private_group_link','private_group_link_revision','private_group_review') OR n.nspname='audit' AND c.relname='group_revision' OR n.nspname='ops' AND c.relname='shared_bundle_proof')",
        )
      ).rows;
      expect(tables).toHaveLength(22);
      for (const t of tables) {
        expect(t.relrowsecurity && t.relforcerowsecurity).toBe(true);
        for (const role of ["auth_adapter", "queue_broker", "worker_domain"])
          expect(
            (
              await c.query(
                "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",
                [role, `${t.nspname}.${t.relname}`],
              )
            ).rows[0].allowed,
          ).toBe(false);
      }
      for (const r of (
        await c.query(
          "SELECT rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname IN('app_domain','auth_adapter','queue_broker','worker_domain','lifecycle_operator')",
        )
      ).rows)
        expect(r).toEqual({
          rolsuper: false,
          rolbypassrls: false,
          rolinherit: false,
        });
    } finally {
      await c.end();
    }
  });
  it(
    "binds single-use invitations to verified email, replays acceptance, and prevents foreign/private reads",
    () =>
      fixture(async (a, b, o, g) => {
        const token = randomBytes(32).toString("hex");
        await command(a, g, {
          kind: "invite",
          email: `${b.userId}@example.test`,
          token,
        });
        await expect(
          invitationCommand(o, { kind: "review", token }),
        ).rejects.toThrow();
        await getAuthPool().query(
          'UPDATE auth."user" SET email_verified=false WHERE id=$1',
          [b.userId],
        );
        await expect(
          invitationCommand(b, { kind: "review", token }),
        ).rejects.toThrow();
        await getAuthPool().query(
          'UPDATE auth."user" SET email_verified=true WHERE id=$1',
          [b.userId],
        );
        const review = (await invitationCommand(b, {
          kind: "review",
          token,
        })) as { version: number };
        const c = {
          kind: "accept",
          token,
          clientCommandId: randomUUID(),
          expectedVersion: review.version,
          consent: true,
          displayName: "B",
        };
        const first = await invitationCommand(b, c);
        expect(await invitationCommand(b, c)).toEqual(first);
        await expect(getGroup(o, g)).rejects.toThrow();
        expect(
          await withDomainTransaction(
            b,
            async (t) =>
              (
                await t.db.execute(
                  sql`SELECT id FROM core.workspace WHERE id=${a.workspaceId}::uuid`,
                )
              ).rows,
          ),
        ).toEqual([]);
        await expect(
          command(b, g, { kind: "manual", displayName: "Forged" }),
        ).rejects.toThrow();
      }),
    20000,
  );
  it(
    "requires fresh manual-claim consent and preserves the participant identity",
    () =>
      fixture(async (a, b, o, g) => {
        void o;
        const manual = await command(a, g, {
          kind: "manual",
          displayName: "Recorded B",
        });
        await bill(a, g);
        const token = randomBytes(32).toString("hex");
        await command(a, g, {
          kind: "invite",
          email: `${b.userId}@example.test`,
          token,
          claimParticipantId: manual.subjectId,
        });
        const review = (await invitationCommand(b, {
          kind: "review",
          token,
        })) as { version: number; shareMinor: string };
        expect(review.shareMinor).toBe("60000");
        await command(a, g, { kind: "manual", displayName: "C" });
        await expect(
          invitationCommand(b, {
            kind: "accept",
            token,
            clientCommandId: randomUUID(),
            expectedVersion: review.version,
            consent: true,
            displayName: "B",
          }),
        ).rejects.toThrow();
        const fresh = (await invitationCommand(b, {
          kind: "review",
          token,
        })) as { version: number };
        await invitationCommand(b, {
          kind: "accept",
          token,
          clientCommandId: randomUUID(),
          expectedVersion: fresh.version,
          consent: true,
          displayName: "B",
        });
        expect((await getGroup(b, g)).group.participantId).toBe(
          manual.subjectId,
        );
      }),
    20000,
  );
  it(
    "retains only pre-exit bill entitlements, rejects last-owner exit, and serializes commands",
    () =>
      fixture(async (a, b, o, g) => {
        void o;
        await invite(a, b, g);
        const original = await bill(a, g);
        await expect(
          command(a, g, {
            kind: "membership",
            participantId: (await getGroup(a, g)).group.participantId,
            operation: "leave",
          }),
        ).rejects.toThrow();
        await command(b, g, {
          kind: "membership",
          participantId: (await getGroup(b, g)).group.participantId,
          operation: "leave",
        });
        await bill(a, g, "200");
        const former = await getGroup(b, g);
        expect(former.group.active).toBe(false);
        expect(former.bills.map((x) => x.id)).toEqual([original.subjectId]);
        const history = await getBill(a, g, original.subjectId),
          pa = (await getGroup(a, g)).group.participantId,
          pb = former.group.participantId;
        await command(a, g, {
          kind: "bill",
          expenseId: original.subjectId,
          expectedRevisionId: history[0]!.revisionId,
          reason: "Correct a historical obligation",
          bill: {
            description: "Revised dinner",
            expenseDate: "2026-10-10",
            totalMinor: "200",
            splitMethod: "equal",
            contributions: [{ participantId: pa, amountMinor: "200" }],
            shares: [{ participantId: pa }, { participantId: pb }],
          },
        });
        expect(await getBill(b, g, original.subjectId)).toHaveLength(2);
        expect((await getGroup(b, g)).bills).toHaveLength(1);
        const { group } = await getGroup(a, g),
          base = {
            kind: "manual",
            groupId: g,
            expectedVersion: group.version,
            displayName: "Race",
          };
        const race = await Promise.allSettled([
          recordGroupCommand(a, { ...base, clientCommandId: randomUUID() }),
          recordGroupCommand(a, { ...base, clientCommandId: randomUUID() }),
        ]);
        expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      }),
    20000,
  );
  it(
    "uses full bigint money, selected people, multiple payers and only current revisions",
    () =>
      fixture(async (a, b, o, g) => {
        void o;
        await invite(a, b, g);
        const d = await getGroup(a, g),
          pa = d.group.participantId,
          pb = (await getGroup(b, g)).group.participantId;
        const large = "9223372036854775807",
          first = await command(a, g, {
            kind: "bill",
            bill: {
              description: "Big exact bill",
              expenseDate: "2026-10-10",
              totalMinor: large,
              splitMethod: "equal",
              contributions: [
                { participantId: pa, amountMinor: "9223372036854775800" },
                { participantId: pb, amountMinor: "7" },
              ],
              shares: [{ participantId: pa }, { participantId: pb }],
            },
          });
        let balances = (await getGroup(a, g)).participants;
        expect(balances.reduce((s, p) => s + BigInt(p.netMinor), 0n)).toBe(0n);
        const history = await getBill(a, g, first.subjectId);
        expect(history[0]!.totalMinor).toBe(large);
        await command(a, g, {
          kind: "bill",
          expenseId: first.subjectId,
          expectedRevisionId: history[0]!.revisionId,
          reason: "Review exact total",
          bill: {
            description: "Reviewed",
            expenseDate: "2026-10-10",
            totalMinor: "100",
            splitMethod: "exact",
            contributions: [{ participantId: pa, amountMinor: "100" }],
            shares: [{ participantId: pb, amountMinor: "100" }],
          },
        });
        expect(await getBill(a, g, first.subjectId)).toHaveLength(2);
        balances = (await getGroup(a, g)).participants;
        expect(balances.find((p) => p.id === pa)!.netMinor).toBe("100");
        expect(balances.reduce((s, p) => s + BigInt(p.netMinor), 0n)).toBe(0n);
      }),
    20000,
  );
  it(
    "rejects raw RLS, unfinished receipts, forged sums, cross-group references and immutable evidence edits",
    () =>
      fixture(async (a, b, o, g) => {
        void b;
        void o;
        await bill(a, g);
        const d = await getGroup(a, g),
          h = await getBill(a, g, d.bills[0]!.id);
        await expect(
          withDomainTransaction(a, (t) =>
            t.db.execute(
              sql`UPDATE sharing.expense_revision SET total_minor=total_minor+1 WHERE group_id=${g}::uuid AND id=${h[0]!.revisionId}::uuid`,
            ),
          ),
        ).rejects.toThrow();
        await expect(
          withDomainTransaction(a, (t) =>
            t.db.execute(
              sql`INSERT INTO sharing.group_command_receipt(group_id,client_command_id,actor_participant_id,command_type,payload_hash) VALUES(${g}::uuid,${randomUUID()}::uuid,${d.group.participantId}::uuid,'forged',${"12".repeat(32)})`,
            ),
          ),
        ).rejects.toThrow();
        expect(
          (await getDomainPool().query("SELECT id FROM sharing.shared_expense"))
            .rows,
        ).toEqual([]);
        await expect(
          command(a, g, {
            kind: "bill",
            bill: {
              description: "Bad",
              expenseDate: "2026-10-10",
              totalMinor: "100",
              splitMethod: "exact",
              contributions: [
                { participantId: d.group.participantId, amountMinor: "99" },
              ],
              shares: [
                { participantId: d.group.participantId, amountMinor: "100" },
              ],
            },
          }),
        ).rejects.toThrow();
        await expect(
          withDomainTransaction(a, (t) =>
            t.db.execute(
              sql`INSERT INTO sharing.member_record_access(group_id,membership_id,expense_id) VALUES(${g}::uuid,${randomUUID()}::uuid,${d.bills[0]!.id}::uuid)`,
            ),
          ),
        ).rejects.toThrow();
        await expect(
          withDomainTransaction(a, (t) =>
            t.db.execute(
              sql`INSERT INTO sharing.participant(group_id,display_name,identity_kind) VALUES(${g}::uuid,'Unaudited raw member','manual')`,
            ),
          ),
        ).rejects.toThrow();
        await expect(
          withDomainTransaction(a, async (t) => {
            const group = await lockGroup(t, g),
              r = randomUUID(),
              e = randomUUID(),
              v = randomUUID();
            await t.db.execute(
              sql`INSERT INTO sharing.group_command_receipt(id,group_id,client_command_id,actor_participant_id,command_type,payload_hash) VALUES(${r}::uuid,${g}::uuid,${randomUUID()}::uuid,${group.participantId}::uuid,'raw_bill',${"12".repeat(32)})`,
            );
            await t.db.execute(
              sql`UPDATE sharing.expense_group SET version=version+1 WHERE id=${g}::uuid`,
            );
            await t.db.execute(
              sql`INSERT INTO sharing.shared_expense(id,group_id,created_by_participant_id,current_revision_id,original_command_receipt_id) VALUES(${e}::uuid,${g}::uuid,${group.participantId}::uuid,${v}::uuid,${r}::uuid)`,
            );
            await t.db.execute(
              sql`INSERT INTO sharing.expense_revision(id,group_id,expense_id,revision_no,command_receipt_id,actor_participant_id,description,expense_date,total_minor,split_method) VALUES(${v}::uuid,${g}::uuid,${e}::uuid,1,${r}::uuid,${group.participantId}::uuid,'Raw totals','2026-10-10',100,'exact')`,
            );
            await t.db.execute(
              sql`INSERT INTO sharing.payer_contribution(group_id,expense_id,expense_revision_id,participant_id,amount_minor) VALUES(${g}::uuid,${e}::uuid,${v}::uuid,${group.participantId}::uuid,99)`,
            );
            await t.db.execute(
              sql`INSERT INTO sharing.participant_share(group_id,expense_id,expense_revision_id,participant_id,amount_minor,rounding_rank) VALUES(${g}::uuid,${e}::uuid,${v}::uuid,${group.participantId}::uuid,100,0)`,
            );
            await t.db.execute(
              sql`UPDATE sharing.expense_revision SET state='finalized' WHERE group_id=${g}::uuid AND id=${v}::uuid`,
            );
            await finishGroupCommand(
              t,
              { id: g, version: group.version + 1 },
              r,
              group.participantId,
              "expense",
              e,
              "raw_bill",
            );
          }),
        ).rejects.toThrow("payer and share totals");
      }),
    20000,
  );
  it(
    "atomically records integrated entry, rolls back bad private funding, and replays after a later group revision",
    () =>
      fixture(async (a, b, o, g) => {
        void o;
        await invite(a, b, g);
        const account = await cash(a),
          data = await getGroup(a, g),
          setup = await withDomainTransaction(
            a,
            async (t) =>
              (
                await t.db.execute<{ v: string }>(
                  sql`SELECT financial_revision::text v FROM core.workspace`,
                )
              ).rows[0]!.v,
          );
        const input = {
          groupCommand: {
            kind: "bill",
            groupId: g,
            clientCommandId: randomUUID(),
            expectedVersion: data.group.version,
            bill: {
              description: "Integrated dinner",
              expenseDate: "2026-10-10",
              totalMinor: "120000",
              splitMethod: "equal",
              contributions: [
                {
                  participantId: data.group.participantId,
                  amountMinor: "120000",
                },
              ],
              shares: data.participants.map((p) => ({ participantId: p.id })),
            },
          },
          adoption: {
            groupId: g,
            clientCommandId: randomUUID(),
            expectedFinancialRevision: setup,
            approved: true,
            funding: { kind: "cash", accountId: randomUUID() as string },
          },
        };
        await expect(recordIntegratedSharedExpense(a, input)).rejects.toThrow();
        expect((await getGroup(a, g)).bills).toHaveLength(0);
        input.adoption.funding.accountId = account.accountId;
        const [first, second] = await Promise.all([
          recordIntegratedSharedExpense(a, input),
          recordIntegratedSharedExpense(a, input),
        ]);
        expect(second).toEqual(first);
        const history = await getBill(a, g, first.group.subjectId);
        await command(a, g, {
          kind: "bill",
          expenseId: first.group.subjectId,
          expectedRevisionId: history[0]!.revisionId,
          reason: "Revised selected shares",
          bill: {
            ...input.groupCommand.bill,
            splitMethod: "exact",
            shares: [
              { participantId: data.group.participantId, amountMinor: "40000" },
              {
                participantId: (await getGroup(b, g)).group.participantId,
                amountMinor: "80000",
              },
            ],
          },
        });
        expect(
          (await getAdoptionPreview(a, g, first.group.subjectId))
            .needsPrivateCorrection,
        ).toBe(true);
        expect(await recordIntegratedSharedExpense(a, input)).toEqual(first);
      }),
    30000,
  );
  it(
    "rejects revoked and expired invitations, and enforces recent owner authentication",
    () =>
      fixture(async (a, b, o, g) => {
        void o;
        const token = randomBytes(32).toString("hex"),
          i = await command(a, g, {
            kind: "invite",
            email: `${b.userId}@example.test`,
            token,
          });
        await command(a, g, { kind: "revoke", invitationId: i.subjectId });
        await expect(
          invitationCommand(b, { kind: "review", token }),
        ).rejects.toThrow();
        const token2 = randomBytes(32).toString("hex"),
          i2 = await command(a, g, {
            kind: "invite",
            email: `${b.userId}@example.test`,
            token: token2,
          });
        const c = await admin();
        try {
          await c.query("BEGIN");
          await c.query("SET LOCAL session_replication_role='replica'");
          await c.query(
            "UPDATE sharing.invitation SET created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 day' WHERE id=$1",
            [i2.subjectId],
          );
          await c.query("COMMIT");
        } finally {
          await c.end();
        }
        await expect(
          invitationCommand(b, { kind: "review", token: token2 }),
        ).rejects.toThrow();
        await getAuthPool().query(
          "DELETE FROM auth.session_assurance WHERE session_id=$1",
          [a.sessionId],
        );
        await expect(
          command(a, g, { kind: "manual", displayName: "No assurance" }),
        ).rejects.toThrow();
      }),
    20000,
  );
  it(
    "preserves shared evidence and another private owner through approved account deletion",
    () =>
      fixture(async (a, b, o, g) => {
        void o;
        const trackerCommand = (body: Record<string, unknown>) =>
          recordTrackerCommand(
            { userId: a.userId, workspaceId: a.workspaceId },
            { clientCommandId: randomUUID(), ...body },
          );
        const tracker = await trackerCommand({
          operation: "preset",
          preset: "learning",
          name: "Purge private tracker",
        });
        await trackerCommand({
          operation: "save_entry",
          trackerId: tracker.trackerId,
          entryId: null,
          expectedRevisionId: null,
          values: { topic: "Purge immutable history" },
          reason: "Synthetic",
        });
        const definition = structuredClone(trackerPresets.learning);
        definition.fields[0]!.label = "Renamed topic";
        const version = await trackerCommand({
          operation: "publish",
          templateId: tracker.templateId,
          expectedVersionId: tracker.versionId,
          definition,
          reason: "Purge versioned history",
        });
        await trackerCommand({
          operation: "preview",
          trackerId: tracker.trackerId,
          toVersionId: version.versionId,
          rules: {},
        });

        await invite(a, b, g);
        const event = await bill(a, g),
          preview = await getAdoptionPreview(b, g, event.subjectId);
        await adoptGroupExpense(b, {
          clientCommandId: randomUUID(),
          groupId: g,
          expenseId: event.subjectId,
          expectedSourceRevisionId: preview.revisionId,
          expectedSourceHash: preview.sourceHash,
          expectedFinancialRevision: preview.financialRevision,
          approved: true,
          funding: { kind: "none" },
        });
        const client = await getDomainPool().connect();
        let requestId: string;
        try {
          requestId = await runScopedTransactionOnClient(
            client,
            a,
            async () => (await makeDeletionPending(client, a)).requestId,
          );
        } finally {
          client.release();
        }
        const env = parseEnv(readFileSync(".env.bootstrap", "utf8")),
          url = new URL(process.env.DATABASE_URL!);
        url.username = "lifecycle_operator";
        url.password = env.LIFECYCLE_OPERATOR_PASSWORD!;
        const operator = new Client({ connectionString: url.toString() }),
          c = await admin();
        await operator.connect();
        try {
          await c.query("BEGIN");
          await c.query("SET LOCAL session_replication_role='replica'");
          await c.query(
            "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1",
            [requestId],
          );
          await c.query("COMMIT");
          for (let i = 0; i < 10; i++)
            if (
              (await purgeDeletionStep(operator, requestId)).state ===
              "completed"
            )
              break;
          expect((await purgeDeletionStep(operator, requestId)).state).toBe(
            "completed",
          );
          for (const table of [
            "template",
            "template_version",
            "field_identity",
            "field_definition",
            "field_option",
            "tracker",
            "entry",
            "entry_revision",
            "template_migration",
          ])
            expect(
              (
                await c.query(
                  `SELECT count(*)::int n FROM tracker.${table} WHERE workspace_id=$1`,
                  [a.workspaceId],
                )
              ).rows[0].n,
            ).toBe(0);
          const preserved = await getGroup(b, g);
          expect(preserved.group.archived).toBe(true);
          expect(
            preserved.participants.some((p) => p.identityKind === "deleted"),
          ).toBe(true);
          expect(preserved.bills).toHaveLength(1);
          expect(
            (await getAdoptionPreview(b, g, event.subjectId)).link,
          ).not.toBeNull();
          expect(
            (
              await c.query(
                "SELECT registered_user_id FROM sharing.participant WHERE group_id=$1 AND identity_kind='deleted'",
                [g],
              )
            ).rows[0].registered_user_id,
          ).toBeNull();
        } finally {
          await operator.end();
          await c.end();
        }
      }),
    30000,
  );
  it(
    "rejects participant references from another group under the database boundary",
    () =>
      fixture(async (a, b, o, g) => {
        void b;
        void o;
        const otherGroup = randomUUID();
        await recordGroupCommand(a, {
          kind: "create",
          groupId: otherGroup,
          clientCommandId: randomUUID(),
          name: "Other group",
          displayName: "A",
        });
        const wrong = (await getGroup(a, otherGroup)).group.participantId,
          own = (await getGroup(a, g)).group.participantId;
        await expect(
          command(a, g, {
            kind: "bill",
            bill: {
              description: "Cross-scope",
              expenseDate: "2026-10-10",
              totalMinor: "100",
              splitMethod: "equal",
              contributions: [{ participantId: wrong, amountMinor: "100" }],
              shares: [{ participantId: own }],
            },
          }),
        ).rejects.toThrow();
        expect((await getGroup(a, g)).bills).toHaveLength(0);
      }),
    20000,
  );
  it(
    "retires expired bearer hashes and contacts through a bounded operator command",
    () =>
      fixture(async (a, b, o, g) => {
        void o;
        const token = randomBytes(32).toString("hex"),
          invitation = await command(a, g, {
            kind: "invite",
            email: `${b.userId}@example.test`,
            token,
          });
        const c = await admin(),
          env = parseEnv(readFileSync(".env.bootstrap", "utf8")),
          url = new URL(process.env.DATABASE_URL!);
        url.username = "lifecycle_operator";
        url.password = env.LIFECYCLE_OPERATOR_PASSWORD!;
        const operator = new Client({ connectionString: url.toString() });
        await operator.connect();
        try {
          await c.query("BEGIN");
          await c.query("SET LOCAL session_replication_role='replica'");
          await c.query(
            "UPDATE sharing.invitation SET created_at=clock_timestamp()-interval '50 days',expires_at=clock_timestamp()-interval '40 days' WHERE id=$1",
            [invitation.subjectId],
          );
          await c.query("COMMIT");
          expect(
            (
              await operator.query(
                "SELECT sharing.maintain_invitations(1) result",
              )
            ).rows[0].result.redactedInvitations,
          ).toBe(1);
          expect(
            (
              await operator.query(
                "SELECT sharing.maintain_invitations(1) result",
              )
            ).rows[0].result.redactedInvitations,
          ).toBe(0);
          const stored = (
            await c.query(
              "SELECT state,target_email_normalized,token_hash FROM sharing.invitation WHERE id=$1",
              [invitation.subjectId],
            )
          ).rows[0];
          expect(stored.state).toBe("expired");
          expect(stored.target_email_normalized).not.toContain(b.userId);
          expect(stored.token_hash).not.toBe(token);
          await expect(
            invitationCommand(b, { kind: "review", token }),
          ).rejects.toThrow();
          await expect(
            getDomainPool().query("SELECT sharing.maintain_invitations(1)"),
          ).rejects.toThrow();
        } finally {
          await operator.end();
          await c.end();
        }
      }),
    20000,
  );
  it.each([
    { paid: "20000", share: "60000", position: "-40000" },
    { paid: "70000", share: "40000", position: "30000" },
  ])(
    "reconciles a multiple-payer private allocation $paid / $share",
    ({ paid, share, position }) =>
      fixture(async (a, b, o, g) => {
        void o;
        await invite(a, b, g);
        const account = await cash(a),
          pa = (await getGroup(a, g)).group.participantId,
          pb = (await getGroup(b, g)).group.participantId;
        const event = await command(a, g, {
            kind: "bill",
            bill: {
              description: "Multiple payers",
              expenseDate: "2026-10-10",
              totalMinor: "100000",
              splitMethod: "exact",
              contributions: [
                { participantId: pa, amountMinor: paid },
                {
                  participantId: pb,
                  amountMinor: (100000n - BigInt(paid)).toString(),
                },
              ],
              shares: [
                { participantId: pa, amountMinor: share },
                {
                  participantId: pb,
                  amountMinor: (100000n - BigInt(share)).toString(),
                },
              ],
            },
          }),
          preview = await getAdoptionPreview(a, g, event.subjectId);
        await adoptGroupExpense(a, {
          clientCommandId: randomUUID(),
          groupId: g,
          expenseId: event.subjectId,
          expectedSourceRevisionId: preview.revisionId,
          expectedSourceHash: preview.sourceHash,
          expectedFinancialRevision: preview.financialRevision,
          approved: true,
          funding: { kind: "cash", accountId: account.accountId },
        });
        const p = await withDomainTransaction(
          a,
          async (t) =>
            (
              await t.db.execute<{ amount: string }>(
                sql`SELECT sum(amount_minor::numeric)::text amount FROM finance.posting WHERE ledger_account_id IN(SELECT id FROM finance.ledger_account WHERE kind IN('group_receivable_asset','group_payable_liability'))`,
              )
            ).rows[0]!.amount,
        );
        expect(p).toBe(position);
        expect(
          (
            await getFinancialReport({
              ...privateScope(a),
              query: {
                period: "custom",
                startDate: "2026-10-01",
                endDate: "2026-10-31",
              },
            })
          ).metrics.gross,
        ).toBe(share);
        expect(
          await withDomainTransaction(
            b,
            async (t) =>
              (await t.db.execute(sql`SELECT id FROM finance.financial_action`))
                .rows,
          ),
        ).toEqual([]);
        expect(
          (await getGroup(a, g)).participants.reduce(
            (s, p) => s + BigInt(p.netMinor),
            0n,
          ),
        ).toBe(0n);
      }),
    25000,
  );
  it.each(["cash", "card", "existing_cash", "existing_card", "debtor"])(
    "posts owner-consented %s adoption once with private account isolation",
    (mode) =>
      fixture(async (a, b, o, g) => {
        await invite(a, b, g);
        const account = await cash(a),
          card = await createCreditCard({
            ...privateScope(a),
            clientCommandId: randomUUID(),
            name: "Private Visa",
            issuerName: "Private Bank",
          });
        const event = await bill(a, g);
        const owner = mode === "debtor" ? b : a,
          preview = await getAdoptionPreview(owner, g, event.subjectId);
        let funding: Record<string, unknown> =
          mode === "debtor"
            ? { kind: "none" }
            : mode === "card"
              ? { kind: "card", cardId: card.cardId, postingDate: "2026-10-11" }
              : { kind: "cash", accountId: account.accountId };
        if (mode.startsWith("existing")) {
          const base = {
            ...privateScope(a),
            clientCommandId: randomUUID(),
            effectiveDate: "2026-10-10",
            purchaseMinor: "120000",
            description: "Dinner",
            splits: [{ amountMinor: "120000", categoryId: null }],
          };
          const purchase =
            mode === "existing_card"
              ? await recordCardPurchase({
                  ...base,
                  cardId: card.cardId,
                  postingDate: "2026-10-11",
                })
              : await recordExpense({
                  ...base,
                  fundingAccountId: account.accountId,
                });
          funding = {
            kind: "existing",
            actionId: purchase.actionId,
            expectedActionRevisionId: purchase.actionRevisionId,
          };
        }
        const fresh = await getAdoptionPreview(owner, g, event.subjectId),
          c = {
            clientCommandId: randomUUID(),
            groupId: g,
            expenseId: event.subjectId,
            expectedSourceRevisionId: fresh.revisionId,
            expectedSourceHash: fresh.sourceHash,
            expectedFinancialRevision: fresh.financialRevision,
            approved: true,
            funding,
          };
        const result = await adoptGroupExpense(owner, c);
        expect(await adoptGroupExpense(owner, c)).toEqual(result);
        const ledgers = await withDomainTransaction(
          owner,
          async (t) =>
            (
              await t.db.execute<{ kind: string; amount: string }>(
                sql`SELECT l.kind,sum(p.amount_minor::numeric)::text amount FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id JOIN finance.financial_action a ON a.workspace_id=p.workspace_id AND a.id=p.action_id WHERE a.id=${(result as { actionId: string }).actionId}::uuid GROUP BY l.kind`,
              )
            ).rows,
        );
        expect(ledgers.find((l) => l.kind === "expense")!.amount).toBe("60000");
        expect(
          ledgers.find(
            (l) =>
              l.kind ===
              (mode === "debtor"
                ? "group_payable_liability"
                : "group_receivable_asset"),
          )!.amount,
        ).toBe(mode === "debtor" ? "-60000" : "60000");
        if (mode !== "debtor")
          expect(
            ledgers.find(
              (l) =>
                l.kind ===
                (mode.includes("card") ? "card_liability" : "cash_asset"),
            )!.amount,
          ).toBe("-120000");
        for (const other of [owner.userId === a.userId ? b : a, o])
          expect(
            await withDomainTransaction(
              other,
              async (t) =>
                (
                  await t.db.execute(
                    sql`SELECT id FROM finance.private_group_link WHERE group_id=${g}::uuid`,
                  )
                ).rows,
            ),
          ).toEqual([]);
        const groupJson = JSON.stringify(await getGroup(b, g));
        expect(groupJson).not.toContain(account.accountId);
        expect(groupJson).not.toContain(card.cardId);
        expect(
          (
            await getFinancialReport({
              ...privateScope(owner),
              query: {
                period: "custom",
                startDate: "2026-10-01",
                endDate: "2026-10-31",
              },
            })
          ).metrics.gross,
        ).toBe("60000");
        expect(preview.paidMinor).toBe(mode === "debtor" ? "0" : "120000");
      }),
    30000,
  );
});
