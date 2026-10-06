import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  APPLICATION_EVENT_TEMPORAL_KINDS,
  CAREER_ACTIONABLE_EVENT_KINDS,
  type ApplicationEventTemporalKind,
  type CareerActionableEventKind,
} from "@/modules/career/domain/application-event";
import {
  JobApplicationArchivedError,
  JobApplicationUnavailableError,
  JobApplicationVersionConflictError,
} from "@/modules/career/domain/application";
import {
  createScheduledApplicationEvent,
  lockJobApplicationForEventCreation,
  setJobApplicationNextAction,
} from "@/modules/career/repositories/application-event-repository";
import { enforceDeferredCareerConstraints } from "@/modules/career/repositories/job-application-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";

const CREATE_APPLICATION_EVENT_COMMAND_TYPE = "career.create_application_event";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const actionableEventKindSchema = z.enum(CAREER_ACTIONABLE_EVENT_KINDS);

const temporalKindSchema = z.enum(APPLICATION_EVENT_TEMPORAL_KINDS);

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const instantSchema = z.iso.datetime({
  offset: true,
});

function nullableTrimmedText(maximumLength: number) {
  return z.string().trim().min(1).max(maximumLength).nullable().optional();
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

const nullableMeetingUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isHttpUrl, {
    message: "Meeting URL must be a valid HTTP or HTTPS URL.",
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

const createApplicationEventInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    applicationId: z.uuid(),

    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),

    eventKind: actionableEventKindSchema,

    title: z.string().trim().min(1).max(200),

    temporalKind: temporalKindSchema,

    eventDate: calendarDateSchema.nullable().optional(),

    startsAt: instantSchema.nullable().optional(),
    endsAt: instantSchema.nullable().optional(),
    timezone: nullableTimezoneSchema,

    location: nullableTrimmedText(500),
    meetingUrl: nullableMeetingUrlSchema,
    preparationNotes: nullableTrimmedText(20_000),

    setAsNextAction: z.boolean().default(false),

    expectedApplicationVersion: z
      .number()
      .int()
      .min(1)
      .max(POSTGRES_INTEGER_MAX)
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const eventDate = input.eventDate ?? null;
    const startsAt = input.startsAt ?? null;
    const endsAt = input.endsAt ?? null;
    const timezone = input.timezone ?? null;

    if (input.temporalKind === "date") {
      if (eventDate === null) {
        context.addIssue({
          code: "custom",
          path: ["eventDate"],
          message: "A date-only application event requires an event date.",
        });
      }

      if (startsAt !== null) {
        context.addIssue({
          code: "custom",
          path: ["startsAt"],
          message:
            "A date-only application event cannot include a start instant.",
        });
      }

      if (endsAt !== null) {
        context.addIssue({
          code: "custom",
          path: ["endsAt"],
          message:
            "A date-only application event cannot include an end instant.",
        });
      }

      if (timezone !== null) {
        context.addIssue({
          code: "custom",
          path: ["timezone"],
          message: "A date-only application event does not store a timezone.",
        });
      }
    }

    if (input.temporalKind === "timed") {
      if (eventDate !== null) {
        context.addIssue({
          code: "custom",
          path: ["eventDate"],
          message:
            "A timed application event cannot include a date-only event date.",
        });
      }

      if (startsAt === null) {
        context.addIssue({
          code: "custom",
          path: ["startsAt"],
          message: "A timed application event requires a start instant.",
        });
      }

      if (timezone === null) {
        context.addIssue({
          code: "custom",
          path: ["timezone"],
          message: "A timed application event requires an IANA timezone.",
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
          message:
            "A timed application event end must be later than its start.",
        });
      }
    }

    if (
      input.setAsNextAction &&
      input.expectedApplicationVersion === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedApplicationVersion"],
        message:
          "The expected application version is required when setting the event as the next action.",
      });
    }
  });

const createApplicationEventResultSchema = z.object({
  eventId: z.uuid(),

  eventVersion: z.literal(1),
  notificationGeneration: z.literal(1),

  applicationVersion: z.number().int().positive(),

  nextActionEventId: z.uuid().nullable(),
});

export type CreateApplicationEventInput = z.input<
  typeof createApplicationEventInputSchema
>;

export type CreateApplicationEventResult = z.infer<
  typeof createApplicationEventResultSchema
>;

type NormalizedCreateApplicationEventInput = {
  userId: string;
  workspaceId: string;

  applicationId: string;

  clientCommandId: string;
  requestId: string | null;

  eventKind: CareerActionableEventKind;
  title: string;

  temporalKind: ApplicationEventTemporalKind;

  eventDate: CalendarDate | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  location: string | null;
  meetingUrl: string | null;
  preparationNotes: string | null;

  setAsNextAction: boolean;
  expectedApplicationVersion: number | null;
};

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function normalizeCreateApplicationEventInput(
  input: CreateApplicationEventInput,
): NormalizedCreateApplicationEventInput {
  const parsed = createApplicationEventInputSchema.parse(input);

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    applicationId: parsed.applicationId,

    clientCommandId: parsed.clientCommandId,
    requestId: parsed.requestId ?? null,

    eventKind: parsed.eventKind,
    title: parsed.title,

    temporalKind: parsed.temporalKind,

    eventDate:
      parsed.eventDate == null ? null : parseCalendarDate(parsed.eventDate),

    startsAt: normalizeInstant(parsed.startsAt ?? null),
    endsAt: normalizeInstant(parsed.endsAt ?? null),
    timezone: parsed.timezone ?? null,

    location: parsed.location ?? null,
    meetingUrl: parsed.meetingUrl ?? null,
    preparationNotes: parsed.preparationNotes ?? null,

    setAsNextAction: parsed.setAsNextAction,
    expectedApplicationVersion: parsed.expectedApplicationVersion ?? null,
  };
}

async function executeCreateApplicationEvent(
  transaction: ScopedTransaction,
  input: NormalizedCreateApplicationEventInput,
): Promise<CreateApplicationEventResult> {
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const payloadHash = hashCommandPayload({
    applicationId: input.applicationId,

    eventKind: input.eventKind,
    title: input.title,

    temporalKind: input.temporalKind,

    eventDate: input.eventDate,

    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,

    location: input.location,
    meetingUrl: input.meetingUrl,
    preparationNotes: input.preparationNotes,

    setAsNextAction: input.setAsNextAction,
    expectedApplicationVersion: input.expectedApplicationVersion,
  });

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    clientCommandId: input.clientCommandId,
    commandType: CREATE_APPLICATION_EVENT_COMMAND_TYPE,
    payloadHash,
  });

  /*
   * Replay resolves before checking the application's current version. A
   * committed command remains replayable even if the application has since
   * changed.
   */
  if (receipt.kind === "replay") {
    return createApplicationEventResultSchema.parse(receipt.result);
  }

  const application = await lockJobApplicationForEventCreation(transaction, {
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
  });

  if (!application) {
    throw new JobApplicationUnavailableError();
  }

  if (application.archived) {
    throw new JobApplicationArchivedError();
  }

  if (
    input.setAsNextAction &&
    application.version !== input.expectedApplicationVersion
  ) {
    throw new JobApplicationVersionConflictError(
      input.expectedApplicationVersion ?? application.version,
      application.version,
    );
  }

  const eventId = randomUUID();

  await createScheduledApplicationEvent(transaction, {
    id: eventId,
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,

    eventKind: input.eventKind,
    title: input.title,

    temporalKind: input.temporalKind,

    eventDate: input.eventDate,

    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,

    location: input.location,
    meetingUrl: input.meetingUrl,
    preparationNotes: input.preparationNotes,

    recordedByUserId: input.userId,
    requestId: input.requestId,
  });

  await createPrivateRevision(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,

    subjectKind: "application_event",
    subjectId: eventId,
    subjectVersion: 1,
    operation: "create",

    beforeJson: null,
    afterJson: {
      applicationId: input.applicationId,

      eventKind: input.eventKind,
      title: input.title,

      temporalKind: input.temporalKind,

      eventDate: input.eventDate,

      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,

      status: "scheduled",

      location: input.location,
      meetingUrl: input.meetingUrl,
      preparationNotes: input.preparationNotes,

      outcomeNotes: null,
      completedAt: null,

      notificationGeneration: 1,
    },

    reason: null,
    effectiveDate: input.eventDate,

    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  });

  let applicationVersion = application.version;
  let nextActionEventId = application.nextActionEventId;

  if (input.setAsNextAction) {
    const expectedApplicationVersion = input.expectedApplicationVersion;

    if (expectedApplicationVersion === null) {
      throw new Error(
        "Expected application version was not normalized for a next-action update.",
      );
    }

    const updatedVersion = await setJobApplicationNextAction(transaction, {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      eventId,
      expectedVersion: expectedApplicationVersion,
    });

    if (updatedVersion === null) {
      throw new JobApplicationVersionConflictError(
        expectedApplicationVersion,
        application.version,
      );
    }

    await createPrivateRevision(transaction, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      commandReceiptId: receipt.receiptId,

      subjectKind: "job_application",
      subjectId: input.applicationId,
      subjectVersion: updatedVersion,
      operation: "next_action_set",

      beforeJson: {
        version: application.version,
        nextActionEventId: application.nextActionEventId,
      },

      afterJson: {
        version: updatedVersion,
        nextActionEventId: eventId,
      },

      reason: null,
      effectiveDate: input.eventDate,

      recordedByUserId: input.userId,
      actorKind: "user",
      requestId: input.requestId,
    });

    applicationVersion = updatedVersion;
    nextActionEventId = eventId;
  }

  const result: CreateApplicationEventResult = {
    eventId,

    eventVersion: 1,
    notificationGeneration: 1,

    applicationVersion,

    nextActionEventId,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });

  /*
   * This validates the deferred next-action/event relationship immediately
   * while restoring Career's deferrable constraints afterwards so another
   * command can still run in the same scoped transaction.
   */
  await enforceDeferredCareerConstraints(transaction);

  return result;
}

export async function createApplicationEventInTransaction(
  transaction: ScopedTransaction,
  input: CreateApplicationEventInput,
): Promise<CreateApplicationEventResult> {
  return executeCreateApplicationEvent(
    transaction,
    normalizeCreateApplicationEventInput(input),
  );
}

export async function createApplicationEvent(
  input: CreateApplicationEventInput,
): Promise<CreateApplicationEventResult> {
  const normalizedInput = normalizeCreateApplicationEventInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) =>
      executeCreateApplicationEvent(transaction, normalizedInput),
  );
}
