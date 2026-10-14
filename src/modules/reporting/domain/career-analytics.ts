import { z } from "zod";
import { CAREER_APPLICATION_OUTCOMES } from "@/modules/career/domain/application";
import type {
  CohortApplication,
  CareerReportEvent,
  CareerStageDuration,
} from "../repositories/career-report-repository";
import { addCalendarDays, type ReportPeriod } from "./period";
import { reportQuerySchema } from "./reports";

export const CAREER_CALCULATION_VERSION = "v2-f-corrected-cohorts-1";
export const careerReportQuerySchema = reportQuerySchema
  .extend({
    cohortInterval: z.enum(["week", "month", "quarter", "year"]).optional(),
    sourceName: z.string().min(1).max(200).optional(),
    sourceMissing: z.literal("true").optional(),
    compare: z.literal("previous").optional(),
  })
  .strict()
  .refine(
    (q) => !(q.sourceName !== undefined && q.sourceMissing),
    "Choose one source filter.",
  );
export type CareerReportQuery = z.input<typeof careerReportQuerySchema>;
export function careerBaseQuery(raw: CareerReportQuery) {
  const { cohortInterval, sourceName, sourceMissing, compare, ...query } =
    careerReportQuerySchema.parse(raw);
  return {
    query,
    cohortInterval: cohortInterval ?? "month",
    sourceName,
    sourceMissing,
    compare,
  };
}
export function calendarDays(start: string, end: string) {
  return (
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
    86400000
  );
}
export const careerRate = (numerator: number, denominator: number) =>
  denominator ? { numerator, denominator } : null;
export function timingSummary(values: number[], population: number) {
  const sorted = [...values].sort((a, b) => a - b),
    count = sorted.length,
    middle = Math.floor(count / 2);
  return {
    samples: count,
    missing: population - count,
    minimumDays: sorted[0] ?? null,
    medianDays: count
      ? count % 2
        ? sorted[middle]!
        : (sorted[middle - 1]! + sorted[middle]!) / 2
      : null,
    maximumDays: sorted.at(-1) ?? null,
  };
}
function bucketStart(date: string, interval: string, weekStart: number) {
  if (interval === "week")
    return addCalendarDays(
      date,
      -((new Date(`${date}T00:00:00Z`).getUTCDay() - weekStart + 7) % 7),
    );
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 4)}-${String(interval === "year" ? 1 : interval === "quarter" ? Math.floor((month - 1) / 3) * 3 + 1 : month).padStart(2, "0")}-01`;
}
export function previousCareerPeriod(period: ReportPeriod): ReportPeriod {
  const length = calendarDays(period.startDate, period.endDateExclusive);
  return {
    kind: "custom",
    startDate: addCalendarDays(period.startDate, -length),
    endDate: addCalendarDays(period.startDate, -1),
    endDateExclusive: period.startDate,
  };
}
type Evidence = {
  applications: CohortApplication[];
  events: CareerReportEvent[];
  stages: CareerStageDuration[];
};
export function analyzeCareerEvidence(
  data: Evidence,
  input: {
    period: ReportPeriod;
    asOfDate: string;
    today: string;
    weekStart: number;
    cohortInterval: string;
    sourceName?: string | undefined;
    sourceMissing?: "true" | undefined;
  },
) {
  const matches = (source: string | null) =>
    input.sourceName !== undefined
      ? source === input.sourceName
      : input.sourceMissing
        ? source === null
        : true;
  const roots = data.applications.filter((a) => matches(a.source)),
    ids = new Set(roots.map((a) => a.applicationId));
  const events = data.events.filter((e) => e.inPeriod && matches(e.source));
  const stages = data.stages.filter((s) => ids.has(s.applicationId));
  const byApp = new Map(
    roots.map((a) => [
      a.applicationId,
      {
        root: a,
        events: [] as CareerReportEvent[],
        stages: [] as CareerStageDuration[],
      },
    ]),
  );
  for (const e of data.events)
    if (e.inCohort && e.date <= input.asOfDate)
      byApp.get(e.applicationId)?.events.push(e);
  for (const s of stages) byApp.get(s.applicationId)?.stages.push(s);
  let preSubmissionEvidence = 0;
  const applications = roots.map((a) => {
    const evidence = byApp.get(a.applicationId)!;
    const eligibleEvents = evidence.events.filter(
      (e) => e.status !== "cancelled" && e.date >= a.appliedDate,
    );
    const eligibleStages = evidence.stages.filter(
      (s) => s.effectiveDate >= a.appliedDate,
    );
    preSubmissionEvidence +=
      evidence.events.filter(
        (e) => e.status !== "cancelled" && e.date < a.appliedDate,
      ).length +
      evidence.stages.filter(
        (s) => s.stage !== "saved" && s.effectiveDate < a.appliedDate,
      ).length;
    const first = (kind: string, names: string[]) =>
      [
        ...eligibleEvents
          .filter(
            (e) =>
              e.kind === kind &&
              (["response", "offer"].includes(kind) ||
                e.status === "completed"),
          )
          .map((e) => e.date),
        ...eligibleStages
          .filter((s) => names.includes(s.stage))
          .map((s) => s.effectiveDate),
      ].sort()[0] ?? null;
    const firstResponseDate = first("response", []),
      firstInterviewDate = first("interview", ["interview", "final_interview"]),
      firstAssessmentDate = first("assessment", ["technical_assessment"]),
      firstOfferDate = first("offer", ["offer"]);
    return {
      ...a,
      responded: firstResponseDate !== null,
      interviewed: firstInterviewDate !== null,
      assessed: firstAssessmentDate !== null,
      offered: firstOfferDate !== null,
      firstResponseDate,
      firstInterviewDate,
      firstAssessmentDate,
      firstOfferDate,
      responseDays: firstResponseDate
        ? calendarDays(a.appliedDate, firstResponseDate)
        : null,
      interviewDays: firstInterviewDate
        ? calendarDays(a.appliedDate, firstInterviewDate)
        : null,
      offerDays: firstOfferDate
        ? calendarDays(a.appliedDate, firstOfferDate)
        : null,
      followUpDays: calendarDays(a.appliedDate, input.asOfDate),
      explicitNoResponse: eligibleEvents.some((e) => e.kind === "no_response"),
      reachedOutcomes: [
        ...new Set(
          eligibleStages.flatMap((s) => (s.outcome ? [s.outcome] : [])),
        ),
      ],
      observationCount: evidence.stages.length,
    };
  });
  const summarize = (apps: typeof applications) => {
    const submitted = apps.length,
      responded = apps.filter((a) => a.responded).length,
      interviewed = apps.filter((a) => a.interviewed).length,
      offered = apps.filter((a) => a.offered).length;
    return {
      submitted,
      responded,
      interviewed,
      assessed: apps.filter((a) => a.assessed).length,
      offered,
      ...(Object.fromEntries(
        CAREER_APPLICATION_OUTCOMES.map((o) => [
          o,
          apps.filter((a) => a.outcome === o).length,
        ]),
      ) as Record<(typeof CAREER_APPLICATION_OUTCOMES)[number], number>),
      open: apps.filter((a) => a.outcome === null && a.historyId !== null)
        .length,
      unknownStage: apps.filter((a) => a.historyId === null).length,
      archived: apps.filter((a) => a.archived).length,
      explicitNoResponse: apps.filter((a) => a.explicitNoResponse).length,
      responseRate: careerRate(responded, submitted),
      interviewRate: careerRate(interviewed, submitted),
      offerRate: careerRate(offered, submitted),
      acceptedRate: careerRate(
        apps.filter((a) => a.outcome === "accepted").length,
        submitted,
      ),
      responseToInterviewRate: careerRate(
        apps.filter((a) => a.responded && a.interviewed).length,
        responded,
      ),
      interviewToOfferRate: careerRate(
        apps.filter((a) => a.interviewed && a.offered).length,
        interviewed,
      ),
      responseTiming: timingSummary(
        apps.flatMap((a) => (a.responseDays === null ? [] : [a.responseDays])),
        submitted,
      ),
      interviewTiming: timingSummary(
        apps.flatMap((a) =>
          a.interviewDays === null ? [] : [a.interviewDays],
        ),
        submitted,
      ),
      offerTiming: timingSummary(
        apps.flatMap((a) => (a.offerDays === null ? [] : [a.offerDays])),
        submitted,
      ),
      followUpTiming: timingSummary(
        apps.map((a) => a.followUpDays),
        submitted,
      ),
    };
  };
  const summary = summarize(applications);
  const sourceMap = new Map<string | null, typeof applications>();
  const bucketMap = new Map<string, typeof applications>();
  for (const a of applications) {
    const sourceApps = sourceMap.get(a.source) ?? [];
    sourceApps.push(a);
    sourceMap.set(a.source, sourceApps);
    const key = bucketStart(
      a.appliedDate,
      input.cohortInterval,
      input.weekStart,
    );
    const bucketApps = bucketMap.get(key) ?? [];
    bucketApps.push(a);
    bucketMap.set(key, bucketApps);
  }
  // Include empty buckets; totals always use every source in the bounded read.
  for (
    let date = input.period.startDate;
    date < input.period.endDateExclusive;
    date = addCalendarDays(date, 1)
  ) {
    const key = bucketStart(date, input.cohortInterval, input.weekStart);
    if (!bucketMap.has(key)) bucketMap.set(key, []);
  }
  const cohorts = [...bucketMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, apps], index, all) => {
      const startDate =
        bucket < input.period.startDate ? input.period.startDate : bucket;
      const endDate = addCalendarDays(
        all[index + 1]?.[0] ?? input.period.endDateExclusive,
        -1,
      );
      return {
        bucket,
        startDate,
        endDate,
        fullyObserved: endDate <= input.asOfDate,
        ...summarize(apps),
      };
    });
  const stageMap = new Map<string, CareerStageDuration[]>();
  for (const s of stages) {
    const a = byApp.get(s.applicationId)?.root;
    if (
      s.stage === "saved" ||
      s.outcome !== null ||
      !a ||
      s.effectiveDate < a.appliedDate
    )
      continue;
    const visits = stageMap.get(s.stage) ?? [];
    visits.push(s);
    stageMap.set(s.stage, visits);
  }
  const stageTiming = [...stageMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stage, visits]) => ({
      stage,
      applications: new Set(visits.map((s) => s.applicationId)).size,
      visits: visits.length,
      closed: timingSummary(
        visits.filter((s) => !s.open).map((s) => s.elapsedDays),
        visits.filter((s) => !s.open).length,
      ),
      open: timingSummary(
        visits.filter((s) => s.open).map((s) => s.elapsedDays),
        visits.filter((s) => s.open).length,
      ),
    }));
  const eventSummary = [...new Set(events.map((e) => e.kind))]
    .sort()
    .map((kind) => ({
      kind,
      completed: events.filter(
        (e) =>
          e.kind === kind &&
          e.status === "completed" &&
          e.date <= input.asOfDate,
      ).length,
      scheduled: events.filter(
        (e) => e.kind === kind && e.status === "scheduled",
      ).length,
      cancelled: events.filter(
        (e) => e.kind === kind && e.status === "cancelled",
      ).length,
      afterCutoff: events.filter(
        (e) =>
          e.kind === kind &&
          e.status === "completed" &&
          e.date > input.asOfDate,
      ).length,
    }));
  return {
    applications,
    events,
    stages,
    summary: {
      ...summary,
      interviewEvents: events.filter(
        (e) => e.kind === "interview" && e.status !== "cancelled",
      ).length,
      assessmentEvents: events.filter(
        (e) => e.kind === "assessment" && e.status !== "cancelled",
      ).length,
      upcoming: events.filter(
        (e) =>
          e.status === "scheduled" &&
          e.date >= input.today &&
          ["interview", "assessment", "follow_up"].includes(e.kind),
      ).length,
    },
    analytics: {
      calculationVersion: CAREER_CALCULATION_VERSION,
      sources: [...sourceMap.entries()].map(([source, apps]) => ({
        source,
        ...summarize(apps),
      })),
      cohorts,
      stageTiming,
      eventSummary,
      reachedOutcomes: CAREER_APPLICATION_OUTCOMES.map((outcome) => ({
        outcome,
        applications: applications.filter((a) =>
          a.reachedOutcomes.includes(outcome),
        ).length,
      })),
      preSubmissionEvidence,
      missingStageEvidence: applications.filter((a) => a.observationCount === 0)
        .length,
    },
  };
}
