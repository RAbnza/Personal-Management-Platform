import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeRuntimeDatabasePools, getDomainPool } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { getAuthPool } from "@/platform/db/pools";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";
import {
  action,
  finalizeSchedule,
  finish,
  fixture,
  mapPool,
  payment,
  reclassify,
  schedule,
  scoped,
  withFixture,
} from "./helpers/debt-payment-fixture";

const immediate = "SET CONSTRAINTS ALL IMMEDIATE";
const tables = [
  "debt_payment",
  "debt_payment_revision",
  "payment_component",
  "payment_due_allocation",
  "schedule_allocation_map",
  "payment_reclassification",
];
afterAll(closeRuntimeDatabasePools);

describe("D8a PostgreSQL payment foundation", () => {
  it("rejects clearing resolution before the source payment date", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f, {
        certainty: "unresolved",
        components: [{ disposition: "clearing", amount: "400" }],
      });
      await expect(
        reclassify(c, f, p, { effectiveDate: "2026-10-07" }),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("permits historical payment correction through an archived paying account", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      await c.query(immediate);
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      await c.query(
        `UPDATE finance.financial_account SET archived_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, f.accountId],
      );
      await payment(c, f, { previous: p, contractual: "300" });
      await c.query(immediate);
    });
  });

  it("rejects another owner's valid paying account", async () => {
    const other = { userId: randomUUID(), workspaceId: randomUUID() };
    await getAuthPool().query(
      `INSERT INTO auth."user" (id,name,email,email_verified) VALUES ($1,'Other fixture',$2,true)`,
      [other.userId, other.userId + "@example.test"],
    );
    try {
      await withFixture(async (c, f) => {
        await scoped(c, other);
        await c.query(
          `INSERT INTO core.user_profile (user_id,display_name) VALUES ($1,'Other fixture')`,
          [other.userId],
        );
        await c.query(
          `INSERT INTO core.workspace (id,owner_user_id) VALUES ($1,$2)`,
          [other.workspaceId, other.userId],
        );
        await c.query(
          `INSERT INTO core.workspace_preference (workspace_id) VALUES ($1)`,
          [other.workspaceId],
        );
        const foreign = await fixture(c, other);
        await c.query(immediate);
        await c.query("SET CONSTRAINTS ALL DEFERRED");
        await scoped(c, f);
        await expect(
          payment(c, f, { accountId: foreign.accountId }),
        ).rejects.toMatchObject({ code: "23503" });
      });
    } finally {
      await getAuthPool().query(`DELETE FROM auth."user" WHERE id=$1`, [
        other.userId,
      ]);
    }
  });
  it("rejects a new payment on a closed debt", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f, { contractual: "1000" });
      await c.query(immediate);
      await c.query(
        `UPDATE finance.debt SET lifecycle='settled',closed_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, f.debtId],
      );
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      await expect(
        payment(c, f, { contractual: "0", external: "15", components: [] }),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects a new payment from an archived account or before its cutoff", async () => {
    for (const mode of ["archive", "cutoff"]) {
      await withFixture(async (c, f) => {
        await c.query(
          mode === "archive"
            ? `UPDATE finance.financial_account SET archived_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`
            : `UPDATE finance.financial_account SET opening_cutoff_date='2026-10-08' WHERE workspace_id=$1 AND id=$2`,
          [f.workspaceId, f.accountId],
        );
        await payment(c, f);
        await expect(c.query(immediate)).rejects.toMatchObject({
          code: "23514",
        });
      });
    }
  });

  it("hides payment evidence when owner lifecycle becomes inactive", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f);
      await c.query(immediate);
      await makeDeletionPending(c, {
        userId: f.userId,
        workspaceId: f.workspaceId,
      });
      for (const table of tables)
        expect(
          (await c.query(`SELECT count(*)::int AS n FROM finance.${table}`))
            .rows[0].n,
        ).toBe(0);
    });
  });
  it("accepts full recognized repayment and exact closure", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f, { contractual: "1000" });
      await c.query(
        `UPDATE finance.debt SET lifecycle='settled',closed_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, f.debtId],
      );
      await c.query(immediate);
    });
  });

  it("keeps a one-centavo residual exact", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f, { contractual: "999" });
      await c.query(immediate);
      expect(
        (
          await c.query(
            `SELECT (-sum(amount_minor))::text AS remaining FROM finance.posting WHERE ledger_account_id=$1`,
            [f.liabilityId],
          )
        ).rows[0].remaining,
      ).toBe("1");
    });
  });

  it.each(["0", "-1", "100000000001"])(
    "rejects invalid payment amount %s",
    async (amount) => {
      await withFixture(async (c, f) => {
        await expect(payment(c, f, { actual: amount })).rejects.toMatchObject({
          code: "23514",
        });
      });
    },
  );

  it("rejects external-fee totals masquerading as contractual allocation", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f, {
        certainty: "known_components",
        external: "15",
        components: [{ disposition: "external_fee", amount: "400", fee: true }],
      });
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects negative components and wrong debt liability or clearing buckets", async () => {
    await withFixture(async (c, f) => {
      await expect(
        payment(c, f, {
          components: [{ disposition: "liability_reduction", amount: "-400" }],
        }),
      ).rejects.toMatchObject({ code: "23514" });
    });
    for (const disposition of ["liability_reduction", "clearing"]) {
      await withFixture(async (c, f) => {
        const g = await fixture(c, f);
        await payment(c, f, {
          certainty: "unresolved",
          components: [
            {
              disposition,
              amount: "400",
              ledgerId:
                disposition === "clearing" ? g.clearingId : g.liabilityId,
            },
          ],
        });
        await expect(c.query(immediate)).rejects.toMatchObject({
          code: "23514",
        });
      });
    }
  });

  it("rejects schedule maps using another payment's source pool", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      const q = await payment(c, f);
      const s = await schedule(c, f, { previousId: f.scheduleId, version: 2 });
      await expect(
        mapPool(c, f, p, s, "400", q.allocationId),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });

  it("prevents historical opening satisfaction from absorbing a later payment", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      const s = await schedule(c, f, {
        previousId: f.scheduleId,
        version: 2,
        opening: "400",
      });
      await mapPool(c, f, p, s, "400");
      await finalizeSchedule(c, f, s.scheduleId);
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects closure with clearing even when recognized liability is zero", async () => {
    await withFixture(async (c, f) => {
      const s = await schedule(c, f, {
        previousId: f.scheduleId,
        version: 2,
        total: "2000",
      });
      await finalizeSchedule(c, f, s.scheduleId);
      await payment(
        c,
        { ...f, ...s },
        {
          contractual: "1100",
          certainty: "unresolved",
          components: [
            { disposition: "liability_reduction", amount: "1000" },
            { disposition: "clearing", amount: "100" },
          ],
        },
      );
      await c.query(
        `UPDATE finance.debt SET lifecycle='settled',closed_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, f.debtId],
      );
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects closure with unapplied contractual allocation", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f, { contractual: "1000", unapplied: "1000" });
      await c.query(
        `UPDATE finance.debt SET lifecycle='settled',closed_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, f.debtId],
      );
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
    }, true);
  });

  it("allows resolved formerly unapplied allocation after exhaustive mapping", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f, { contractual: "1000", unapplied: "1000" });
      const s = await schedule(c, f, { previousId: f.scheduleId, version: 2 });
      await mapPool(c, f, p, s, "1000", null);
      await finalizeSchedule(c, f, s.scheduleId);
      await c.query(
        `UPDATE finance.debt SET lifecycle='settled',closed_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2`,
        [f.workspaceId, f.debtId],
      );
      await c.query(immediate);
    }, true);
  });

  it("rolls invalid payment effects back together before retry", async () => {
    await withFixture(async (c, f) => {
      await c.query(immediate);
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      await c.query("SAVEPOINT invalid_payment");
      await payment(c, f, { due: "399" });
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
      await c.query("ROLLBACK TO SAVEPOINT invalid_payment");
      expect(
        (
          await c.query(
            `SELECT count(*)::int AS n FROM finance.debt_payment WHERE workspace_id=$1`,
            [f.workspaceId],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await c.query(
            `SELECT count(*)::int AS n FROM core.command_receipt WHERE workspace_id=$1`,
            [f.workspaceId],
          )
        ).rows[0].n,
      ).toBe(1);
      await payment(c, f);
      await c.query(immediate);
    });
  });
  it("separates a partial contractual payment and external fee from expenses and cash", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f, { external: "15" });
      await c.query(immediate);
      const result = await c.query(
        `SELECT sum(x.amount_minor)::text AS total,
        sum(x.amount_minor) FILTER (WHERE l.kind='cash_asset')::text AS cash,
        sum(x.amount_minor) FILTER (WHERE l.kind='debt_liability')::text AS liability,
        sum(x.amount_minor) FILTER (WHERE l.kind='expense')::text AS expense
        FROM finance.posting x JOIN finance.ledger_account l ON l.workspace_id=x.workspace_id AND l.id=x.ledger_account_id
        WHERE x.workspace_id=$1 AND x.action_revision_id=$2`,
        [f.workspaceId, p.revisionId],
      );
      expect(result.rows[0]).toEqual({
        total: "0",
        cash: "-415",
        liability: "400",
        expense: "15",
      });
      const due = await c.query(
        `SELECT i.contractual_minor - i.opening_satisfied_minor - sum(a.amount_minor) AS remaining
        FROM finance.scheduled_installment i JOIN finance.payment_due_allocation a ON a.workspace_id=i.workspace_id AND a.installment_id=i.id
        WHERE i.workspace_id=$1 AND i.id=$2 GROUP BY i.id`,
        [f.workspaceId, f.installmentId],
      );
      expect(due.rows[0].remaining).toBe("600");
    });
  });

  it("accepts unknown breakdown as unclassified recognized reduction without new spending", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f);
      await c.query(immediate);
      const r = await c.query(
        `SELECT breakdown_status FROM finance.debt WHERE id=$1`,
        [f.debtId],
      );
      expect(r.rows[0].breakdown_status).toBe("unknown");
    });
  });

  it("accepts exact mixed accounting components while due allocation remains independent", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f, {
        certainty: "unresolved",
        unapplied: "100",
        components: [
          { disposition: "liability_reduction", amount: "200" },
          { disposition: "new_interest", amount: "50" },
          { disposition: "new_fee", amount: "30", fee: true },
          { disposition: "new_penalty", amount: "20" },
          { disposition: "clearing", amount: "60" },
          { disposition: "advance", amount: "40" },
        ],
      });
      await c.query(immediate);
    });
  });

  it("accepts no supplied due dates through an empty manual schedule and explicit unapplied pool", async () => {
    await withFixture(async (c, f) => {
      await payment(c, f, {
        unapplied: "400",
        components: [{ disposition: "clearing", amount: "400" }],
        certainty: "unresolved",
      });
      await c.query(immediate);
      expect(
        (
          await c.query(
            `SELECT count(*)::int AS n FROM finance.scheduled_installment WHERE debt_id=$1`,
            [f.debtId],
          )
        ).rows[0].n,
      ).toBe(0);
    }, true);
  });

  it.each(["clearing", "advance"])(
    "resolves %s into liability without another cash deduction",
    async (disposition) => {
      await withFixture(async (c, f) => {
        const p = await payment(c, f, {
          certainty: "unresolved",
          components: [{ disposition, amount: "400" }],
        });
        await reclassify(c, f, p, { amount: "150" });
        await reclassify(c, f, p, { amount: "250" });
        await c.query(immediate);
        const r = await c.query(
          `SELECT l.kind,sum(x.amount_minor)::text AS amount FROM finance.posting x
        JOIN finance.ledger_account l ON l.workspace_id=x.workspace_id AND l.id=x.ledger_account_id
        WHERE x.workspace_id=$1 GROUP BY l.kind`,
          [f.workspaceId],
        );
        expect(r.rows).toEqual(
          expect.arrayContaining([
            { kind: "cash_asset", amount: "-400" },
            { kind: "payment_clearing_asset", amount: "0" },
            { kind: "debt_liability", amount: "-600" },
          ]),
        );
      });
    },
  );

  it("preserves historical payment evidence while replacing its economic and due allocation", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      await payment(c, f, { previous: p, contractual: "300" });
      await c.query(immediate);
      const r = await c.query(
        `SELECT sum(amount_minor)::text AS cash FROM finance.posting WHERE workspace_id=$1 AND ledger_account_id=$2`,
        [f.workspaceId, f.cashId],
      );
      expect(r.rows[0].cash).toBe("-300");
      expect(
        (
          await c.query(
            `SELECT count(*)::int AS n FROM finance.debt_payment_revision WHERE workspace_id=$1`,
            [f.workspaceId],
          )
        ).rows[0].n,
      ).toBe(2);
    });
  });

  it("voids a payment with exact reversals and no new payment meaning", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      const v = await action(c, f, "debt_payment", p, "void");
      await finish(c, f, v, true);
      await c.query(immediate);
      expect(
        (
          await c.query(
            `SELECT sum(amount_minor)::text AS cash FROM finance.posting WHERE ledger_account_id=$1`,
            [f.cashId],
          )
        ).rows[0].cash,
      ).toBe("0");
    });
  });

  it("replaces and voids reclassifications while counting only current source consumption", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f, {
        certainty: "unresolved",
        components: [{ disposition: "clearing", amount: "400" }],
      });
      const a = await reclassify(c, f, p, { amount: "300" });
      const b = await reclassify(c, f, p, { amount: "200", previous: a });
      const v = await action(c, f, "payment_reclassification", b, "void");
      await finish(c, f, v, true);
      await reclassify(c, f, p, { amount: "400" });
      await c.query(immediate);
    });
  });

  it("maps original allocated and unapplied pools exactly once into a new schedule", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f, { unapplied: "100" });
      const s = await schedule(c, f, { previousId: f.scheduleId, version: 2 });
      await mapPool(c, f, p, s, "300");
      await mapPool(c, f, p, { scheduleId: s.scheduleId }, "100", null);
      await finalizeSchedule(c, f, s.scheduleId);
      await c.query(immediate);
      expect(
        (
          await c.query(
            `SELECT sum(amount_minor)::text AS mapped FROM finance.schedule_allocation_map WHERE target_schedule_version_id=$1`,
            [s.scheduleId],
          )
        ).rows[0].mapped,
      ).toBe("400");
      expect(
        (
          await c.query(
            `SELECT sum(amount_minor)::text AS cash FROM finance.posting WHERE ledger_account_id=$1`,
            [f.cashId],
          )
        ).rows[0].cash,
      ).toBe("-400");
    });
  });

  it("corrects a mapped payment atomically with a fresh allocation-correction version", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      const s = await schedule(c, f, { previousId: f.scheduleId, version: 2 });
      await mapPool(c, f, p, s, "400");
      await finalizeSchedule(c, f, s.scheduleId);
      const q = await payment(c, f, { previous: p, contractual: "300" });
      const t = await schedule(c, f, {
        previousId: s.scheduleId,
        version: 3,
        kind: "allocation_correction",
      });
      await mapPool(c, f, q, t, "300");
      await finalizeSchedule(c, f, t.scheduleId);
      await c.query(immediate);
    });
  });

  const invalidPayments = [
    [
      "accounting evidence total",
      {
        components: [
          {
            disposition: "liability_reduction",
            amount: "400",
            evidenceAmount: "399",
          },
        ],
      },
    ],
    ["due total", { due: "399" }],
    ["actual equation", { actual: "401" }],
    [
      "over-satisfied installment",
      {
        contractual: "1001",
        certainty: "unresolved",
        components: [{ disposition: "clearing", amount: "1001" }],
      },
    ],
    ["over-reduced recognized liability", { contractual: "1001" }],
    [
      "invented principal breakdown",
      {
        components: [
          {
            disposition: "liability_reduction",
            amount: "400",
            liabilityComponent: "principal",
          },
        ],
      },
    ],
    [
      "clearing marked known",
      {
        certainty: "known_components",
        components: [{ disposition: "clearing", amount: "400" }],
      },
    ],
    [
      "new fee without fee evidence",
      {
        certainty: "known_components",
        components: [{ disposition: "new_fee", amount: "400" }],
      },
    ],
    ["missing action audit", { omitAudit: true }],
  ] as const;
  it.each(invalidPayments)("rejects %s", async (_label, input) => {
    await withFixture(async (c, f) => {
      await expect(
        (async () => {
          await payment(c, f, input);
          await c.query(immediate);
        })(),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects an accounting component from another economic revision", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      const x = await c.query(
        `SELECT posting_id FROM finance.payment_component WHERE id=$1`,
        [p.componentIds[0]],
      );
      await payment(c, f, { componentPostingId: x.rows[0].posting_id });
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects a paying account which differs from the actual cash account", async () => {
    await withFixture(async (c, f) => {
      const g = await fixture(c, f);
      await payment(c, f, { accountId: g.accountId });
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects same-workspace cross-debt schedule and installment references", async () => {
    await withFixture(async (c, f) => {
      const g = await fixture(c, f);
      await expect(
        payment(c, f, { scheduleId: g.scheduleId }),
      ).rejects.toMatchObject({ code: "23514" });
    });
    await withFixture(async (c, f) => {
      const g = await fixture(c, f);
      await expect(
        payment(c, f, { installmentId: g.installmentId }),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });

  it("requires one logical action per payment and immutable revision identity", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      await c.query(immediate);
      await expect(
        c.query(
          `INSERT INTO finance.debt_payment (workspace_id,debt_id,action_id,actor_kind) VALUES ($1,$2,$3,'system')`,
          [f.workspaceId, f.debtId, p.actionId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it.each(
    tables.flatMap((table) =>
      ["UPDATE", "DELETE"].map((operation) => [table, operation] as const),
    ),
  )(
    "denies runtime changes to %s evidence through %s",
    async (t, operation) => {
      await withFixture(async (c, f) => {
        await payment(c, f);
        await c.query(immediate);
        await c.query(`SELECT set_config('app.skip_immutability','true',true)`);
        await expect(
          operation === "UPDATE"
            ? c.query(`UPDATE finance.${t} SET workspace_id=$1`, [
                f.workspaceId,
              ])
            : c.query(`DELETE FROM finance.${t}`),
        ).rejects.toMatchObject({ code: "42501" });
      });
    },
  );

  it("rejects reclassification cash, double consumption, and a different payment source", async () => {
    for (const mode of ["cash", "excess", "payment"]) {
      await withFixture(async (c, f) => {
        const p = await payment(c, f, {
          certainty: "unresolved",
          components: [{ disposition: "clearing", amount: "400" }],
        });
        const q = await payment(c, f, {
          certainty: "unresolved",
          components: [{ disposition: "clearing", amount: "400" }],
        });
        if (mode === "excess") await reclassify(c, f, p, { amount: "250" });
        await reclassify(c, f, p, {
          amount: "250",
          cash: mode === "cash",
          paymentId: mode === "payment" ? q.paymentId : undefined,
        });
        await expect(c.query(immediate)).rejects.toMatchObject({
          code: "23514",
        });
      });
    }
  });

  it("rejects correction or void of a payment with a surviving reclassification", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f, {
        certainty: "unresolved",
        components: [{ disposition: "clearing", amount: "400" }],
      });
      await reclassify(c, f, p);
      const v = await action(c, f, "debt_payment", p, "void");
      await finish(c, f, v, true);
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
    });
  });

  it.each(["missing", "excess", "duplicate", "direct"])(
    "rejects %s schedule allocation paths",
    async (mode) => {
      await withFixture(async (c, f) => {
        let p = await payment(c, f);
        const s = await schedule(c, f, {
          previousId: f.scheduleId,
          version: 2,
        });
        if (mode === "direct") p = await payment(c, { ...f, ...s });
        if (mode !== "missing")
          await mapPool(c, f, p, s, mode === "excess" ? "401" : "400");
        if (mode === "duplicate") {
          await expect(mapPool(c, f, p, s, "400")).rejects.toMatchObject({
            code: "23505",
          });
          return;
        }
        await finalizeSchedule(c, f, s.scheduleId);
        await expect(c.query(immediate)).rejects.toMatchObject({
          code: "23514",
        });
      });
    },
  );

  it("rejects appending a map to a finalized schedule and allocations to a finalized payment", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      await c.query(immediate);
      await expect(
        mapPool(c, f, p, { scheduleId: f.scheduleId }, "400"),
      ).rejects.toMatchObject({ code: "23514" });
    });
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      await c.query(immediate);
      await expect(
        c.query(
          `INSERT INTO finance.payment_due_allocation (workspace_id,debt_id,payment_revision_id,schedule_version_id,installment_id,amount_minor) VALUES ($1,$2,$3,$4,$5,1)`,
          [
            f.workspaceId,
            f.debtId,
            p.paymentRevisionId,
            f.scheduleId,
            f.installmentId,
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects a mapped payment correction without rebuilding the active schedule", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f);
      const s = await schedule(c, f, { previousId: f.scheduleId, version: 2 });
      await mapPool(c, f, p, s, "400");
      await finalizeSchedule(c, f, s.scheduleId);
      await payment(c, f, { previous: p, contractual: "300" });
      await expect(c.query(immediate)).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("isolates all six tables with missing and mismatched runtime scope", async () => {
    await withFixture(async (c, f) => {
      const p = await payment(c, f, {
        certainty: "unresolved",
        components: [{ disposition: "clearing", amount: "400" }],
      });
      await reclassify(c, f, p);
      const s = await schedule(c, f, { previousId: f.scheduleId, version: 2 });
      await mapPool(c, f, p, s, "400");
      await finalizeSchedule(c, f, s.scheduleId);
      await c.query(immediate);
      for (const context of ["missing", "foreign"]) {
        await c.query(`SELECT set_config('app.workspace_id',$1,true)`, [
          context === "missing" ? "" : randomUUID(),
        ]);
        for (const t of tables)
          expect(
            (await c.query(`SELECT count(*)::int AS n FROM finance.${t}`))
              .rows[0].n,
          ).toBe(0);
      }
      await scoped(c, f);
      for (const t of tables)
        expect(
          (await c.query(`SELECT count(*)::int AS n FROM finance.${t}`)).rows[0]
            .n,
        ).toBeGreaterThan(0);
    });
  });

  it("forces RLS and denies unrelated runtime roles and PUBLIC function access", async () => {
    const c = await getDomainPool().connect();
    try {
      for (const t of tables) {
        const r = await c.query(
          `SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass`,
          ["finance." + t],
        );
        expect(r.rows[0]).toEqual({
          relrowsecurity: true,
          relforcerowsecurity: true,
        });
        for (const role of ["auth_adapter", "queue_broker", "worker_domain"]) {
          expect(
            (
              await c.query(
                `SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed`,
                [role, "finance." + t],
              )
            ).rows[0].allowed,
          ).toBe(false);
        }
        expect(
          (
            await c.query(
              "SELECT has_table_privilege('lifecycle_operator',$1,'INSERT,UPDATE,TRUNCATE') AS allowed",
              ["finance." + t],
            )
          ).rows[0].allowed,
        ).toBe(false);
        expect(
          (
            await c.query(
              "SELECT has_table_privilege('lifecycle_operator',$1,'SELECT,DELETE') AS allowed",
              ["finance." + t],
            )
          ).rows[0].allowed,
        ).toBe(true);
      }
      expect(
        (
          await c.query(
            `SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`,
          )
        ).rows[0],
      ).toEqual({ rolsuper: false, rolbypassrls: false });
      for (const functionName of [
        "guard_payment_evidence_parent",
        "guard_payment_command_context",
        "validate_payment_revision_recipe",
        "validate_payment_workspace_state",
        "validate_schedule_opening_carry",
      ]) {
        expect(
          (
            await c.query(
              "SELECT has_function_privilege('auth_adapter',$1,'EXECUTE') AS allowed",
              ["finance." + functionName + "()"],
            )
          ).rows[0].allowed,
        ).toBe(false);
      }
    } finally {
      c.release();
    }
  });

  it("serializes new payment mutation roots on the workspace lock", async () => {
    const userId = randomUUID();
    await getAuthPool().query(
      `INSERT INTO auth."user" (id,name,email,email_verified) VALUES ($1,'Lock fixture',$2,true)`,
      [userId, userId + "@example.test"],
    );
    const w = await provisionPersonalWorkspace({
      userId,
      displayName: "Lock fixture",
    });
    const identity = { userId, workspaceId: w.workspaceId };
    const c1 = await getDomainPool().connect(),
      c2 = await getDomainPool().connect();
    try {
      await c1.query("BEGIN");
      await scoped(c1, identity);
      await c1.query(`SELECT id FROM core.workspace WHERE id=$1 FOR UPDATE`, [
        identity.workspaceId,
      ]);
      const mutations = [
        "INSERT INTO finance.debt_payment (workspace_id,debt_id,action_id,actor_kind) VALUES ($1,$2,$3,'system')",
        "INSERT INTO finance.debt_payment_revision (workspace_id,debt_id,action_id,action_revision_id,payment_id,paid_against_schedule_version_id,paying_account_id,actual_paid_minor,contractual_minor,allocation_certainty) VALUES ($1,$2,$3,$3,$3,$3,$3,1,1,'confirmed_total')",
        "INSERT INTO finance.payment_component (workspace_id,debt_id,payment_revision_id,posting_id,disposition,amount_minor) VALUES ($1,$2,$3,$3,'liability_reduction',1)",
        "INSERT INTO finance.payment_due_allocation (workspace_id,debt_id,payment_revision_id,schedule_version_id,installment_id,amount_minor) VALUES ($1,$2,$3,$3,$3,1)",
        "INSERT INTO finance.schedule_allocation_map (workspace_id,debt_id,target_schedule_version_id,payment_revision_id,source_kind,target_kind,amount_minor) VALUES ($1,$2,$3,$3,'unapplied','unapplied',1)",
        "INSERT INTO finance.payment_reclassification (workspace_id,debt_id,action_id,action_revision_id,payment_id,source_component_id,clearing_credit_posting_id,amount_minor,reason) VALUES ($1,$2,$3,$3,$3,$3,$3,1,'Fixture')",
      ];
      for (const mutation of mutations) {
        await c2.query("BEGIN");
        await scoped(c2, identity);
        await c2.query("SET LOCAL lock_timeout='150ms'");
        await expect(
          c2.query(mutation, [
            identity.workspaceId,
            randomUUID(),
            randomUUID(),
          ]),
        ).rejects.toMatchObject({ code: "55P03" });
        await c2.query("ROLLBACK");
      }
    } finally {
      await c1.query("ROLLBACK");
      await c2.query("ROLLBACK");
      c1.release();
      c2.release();
      await removeProvisionedTestUser(identity, "d8a-lock-cleanup");
    }
  });
});
import { makeDeletionPending } from "./helpers/lifecycle-proof";
