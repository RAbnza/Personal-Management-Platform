export const CAREER_ACTIONABLE_EVENT_KINDS = [
  "interview",
  "assessment",
  "follow_up",
] as const;

export type CareerActionableEventKind =
  (typeof CAREER_ACTIONABLE_EVENT_KINDS)[number];

export const APPLICATION_EVENT_TEMPORAL_KINDS = ["date", "timed"] as const;

export type ApplicationEventTemporalKind =
  (typeof APPLICATION_EVENT_TEMPORAL_KINDS)[number];

export const APPLICATION_EVENT_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
] as const;

export type ApplicationEventStatus =
  (typeof APPLICATION_EVENT_STATUSES)[number];

export const APPLICATION_EVENT_MUTATIONS = [
  "reschedule",
  "complete",
  "cancel",
] as const;

export type ApplicationEventMutation =
  (typeof APPLICATION_EVENT_MUTATIONS)[number];

export class ApplicationEventUnavailableError extends Error {
  readonly code = "APPLICATION_EVENT_UNAVAILABLE";

  constructor() {
    super("The application event is unavailable in this workspace.");

    this.name = "ApplicationEventUnavailableError";
  }
}

export class ApplicationEventVersionConflictError extends Error {
  readonly code = "STALE_VERSION";

  constructor(
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `The application event changed since it was loaded. Expected version ${expectedVersion}, but the current version is ${currentVersion}.`,
    );

    this.name = "ApplicationEventVersionConflictError";
  }
}

export class ApplicationEventStateError extends Error {
  readonly code = "APPLICATION_EVENT_INVALID_STATE";

  constructor(readonly currentStatus: ApplicationEventStatus) {
    super(
      `The application event cannot be changed from its current ${currentStatus} state.`,
    );

    this.name = "ApplicationEventStateError";
  }
}
