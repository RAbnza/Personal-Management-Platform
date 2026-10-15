import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
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
  type SharingActor,
} from "@/modules/sharing/services/groups";
import { getGroup, getBill } from "@/modules/sharing/services/read-groups";
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
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
const label = "V2-I sharing fixture" as const;
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
  const review = (await invitationCommand(b, { kind: "review", token })) as {
    version: number;
  };
  const accept = {
    kind: "accept",
    token,
    clientCommandId: randomUUID(),
    expectedVersion: review.version,
    consent: true,
    displayName: "B",
  };
  await invitationCommand(b, accept);
  return { token, accept };
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
          "SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND (n.nspname='sharing' OR n.nspname='finance' AND c.relname IN('group_ledger_binding','private_group_link','private_group_link_revision') OR n.nspname='audit' AND c.relname='group_revision')",
        )
      ).rows;
      expect(tables).toHaveLength(15);
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
