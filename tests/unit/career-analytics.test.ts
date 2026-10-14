import { describe, it, expect } from "vitest";
import {
  analyzeCareerEvidence,
  timingSummary,
  previousCareerPeriod,
  careerReportQuerySchema,
} from "@/modules/reporting/domain/career-analytics";
import type {
  CohortApplication,
  CareerReportEvent,
  CareerStageDuration,
} from "@/modules/reporting/repositories/career-report-repository";
import { resolveReportPeriod } from "@/modules/reporting/domain/period";
const period = resolveReportPeriod(
  { period: "custom", startDate: "2024-02-01", endDate: "2024-02-29" },
  "2024-03-10",
  1,
);
const options = {
  period,
  asOfDate: "2024-03-10",
  today: "2024-03-10",
  weekStart: 1,
  cohortInterval: "month",
};
const app = (
  id: string,
  changes: Partial<CohortApplication> = {},
): CohortApplication => ({
  applicationId: id,
  company: "Same company",
  role: "Same role",
  source: null,
  appliedDate: "2024-02-01",
  stage: "applied",
  outcome: null,
  archived: false,
  version: 1,
  historyId: `${id}-h`,
  ...changes,
});
const event = (
  id: string,
  kind: string,
  changes: Partial<CareerReportEvent> = {},
): CareerReportEvent => ({
  eventId: id,
  applicationId: "a",
  title: "Evidence",
  kind,
  date: "2024-02-02",
  startsAt: null,
  status: "completed",
  version: 1,
  source: null,
  inCohort: true,
  inPeriod: true,
  ...changes,
});
const stage = (
  id: string,
  changes: Partial<CareerStageDuration> = {},
): CareerStageDuration => ({
  historyId: id,
  applicationId: "a",
  stage: "interview",
  outcome: null,
  sequenceNo: 1,
  effectiveOrder: 1,
  effectiveDate: "2024-02-02",
  endDate: "2024-02-03",
  elapsedDays: 1,
  open: false,
  ...changes,
});
describe("V2-F compatible corrected Career metrics", () => {
  it("preserves attempts, distinct milestones and intersection denominators when stages are skipped", () => {
    const r = analyzeCareerEvidence(
      {
        applications: [
          app("a"),
          app("b"),
          app("c", { stage: "accepted", outcome: "accepted", archived: true }),
        ],
        events: [
          event("r", "response"),
          event("r2", "response"),
          event("i", "interview", { applicationId: "b" }),
          event("o", "offer", { applicationId: "b" }),
        ],
        stages: [],
      },
      options,
    );
    expect(r.summary).toMatchObject({
      submitted: 3,
      responded: 1,
      interviewed: 1,
      offered: 1,
      accepted: 1,
      archived: 1,
      responseRate: { numerator: 1, denominator: 3 },
      responseToInterviewRate: { numerator: 0, denominator: 1 },
      interviewToOfferRate: { numerator: 1, denominator: 1 },
    });
    expect(r.applications[2]!.offered).toBe(false);
  });
  it("does not turn scheduled/cancelled or pre-submission events into progression or rejection", () => {
    const r = analyzeCareerEvidence(
      {
        applications: [app("a")],
        events: [
          event("i", "interview", { status: "scheduled" }),
          event("a", "assessment", { status: "cancelled" }),
          event("before", "response", { date: "2024-01-31" }),
          event("later", "offer", { date: "2024-03-11" }),
          event("n", "no_response"),
        ],
        stages: [],
      },
      options,
    );
    expect(r.summary).toMatchObject({
      responded: 0,
      interviewed: 0,
      assessed: 0,
      offered: 0,
      rejected: 0,
      explicitNoResponse: 1,
    });
    expect(r.analytics.preSubmissionEvidence).toBe(1);
    expect(
      r.analytics.eventSummary.find((e) => e.kind === "interview"),
    ).toMatchObject({ completed: 0, scheduled: 1 });
  });
  it("uses after-period cohort evidence for first-response timing and keeps period event counts separate", () => {
    const r = analyzeCareerEvidence(
      {
        applications: [
          app("a", { appliedDate: "2024-02-29" }),
          app("b", { appliedDate: "2024-02-28" }),
        ],
        events: [
          event("response", "response", {
            date: "2024-03-01",
            inPeriod: false,
          }),
          event("r2", "response", {
            date: "2024-03-03",
            inPeriod: false,
            applicationId: "b",
          }),
          event("other", "interview", {
            applicationId: "outside",
            inCohort: false,
          }),
        ],
        stages: [],
      },
      options,
    );
    expect(r.summary.responseTiming).toEqual({
      samples: 2,
      missing: 0,
      minimumDays: 1,
      medianDays: 2.5,
      maximumDays: 4,
    });
    expect(r.summary.responded).toBe(2);
    expect(r.summary.interviewed).toBe(0);
    expect(r.summary.interviewEvents).toBe(1);
    expect(r.events).toHaveLength(1);
  });
  it("summarizes repeated closed/open visits independently and retains reopened terminal history", () => {
    const r = analyzeCareerEvidence(
      {
        applications: [app("a")],
        events: [],
        stages: [
          stage("s0", { stage: "saved" }),
          stage("s1"),
          stage("s2", { effectiveOrder: 2, elapsedDays: 0 }),
          stage("s3", { stage: "interview", open: true, elapsedDays: 12 }),
          stage("terminal", { outcome: "rejected", elapsedDays: 0 }),
        ],
      },
      options,
    );
    expect(r.summary.rejected).toBe(0);
    expect(
      r.analytics.reachedOutcomes.find((o) => o.outcome === "rejected")!
        .applications,
    ).toBe(1);
    expect(r.analytics.stageTiming).toHaveLength(1);
    expect(r.analytics.stageTiming[0]).toMatchObject({
      applications: 1,
      visits: 3,
      closed: { samples: 2, medianDays: 0.5 },
      open: { samples: 1, medianDays: 12 },
    });
  });
  it("keeps exact source labels distinct, including null, reserved display text and object-property names", () => {
    const data = {
      applications: [
        app("a"),
        app("b", { source: "Unspecified source" }),
        app("c", { source: "__proto__" }),
        app("d", { source: "Referral" }),
        app("e", { source: "referral" }),
      ],
      events: [],
      stages: [],
    };
    expect(analyzeCareerEvidence(data, options).analytics.sources).toHaveLength(
      5,
    );
    expect(
      analyzeCareerEvidence(data, { ...options, sourceMissing: "true" }).summary
        .submitted,
    ).toBe(1);
    expect(
      analyzeCareerEvidence(data, {
        ...options,
        sourceName: "Referral",
      }).applications.map((a) => a.applicationId),
    ).toEqual(["d"]);
  });
  it("returns not applicable for empty cohorts and discloses absent stage evidence", () => {
    const r = analyzeCareerEvidence(
      { applications: [], events: [], stages: [] },
      options,
    );
    expect(r.summary.responseRate).toBeNull();
    expect(r.summary.interviewToOfferRate).toBeNull();
    expect(r.summary.responseTiming.medianDays).toBeNull();
    expect(
      analyzeCareerEvidence(
        {
          applications: [app("a", { historyId: null, stage: null })],
          events: [],
          stages: [],
        },
        options,
      ).summary.unknownStage,
    ).toBe(1);
    expect(timingSummary([0, 3, 5], 5)).toMatchObject({
      medianDays: 3,
      missing: 2,
    });
  });
  it("clips weekly/calendar buckets, retains empty buckets and describes partial observation windows", () => {
    const p = resolveReportPeriod(
      { period: "custom", startDate: "2024-02-28", endDate: "2024-03-05" },
      "2024-03-10",
      1,
    );
    const d = {
      applications: [app("a", { appliedDate: "2024-02-29" })],
      events: [],
      stages: [],
    };
    const weekly = analyzeCareerEvidence(d, {
      ...options,
      period: p,
      cohortInterval: "week",
      asOfDate: "2024-03-01",
    }).analytics.cohorts;
    expect(
      weekly.map((c) => [c.startDate, c.endDate, c.submitted, c.fullyObserved]),
    ).toEqual([
      ["2024-02-28", "2024-03-03", 1, false],
      ["2024-03-04", "2024-03-05", 0, false],
    ]);
    expect(
      analyzeCareerEvidence(d, { ...options, period: p }).analytics.cohorts.map(
        (c) => c.startDate,
      ),
    ).toEqual(["2024-02-28", "2024-03-01"]);
    expect(previousCareerPeriod(p)).toMatchObject({
      startDate: "2024-02-21",
      endDate: "2024-02-27",
    });
    for (const interval of ["quarter", "year"])
      expect(
        analyzeCareerEvidence(d, {
          ...options,
          period: p,
          cohortInterval: interval,
        }).analytics.cohorts,
      ).toHaveLength(1);
  });
  it("strictly rejects ambiguous source filters, spoofed scope and unsupported grouping", () => {
    for (const q of [
      { sourceName: "Referral", sourceMissing: "true" },
      { sourceName: "" },
      { cohortInterval: "daily" },
      { workspaceId: "foreign" },
      { compare: "future" },
    ])
      expect(careerReportQuerySchema.safeParse(q).success).toBe(false);
  });
});
