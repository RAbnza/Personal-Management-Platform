export const CAREER_APPLICATION_STAGES = [
  "saved",
  "applied",
  "screening",
  "interview",
  "technical_assessment",
  "final_interview",
  "offer",
  "accepted",
] as const;

export type CareerApplicationStage = (typeof CAREER_APPLICATION_STAGES)[number];

export const CAREER_APPLICATION_OUTCOMES = [
  "accepted",
  "rejected",
  "withdrawn",
  "offer_declined",
  "offer_expired",
  "employer_cancelled",
] as const;

export type CareerApplicationOutcome =
  (typeof CAREER_APPLICATION_OUTCOMES)[number];

export const CAREER_WORK_ARRANGEMENTS = [
  "onsite",
  "hybrid",
  "remote",
  "unspecified",
] as const;

export type CareerWorkArrangement = (typeof CAREER_WORK_ARRANGEMENTS)[number];

export const CAREER_SALARY_PERIODS = ["hour", "month", "year"] as const;

export type CareerSalaryPeriod = (typeof CAREER_SALARY_PERIODS)[number];

export type PossibleDuplicateJobApplication = {
  applicationId: string;
  archived: boolean;
};

export class PossibleDuplicateJobApplicationError extends Error {
  readonly code = "POSSIBLE_DUPLICATE_JOB_APPLICATION";

  readonly candidates: readonly PossibleDuplicateJobApplication[];

  constructor(candidates: readonly PossibleDuplicateJobApplication[]) {
    super(
      "A job application with the same company and role already exists. Confirm that another attempt should be created.",
    );

    this.name = "PossibleDuplicateJobApplicationError";
    this.candidates = [...candidates];
  }
}
