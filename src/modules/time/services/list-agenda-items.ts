import { z } from "zod";

import {
  AGENDA_DISPLAY_MODULES,
  AGENDA_SOURCE_KINDS,
  AGENDA_TEMPORAL_KINDS,
  AGENDA_TIMING_STATES,
  type AgendaDisplayModule,
  type AgendaSourceKind,
  type AgendaTemporalKind,
  type AgendaTimingState,
} from "@/modules/time/domain/agenda";
import {
  readAgendaPage,
  type AgendaCursorPosition,
  type AgendaListQueryRow,
} from "@/modules/time/repositories/agenda-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  compareCalendarDates,
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const agendaModulesSchema = z
  .array(z.enum(AGENDA_DISPLAY_MODULES))
  .min(1)
  .max(AGENDA_DISPLAY_MODULES.length)
  .refine((modules) => new Set(modules).size === modules.length, {
    message: "Agenda module filters cannot contain duplicates.",
  });

const agendaCursorSchema = z
  .object({
    version: z.literal(1),

    agendaDate: calendarDateSchema,

    temporalKind: z.enum(AGENDA_TEMPORAL_KINDS),

    startsAt: z.iso
      .datetime({
        offset: true,
      })
      .nullable(),

    sourceKind: z.enum(AGENDA_SOURCE_KINDS),
    sourceId: z.uuid(),
    occurrenceKey: z.string().min(1).max(200),

    startDate: calendarDateSchema,
    endDate: calendarDateSchema,

    modules: agendaModulesSchema,
  })
  .strict()
  .superRefine((cursor, context) => {
    if (cursor.temporalKind === "date" && cursor.startsAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message:
          "A date-only Agenda cursor cannot contain a timed start instant.",
      });
    }

    if (cursor.temporalKind === "timed" && cursor.startsAt === null) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "A timed Agenda cursor requires its start instant.",
      });
    }
  });

const listAgendaItemsInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    startDate: calendarDateSchema,
    endDate: calendarDateSchema,

    modules: agendaModulesSchema.default(["career", "time", "money"]),

    pageSize: z.number().int().min(1).max(200).default(100),

    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      isCalendarDate(input.startDate) &&
      isCalendarDate(input.endDate) &&
      input.startDate > input.endDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Agenda end date cannot be earlier than the start date.",
      });
    }
  });

export type ListAgendaItemsInput = z.input<typeof listAgendaItemsInputSchema>;

export type AgendaDateTemporalValue = {
  kind: "date";

  eventDate: CalendarDate;
  endDateExclusive: CalendarDate | null;
};

export type AgendaTimedTemporalValue = {
  kind: "timed";

  startsAt: string;
  endsAt: string | null;

  /**
   * Original source timezone. Rendering may additionally use the workspace
   * timezone returned by the Agenda response.
   */
  timezone: string;
};

export type AgendaTemporalValue =
  AgendaDateTemporalValue | AgendaTimedTemporalValue;

export type AgendaItem = {
  sourceKind: AgendaSourceKind;
  sourceId: string;

  occurrenceKey: string;

  title: string;

  displayModule: AgendaDisplayModule;

  /**
   * Local workspace calendar date used for Agenda grouping and
   * overdue/today/upcoming classification.
   */
  agendaDate: CalendarDate;

  timingState: AgendaTimingState;

  temporal: AgendaTemporalValue;

  status: "scheduled";

  notificationGeneration: number;

  reminderCapable: true;

  remindersEnabled: boolean;

  sourceVersion: number;
};

export type ListAgendaItemsResult = {
  workspaceTimezone: string;
  today: CalendarDate;

  items: AgendaItem[];

  /**
   * Authorized routes back to each source aggregate.
   *
   * Career events route to their owning application. Manual personal events
   * route to their Calendar-owned source detail page.
   */
  sourceRoutes: Record<string, string>;

  nextCursor: string | null;
};

export class InvalidAgendaCursorError extends Error {
  readonly code = "INVALID_AGENDA_CURSOR";

  constructor() {
    super(
      "The Agenda cursor is invalid for the requested date range or module filters.",
    );

    this.name = "InvalidAgendaCursorError";
  }
}

export class AgendaWorkspaceUnavailableError extends Error {
  readonly code = "AGENDA_WORKSPACE_UNAVAILABLE";

  constructor() {
    super("The active workspace could not be resolved for the Agenda query.");

    this.name = "AgendaWorkspaceUnavailableError";
  }
}

type NormalizedListAgendaItemsInput = {
  userId: string;
  workspaceId: string;

  startDate: CalendarDate;
  endDate: CalendarDate;

  modules: AgendaDisplayModule[];

  pageSize: number;

  cursor: AgendaCursorPosition | null;
};

type AgendaCursorFilters = {
  startDate: CalendarDate;
  endDate: CalendarDate;

  modules: readonly AgendaDisplayModule[];
};

function normalizeModules(
  modules: readonly AgendaDisplayModule[],
): AgendaDisplayModule[] {
  const requested = new Set(modules);

  return AGENDA_DISPLAY_MODULES.filter((module) => requested.has(module));
}

function sameModules(
  left: readonly AgendaDisplayModule[],
  right: readonly AgendaDisplayModule[],
): boolean {
  return (
    left.length === right.length &&
    left.every((module, index) => module === right[index])
  );
}

function encodeAgendaCursor(
  position: AgendaCursorPosition,
  filters: AgendaCursorFilters,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,

      agendaDate: position.agendaDate,

      temporalKind: position.temporalKind,
      startsAt: position.startsAt,

      sourceKind: position.sourceKind,
      sourceId: position.sourceId,
      occurrenceKey: position.occurrenceKey,

      startDate: filters.startDate,
      endDate: filters.endDate,

      modules: filters.modules,
    }),
    "utf8",
  ).toString("base64url");
}

function decodeAgendaCursor(
  cursor: string,
  filters: AgendaCursorFilters,
): AgendaCursorPosition {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );

    const parsed = agendaCursorSchema.parse(decoded);

    const parsedModules = normalizeModules(parsed.modules);

    if (
      parsed.startDate !== filters.startDate ||
      parsed.endDate !== filters.endDate ||
      !sameModules(parsedModules, filters.modules)
    ) {
      throw new InvalidAgendaCursorError();
    }

    return {
      agendaDate: parseCalendarDate(parsed.agendaDate),

      temporalKind: parsed.temporalKind,
      startsAt: parsed.startsAt,

      sourceKind: parsed.sourceKind,
      sourceId: parsed.sourceId,
      occurrenceKey: parsed.occurrenceKey,
    };
  } catch (error) {
    if (error instanceof InvalidAgendaCursorError) {
      throw error;
    }

    throw new InvalidAgendaCursorError();
  }
}

function normalizeListAgendaItemsInput(
  input: ListAgendaItemsInput,
): NormalizedListAgendaItemsInput {
  const parsed = listAgendaItemsInputSchema.parse(input);

  const startDate = parseCalendarDate(parsed.startDate);

  const endDate = parseCalendarDate(parsed.endDate);

  if (compareCalendarDates(startDate, endDate) > 0) {
    throw new RangeError(
      "Agenda end date cannot be earlier than the start date.",
    );
  }

  const modules = normalizeModules(parsed.modules);

  const filters: AgendaCursorFilters = {
    startDate,
    endDate,
    modules,
  };

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    startDate,
    endDate,

    modules,

    pageSize: parsed.pageSize,

    cursor:
      parsed.cursor === undefined
        ? null
        : decodeAgendaCursor(parsed.cursor, filters),
  };
}

function expectedDisplayModule(
  sourceKind: AgendaSourceKind,
): AgendaDisplayModule {
  switch (sourceKind) {
    case "application_event":
      return "career";

    case "personal_event":
      return "time";
    case "debt_installment":
      return "money";
  }
}

function parseTimingState(value: string): AgendaTimingState {
  if (AGENDA_TIMING_STATES.includes(value as AgendaTimingState)) {
    return value as AgendaTimingState;
  }

  throw new Error("Agenda query returned an invalid timing state.");
}

function mapAgendaItem(row: AgendaListQueryRow): AgendaItem {
  if (
    row.source_kind === null ||
    row.source_id === null ||
    row.occurrence_key === null ||
    row.title === null ||
    row.display_module === null ||
    row.notification_generation === null ||
    row.temporal_kind === null ||
    row.agenda_date === null ||
    row.status === null ||
    row.source_version === null ||
    row.timing_state === null ||
    row.module_reminders_enabled === null
  ) {
    throw new Error("Agenda query returned an incomplete source row.");
  }

  if (!AGENDA_SOURCE_KINDS.includes(row.source_kind as AgendaSourceKind)) {
    throw new Error("Agenda query returned an unsupported source kind.");
  }

  const sourceKind = row.source_kind as AgendaSourceKind;

  const displayModule = expectedDisplayModule(sourceKind);

  if (row.display_module !== displayModule) {
    throw new Error(
      "Agenda query returned a source under the wrong display module.",
    );
  }

  if (row.status !== "scheduled") {
    throw new Error("Agenda projection returned a non-scheduled source.");
  }

  if (row.notification_generation <= 0 || row.source_version <= 0) {
    throw new Error("Agenda source version metadata is invalid.");
  }

  const agendaDate = parseCalendarDate(row.agenda_date);

  const timingState = parseTimingState(row.timing_state);

  let temporal: AgendaTemporalValue;

  if (row.temporal_kind === "date") {
    if (
      row.event_date === null ||
      row.starts_at !== null ||
      row.ends_at !== null ||
      row.timezone !== null
    ) {
      throw new Error("Date-only Agenda source has an invalid temporal shape.");
    }

    const eventDate = parseCalendarDate(row.event_date);

    const endDateExclusive =
      row.end_date_exclusive === null
        ? null
        : parseCalendarDate(row.end_date_exclusive);

    temporal = {
      kind: "date",

      eventDate,
      endDateExclusive,
    };
  } else if (row.temporal_kind === "timed") {
    if (
      row.event_date !== null ||
      row.end_date_exclusive !== null ||
      row.starts_at === null ||
      row.timezone === null
    ) {
      throw new Error("Timed Agenda source has an invalid temporal shape.");
    }

    temporal = {
      kind: "timed",

      startsAt: row.starts_at,
      endsAt: row.ends_at,

      timezone: row.timezone,
    };
  } else {
    throw new Error("Agenda query returned an invalid temporal kind.");
  }

  return {
    sourceKind,
    sourceId: row.source_id,

    occurrenceKey: row.occurrence_key,

    title: row.title,

    displayModule,

    agendaDate,

    timingState,

    temporal,

    status: "scheduled",

    notificationGeneration: row.notification_generation,

    reminderCapable: true,

    remindersEnabled: row.module_reminders_enabled,

    sourceVersion: row.source_version,
  };
}

async function executeListAgendaItems(
  transaction: ScopedTransaction,
  input: NormalizedListAgendaItemsInput,
): Promise<ListAgendaItemsResult> {
  const rows = await readAgendaPage(transaction, {
    workspaceId: input.workspaceId,

    startDate: input.startDate,
    endDate: input.endDate,

    modules: input.modules,

    limit: input.pageSize + 1,

    cursor: input.cursor,
  });

  const firstRow = rows[0];

  if (!firstRow) {
    throw new AgendaWorkspaceUnavailableError();
  }

  const today = parseCalendarDate(firstRow.workspace_today);

  const sourceRows = rows.filter((row) => row.source_id !== null);

  const hasMore = sourceRows.length > input.pageSize;

  const visibleRows = sourceRows.slice(0, input.pageSize);

  const items = visibleRows.map(mapAgendaItem);

  const sourceRoutes: Record<string, string> = {};

  for (const row of visibleRows) {
    if (row.source_id === null) {
      continue;
    }

    if (row.source_kind === "debt_installment") {
      if (!row.debt_id)
        throw new Error("Debt Agenda source could not resolve its debt.");
      sourceRoutes[`debt_installment:${row.source_id}`] =
        `/money/debts/${row.debt_id}`;
      continue;
    }

    if (row.source_kind === "personal_event") {
      sourceRoutes[`personal_event:${row.source_id}`] =
        `/calendar/events/${row.source_id}`;

      continue;
    }

    if (row.source_kind === "application_event") {
      if (row.application_id === null) {
        throw new Error(
          "Career Agenda source could not resolve its owning application.",
        );
      }

      sourceRoutes[`application_event:${row.source_id}`] =
        `/career/applications/${row.application_id}`;
    }
  }

  const lastRow = visibleRows.at(-1);

  let nextCursor: string | null = null;

  if (hasMore && lastRow) {
    if (
      lastRow.agenda_date === null ||
      lastRow.temporal_kind === null ||
      lastRow.source_kind === null ||
      lastRow.source_id === null ||
      lastRow.occurrence_key === null
    ) {
      throw new Error(
        "Agenda query could not create a pagination cursor from its final row.",
      );
    }

    if (lastRow.temporal_kind !== "date" && lastRow.temporal_kind !== "timed") {
      throw new Error("Agenda query returned an invalid cursor temporal kind.");
    }

    if (
      !AGENDA_SOURCE_KINDS.includes(lastRow.source_kind as AgendaSourceKind)
    ) {
      throw new Error("Agenda query returned an invalid cursor source kind.");
    }

    const temporalKind = lastRow.temporal_kind as AgendaTemporalKind;

    if (temporalKind === "date" && lastRow.starts_at !== null) {
      throw new Error(
        "Date-only Agenda cursor row unexpectedly contained a start instant.",
      );
    }

    if (temporalKind === "timed" && lastRow.starts_at === null) {
      throw new Error(
        "Timed Agenda cursor row did not contain its start instant.",
      );
    }

    nextCursor = encodeAgendaCursor(
      {
        agendaDate: parseCalendarDate(lastRow.agenda_date),

        temporalKind,
        startsAt: lastRow.starts_at,

        sourceKind: lastRow.source_kind as AgendaSourceKind,

        sourceId: lastRow.source_id,
        occurrenceKey: lastRow.occurrence_key,
      },
      {
        startDate: input.startDate,
        endDate: input.endDate,

        modules: input.modules,
      },
    );
  }

  return {
    workspaceTimezone: firstRow.workspace_timezone,

    today,

    items,

    sourceRoutes,

    nextCursor,
  };
}

export async function listAgendaItemsInTransaction(
  transaction: ScopedTransaction,
  input: ListAgendaItemsInput,
): Promise<ListAgendaItemsResult> {
  return executeListAgendaItems(
    transaction,
    normalizeListAgendaItemsInput(input),
  );
}

export async function listAgendaItems(
  input: ListAgendaItemsInput,
): Promise<ListAgendaItemsResult> {
  const normalizedInput = normalizeListAgendaItemsInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeListAgendaItems(transaction, normalizedInput),
  );
}
