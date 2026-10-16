import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import {
  getAuthPool,
  closeRuntimeDatabasePools,
} from "../../src/platform/db/pools";
import { withDomainTransaction } from "../../src/platform/db";
import { provisionPersonalWorkspace } from "../../src/modules/core/services/provision-personal-workspace";
import {
  recordGroupCommand,
  type SharingActor,
} from "../../src/modules/sharing/services/groups";
import { getGroup } from "../../src/modules/sharing/services/read-groups";
import { getDashboard } from "../../src/modules/dashboard/services/get-dashboard";
import { getFinancialReport } from "../../src/modules/reporting/services/get-reports";
import { removeNamedFinancialFixture } from "../../tests/integration/helpers/named-financial-fixture";
const label = "V2-I sharing fixture" as const;
let phase = "setup";
async function main() {
  const userId = randomUUID(),
    groupId = randomUUID(),
    sessionId = randomUUID();
  let actor: SharingActor | undefined,
    groupCreated = false;
  process.env.SHARED_EXPENSES_ENABLED = "true";
  try {
    await getAuthPool().query(
      'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
      [userId, label, `${userId}@example.test`],
    );
    const { workspaceId } = await provisionPersonalWorkspace({
      userId,
      displayName: label,
    });
    actor = { userId, workspaceId, sessionId };
    await getAuthPool().query(
      "INSERT INTO auth.session(id,user_id,token,updated_at,expires_at) VALUES($1,$2,$3,clock_timestamp(),clock_timestamp()+interval '1 day')",
      [sessionId, userId, randomUUID()],
    );
    await getAuthPool().query(
      "INSERT INTO auth.session_assurance(session_id,verified_at,method) VALUES($1,clock_timestamp(),'password')",
      [sessionId],
    );
    let version = (
      await recordGroupCommand(actor, {
        kind: "create",
        clientCommandId: randomUUID(),
        groupId,
        name: "V2-I household capacity",
        displayName: "Household owner",
      })
    ).version;
    groupCreated = true;
    const command = async (body: Record<string, unknown>) => {
      const r = await recordGroupCommand(actor!, {
        clientCommandId: randomUUID(),
        groupId,
        expectedVersion: version,
        ...body,
      });
      version = r.version;
      return r;
    };
    const people = [(await getGroup(actor, groupId)).group.participantId];
    for (let n = 1; n < 4; n++)
      people.push(
        (
          await command({
            kind: "manual",
            displayName: `Household participant ${n}`,
          })
        ).subjectId,
      );
    phase = "seed_bills";
    const started = performance.now();
    for (let n = 0; n < 200; n++)
      await command({
        kind: "bill",
        bill: {
          description: `Household source ${n}`,
          expenseDate: "2026-10-10",
          totalMinor: "10000",
          splitMethod: "equal",
          contributions: [{ participantId: people[1], amountMinor: "10000" }],
          shares: people.map((participantId) => ({ participantId })),
        },
      });
    const billCreationMs = performance.now() - started;
    console.log(
      "Sharing capacity: 200 protected bills / 800 current source positions created.",
    );
    phase = "seed_settlements";
    for (let n = 0; n < 50; n++) {
      const r = await command({
        kind: "settlement",
        recipientId: people[1],
        mode: "custom",
        amountMinor: "1000",
        paymentDate: "2026-10-15",
        allocations: [],
      });
      await command({
        kind: "settlement_transition",
        settlementId: r.subjectId,
        expectedSettlementVersion: 1,
        operation: "manual_confirm",
        reason: "Synthetic manually received payment",
        acknowledgeManualLimitation: true,
      });
    }
    let snapshot = await getGroup(actor, groupId);
    const eligible = snapshot
      .ledger!.edges.filter(
        (e) =>
          e.senderId === people[0] &&
          e.recipientId === people[1] &&
          e.expenseId,
      )
      .map((e) => e.expenseId!);
    const unique = [...new Set(eligible)].filter((id) => {
      const net = snapshot
        .ledger!.edges.filter((e) => e.expenseId === id)
        .reduce(
          (n, e) =>
            n +
            (e.senderId === people[0] && e.recipientId === people[1]
              ? BigInt(e.amountMinor)
              : e.senderId === people[1] && e.recipientId === people[0]
                ? -BigInt(e.amountMinor)
                : 0n),
          0n,
        );
      return net >= 1000n;
    });
    assert.ok(unique.length >= 50);
    for (const expenseId of unique.slice(0, 50))
      await command({
        kind: "settlement",
        recipientId: people[1],
        mode: "selected",
        amountMinor: "1000",
        paymentDate: "2026-10-15",
        allocations: [
          {
            expenseId,
            sourceRevisionId: snapshot.ledger!.sources.find(
              (p) => p.expenseId === expenseId,
            )!.revisionId,
            amountMinor: "1000",
          },
        ],
      });
    const invariant = () =>
      withDomainTransaction(
        actor!,
        async (t) =>
          (
            await t.db.execute<{
              revision: string;
              actions: number;
              postings: number;
            }>(
              sql`SELECT financial_revision::text revision,(SELECT count(*)::int FROM finance.financial_action) actions,(SELECT count(*)::int FROM finance.posting) postings FROM core.workspace WHERE id=${workspaceId}::uuid`,
            )
          ).rows[0]!,
      );
    const before = await invariant();
    assert.deepEqual(before, { revision: "0", actions: 0, postings: 0 });
    const p95 = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1]!;
    async function samples(run: () => Promise<unknown>, budget: number) {
      await run();
      const values: number[] = [];
      for (let n = 0; n < 7; n++) {
        const start = performance.now();
        await run();
        values.push(performance.now() - start);
      }
      const result = p95(values);
      assert.ok(
        result < budget,
        `${phase}: p95 ${result.toFixed(2)} ms exceeds ${budget} ms`,
      );
      return Number(result.toFixed(2));
    }
    phase = "group_reads";
    const groupReadP95 = await samples(() => getGroup(actor!, groupId), 800);
    phase = "dashboard_reads";
    const dashboardReadP95 = await samples(
      () => getDashboard({ ...actor!, query: { period: "month" } }),
      2000,
    );
    phase = "private_reports";
    const reportReadP95 = await samples(
      () =>
        getFinancialReport({
          ...actor!,
          query: {
            period: "custom",
            startDate: "2026-10-01",
            endDate: "2026-10-31",
          },
        }),
      2000,
    );
    phase = "group_commands";
    const times: number[] = [];
    for (let n = 0; n < 7; n++) {
      const start = performance.now();
      await command({
        kind: "settlement",
        recipientId: people[1],
        mode: "custom",
        amountMinor: "1000",
        paymentDate: "2026-10-15",
        allocations: [],
      });
      times.push(performance.now() - start);
    }
    const commandP95 = p95(times);
    console.log(
      JSON.stringify({
        p95Milliseconds: {
          group: groupReadP95,
          dashboard: dashboardReadP95,
          privateReport: reportReadP95,
          command: Number(commandP95.toFixed(2)),
        },
      }),
    );
    assert.ok(
      commandP95 < 1000,
      `group_commands: p95 ${commandP95.toFixed(2)} ms exceeds 1000 ms`,
    );
    snapshot = await getGroup(actor, groupId);
    assert.equal(snapshot.ledger!.sources.length, 800);
    assert.equal(
      snapshot.ledger!.settlements.filter((s) => s.state === "confirmed")
        .length,
      50,
    );
    assert.equal(
      snapshot.ledger!.settlements.filter((s) => s.state === "pending").length,
      57,
    );
    assert.equal(
      snapshot.ledger!.positions.find((p) => p.participantId === people[0])!
        .netMinor,
      "-450000",
    );
    assert.equal(
      snapshot.ledger!.positions.reduce((n, p) => n + BigInt(p.netMinor), 0n),
      0n,
    );
    phase = "full_multi_bill_settlement";
    const fullStarted = performance.now();
    const full = await command({
      kind: "settlement",
      recipientId: people[1],
      mode: "full",
      amountMinor: "450000",
      paymentDate: "2026-10-15",
      allocations: [],
    });
    const fullReportMs = performance.now() - fullStarted;
    snapshot = await getGroup(actor, groupId);
    const fullReport = snapshot.ledger!.settlements.find(
      (s) => s.id === full.subjectId,
    )!;
    assert.equal(fullReport.allocations.length, 180);
    assert.equal(fullReport.state, "pending");
    assert.equal(
      snapshot.ledger!.positions.find((p) => p.participantId === people[0])!
        .netMinor,
      "-450000",
    );
    const confirmationStarted = performance.now();
    await command({
      kind: "settlement_transition",
      settlementId: full.subjectId,
      expectedSettlementVersion: 1,
      operation: "manual_confirm",
      reason: "Synthetic receipt of complete multi-bill relationship",
      acknowledgeManualLimitation: true,
    });
    const fullConfirmationMs = performance.now() - confirmationStarted;
    assert.ok(
      fullReportMs < 5000,
      `180-bill full report ${fullReportMs.toFixed(2)} ms exceeds 5000 ms`,
    );
    assert.ok(
      fullConfirmationMs < 5000,
      `180-bill full confirmation ${fullConfirmationMs.toFixed(2)} ms exceeds 5000 ms`,
    );
    snapshot = await getGroup(actor, groupId);
    assert.equal(
      snapshot.ledger!.positions.find((p) => p.participantId === people[0])!
        .netMinor,
      "0",
    );
    assert.equal(
      snapshot.ledger!.positions.reduce((n, p) => n + BigInt(p.netMinor), 0n),
      0n,
    );
    assert.equal(
      snapshot.ledger!.settlements.filter((s) => s.state === "confirmed")
        .length,
      51,
    );
    assert.equal(
      snapshot.ledger!.settlements.filter((s) => s.state === "pending").length,
      57,
    );
    assert.deepEqual(await invariant(), before);
    const evidence = {
      bills: 200,
      participants: 4,
      sourcePositions: 800,
      confirmedSettlements: 51,
      pendingSettlements: 57,
      fullSettlement: {
        allocatedBills: fullReport.allocations.length,
        reportMilliseconds: Number(fullReportMs.toFixed(2)),
        confirmationMilliseconds: Number(fullConfirmationMs.toFixed(2)),
        senderNetMinorAfterConfirmation: "0",
      },
      billCreationMs: Number(billCreationMs.toFixed(2)),
      p95Milliseconds: {
        group: groupReadP95,
        dashboard: dashboardReadP95,
        privateReport: reportReadP95,
        command: Number(commandP95.toFixed(2)),
      },
      financialEvidenceUnchanged: true,
    };
    await mkdir("out", { recursive: true });
    await writeFile(
      "out/v2-i-sharing-performance.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } finally {
    if (actor && groupCreated) {
      const u = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
      u.pathname = "/personal_management_test";
      const c = new Client({ connectionString: u.toString() });
      await c.connect();
      try {
        assert.equal(
          (await c.query("SELECT current_database() n")).rows[0].n,
          "personal_management_test",
        );
        assert.equal(
          (
            await c.query(
              "SELECT 1 FROM auth.\"user\" u JOIN sharing.expense_group g ON g.created_by_user_id=u.id WHERE u.id=$1 AND u.name=$2 AND u.email=$3 AND g.id=$4 AND g.name='V2-I household capacity'",
              [userId, label, `${userId}@example.test`, groupId],
            )
          ).rowCount,
          1,
        );
        await c.query("BEGIN");
        await c.query("SET LOCAL session_replication_role='replica'");
        const tables = (
          await c.query(
            "SELECT table_name FROM information_schema.columns WHERE table_schema='sharing' AND column_name='group_id'",
          )
        ).rows;
        for (const t of tables) {
          assert.match(t.table_name, /^[a-z_]+$/);
          await c.query(
            `DELETE FROM sharing."${t.table_name}" WHERE group_id=$1`,
            [groupId],
          );
        }
        await c.query("DELETE FROM audit.group_revision WHERE group_id=$1", [
          groupId,
        ]);
        await c.query("DELETE FROM sharing.expense_group WHERE id=$1", [
          groupId,
        ]);
        await c.query("COMMIT");
      } finally {
        await c.end();
      }
    }
    if (actor) await removeNamedFinancialFixture(actor, label);
    else
      await getAuthPool().query(
        'DELETE FROM auth."user" WHERE id=$1 AND name=$2 AND email=$3',
        [userId, label, `${userId}@example.test`],
      );
    await closeRuntimeDatabasePools();
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      phase,
      code: (e?.cause ?? e)?.code ?? "CAPACITY_FAILED",
      message:
        e instanceof assert.AssertionError
          ? e.message
          : "Sharing capacity failed; private values omitted.",
    }),
  );
  process.exitCode = 1;
});
