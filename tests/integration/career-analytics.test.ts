import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { afterAll, describe, it, expect } from "vitest";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { getAuthPool, closeRuntimeDatabasePools } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  createJobApplication,
  createJobApplicationInTransaction,
} from "@/modules/career/services/create-job-application";
import { transitionJobApplicationStageInTransaction } from "@/modules/career/services/transition-job-application-stage";
import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { mutateApplicationEventInTransaction } from "@/modules/career/services/mutate-application-event";
import {
  recordCareerObservation,
  recordCareerObservationInTransaction,
} from "@/modules/career/services/record-career-observation";
import {
  getCareerReport,
  getCareerReportInTransaction,
} from "@/modules/reporting/services/get-reports";
import { prepareCsvSnapshotInTransaction } from "@/modules/reporting/services/export-csv";
import { readCareerSnapshot } from "@/modules/dashboard/repositories/dashboard-repository";
import {
  withFixture as withDebtFixture,
  scoped,
} from "./helpers/debt-payment-fixture";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
const tx = (c: PoolClient) =>
  ({ db: drizzle({ client: c }) }) as ScopedTransaction;
type Owner = { userId: string; workspaceId: string };
const withFixture = (run: (c: PoolClient, o: Owner) => Promise<void>) =>
  withDebtFixture((c, f) =>
    run(c, { userId: f.userId, workspaceId: f.workspaceId }),
  );
const query = {
  period: "custom" as const,
  startDate: "2024-02-01",
  endDate: "2024-02-29",
  asOfDate: "2024-03-10",
};
async function app(
  c: PoolClient,
  o: Owner,
  date = "2024-02-01",
  source: string | null = null,
  extra: Partial<Parameters<typeof createJobApplicationInTransaction>[1]> = {},
) {
  return createJobApplicationInTransaction(tx(c), {
    ...o,
    clientCommandId: randomUUID(),
    companyName: "Same company",
    roleTitle: "Same role",
    initialStage: "applied",
    initialStageEffectiveDate: date,
    appliedDate: date,
    sourceName: source,
    allowPossibleDuplicate: true,
    ...extra,
  });
}
async function observation(
  c: PoolClient,
  o: Owner,
  a: { applicationId: string; version: number },
  date: string,
  kind: "response" | "offer" | "no_response" = "response",
) {
  return recordCareerObservationInTransaction(tx(c), {
    ...o,
    applicationId: a.applicationId,
    body: {
      clientCommandId: randomUUID(),
      expectedApplicationVersion: a.version,
      kind,
      date,
      title: "Recorded employer evidence",
    },
  });
}
const report = (c: PoolClient, o: Owner, changes = {}) =>
  getCareerReportInTransaction(tx(c), {
    workspaceId: o.workspaceId,
    query: { ...query, ...changes },
  });
afterAll(closeRuntimeDatabasePools);
describe("V2-F authoritative Career analytics", () => {
  it("retains known submissions before their first supplied stage observation and rejects future cutoffs", () =>
    withFixture(async (c, o) => {
      await app(c, o, "2024-02-01", null, {
        initialStage: "interview",
        initialStageEffectiveDate: "2024-02-10",
      });
      const r = await report(c, o, { asOfDate: "2024-02-02" });
      expect(r.summary).toMatchObject({
        submitted: 1,
        interviewed: 0,
        unknownStage: 1,
        responseRate: { numerator: 0, denominator: 1 },
      });
      expect(r.analytics.missingStageEvidence).toBe(1);
      expect(r.applications[0]!.stage).toBeNull();
      await expect(report(c, o, { asOfDate: "2199-01-01" })).rejects.toThrow(
        "cannot be in the future",
      );
    }));
  it("keeps repeated and archived attempts, excludes saved opportunities, and uses compatible milestone intersections", () =>
    withFixture(async (c, o) => {
      const a = await app(c, o),
        b = await app(c, o);
      await app(c, o, "2024-02-01", null, {
        companyName: "Saved",
        initialStage: "saved",
        appliedDate: null,
      });
      await observation(c, o, a, "2024-02-02");
      await observation(c, o, a, "2024-02-03");
      const interview = await transitionJobApplicationStageInTransaction(
        tx(c),
        {
          ...o,
          clientCommandId: randomUUID(),
          applicationId: b.applicationId,
          expectedVersion: b.version,
          stage: "interview",
          effectiveDate: "2024-02-04",
        },
      );
      await observation(
        c,
        o,
        { ...b, version: interview.version },
        "2024-02-07",
        "offer",
      );
      await c.query(
        "UPDATE career.job_application SET archived_at=clock_timestamp() WHERE id=$1",
        [a.applicationId],
      );
      const r = await report(c, o);
      expect(r.summary).toMatchObject({
        submitted: 2,
        responded: 1,
        interviewed: 1,
        offered: 1,
        archived: 1,
        responseRate: { numerator: 1, denominator: 2 },
        responseToInterviewRate: { numerator: 0, denominator: 1 },
        interviewToOfferRate: { numerator: 1, denominator: 1 },
      });
      expect(r.summary.responseTiming).toMatchObject({
        samples: 1,
        missing: 1,
        medianDays: 1,
      });
      expect(r.events.filter((e) => e.kind === "response")).toHaveLength(2);
    }));
  it("observes responses beyond the submission period, independent event-period activity and exact leap-day timing", () =>
    withFixture(async (c, o) => {
      const a = await app(c, o, "2024-02-29"),
        previous = await app(c, o, "2024-01-31");
      await observation(c, o, a, "2024-03-01");
      await observation(c, o, previous, "2024-02-03");
      const r = await report(c, o),
        earlier = await report(c, o, { asOfDate: "2024-02-29" });
      expect(r.summary.responded).toBe(1);
      expect(r.summary.responseTiming.medianDays).toBe(1);
      expect(r.applications[0]!.firstResponseDate).toBe("2024-03-01");
      expect(r.events).toHaveLength(1);
      expect(r.events[0]!.inCohort).toBe(false);
      expect(earlier.summary.responded).toBe(0);
      expect(earlier.summary.responseTiming.medianDays).toBeNull();
    }));
  it("separates scheduled, completed, cancelled and no-response evidence without fabricating outcomes", () =>
    withFixture(async (c, o) => {
      const a = await app(c, o);
      const scheduled = await createApplicationEventInTransaction(tx(c), {
        ...o,
        clientCommandId: randomUUID(),
        applicationId: a.applicationId,
        eventKind: "interview",
        title: "Scheduled only",
        temporalKind: "date",
        eventDate: "2024-02-02",
      });
      const cancelled = await createApplicationEventInTransaction(tx(c), {
        ...o,
        clientCommandId: randomUUID(),
        applicationId: a.applicationId,
        eventKind: "assessment",
        title: "Cancelled",
        temporalKind: "date",
        eventDate: "2024-02-03",
      });
      await mutateApplicationEventInTransaction(tx(c), {
        ...o,
        clientCommandId: randomUUID(),
        applicationId: a.applicationId,
        eventId: cancelled.eventId,
        expectedEventVersion: cancelled.eventVersion,
        action: "cancel",
      });
      await observation(c, o, a, "2024-01-31");
      await observation(c, o, a, "2024-02-04", "no_response");
      const before = await report(c, o);
      expect(before.summary).toMatchObject({
        interviewed: 0,
        assessed: 0,
        responded: 0,
        rejected: 0,
        explicitNoResponse: 1,
      });
      expect(before.analytics.preSubmissionEvidence).toBe(1);
      await mutateApplicationEventInTransaction(tx(c), {
        ...o,
        clientCommandId: randomUUID(),
        applicationId: a.applicationId,
        eventId: scheduled.eventId,
        expectedEventVersion: scheduled.eventVersion,
        action: "complete",
      });
      const after = await report(c, o);
      expect(after.summary.interviewed).toBe(1);
      expect(
        after.analytics.eventSummary.find((e) => e.kind === "interview"),
      ).toMatchObject({ completed: 1, scheduled: 0 });
      expect(after.coverage.sourceRevision).not.toBe(
        before.coverage.sourceRevision,
      );
    }));
  it("resolves repeated stages, same-day terminal ordering and reopening with censored open durations", () =>
    withFixture(async (c, o) => {
      const a = await app(c, o);
      let version: number = a.version;
      for (const [stage, date, outcome] of [
        ["interview", "2024-02-02", null],
        ["screening", "2024-02-03", "rejected"],
        ["interview", "2024-02-03", null],
        ["offer", "2024-02-07", null],
      ] as const) {
        version = (
          await transitionJobApplicationStageInTransaction(tx(c), {
            ...o,
            applicationId: a.applicationId,
            clientCommandId: randomUUID(),
            expectedVersion: version,
            stage,
            outcome,
            effectiveDate: date,
            reason: "Recorded progression or reopening",
          })
        ).version;
      }
      const r = await report(c, o);
      expect(r.summary.rejected).toBe(0);
      expect(r.summary.open).toBe(1);
      expect(
        r.analytics.reachedOutcomes.find((o) => o.outcome === "rejected")!
          .applications,
      ).toBe(1);
      expect(
        r.analytics.stageTiming.find((s) => s.stage === "interview"),
      ).toMatchObject({
        visits: 2,
        applications: 1,
        closed: { samples: 2, medianDays: 2.5 },
      });
      expect(
        r.analytics.stageTiming.find((s) => s.stage === "offer"),
      ).toMatchObject({
        closed: { samples: 0 },
        open: { samples: 1, medianDays: 32 },
      });
      expect(
        r.stages
          .filter((s) => s.effectiveDate === "2024-02-03")
          .map((s) => s.elapsedDays),
      ).toEqual([0, 4]);
    }));
  it("applies known corrections at an earlier cutoff while preserving superseded observations", () =>
    withFixture(async (c, o) => {
      const a = await app(c, o);
      const h = await transitionJobApplicationStageInTransaction(tx(c), {
        ...o,
        applicationId: a.applicationId,
        clientCommandId: randomUUID(),
        expectedVersion: a.version,
        stage: "interview",
        effectiveDate: "2024-02-03",
      });
      const before = await report(c, o, { asOfDate: "2024-02-04" });
      const id = randomUUID();
      await c.query(
        "INSERT INTO career.application_stage_history(id,workspace_id,application_id,sequence_no,stage,effective_date,effective_order,supersedes_history_id,reason,command_receipt_id,recorded_by_user_id,actor_kind) SELECT $1,workspace_id,application_id,3,'technical_assessment',effective_date,effective_order,id,'Correct recorded stage',command_receipt_id,recorded_by_user_id,'user' FROM career.application_stage_history WHERE id=$2",
        [id, h.historyId],
      );
      await c.query(
        "UPDATE career.job_application SET current_history_id=$1,current_stage='technical_assessment' WHERE id=$2",
        [id, a.applicationId],
      );
      const after = await report(c, o, { asOfDate: "2024-02-04" });
      expect(before.summary.interviewed).toBe(1);
      expect(after.summary).toMatchObject({ interviewed: 0, assessed: 1 });
      expect(after.stages.some((s) => s.historyId === h.historyId)).toBe(false);
      expect(after.coverage.sourceRevision).not.toBe(
        before.coverage.sourceRevision,
      );
      expect(
        (
          await c.query(
            "SELECT id FROM career.application_stage_history WHERE id=$1",
            [h.historyId],
          )
        ).rowCount,
      ).toBe(1);
    }));
  it("uses exact source cohorts/comparisons and consistent safe aggregate/history exports without financial effects", () =>
    withFixture(async (c, o) => {
      const a = await app(c, o, "2024-02-29", "Referral", {
        contactEmail: "private-person@example.test",
        notes: "PRIVATE_ANALYTICS_SENTINEL",
        salaryMinMinor: "9000000",
        salaryMaxMinor: "9000000",
        salaryCurrency: "PHP",
        salaryPeriod: "month",
      });
      await observation(c, o, a, "2024-03-01");
      await app(c, o, "2024-02-01", "referral");
      await app(c, o, "2024-01-31", "Referral");
      await app(c, o);
      const counts = async () =>
        (
          await c.query(
            "SELECT (SELECT count(*) FROM core.command_receipt WHERE workspace_id=$1)::int AS receipts,(SELECT count(*) FROM finance.posting WHERE workspace_id=$1)::int AS postings,(SELECT count(*) FROM audit.private_revision WHERE workspace_id=$1)::int AS audits,(SELECT financial_revision::text FROM core.workspace WHERE id=$1) AS revision",
            [o.workspaceId],
          )
        ).rows;
      const before = await counts();
      const r = await report(c, o, {
        sourceName: "Referral",
        compare: "previous",
        cohortInterval: "week",
      });
      expect(r.summary).toMatchObject({ submitted: 1, responded: 1 });
      expect(r.comparison!.summary.submitted).toBe(1);
      expect(r.comparison!.period).toMatchObject({
        startDate: "2024-01-03",
        endDate: "2024-01-31",
      });
      expect(r.comparison!.summary.followUpTiming.medianDays).toBeGreaterThan(
        r.summary.followUpTiming.medianDays!,
      );
      expect(JSON.stringify(r)).not.toContain("private-person");
      expect(JSON.stringify(r)).not.toContain("PRIVATE_ANALYTICS_SENTINEL");
      expect(JSON.stringify(r)).not.toContain("9000000");
      expect(
        (await report(c, o, { sourceMissing: "true" })).summary.submitted,
      ).toBe(1);
      const aggregate = await prepareCsvSnapshotInTransaction(tx(c), {
        workspaceId: o.workspaceId,
        kind: "report",
        query: {
          ...query,
          sourceName: "Referral",
          compare: "previous",
          cohortInterval: "week",
        },
      });
      expect(
        aggregate.rows.find(
          (r) => r.record_type === "career_metric" && r.metric === "submitted",
        )!.count_value,
      ).toBe("1");
      expect(
        JSON.parse(
          String(
            aggregate.rows.find(
              (r) => r.record_type === "career_cohort_summary",
            )!.summary_json,
          ),
        ).responseTiming.medianDays,
      ).toBe(1);
      expect(
        aggregate.rows.some(
          (r) => r.record_type === "career_comparison_summary",
        ),
      ).toBe(true);
      expect(JSON.stringify(aggregate)).not.toContain(
        "PRIVATE_ANALYTICS_SENTINEL",
      );
      const history = await prepareCsvSnapshotInTransaction(tx(c), {
        workspaceId: o.workspaceId,
        kind: "applications",
        query: { ...query, sourceName: "Referral" },
      });
      expect(new Set(history.rows.map((r) => r.source_name))).toEqual(
        new Set(["Referral"]),
      );
      expect(await counts()).toEqual(before);
    }));
  it("retains all supported terminal results and never infers an offer or response from accepted alone", () =>
    withFixture(async (c, o) => {
      for (const outcome of [
        "accepted",
        "rejected",
        "withdrawn",
        "offer_declined",
        "offer_expired",
        "employer_cancelled",
      ] as const)
        await app(c, o, "2024-02-01", null, {
          initialStage: outcome === "accepted" ? "accepted" : "applied",
          initialOutcome: outcome,
        });
      const r = await report(c, o);
      expect(r.summary).toMatchObject({
        submitted: 6,
        accepted: 1,
        rejected: 1,
        withdrawn: 1,
        offer_declined: 1,
        offer_expired: 1,
        employer_cancelled: 1,
        responded: 0,
        offered: 0,
        acceptedRate: { numerator: 1, denominator: 6 },
      });
    }));
  it("preserves timezone-local event boundaries and keeps Dashboard scheduled scope distinct", () =>
    withFixture(async (c, o) => {
      await c.query(
        "UPDATE core.workspace SET timezone='Pacific/Kiritimati',week_start=0 WHERE id=$1",
        [o.workspaceId],
      );
      const a = await app(c, o, "2024-02-29");
      await createApplicationEventInTransaction(tx(c), {
        ...o,
        clientCommandId: randomUUID(),
        applicationId: a.applicationId,
        eventKind: "interview",
        title: "At local midnight",
        temporalKind: "timed",
        startsAt: "2024-02-28T10:00:00Z",
        timezone: "Pacific/Kiritimati",
      });
      const r = await report(c, o, {
        startDate: "2024-02-29",
        endDate: "2024-02-29",
        asOfDate: "2024-02-29",
        cohortInterval: "week",
      });
      expect(r.events[0]!.date).toBe("2024-02-29");
      expect(r.summary.interviewed).toBe(0);
      expect(r.analytics.cohorts[0]!.startDate).toBe("2024-02-29");
      const dashboard = await readCareerSnapshot(
        tx(c),
        o.workspaceId,
        "2024-02-29",
        "2024-02-29",
      );
      expect(dashboard.events[0]!.eventId).toBe(r.events[0]!.eventId);
      expect(dashboard.applications.filter((a) => a.active)).toHaveLength(1);
      await scoped(c, { userId: randomUUID(), workspaceId: randomUUID() });
      expect(
        (await c.query("SELECT id FROM career.job_application")).rows,
      ).toEqual([]);
      expect(
        (await c.query("SELECT id FROM career.application_event")).rows,
      ).toEqual([]);
      await expect(report(c, o)).rejects.toThrow("Workspace unavailable");
      await scoped(c, o);
    }));
  it("holds one stable read-only snapshot across a concurrent Career writer and preserves another owner", async () => {
    const label = "V2-F career analytics fixture",
      owners: Owner[] = [];
    try {
      for (let n = 0; n < 2; n++) {
        const userId = randomUUID();
        await getAuthPool().query(
          'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
          [userId, label, `${userId}@example.test`],
        );
        const w = await provisionPersonalWorkspace({
          userId,
          displayName: label,
        });
        owners.push({ userId, workspaceId: w.workspaceId });
      }
      const o = owners[0]!,
        other = owners[1]!;
      const a = await createJobApplication({
        ...o,
        clientCommandId: randomUUID(),
        companyName: "Snapshot company",
        roleTitle: "Engineer",
        initialStage: "applied",
        initialStageEffectiveDate: "2024-02-01",
        appliedDate: "2024-02-01",
      });
      await withDomainTransaction(
        o,
        async (t) => {
          const before = await getCareerReportInTransaction(t, {
            workspaceId: o.workspaceId,
            query,
          });
          await recordCareerObservation({
            ...o,
            applicationId: a.applicationId,
            body: {
              clientCommandId: randomUUID(),
              expectedApplicationVersion: a.version,
              kind: "response",
              date: "2024-02-02",
              title: "Concurrent recorded response",
            },
          });
          const after = await getCareerReportInTransaction(t, {
            workspaceId: o.workspaceId,
            query,
          });
          expect(after).toEqual(before);
        },
        { readOnlySnapshot: true },
      );
      expect((await getCareerReport({ ...o, query })).summary.responded).toBe(
        1,
      );
      expect(
        (await getCareerReport({ ...other, query })).summary.submitted,
      ).toBe(0);
      await expect(
        withDomainTransaction(
          o,
          (t) =>
            t.db.execute(
              sql`UPDATE career.job_application SET company_name='Invalid' WHERE workspace_id=${o.workspaceId}::uuid`,
            ),
          { readOnlySnapshot: true },
        ),
      ).rejects.toMatchObject({ cause: { code: "25006" } });
      await expect(
        withDomainTransaction(
          other,
          (t) =>
            getCareerReportInTransaction(t, {
              workspaceId: o.workspaceId,
              query,
            }),
          { readOnlySnapshot: true },
        ),
      ).rejects.toThrow("Workspace unavailable");
    } finally {
      for (const o of owners) await removeNamedFinancialFixture(o, label);
    }
  });
});
