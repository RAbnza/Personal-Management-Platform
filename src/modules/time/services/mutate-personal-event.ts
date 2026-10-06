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
  PERSONAL_EVENT_MUTATIONS,
  PERSONAL_EVENT_TEMPORAL_KINDS,
  PersonalEventStateError,
  PersonalEventUnavailableError,
  PersonalEventVersionConflictError,
  type PersonalEventMutation,
  type PersonalEventTemporalKind,
} from "@/modules/time/domain/personal-event";
import {
  finishPersonalEvent,
  lockPersonalEventForMutation,
  updateScheduledPersonalEvent,
  type LockedPersonalEvent,
} from "@/modules/time/repositories/personal-event-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  compareCalendarDates,
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const personalEventMutationSchema = z.enum(PERSONAL_EVENT_MUTATIONS);

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

const commonInputShape = {
  userId: z.uuid(),
  workspaceId: z.uuid(),

  eventId: z.uuid(),

  clientCommandId: z.uuid(),
  requestId: z.uuid().optional(),

  expectedEventVersion: z.number().int().min(1).max(POSTGRES_INTEGER_MAX),

  reason: nullableTrimmedText(2000),
};

const editInputSchema = z
  .object({
    ...commonInputShape,

    action: z.literal("edit"),

    title: z.string().trim().min(1).max(200),

    temporalKind: temporalKindSchema,

    eventDate: calendarDateSchema.nullable().optional(),

    endDateExclusive: calendarDateSchema.nullable().optional(),

    startsAt: instantSchema.nullable().optional(),

    endsAt: instantSchema.nullable().optional(),

    timezone: nullableTimezoneSchema,

    description: nullableTrimmedText(2000),

    location: nullableTrimmedText(),

    referenceUrl: nullableReferenceUrlSchema,
  })
  .strict();

const completeInputSchema = z
  .object({
    ...commonInputShape,

    action: z.literal("complete"),
  })
  .strict();

const cancelInputSchema = z
  .object({
    ...commonInputShape,

    action: z.literal("cancel"),
  })
  .strict();

const mutatePersonalEventInputSchema = z
  .discriminatedUnion("action", [
    editInputSchema,
    completeInputSchema,
    cancelInputSchema,
  ])
  .superRefine((input, context) => {
    if (input.action !== "edit") {
      return;
    }

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

const mutatePersonalEventResultSchema = z.object({
  eventId: z.uuid(),

  action: personalEventMutationSchema,

  eventVersion: z.number().int().positive(),

  notificationGeneration: z.number().int().positive(),

  status: z.enum(["scheduled", "completed", "cancelled"]),

  completedAt: z.iso.datetime().nullable(),
});

export type MutatePersonalEventInput = z.input<
  typeof mutatePersonalEventInputSchema
>;

export type MutatePersonalEventResult = z.infer<
  typeof mutatePersonalEventResultSchema
>;

type NormalizedEditInput = {
  userId: string;
  workspaceId: string;

  eventId: string;

  clientCommandId: string;
  requestId: string | null;

  expectedEventVersion: number;

  action: "edit";

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

  reason: string | null;
};

type NormalizedFinishInput = {
  userId: string;
  workspaceId: string;

  eventId: string;

  clientCommandId: string;
  requestId: string | null;

  expectedEventVersion: number;

  action: "complete" | "cancel";

  reason: string | null;
};

type NormalizedMutatePersonalEventInput =
  NormalizedEditInput | NormalizedFinishInput;

function normalizeInstant(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function normalizeMutatePersonalEventInput(
  input: MutatePersonalEventInput,
): NormalizedMutatePersonalEventInput {
  const parsed = mutatePersonalEventInputSchema.parse(input);

  if (parsed.action === "edit") {
    return {
      userId: parsed.userId,
      workspaceId: parsed.workspaceId,

      eventId: parsed.eventId,

      clientCommandId: parsed.clientCommandId,

      requestId: parsed.requestId ?? null,

      expectedEventVersion: parsed.expectedEventVersion,

      action: parsed.action,

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

      reason: parsed.reason ?? null,
    };
  }

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    eventId: parsed.eventId,

    clientCommandId: parsed.clientCommandId,

    requestId: parsed.requestId ?? null,

    expectedEventVersion: parsed.expectedEventVersion,

    action: parsed.action,

    reason: parsed.reason ?? null,
  };
}

function getCommandType(action: PersonalEventMutation): string {
  switch (action) {
    case "edit":
      return "time.edit_personal_event";

    case "complete":
      return "time.complete_personal_event";

    case "cancel":
      return "time.cancel_personal_event";
  }
}

function getEventAuditJson(
  event: LockedPersonalEvent,
): Record<string, unknown> {
  return {
    title: event.title,

    temporalKind: event.temporalKind,

    eventDate: event.eventDate,

    endDateExclusive: event.endDateExclusive,

    startsAt: event.startsAt,

    endsAt: event.endsAt,

    timezone: event.timezone,

    status: event.status,

    description: event.description,

    location: event.location,

    referenceUrl: event.referenceUrl,

    completedAt: event.completedAt,

    notificationGeneration: event.notificationGeneration,

    version: event.version,
  };
}

function getPayloadHash(input: NormalizedMutatePersonalEventInput) {
  if (input.action === "edit") {
    return hashCommandPayload({
      eventId: input.eventId,

      expectedEventVersion: input.expectedEventVersion,

      action: input.action,

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

      reason: input.reason,
    });
  }

  return hashCommandPayload({
    eventId: input.eventId,

    expectedEventVersion: input.expectedEventVersion,

    action: input.action,

    reason: input.reason,
  });
}

async function executeMutatePersonalEvent(
  transaction: ScopedTransaction,
  input: NormalizedMutatePersonalEventInput,
): Promise<MutatePersonalEventResult> {
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

  /*
   * A successfully committed command remains replayable even if the event
   * has since advanced to another version or terminal state.
   */
  if (receipt.kind === "replay") {
    return mutatePersonalEventResultSchema.parse(receipt.result);
  }

  const event = await lockPersonalEventForMutation(transaction, {
    workspaceId: input.workspaceId,

    eventId: input.eventId,
  });

  if (!event) {
    throw new PersonalEventUnavailableError();
  }

  if (event.version !== input.expectedEventVersion) {
    throw new PersonalEventVersionConflictError(
      input.expectedEventVersion,
      event.version,
    );
  }

  /*
   * The current first-slice lifecycle is intentionally terminal.
   * Reopening a completed/cancelled personal event is not yet a documented
   * command.
   */
  if (event.status !== "scheduled") {
    throw new PersonalEventStateError(event.status);
  }

  if (input.action === "edit") {
    const updated = await updateScheduledPersonalEvent(transaction, {
      workspaceId: input.workspaceId,

      eventId: input.eventId,

      expectedVersion: input.expectedEventVersion,

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

    if (!updated) {
      throw new PersonalEventVersionConflictError(
        input.expectedEventVersion,
        event.version,
      );
    }

    await createPrivateRevision(transaction, {
      id: randomUUID(),

      workspaceId: input.workspaceId,

      commandReceiptId: receipt.receiptId,

      subjectKind: "personal_event",

      subjectId: input.eventId,

      subjectVersion: updated.version,

      operation: "edit",

      beforeJson: getEventAuditJson(event),

      afterJson: {
        ...getEventAuditJson(event),

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

        notificationGeneration: updated.notificationGeneration,

        version: updated.version,
      },

      reason: input.reason,

      effectiveDate: input.eventDate,

      recordedByUserId: input.userId,

      actorKind: "user",

      requestId: input.requestId,
    });

    const result: MutatePersonalEventResult = {
      eventId: input.eventId,

      action: input.action,

      eventVersion: updated.version,

      notificationGeneration: updated.notificationGeneration,

      status: "scheduled",

      completedAt: null,
    };

    await completeCommandReceipt(transaction, {
      workspaceId: input.workspaceId,

      receiptId: receipt.receiptId,

      result,
    });

    return result;
  }

  const targetStatus: "completed" | "cancelled" =
    input.action === "complete" ? "completed" : "cancelled";

  const updated = await finishPersonalEvent(transaction, {
    workspaceId: input.workspaceId,

    eventId: input.eventId,

    expectedVersion: input.expectedEventVersion,

    status: targetStatus,
  });

  if (!updated) {
    throw new PersonalEventVersionConflictError(
      input.expectedEventVersion,
      event.version,
    );
  }

  await createPrivateRevision(transaction, {
    id: randomUUID(),

    workspaceId: input.workspaceId,

    commandReceiptId: receipt.receiptId,

    subjectKind: "personal_event",

    subjectId: input.eventId,

    subjectVersion: updated.version,

    operation: input.action,

    beforeJson: getEventAuditJson(event),

    afterJson: {
      ...getEventAuditJson(event),

      status: targetStatus,

      completedAt: updated.completedAt,

      notificationGeneration: updated.notificationGeneration,

      version: updated.version,
    },

    reason: input.reason,

    effectiveDate: event.eventDate,

    recordedByUserId: input.userId,

    actorKind: "user",

    requestId: input.requestId,
  });

  const result: MutatePersonalEventResult = {
    eventId: input.eventId,

    action: input.action,

    eventVersion: updated.version,

    notificationGeneration: updated.notificationGeneration,

    status: targetStatus,

    completedAt: updated.completedAt,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,

    receiptId: receipt.receiptId,

    result,
  });

  return result;
}

export async function mutatePersonalEventInTransaction(
  transaction: ScopedTransaction,
  input: MutatePersonalEventInput,
): Promise<MutatePersonalEventResult> {
  return executeMutatePersonalEvent(
    transaction,
    normalizeMutatePersonalEventInput(input),
  );
}

export async function mutatePersonalEvent(
  input: MutatePersonalEventInput,
): Promise<MutatePersonalEventResult> {
  const normalizedInput = normalizeMutatePersonalEventInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,

      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeMutatePersonalEvent(transaction, normalizedInput),
  );
}
