import { z } from "zod";

import {
  PERSONAL_EVENT_STATUSES,
  PERSONAL_EVENT_TEMPORAL_KINDS,
  PersonalEventUnavailableError,
  type PersonalEventStatus,
  type PersonalEventTemporalKind,
} from "@/modules/time/domain/personal-event";
import {
  readPersonalEventDetail,
  type PersonalEventDetailQueryRow,
} from "@/modules/time/repositories/personal-event-detail-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import { parseCalendarDate, type CalendarDate } from "@/shared/calendar-date";

const personalEventTemporalKindSchema = z.enum(PERSONAL_EVENT_TEMPORAL_KINDS);

const personalEventStatusSchema = z.enum(PERSONAL_EVENT_STATUSES);

const getPersonalEventDetailInputSchema = z
  .object({
    userId: z.uuid(),

    workspaceId: z.uuid(),

    eventId: z.uuid(),
  })
  .strict();

export type GetPersonalEventDetailInput = z.input<
  typeof getPersonalEventDetailInputSchema
>;

export type GetPersonalEventDetailResult = {
  eventId: string;

  title: string;

  temporalKind: PersonalEventTemporalKind;

  eventDate: CalendarDate | null;
  endDateExclusive: CalendarDate | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  status: PersonalEventStatus;

  description: string | null;
  location: string | null;
  referenceUrl: string | null;

  completedAt: string | null;

  notificationGeneration: number;

  createdAt: string;
  updatedAt: string;

  version: number;
};

type NormalizedGetPersonalEventDetailInput = {
  userId: string;

  workspaceId: string;

  eventId: string;
};

function normalizeInput(
  input: GetPersonalEventDetailInput,
): NormalizedGetPersonalEventDetailInput {
  return getPersonalEventDetailInputSchema.parse(input);
}

function normalizeInstant(value: string): string {
  return new Date(value).toISOString();
}

function normalizeNullableInstant(value: string | null): string | null {
  return value === null ? null : normalizeInstant(value);
}

function mapPersonalEventDetail(
  row: PersonalEventDetailQueryRow,
): GetPersonalEventDetailResult {
  const temporalKind = personalEventTemporalKindSchema.parse(row.temporal_kind);

  const status = personalEventStatusSchema.parse(row.status);

  if (temporalKind === "date") {
    if (
      row.event_date === null ||
      row.starts_at !== null ||
      row.ends_at !== null ||
      row.timezone !== null
    ) {
      throw new Error(
        "Date-only personal event has an invalid temporal shape.",
      );
    }

    if (
      row.end_date_exclusive !== null &&
      row.end_date_exclusive <= row.event_date
    ) {
      throw new Error(
        "Date-only personal event has an invalid exclusive end date.",
      );
    }
  } else if (
    row.event_date !== null ||
    row.end_date_exclusive !== null ||
    row.starts_at === null ||
    row.timezone === null
  ) {
    throw new Error("Timed personal event has an invalid temporal shape.");
  }

  if (
    row.starts_at !== null &&
    row.ends_at !== null &&
    new Date(row.ends_at).getTime() <= new Date(row.starts_at).getTime()
  ) {
    throw new Error("Timed personal event has an invalid end instant.");
  }

  if (status === "completed" && row.completed_at === null) {
    throw new Error(
      "Completed personal event is missing its completion timestamp.",
    );
  }

  if (status !== "completed" && row.completed_at !== null) {
    throw new Error(
      "Non-completed personal event unexpectedly has a completion timestamp.",
    );
  }

  if (row.notification_generation <= 0 || row.version <= 0) {
    throw new Error("Personal event version metadata is invalid.");
  }

  return {
    eventId: row.event_id,

    title: row.title,

    temporalKind,

    eventDate:
      row.event_date === null ? null : parseCalendarDate(row.event_date),

    endDateExclusive:
      row.end_date_exclusive === null
        ? null
        : parseCalendarDate(row.end_date_exclusive),

    startsAt: normalizeNullableInstant(row.starts_at),

    endsAt: normalizeNullableInstant(row.ends_at),

    timezone: row.timezone,

    status,

    description: row.description,

    location: row.location,

    referenceUrl: row.reference_url,

    completedAt: normalizeNullableInstant(row.completed_at),

    notificationGeneration: row.notification_generation,

    createdAt: normalizeInstant(row.created_at),

    updatedAt: normalizeInstant(row.updated_at),

    version: row.version,
  };
}

async function executeGetPersonalEventDetail(
  transaction: ScopedTransaction,
  input: NormalizedGetPersonalEventDetailInput,
): Promise<GetPersonalEventDetailResult> {
  const row = await readPersonalEventDetail(transaction, {
    workspaceId: input.workspaceId,

    eventId: input.eventId,
  });

  if (!row) {
    throw new PersonalEventUnavailableError();
  }

  return mapPersonalEventDetail(row);
}

export async function getPersonalEventDetailInTransaction(
  transaction: ScopedTransaction,
  input: GetPersonalEventDetailInput,
): Promise<GetPersonalEventDetailResult> {
  return executeGetPersonalEventDetail(transaction, normalizeInput(input));
}

export async function getPersonalEventDetail(
  input: GetPersonalEventDetailInput,
): Promise<GetPersonalEventDetailResult> {
  const normalized = normalizeInput(input);

  return withDomainTransaction(
    {
      userId: normalized.userId,

      workspaceId: normalized.workspaceId,
    },
    (transaction) => executeGetPersonalEventDetail(transaction, normalized),
  );
}
