import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  APPLICATION_EVENT_MUTATIONS,
  APPLICATION_EVENT_TEMPORAL_KINDS,
  ApplicationEventStateError,
  ApplicationEventUnavailableError,
  ApplicationEventVersionConflictError,
  type ApplicationEventMutation,
  type ApplicationEventTemporalKind,
} from "@/modules/career/domain/application-event";
import {
  JobApplicationArchivedError,
  JobApplicationUnavailableError,
  JobApplicationVersionConflictError,
} from "@/modules/career/domain/application";
import {
  finishApplicationEvent,
  lockApplicationEventForMutation,
  lockJobApplicationForEventMutation,
  lockReplacementNextActionEvent,
  rescheduleApplicationEvent,
  updateJobApplicationNextAction,
  type LockedApplicationEvent,
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

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const applicationEventMutationSchema = z.enum(APPLICATION_EVENT_MUTATIONS);

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

const commonInputShape = {
  userId: z.uuid(),
  workspaceId: z.uuid(),

  applicationId: z.uuid(),
  eventId: z.uuid(),

  clientCommandId: z.uuid(),
  requestId: z.uuid().optional(),

  expectedEventVersion: z.number().int().min(1).max(POSTGRES_INTEGER_MAX),

  reason: nullableTrimmedText(2000),
};

const rescheduleInputSchema = z
  .object({
    ...commonInputShape,

    action: z.literal("reschedule"),

    temporalKind: temporalKindSchema,

    eventDate: calendarDateSchema.nullable().optional(),

    startsAt: instantSchema.nullable().optional(),
    endsAt: instantSchema.nullable().optional(),
    timezone: nullableTimezoneSchema,
  })
  .strict();

const completeInputSchema = z
  .object({
    ...commonInputShape,

    action: z.literal("complete"),

    outcomeNotes: nullableTrimmedText(20_000),

    expectedApplicationVersion: z
      .number()
      .int()
      .min(1)
      .max(POSTGRES_INTEGER_MAX)
      .optional(),

    replacementNextActionEventId: z.uuid().nullable().optional(),
  })
  .strict();

const cancelInputSchema = z
  .object({
    ...commonInputShape,

    action: z.literal("cancel"),

    outcomeNotes: nullableTrimmedText(20_000),

    expectedApplicationVersion: z
      .number()
      .int()
      .min(1)
      .max(POSTGRES_INTEGER_MAX)
      .optional(),

    replacementNextActionEventId: z.uuid().nullable().optional(),
  })
  .strict();

const mutateApplicationEventInputSchema = z
  .discriminatedUnion("action", [
    rescheduleInputSchema,
    completeInputSchema,
    cancelInputSchema,
  ])
  .superRefine((input, context) => {
    if (input.action !== "reschedule") {
      return;
    }

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

      return;
    }

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
        message: "A timed application event end must be later than its start.",
      });
    }
  });

const mutateApplicationEventResultSchema = z.object({
  applicationId: z.uuid(),
  eventId: z.uuid(),

  action: applicationEventMutationSchema,

  eventVersion: z.number().int().positive(),
  notificationGeneration: z.number().int().positive(),

  status: z.enum(["scheduled", "completed", "cancelled"]),

  completedAt: z.iso.datetime().nullable(),

  applicationVersion: z.number().int().positive(),
  nextActionEventId: z.uuid().nullable(),
});

export type MutateApplicationEventInput = z.input<
  typeof mutateApplicationEventInputSchema
>;

export type MutateApplicationEventResult = z.infer<
  typeof mutateApplicationEventResultSchema
>;

type NormalizedRescheduleInput = {
  userId: string;
  workspaceId: string;

  applicationId: string;
  eventId: string;

  clientCommandId: string;
  requestId: string | null;

  expectedEventVersion: number;

  action: "reschedule";

  temporalKind: ApplicationEventTemporalKind;

  eventDate: CalendarDate | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  reason: string | null;
};

type NormalizedFinishInput = {
  userId: string;
  workspaceId: string;

  applicationId: string;
  eventId: string;

  clientCommandId: string;
  requestId: string | null;

  expectedEventVersion: number;

  action: "complete" | "cancel";

  outcomeNotes: string | null;

  expectedApplicationVersion: number | null;
  replacementNextActionEventId: string | null;

  reason: string | null;
};

type NormalizedMutateApplicationEventInput =
  NormalizedRescheduleInput | NormalizedFinishInput;

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function normalizeMutateApplicationEventInput(
  input: MutateApplicationEventInput,
): NormalizedMutateApplicationEventInput {
  const parsed = mutateApplicationEventInputSchema.parse(input);

  if (parsed.action === "reschedule") {
    return {
      userId: parsed.userId,
      workspaceId: parsed.workspaceId,

      applicationId: parsed.applicationId,
      eventId: parsed.eventId,

      clientCommandId: parsed.clientCommandId,
      requestId: parsed.requestId ?? null,

      expectedEventVersion: parsed.expectedEventVersion,

      action: parsed.action,

      temporalKind: parsed.temporalKind,

      eventDate:
        parsed.eventDate == null ? null : parseCalendarDate(parsed.eventDate),

      startsAt: normalizeInstant(parsed.startsAt ?? null),
      endsAt: normalizeInstant(parsed.endsAt ?? null),
      timezone: parsed.timezone ?? null,

      reason: parsed.reason ?? null,
    };
  }

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    applicationId: parsed.applicationId,
    eventId: parsed.eventId,

    clientCommandId: parsed.clientCommandId,
    requestId: parsed.requestId ?? null,

    expectedEventVersion: parsed.expectedEventVersion,

    action: parsed.action,

    outcomeNotes: parsed.outcomeNotes ?? null,

    expectedApplicationVersion: parsed.expectedApplicationVersion ?? null,

    replacementNextActionEventId: parsed.replacementNextActionEventId ?? null,

    reason: parsed.reason ?? null,
  };
}

function getCommandType(action: ApplicationEventMutation): string {
  switch (action) {
    case "reschedule":
      return "career.reschedule_application_event";
    case "complete":
      return "career.complete_application_event";
    case "cancel":
      return "career.cancel_application_event";
  }
}

function getEventAuditJson(
  event: LockedApplicationEvent,
): Record<string, unknown> {
  return {
    applicationId: event.applicationId,

    eventKind: event.eventKind,
    title: event.title,

    temporalKind: event.temporalKind,
    eventDate: event.eventDate,

    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,

    status: event.status,

    location: event.location,
    meetingUrl: event.meetingUrl,
    preparationNotes: event.preparationNotes,
    outcomeNotes: event.outcomeNotes,

    completedAt: event.completedAt,

    notificationGeneration: event.notificationGeneration,

    version: event.version,
  };
}

function getPayloadHash(input: NormalizedMutateApplicationEventInput) {
  if (input.action === "reschedule") {
    return hashCommandPayload({
      applicationId: input.applicationId,
      eventId: input.eventId,

      expectedEventVersion: input.expectedEventVersion,

      action: input.action,

      temporalKind: input.temporalKind,
      eventDate: input.eventDate,

      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,

      reason: input.reason,
    });
  }

  return hashCommandPayload({
    applicationId: input.applicationId,
    eventId: input.eventId,

    expectedEventVersion: input.expectedEventVersion,

    action: input.action,

    outcomeNotes: input.outcomeNotes,

    expectedApplicationVersion: input.expectedApplicationVersion,

    replacementNextActionEventId: input.replacementNextActionEventId,

    reason: input.reason,
  });
}

async function executeMutateApplicationEvent(
  transaction: ScopedTransaction,
  input: NormalizedMutateApplicationEventInput,
): Promise<MutateApplicationEventResult> {
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    clientCommandId: input.clientCommandId,
    commandType: getCommandType(input.action),
    payloadHash: getPayloadHash(input),
  });

  if (receipt.kind === "replay") {
    return mutateApplicationEventResultSchema.parse(receipt.result);
  }

  /*
   * Keep the established lock order:
   *
   * profile FOR SHARE
   * -> parent application FOR UPDATE
   * -> target event FOR UPDATE
   * -> optional replacement event FOR UPDATE
   */
  const application = await lockJobApplicationForEventMutation(transaction, {
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
  });

  if (!application) {
    throw new JobApplicationUnavailableError();
  }

  if (application.archived) {
    throw new JobApplicationArchivedError();
  }

  const event = await lockApplicationEventForMutation(transaction, {
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
    eventId: input.eventId,
  });

  if (!event) {
    throw new ApplicationEventUnavailableError();
  }

  if (event.version !== input.expectedEventVersion) {
    throw new ApplicationEventVersionConflictError(
      input.expectedEventVersion,
      event.version,
    );
  }

  if (event.status !== "scheduled") {
    throw new ApplicationEventStateError(event.status);
  }

  if (input.action === "reschedule") {
    const updated = await rescheduleApplicationEvent(transaction, {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      eventId: input.eventId,

      expectedVersion: input.expectedEventVersion,

      temporalKind: input.temporalKind,
      eventDate: input.eventDate,

      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
    });

    if (!updated) {
      throw new ApplicationEventVersionConflictError(
        input.expectedEventVersion,
        event.version,
      );
    }

    await createPrivateRevision(transaction, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      commandReceiptId: receipt.receiptId,

      subjectKind: "application_event",
      subjectId: input.eventId,
      subjectVersion: updated.version,
      operation: "reschedule",

      beforeJson: getEventAuditJson(event),

      afterJson: {
        ...getEventAuditJson(event),

        temporalKind: input.temporalKind,
        eventDate: input.eventDate,

        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,

        notificationGeneration: updated.notificationGeneration,

        version: updated.version,
      },

      reason: input.reason,
      effectiveDate: input.eventDate,

      recordedByUserId: input.userId,
      actorKind: "user",
      requestId: input.requestId,
    });

    const result: MutateApplicationEventResult = {
      applicationId: input.applicationId,
      eventId: input.eventId,

      action: input.action,

      eventVersion: updated.version,
      notificationGeneration: updated.notificationGeneration,

      status: "scheduled",
      completedAt: null,

      applicationVersion: application.version,
      nextActionEventId: application.nextActionEventId,
    };

    await completeCommandReceipt(transaction, {
      workspaceId: input.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });

    await enforceDeferredCareerConstraints(transaction);

    return result;
  }

  const eventIsCurrentNextAction =
    application.nextActionEventId === input.eventId;

  if (
    !eventIsCurrentNextAction &&
    input.replacementNextActionEventId !== null
  ) {
    throw new RangeError(
      "A replacement next action can only be supplied when completing or cancelling the application's current next-action event.",
    );
  }

  let replacementNextActionEventId: string | null = null;

  if (eventIsCurrentNextAction) {
    if (input.expectedApplicationVersion === null) {
      throw new RangeError(
        "The expected application version is required when completing or cancelling the current next-action event.",
      );
    }

    if (application.version !== input.expectedApplicationVersion) {
      throw new JobApplicationVersionConflictError(
        input.expectedApplicationVersion,
        application.version,
      );
    }

    replacementNextActionEventId = input.replacementNextActionEventId;

    if (replacementNextActionEventId !== null) {
      const validReplacement = await lockReplacementNextActionEvent(
        transaction,
        {
          workspaceId: input.workspaceId,
          applicationId: input.applicationId,
          eventId: replacementNextActionEventId,
          excludedEventId: input.eventId,
        },
      );

      if (!validReplacement) {
        throw new RangeError(
          "The replacement next action must be another scheduled actionable event belonging to the same application.",
        );
      }
    }
  }

  const targetStatus: "completed" | "cancelled" =
    input.action === "complete" ? "completed" : "cancelled";

  /*
   * If this event owns the next-action pointer, move/clear the
   * pointer before making the event non-scheduled. Both checks are
   * deferred, so the pair still commits atomically.
   */
  let applicationVersion = application.version;
  let nextActionEventId = application.nextActionEventId;

  if (eventIsCurrentNextAction) {
    const expectedApplicationVersion = input.expectedApplicationVersion;

    if (expectedApplicationVersion === null) {
      throw new Error(
        "Expected application version was not normalized for a next-action mutation.",
      );
    }

    const updatedApplicationVersion = await updateJobApplicationNextAction(
      transaction,
      {
        workspaceId: input.workspaceId,
        applicationId: input.applicationId,

        nextActionEventId: replacementNextActionEventId,

        expectedVersion: expectedApplicationVersion,
      },
    );

    if (updatedApplicationVersion === null) {
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
      subjectVersion: updatedApplicationVersion,
      operation:
        replacementNextActionEventId === null
          ? "next_action_clear"
          : "next_action_replace",

      beforeJson: {
        version: application.version,
        nextActionEventId: application.nextActionEventId,
      },

      afterJson: {
        version: updatedApplicationVersion,
        nextActionEventId: replacementNextActionEventId,
      },

      reason: input.reason,
      effectiveDate: event.eventDate,

      recordedByUserId: input.userId,
      actorKind: "user",
      requestId: input.requestId,
    });

    applicationVersion = updatedApplicationVersion;

    nextActionEventId = replacementNextActionEventId;
  }

  const updatedEvent = await finishApplicationEvent(transaction, {
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
    eventId: input.eventId,

    expectedVersion: input.expectedEventVersion,

    status: targetStatus,
    outcomeNotes: input.outcomeNotes,
  });

  if (!updatedEvent) {
    throw new ApplicationEventVersionConflictError(
      input.expectedEventVersion,
      event.version,
    );
  }

  await createPrivateRevision(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,

    subjectKind: "application_event",
    subjectId: input.eventId,
    subjectVersion: updatedEvent.version,
    operation: input.action,

    beforeJson: getEventAuditJson(event),

    afterJson: {
      ...getEventAuditJson(event),

      status: targetStatus,

      outcomeNotes: input.outcomeNotes,
      completedAt: updatedEvent.completedAt,

      notificationGeneration: updatedEvent.notificationGeneration,

      version: updatedEvent.version,
    },

    reason: input.reason,
    effectiveDate: event.eventDate,

    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  });

  const result: MutateApplicationEventResult = {
    applicationId: input.applicationId,
    eventId: input.eventId,

    action: input.action,

    eventVersion: updatedEvent.version,
    notificationGeneration: updatedEvent.notificationGeneration,

    status: targetStatus,
    completedAt: updatedEvent.completedAt,

    applicationVersion,
    nextActionEventId,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });

  await enforceDeferredCareerConstraints(transaction);

  return result;
}

export async function mutateApplicationEventInTransaction(
  transaction: ScopedTransaction,
  input: MutateApplicationEventInput,
): Promise<MutateApplicationEventResult> {
  return executeMutateApplicationEvent(
    transaction,
    normalizeMutateApplicationEventInput(input),
  );
}

export async function mutateApplicationEvent(
  input: MutateApplicationEventInput,
): Promise<MutateApplicationEventResult> {
  const normalizedInput = normalizeMutateApplicationEventInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) =>
      executeMutateApplicationEvent(transaction, normalizedInput),
  );
}
