import { z } from "zod";

import {
  APPLICATION_EVENT_KINDS,
  APPLICATION_EVENT_STATUSES,
  APPLICATION_EVENT_TEMPORAL_KINDS,
  type ApplicationEventKind,
  type ApplicationEventStatus,
  type ApplicationEventTemporalKind,
} from "@/modules/career/domain/application-event";
import {
  CAREER_APPLICATION_OUTCOMES,
  CAREER_APPLICATION_STAGES,
  CAREER_SALARY_PERIODS,
  CAREER_WORK_ARRANGEMENTS,
  JobApplicationUnavailableError,
  type CareerApplicationOutcome,
  type CareerApplicationStage,
  type CareerSalaryPeriod,
  type CareerWorkArrangement,
} from "@/modules/career/domain/application";
import {
  readJobApplicationDetail,
  type JobApplicationDetailEventRow,
  type JobApplicationDetailStageHistoryRow,
} from "@/modules/career/repositories/job-application-detail-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import { parseCalendarDate, type CalendarDate } from "@/shared/calendar-date";
import { parseMinorUnits } from "@/shared/money";

const applicationStageSchema = z.enum(CAREER_APPLICATION_STAGES);

const applicationOutcomeSchema = z.enum(CAREER_APPLICATION_OUTCOMES);

const workArrangementSchema = z.enum(CAREER_WORK_ARRANGEMENTS);

const salaryPeriodSchema = z.enum(CAREER_SALARY_PERIODS);

const applicationEventKindSchema = z.enum(APPLICATION_EVENT_KINDS);

const applicationEventTemporalKindSchema = z.enum(
  APPLICATION_EVENT_TEMPORAL_KINDS,
);

const applicationEventStatusSchema = z.enum(APPLICATION_EVENT_STATUSES);

const getJobApplicationDetailInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    applicationId: z.uuid(),
  })
  .strict();

export type GetJobApplicationDetailInput = z.input<
  typeof getJobApplicationDetailInputSchema
>;

export type JobApplicationDetailResumeVersion = {
  resumeVersionId: string;

  label: string;

  referenceUrl: string | null;
  notes: string | null;

  archived: boolean;
};

export type JobApplicationStageHistoryItem = {
  historyId: string;

  sequenceNo: number;

  stage: CareerApplicationStage;
  outcome: CareerApplicationOutcome | null;

  effectiveDate: CalendarDate;
  effectiveOrder: number;

  supersedesHistoryId: string | null;
  supersededByHistoryId: string | null;

  reason: string | null;

  recordedAt: string;

  isCurrent: boolean;
};

export type JobApplicationDetailEvent = {
  eventId: string;

  eventKind: ApplicationEventKind;
  title: string;

  temporalKind: ApplicationEventTemporalKind;

  eventDate: CalendarDate | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  status: ApplicationEventStatus;

  location: string | null;
  meetingUrl: string | null;

  preparationNotes: string | null;
  outcomeNotes: string | null;

  completedAt: string | null;

  notificationGeneration: number;

  createdAt: string;
  updatedAt: string;

  version: number;

  isNextAction: boolean;
};

export type GetJobApplicationDetailResult = {
  application: {
    applicationId: string;

    companyName: string;
    roleTitle: string;

    postingUrl: string | null;
    sourceName: string | null;

    roleDescriptionSnapshot: string | null;

    location: string | null;
    workArrangement: CareerWorkArrangement | null;

    salaryMinMinor: string | null;
    salaryMaxMinor: string | null;
    salaryCurrency: string | null;
    salaryPeriod: CareerSalaryPeriod | null;

    technologyTags: string[];

    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;

    resumeVersion: JobApplicationDetailResumeVersion | null;

    appliedDate: CalendarDate | null;

    currentStage: CareerApplicationStage;
    currentOutcome: CareerApplicationOutcome | null;

    currentHistoryId: string;

    nextActionEventId: string | null;

    notes: string | null;

    archived: boolean;

    createdAt: string;
    updatedAt: string;

    version: number;
  };

  stageHistory: JobApplicationStageHistoryItem[];

  events: JobApplicationDetailEvent[];
};

type NormalizedGetJobApplicationDetailInput = {
  userId: string;
  workspaceId: string;

  applicationId: string;
};

function normalizeInput(
  input: GetJobApplicationDetailInput,
): NormalizedGetJobApplicationDetailInput {
  return getJobApplicationDetailInputSchema.parse(input);
}

function normalizeInstant(value: string): string {
  return new Date(value).toISOString();
}

function normalizeNullableInstant(value: string | null): string | null {
  return value === null ? null : normalizeInstant(value);
}

function normalizeSalaryMinor(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const parsed = parseMinorUnits(value);

  if (parsed < 0n) {
    throw new Error(
      "Job application detail query returned a negative salary value.",
    );
  }

  return parsed.toString();
}

function mapStageHistory(
  row: JobApplicationDetailStageHistoryRow,
): JobApplicationStageHistoryItem {
  return {
    historyId: row.historyId,

    sequenceNo: row.sequenceNo,

    stage: applicationStageSchema.parse(row.stage),

    outcome:
      row.outcome === null ? null : applicationOutcomeSchema.parse(row.outcome),

    effectiveDate: parseCalendarDate(row.effectiveDate),

    effectiveOrder: row.effectiveOrder,

    supersedesHistoryId: row.supersedesHistoryId,

    supersededByHistoryId: row.supersededByHistoryId,

    reason: row.reason,

    recordedAt: normalizeInstant(row.recordedAt),

    isCurrent: row.isCurrent,
  };
}

function mapApplicationEvent(
  row: JobApplicationDetailEventRow,
): JobApplicationDetailEvent {
  const eventKind = applicationEventKindSchema.parse(row.eventKind);

  const temporalKind = applicationEventTemporalKindSchema.parse(
    row.temporalKind,
  );

  const status = applicationEventStatusSchema.parse(row.status);

  if (temporalKind === "date") {
    if (
      row.eventDate === null ||
      row.startsAt !== null ||
      row.endsAt !== null ||
      row.timezone !== null
    ) {
      throw new Error(
        "Date-only application event has an invalid temporal shape.",
      );
    }
  } else if (
    row.eventDate !== null ||
    row.startsAt === null ||
    row.timezone === null
  ) {
    throw new Error("Timed application event has an invalid temporal shape.");
  }

  if (status === "completed" && row.completedAt === null) {
    throw new Error(
      "Completed application event is missing its completion timestamp.",
    );
  }

  if (status !== "completed" && row.completedAt !== null) {
    throw new Error(
      "Non-completed application event unexpectedly has a completion timestamp.",
    );
  }

  return {
    eventId: row.eventId,

    eventKind,
    title: row.title,

    temporalKind,

    eventDate: row.eventDate === null ? null : parseCalendarDate(row.eventDate),

    startsAt: normalizeNullableInstant(row.startsAt),

    endsAt: normalizeNullableInstant(row.endsAt),

    timezone: row.timezone,

    status,

    location: row.location,
    meetingUrl: row.meetingUrl,

    preparationNotes: row.preparationNotes,

    outcomeNotes: row.outcomeNotes,

    completedAt: normalizeNullableInstant(row.completedAt),

    notificationGeneration: row.notificationGeneration,

    createdAt: normalizeInstant(row.createdAt),

    updatedAt: normalizeInstant(row.updatedAt),

    version: row.version,

    isNextAction: row.isNextAction,
  };
}

async function executeGetJobApplicationDetail(
  transaction: ScopedTransaction,
  input: NormalizedGetJobApplicationDetailInput,
): Promise<GetJobApplicationDetailResult> {
  const row = await readJobApplicationDetail(transaction, {
    workspaceId: input.workspaceId,

    applicationId: input.applicationId,
  });

  if (!row) {
    throw new JobApplicationUnavailableError();
  }

  const resumeVersion =
    row.resume_version_id === null
      ? null
      : (() => {
          if (row.resume_label === null || row.resume_archived === null) {
            throw new Error(
              "Job application detail query returned incomplete resume-version metadata.",
            );
          }

          return {
            resumeVersionId: row.resume_version_id,

            label: row.resume_label,

            referenceUrl: row.resume_reference_url,

            notes: row.resume_notes,

            archived: row.resume_archived,
          };
        })();

  return {
    application: {
      applicationId: row.application_id,

      companyName: row.company_name,

      roleTitle: row.role_title,

      postingUrl: row.posting_url,

      sourceName: row.source_name,

      roleDescriptionSnapshot: row.role_description_snapshot,

      location: row.location,

      workArrangement:
        row.work_arrangement === null
          ? null
          : workArrangementSchema.parse(row.work_arrangement),

      salaryMinMinor: normalizeSalaryMinor(row.salary_min_minor),

      salaryMaxMinor: normalizeSalaryMinor(row.salary_max_minor),

      salaryCurrency: row.salary_currency,

      salaryPeriod:
        row.salary_period === null
          ? null
          : salaryPeriodSchema.parse(row.salary_period),

      technologyTags: [...row.technology_tags],

      contactName: row.contact_name,

      contactEmail: row.contact_email,

      contactPhone: row.contact_phone,

      resumeVersion,

      appliedDate:
        row.applied_date === null ? null : parseCalendarDate(row.applied_date),

      currentStage: applicationStageSchema.parse(row.current_stage),

      currentOutcome:
        row.current_outcome === null
          ? null
          : applicationOutcomeSchema.parse(row.current_outcome),

      currentHistoryId: row.current_history_id,

      nextActionEventId: row.next_action_event_id,

      notes: row.notes,

      archived: row.archived,

      createdAt: normalizeInstant(row.created_at),

      updatedAt: normalizeInstant(row.updated_at),

      version: row.version,
    },

    stageHistory: row.stage_history.map(mapStageHistory),

    events: row.events.map(mapApplicationEvent),
  };
}

export async function getJobApplicationDetailInTransaction(
  transaction: ScopedTransaction,
  input: GetJobApplicationDetailInput,
): Promise<GetJobApplicationDetailResult> {
  return executeGetJobApplicationDetail(transaction, normalizeInput(input));
}

export async function getJobApplicationDetail(
  input: GetJobApplicationDetailInput,
): Promise<GetJobApplicationDetailResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,
      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeGetJobApplicationDetail(transaction, normalized),
  );
}
