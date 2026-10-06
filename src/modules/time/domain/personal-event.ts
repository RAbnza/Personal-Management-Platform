export const PERSONAL_EVENT_TEMPORAL_KINDS = ["date", "timed"] as const;

export type PersonalEventTemporalKind =
  (typeof PERSONAL_EVENT_TEMPORAL_KINDS)[number];

export const PERSONAL_EVENT_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
] as const;

export type PersonalEventStatus = (typeof PERSONAL_EVENT_STATUSES)[number];

export class PersonalEventUnavailableError extends Error {
  readonly code = "PERSONAL_EVENT_UNAVAILABLE";

  constructor() {
    super("The personal event is unavailable in this workspace.");

    this.name = "PersonalEventUnavailableError";
  }
}

export class PersonalEventVersionConflictError extends Error {
  readonly code = "STALE_VERSION";

  constructor(
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `The personal event changed since it was loaded. Expected version ${expectedVersion}, but the current version is ${currentVersion}.`,
    );

    this.name = "PersonalEventVersionConflictError";
  }
}

export class PersonalEventStateError extends Error {
  readonly code = "PERSONAL_EVENT_INVALID_STATE";

  constructor(readonly currentStatus: PersonalEventStatus) {
    super(
      `The personal event cannot be changed from its current ${currentStatus} state.`,
    );

    this.name = "PersonalEventStateError";
  }
}
