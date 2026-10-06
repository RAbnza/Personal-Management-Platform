import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import {
  PERSONAL_EVENT_TEMPORAL_KINDS,
  type PersonalEventTemporalKind,
} from "@/modules/time/domain/personal-event";
import { createScheduledPersonalEvent } from "@/modules/time/repositories/personal-event-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  compareCalendarDates,
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";

const CREATE_PERSONAL_EVENT_COMMAND_TYPE = "time.create_personal_event";

const temporalKindSchema = z.enum(PERSONAL_EVENT_TEMPORAL_KINDS);

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const instantSchema = z.iso.datetime({
  offset: true,
});

function nullableTrimmedText(maximumLength?: number) {
  let schema = z.string().trim().min(1);

  if (maximumLength !== undefined) {
    schema = schema.max(maximumLength);
  }

  return schema.nullable().optional();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).format(new Date(0));

    return true;
  } catch {
    return false;
  }
}

const nullableReferenceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isHttpUrl, {
    message: "Reference URL must be a valid HTTP or HTTPS URL.",
  })
  .nullable()
  .optional();

const nullableTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isIanaTimezone, {
    message: "Timezone must be a valid IANA timezone.",
  })
  .nullable()
  .optional();

const createPersonalEventInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),

    title: z.string().trim().min(1).max(200),

    temporalKind: temporalKindSchema,

    eventDate: calendarDateSchema.nullable().optional(),

    endDateExclusive: calendarDateSchema.nullable().optional(),

    startsAt: instantSchema.nullable().optional(),

    endsAt: instantSchema.nullable().optional(),

    timezone: nullableTimezoneSchema,

    description: nullableTrimmedText(2000),

    /*
     * The database/documentation intentionally does not prescribe an arbitrary
     * location length limit, so the service only normalizes non-empty text.
     */
    location: nullableTrimmedText(),

    referenceUrl: nullableReferenceUrlSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const eventDate = input.eventDate ?? null;

    const endDateExclusive = input.endDateExclusive ?? null;

    const startsAt = input.startsAt ?? null;

    const endsAt = input.endsAt ?? null;

    const timezone = input.timezone ?? null;

    if (input.temporalKind === "date") {
      if (eventDate === null) {
        context.addIssue({
          code: "custom",
          path: ["eventDate"],
          message: "A date-only personal event requires an event date.",
        });
      }

      if (
        eventDate !== null &&
        endDateExclusive !== null &&
        isCalendarDate(eventDate) &&
        isCalendarDate(endDateExclusive) &&
        compareCalendarDates(
          parseCalendarDate(endDateExclusive),
          parseCalendarDate(eventDate),
        ) <= 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["endDateExclusive"],
          message: "The exclusive end date must be later than the event date.",
        });
      }

      if (startsAt !== null) {
        context.addIssue({
          code: "custom",
          path: ["startsAt"],
          message: "A date-only personal event cannot include a start instant.",
        });
      }

      if (endsAt !== null) {
        context.addIssue({
          code: "custom",
          path: ["endsAt"],
          message: "A date-only personal event cannot include an end instant.",
        });
      }

      if (timezone !== null) {
        context.addIssue({
          code: "custom",
          path: ["timezone"],
          message: "A date-only personal event does not store a timezone.",
        });
      }

      return;
    }

    if (eventDate !== null) {
      context.addIssue({
        code: "custom",
        path: ["eventDate"],
        message:
          "A timed personal event cannot include a date-only event date.",
      });
    }

    if (endDateExclusive !== null) {
      context.addIssue({
        code: "custom",
        path: ["endDateExclusive"],
        message:
          "A timed personal event cannot include an exclusive calendar end date.",
      });
    }

    if (startsAt === null) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "A timed personal event requires a start instant.",
      });
    }

    if (timezone === null) {
      context.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "A timed personal event requires an IANA timezone.",
      });
    }

    if (
      startsAt !== null &&
      endsAt !== null &&
      new Date(endsAt).getTime() <= new Date(startsAt).getTime()
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "A timed personal event end must be later than its start.",
      });
    }
  });

const createPersonalEventResultSchema = z.object({
  eventId: z.uuid(),

  eventVersion: z.literal(1),

  notificationGeneration: z.literal(1),
});

export type CreatePersonalEventInput = z.input<
  typeof createPersonalEventInputSchema
>;

export type CreatePersonalEventResult = z.infer<
  typeof createPersonalEventResultSchema
>;

type NormalizedCreatePersonalEventInput = {
  userId: string;
  workspaceId: string;

  clientCommandId: string;
  requestId: string | null;

  title: string;

  temporalKind: PersonalEventTemporalKind;

  eventDate: CalendarDate | null;

  endDateExclusive: CalendarDate | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  description: string | null;
  location: string | null;
  referenceUrl: string | null;
};

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function normalizeCreatePersonalEventInput(
  input: CreatePersonalEventInput,
): NormalizedCreatePersonalEventInput {
  const parsed = createPersonalEventInputSchema.parse(input);

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    clientCommandId: parsed.clientCommandId,

    requestId: parsed.requestId ?? null,

    title: parsed.title,

    temporalKind: parsed.temporalKind,

    eventDate:
      parsed.eventDate == null ? null : parseCalendarDate(parsed.eventDate),

    endDateExclusive:
      parsed.endDateExclusive == null
        ? null
        : parseCalendarDate(parsed.endDateExclusive),

    startsAt: normalizeInstant(parsed.startsAt ?? null),

    endsAt: normalizeInstant(parsed.endsAt ?? null),

    timezone: parsed.timezone ?? null,

    description: parsed.description ?? null,

    location: parsed.location ?? null,

    referenceUrl: parsed.referenceUrl ?? null,
  };
}

async function executeCreatePersonalEvent(
  transaction: ScopedTransaction,
  input: NormalizedCreatePersonalEventInput,
): Promise<CreatePersonalEventResult> {
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const payloadHash = hashCommandPayload({
    title: input.title,

    temporalKind: input.temporalKind,

    eventDate: input.eventDate,

    endDateExclusive: input.endDateExclusive,

    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,

    description: input.description,

    location: input.location,

    referenceUrl: input.referenceUrl,
  });

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    clientCommandId: input.clientCommandId,

    commandType: CREATE_PERSONAL_EVENT_COMMAND_TYPE,

    payloadHash,
  });

  if (receipt.kind === "replay") {
    return createPersonalEventResultSchema.parse(receipt.result);
  }

  const eventId = randomUUID();

  await createScheduledPersonalEvent(transaction, {
    id: eventId,

    workspaceId: input.workspaceId,

    title: input.title,

    temporalKind: input.temporalKind,

    eventDate: input.eventDate,

    endDateExclusive: input.endDateExclusive,

    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,

    description: input.description,

    location: input.location,

    referenceUrl: input.referenceUrl,

    recordedByUserId: input.userId,

    requestId: input.requestId,
  });

  await createPrivateRevision(transaction, {
    id: randomUUID(),

    workspaceId: input.workspaceId,

    commandReceiptId: receipt.receiptId,

    subjectKind: "personal_event",

    subjectId: eventId,

    subjectVersion: 1,

    operation: "create",

    beforeJson: null,

    afterJson: {
      title: input.title,

      temporalKind: input.temporalKind,

      eventDate: input.eventDate,

      endDateExclusive: input.endDateExclusive,

      startsAt: input.startsAt,

      endsAt: input.endsAt,

      timezone: input.timezone,

      status: "scheduled",

      description: input.description,

      location: input.location,

      referenceUrl: input.referenceUrl,

      completedAt: null,

      notificationGeneration: 1,
    },

    reason: null,

    effectiveDate: input.eventDate,

    recordedByUserId: input.userId,

    actorKind: "user",

    requestId: input.requestId,
  });

  const result: CreatePersonalEventResult = {
    eventId,

    eventVersion: 1,

    notificationGeneration: 1,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    receiptId: receipt.receiptId,

    result,
  });

  return result;
}

export async function createPersonalEventInTransaction(
  transaction: ScopedTransaction,
  input: CreatePersonalEventInput,
): Promise<CreatePersonalEventResult> {
  return executeCreatePersonalEvent(
    transaction,
    normalizeCreatePersonalEventInput(input),
  );
}

export async function createPersonalEvent(
  input: CreatePersonalEventInput,
): Promise<CreatePersonalEventResult> {
  const normalizedInput = normalizeCreatePersonalEventInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,

      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeCreatePersonalEvent(transaction, normalizedInput),
  );
}
