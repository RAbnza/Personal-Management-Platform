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
