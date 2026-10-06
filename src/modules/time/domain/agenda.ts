export const AGENDA_SOURCE_KINDS = [
  "personal_event",
  "application_event",
] as const;

export type AgendaSourceKind = (typeof AGENDA_SOURCE_KINDS)[number];

export const AGENDA_DISPLAY_MODULES = ["career", "time"] as const;

export type AgendaDisplayModule = (typeof AGENDA_DISPLAY_MODULES)[number];

export const AGENDA_TEMPORAL_KINDS = ["date", "timed"] as const;

export type AgendaTemporalKind = (typeof AGENDA_TEMPORAL_KINDS)[number];

export const AGENDA_TIMING_STATES = ["overdue", "today", "upcoming"] as const;

export type AgendaTimingState = (typeof AGENDA_TIMING_STATES)[number];
