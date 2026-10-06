import { z } from "zod";

import type {
  ApplicationEventTemporalKind,
  CareerActionableEventKind,
} from "@/modules/career/domain/application-event";
import {
  CAREER_APPLICATION_STAGES,
  type CareerApplicationOutcome,
  type CareerApplicationStage,
  type CareerWorkArrangement,
} from "@/modules/career/domain/application";
import {
  readJobApplicationListPage,
  type JobApplicationListArchiveFilter,
  type JobApplicationListCursorPosition,
  type JobApplicationListQueryRow,
} from "@/modules/career/repositories/job-application-list-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";

const JOB_APPLICATION_LIST_ARCHIVE_FILTERS = [
  "active",
  "archived",
  "all",
] as const;

const jobApplicationListCursorSchema = z
  .object({
    version: z.literal(1),

    appliedDate: z.string().refine(isCalendarDate).nullable(),

    applicationId: z.uuid(),

    archive: z.enum(JOB_APPLICATION_LIST_ARCHIVE_FILTERS),

    stage: z.enum(CAREER_APPLICATION_STAGES).nullable(),

    search: z.string().max(200).nullable(),
  })
  .strict();

const listJobApplicationsInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    archive: z.enum(JOB_APPLICATION_LIST_ARCHIVE_FILTERS).default("active"),

    stage: z.enum(CAREER_APPLICATION_STAGES).optional(),

    search: z.string().trim().max(200).optional(),

    pageSize: z.number().int().min(1).max(100).default(25),

    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();

export type ListJobApplicationsInput = z.input<
  typeof listJobApplicationsInputSchema
>;

export type JobApplicationListNextAction = {
  eventId: string;

  eventKind: CareerActionableEventKind;
  title: string;

  temporalKind: ApplicationEventTemporalKind;

  eventDate: CalendarDate | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
};

export type JobApplicationListItem = {
  applicationId: string;

  companyName: string;
  roleTitle: string;

  location: string | null;
  workArrangement: CareerWorkArrangement | null;

  appliedDate: CalendarDate | null;

  currentStage: CareerApplicationStage;
  currentOutcome: CareerApplicationOutcome | null;

  archived: boolean;

  /**
   * Passed back to mutation commands as their expected application version.
   */
  version: number;

  nextAction: JobApplicationListNextAction | null;
};

export type ListJobApplicationsResult = {
  items: JobApplicationListItem[];

  nextCursor: string | null;
};

export class InvalidJobApplicationListCursorError extends Error {
  readonly code = "INVALID_JOB_APPLICATION_LIST_CURSOR";

  constructor() {
    super(
      "The job application list cursor is invalid for the requested filters.",
    );

    this.name = "InvalidJobApplicationListCursorError";
  }
}

export class JobApplicationListWorkspaceUnavailableError extends Error {
  readonly code = "JOB_APPLICATION_LIST_WORKSPACE_UNAVAILABLE";

  constructor() {
    super(
      "The active workspace could not be resolved for the job application list.",
    );

    this.name = "JobApplicationListWorkspaceUnavailableError";
  }
}

type NormalizedListJobApplicationsInput = {
  userId: string;
  workspaceId: string;

  archive: JobApplicationListArchiveFilter;
  stage: CareerApplicationStage | null;
  search: string | null;

  pageSize: number;

  cursor: JobApplicationListCursorPosition | null;
};

type CursorFilters = {
  archive: JobApplicationListArchiveFilter;
  stage: CareerApplicationStage | null;
  search: string | null;
};

function normalizeSearch(value: string | undefined): string | null {
  if (value === undefined || value.length === 0) {
    return null;
  }

  return value;
}

function encodeJobApplicationListCursor(
  position: JobApplicationListCursorPosition,
  filters: CursorFilters,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,

      appliedDate: position.appliedDate,
      applicationId: position.applicationId,

      archive: filters.archive,
      stage: filters.stage,
      search: filters.search,
    }),
    "utf8",
  ).toString("base64url");
}

function decodeJobApplicationListCursor(
  cursor: string,
  filters: CursorFilters,
): JobApplicationListCursorPosition {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );

    const parsed = jobApplicationListCursorSchema.parse(decoded);

    if (
      parsed.archive !== filters.archive ||
      parsed.stage !== filters.stage ||
      parsed.search !== filters.search
    ) {
      throw new InvalidJobApplicationListCursorError();
    }

    return {
      appliedDate:
        parsed.appliedDate === null
          ? null
          : parseCalendarDate(parsed.appliedDate),

      applicationId: parsed.applicationId,
    };
  } catch (error) {
    if (error instanceof InvalidJobApplicationListCursorError) {
      throw error;
    }

    throw new InvalidJobApplicationListCursorError();
  }
}

function normalizeListJobApplicationsInput(
  input: ListJobApplicationsInput,
): NormalizedListJobApplicationsInput {
  const parsed = listJobApplicationsInputSchema.parse(input);

  const archive = parsed.archive;
  const stage = parsed.stage ?? null;
  const search = normalizeSearch(parsed.search);

  const filters: CursorFilters = {
    archive,
    stage,
    search,
  };

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    archive,
    stage,
    search,

    pageSize: parsed.pageSize,

    cursor:
      parsed.cursor === undefined
        ? null
        : decodeJobApplicationListCursor(parsed.cursor, filters),
  };
}

function mapNextAction(input: {
  eventId: string | null;
  eventKind: string | null;
  title: string | null;
  temporalKind: string | null;
  eventDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
}): JobApplicationListNextAction | null {
  if (input.eventId === null) {
    if (
      input.eventKind !== null ||
      input.title !== null ||
      input.temporalKind !== null ||
      input.eventDate !== null ||
      input.startsAt !== null ||
      input.endsAt !== null ||
      input.timezone !== null
    ) {
      throw new Error(
        "Job application list query returned next-action data without a next-action event ID.",
      );
    }

    return null;
  }

  if (
    input.eventKind === null ||
    input.title === null ||
    input.temporalKind === null
  ) {
    throw new Error(
      "Job application list query returned an incomplete next-action event.",
    );
  }

  if (
    input.eventKind !== "interview" &&
    input.eventKind !== "assessment" &&
    input.eventKind !== "follow_up"
  ) {
    throw new Error(
      "Job application next action is not an actionable Career event.",
    );
  }

  if (input.temporalKind !== "date" && input.temporalKind !== "timed") {
    throw new Error(
      "Job application next action has an invalid temporal kind.",
    );
  }

  if (input.temporalKind === "date") {
    if (
      input.eventDate === null ||
      input.startsAt !== null ||
      input.endsAt !== null ||
      input.timezone !== null
    ) {
      throw new Error(
        "Date-only job application next action has an invalid temporal shape.",
      );
    }

    return {
      eventId: input.eventId,

      eventKind: input.eventKind,
      title: input.title,

      temporalKind: "date",

      eventDate: parseCalendarDate(input.eventDate),

      startsAt: null,
      endsAt: null,
      timezone: null,
    };
  }

  if (
    input.eventDate !== null ||
    input.startsAt === null ||
    input.timezone === null
  ) {
    throw new Error(
      "Timed job application next action has an invalid temporal shape.",
    );
  }

  return {
    eventId: input.eventId,

    eventKind: input.eventKind,
    title: input.title,

    temporalKind: "timed",

    eventDate: null,

    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
  };
}

function mapApplicationRow(
  row: JobApplicationListQueryRow,
): JobApplicationListItem {
  if (
    row.application_id === null ||
    row.company_name === null ||
    row.role_title === null ||
    row.current_stage === null ||
    row.archived === null ||
    row.version === null
  ) {
    throw new Error(
      "Job application list query returned an incomplete application.",
    );
  }

  return {
    applicationId: row.application_id,

    companyName: row.company_name,
    roleTitle: row.role_title,

    location: row.location,
    workArrangement: row.work_arrangement as CareerWorkArrangement | null,

    appliedDate:
      row.applied_date === null ? null : parseCalendarDate(row.applied_date),

    currentStage: row.current_stage as CareerApplicationStage,

    currentOutcome: row.current_outcome as CareerApplicationOutcome | null,

    archived: row.archived,

    version: row.version,

    nextAction: mapNextAction({
      eventId: row.next_action_event_id,
      eventKind: row.next_event_kind,
      title: row.next_title,
      temporalKind: row.next_temporal_kind,
      eventDate: row.next_event_date,
      startsAt: row.next_starts_at,
      endsAt: row.next_ends_at,
      timezone: row.next_timezone,
    }),
  };
}

async function executeListJobApplications(
  transaction: ScopedTransaction,
  input: NormalizedListJobApplicationsInput,
): Promise<ListJobApplicationsResult> {
  const rows = await readJobApplicationListPage(transaction, {
    workspaceId: input.workspaceId,

    archive: input.archive,
    stage: input.stage,
    search: input.search,

    limit: input.pageSize + 1,

    cursor: input.cursor,
  });

  const firstRow = rows[0];

  /*
   * The repository anchors the page to an active workspace row. No visible
   * root means the requested workspace is unavailable in this scoped
   * transaction. A valid workspace with zero applications still returns one
   * workspace-header row whose application_id is null.
   */
  if (!firstRow) {
    throw new JobApplicationListWorkspaceUnavailableError();
  }

  const applicationRows = rows.filter((row) => row.application_id !== null);

  const hasMore = applicationRows.length > input.pageSize;

  const visibleRows = applicationRows.slice(0, input.pageSize);

  const items = visibleRows.map(mapApplicationRow);

  const lastVisibleRow = visibleRows.at(-1);

  let nextCursor: string | null = null;

  if (hasMore && lastVisibleRow) {
    if (lastVisibleRow.application_id === null) {
      throw new Error(
        "Job application list query could not create a cursor from an empty application row.",
      );
    }

    nextCursor = encodeJobApplicationListCursor(
      {
        appliedDate:
          lastVisibleRow.applied_date === null
            ? null
            : parseCalendarDate(lastVisibleRow.applied_date),

        applicationId: lastVisibleRow.application_id,
      },
      {
        archive: input.archive,
        stage: input.stage,
        search: input.search,
      },
    );
  }

  return {
    items,
    nextCursor,
  };
}

export async function listJobApplicationsInTransaction(
  transaction: ScopedTransaction,
  input: ListJobApplicationsInput,
): Promise<ListJobApplicationsResult> {
  return executeListJobApplications(
    transaction,
    normalizeListJobApplicationsInput(input),
  );
}

export async function listJobApplications(
  input: ListJobApplicationsInput,
): Promise<ListJobApplicationsResult> {
  const normalizedInput = normalizeListJobApplicationsInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeListJobApplications(transaction, normalizedInput),
  );
}
