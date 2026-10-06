import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  CAREER_APPLICATION_OUTCOMES,
  CAREER_APPLICATION_STAGES,
  JobApplicationArchivedError,
  JobApplicationUnavailableError,
  JobApplicationVersionConflictError,
  type CareerApplicationOutcome,
  type CareerApplicationStage,
} from "@/modules/career/domain/application";
import {
  appendApplicationStageHistory,
  getNextApplicationStageHistoryPosition,
  lockJobApplicationStageAggregate,
  resolveApplicationCurrentStage,
  updateJobApplicationResolvedStage,
  type JobApplicationStageAggregate,
} from "@/modules/career/repositories/application-stage-repository";
import { enforceDeferredCareerConstraints } from "@/modules/career/repositories/job-application-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  compareCalendarDates,
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "@/shared/calendar-date";

const TRANSITION_JOB_APPLICATION_STAGE_COMMAND_TYPE =
  "career.transition_job_application_stage";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const applicationStageSchema = z.enum(CAREER_APPLICATION_STAGES);

const applicationOutcomeSchema = z.enum(CAREER_APPLICATION_OUTCOMES);

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const transitionJobApplicationStageInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    applicationId: z.uuid(),

    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),

    expectedVersion: z.number().int().min(1).max(POSTGRES_INTEGER_MAX),

    stage: applicationStageSchema,
    outcome: applicationOutcomeSchema.nullable().optional(),

    effectiveDate: calendarDateSchema,

    effectiveOrder: z
      .number()
      .int()
      .min(0)
      .max(POSTGRES_INTEGER_MAX)
      .optional(),

    /**
     * Required only when this command establishes the application's first
     * submitted state. Once set, the application date is historical evidence
     * and this command cannot replace it.
     */
    appliedDate: calendarDateSchema.nullable().optional(),

    reason: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const outcome = input.outcome ?? null;

    if (input.stage === "accepted" && outcome !== "accepted") {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "The Accepted stage requires the Accepted outcome.",
      });
    }

    if (input.stage !== "accepted" && outcome === "accepted") {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "The Accepted outcome requires the Accepted stage.",
      });
    }
  });

const transitionJobApplicationStageResultSchema = z.object({
  applicationId: z.uuid(),

  historyId: z.uuid(),
  historySequenceNo: z.number().int().positive(),
  historyEffectiveOrder: z.number().int().min(0),

  version: z.number().int().positive(),

  currentHistoryId: z.uuid(),
  currentStage: applicationStageSchema,
  currentOutcome: applicationOutcomeSchema.nullable(),

  appliedDate: calendarDateSchema.nullable(),
});

export type TransitionJobApplicationStageInput = z.input<
  typeof transitionJobApplicationStageInputSchema
>;

export type TransitionJobApplicationStageResult = z.infer<
  typeof transitionJobApplicationStageResultSchema
>;

type NormalizedTransitionJobApplicationStageInput = {
  userId: string;
  workspaceId: string;

  applicationId: string;

  clientCommandId: string;
  requestId: string | null;

  expectedVersion: number;

  stage: CareerApplicationStage;
  outcome: CareerApplicationOutcome | null;

  effectiveDate: CalendarDate;
  effectiveOrder: number | null;

  appliedDate: CalendarDate | null;

  reason: string | null;
};

function normalizeTransitionJobApplicationStageInput(
  input: TransitionJobApplicationStageInput,
): NormalizedTransitionJobApplicationStageInput {
  const parsed = transitionJobApplicationStageInputSchema.parse(input);

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    applicationId: parsed.applicationId,

    clientCommandId: parsed.clientCommandId,
    requestId: parsed.requestId ?? null,

    expectedVersion: parsed.expectedVersion,

    stage: parsed.stage,
    outcome: parsed.outcome ?? null,

    effectiveDate: parseCalendarDate(parsed.effectiveDate),
    effectiveOrder: parsed.effectiveOrder ?? null,

    appliedDate:
      parsed.appliedDate == null ? null : parseCalendarDate(parsed.appliedDate),

    reason: parsed.reason ?? null,
  };
}

function resolveTransitionAppliedDate(
  application: JobApplicationStageAggregate,
  input: NormalizedTransitionJobApplicationStageInput,
): CalendarDate | null {
  const existingAppliedDate = application.appliedDate;

  if (existingAppliedDate !== null) {
    if (
      input.appliedDate !== null &&
      input.appliedDate !== existingAppliedDate
    ) {
      throw new RangeError(
        "A stage transition cannot replace the application's existing applied date.",
      );
    }

    if (
      input.stage !== "saved" &&
      compareCalendarDates(input.effectiveDate, existingAppliedDate) < 0
    ) {
      throw new RangeError(
        "A submitted application stage cannot be effective before the application date.",
      );
    }

    if (
      input.stage === "applied" &&
      input.effectiveDate !== existingAppliedDate
    ) {
      throw new RangeError(
        "The Applied stage must use the application's actual applied date.",
      );
    }

    return existingAppliedDate;
  }

  if (input.stage === "saved") {
    if (input.appliedDate !== null) {
      throw new RangeError(
        "A Saved stage is not submitted and cannot establish an applied date.",
      );
    }

    return null;
  }

  if (input.appliedDate === null) {
    throw new RangeError(
      "The first submitted application stage requires an explicit applied date.",
    );
  }

  if (compareCalendarDates(input.effectiveDate, input.appliedDate) < 0) {
    throw new RangeError(
      "A submitted application stage cannot be effective before the application date.",
    );
  }

  if (input.stage === "applied" && input.effectiveDate !== input.appliedDate) {
    throw new RangeError(
      "The first Applied stage must use the explicit applied date as its effective date.",
    );
  }

  return input.appliedDate;
}

function validateResolvedSubmissionState(input: {
  appliedDate: CalendarDate | null;
  stage: CareerApplicationStage;
}): void {
  if (input.stage === "saved" && input.appliedDate !== null) {
    throw new RangeError(
      "A submitted application cannot resolve back to the Saved stage. Record the appropriate active reopening stage instead.",
    );
  }

  if (input.stage !== "saved" && input.appliedDate === null) {
    throw new RangeError(
      "A submitted application stage requires an application date.",
    );
  }
}

async function executeTransitionJobApplicationStage(
  transaction: ScopedTransaction,
  input: NormalizedTransitionJobApplicationStageInput,
): Promise<TransitionJobApplicationStageResult> {
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const payloadHash = hashCommandPayload({
    applicationId: input.applicationId,

    expectedVersion: input.expectedVersion,

    stage: input.stage,
    outcome: input.outcome,

    effectiveDate: input.effectiveDate,
    effectiveOrder: input.effectiveOrder,

    appliedDate: input.appliedDate,

    reason: input.reason,
  });

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    clientCommandId: input.clientCommandId,
    commandType: TRANSITION_JOB_APPLICATION_STAGE_COMMAND_TYPE,
    payloadHash,
  });

  /*
   * An idempotent replay returns the result of the original committed command
   * even if the application has subsequently advanced to another version.
   */
  if (receipt.kind === "replay") {
    return transitionJobApplicationStageResultSchema.parse(receipt.result);
  }

  const application = await lockJobApplicationStageAggregate(transaction, {
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
  });

  if (!application) {
    throw new JobApplicationUnavailableError();
  }

  if (application.archived) {
    throw new JobApplicationArchivedError();
  }

  if (application.version !== input.expectedVersion) {
    throw new JobApplicationVersionConflictError(
      input.expectedVersion,
      application.version,
    );
  }

  const appliedDate = resolveTransitionAppliedDate(application, input);

  const historyPosition = await getNextApplicationStageHistoryPosition(
    transaction,
    {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      effectiveDate: input.effectiveDate,
      requestedEffectiveOrder: input.effectiveOrder,
    },
  );

  const historyId = randomUUID();

  await appendApplicationStageHistory(transaction, {
    id: historyId,
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,

    sequenceNo: historyPosition.sequenceNo,
    stage: input.stage,
    outcome: input.outcome,

    effectiveDate: input.effectiveDate,
    effectiveOrder: historyPosition.effectiveOrder,

    reason: input.reason,
    commandReceiptId: receipt.receiptId,

    recordedByUserId: input.userId,
    requestId: input.requestId,
  });

  /*
   * Insertion order is not current-state authority. A user may add a
   * historical/backdated stage after newer history already exists, so resolve
   * the same effective timeline used by the database commit check.
   */
  const resolved = await resolveApplicationCurrentStage(transaction, {
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
  });

  validateResolvedSubmissionState({
    appliedDate,
    stage: resolved.stage,
  });

  /*
   * A terminal application is reopened only if the newly resolved current
   * state actually clears its terminal outcome. Merely adding a backdated
   * active history row does not count as reopening.
   */
  if (
    application.currentOutcome !== null &&
    resolved.outcome === null &&
    input.reason === null
  ) {
    throw new RangeError(
      "Reopening a terminal job application requires a reason.",
    );
  }

  const nextVersion = await updateJobApplicationResolvedStage(transaction, {
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
    expectedVersion: input.expectedVersion,

    appliedDate,

    currentHistoryId: resolved.historyId,
    currentStage: resolved.stage,
    currentOutcome: resolved.outcome,
  });

  if (nextVersion === null) {
    throw new JobApplicationVersionConflictError(
      input.expectedVersion,
      application.version,
    );
  }

  await createPrivateRevision(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,

    subjectKind: "job_application",
    subjectId: input.applicationId,
    subjectVersion: nextVersion,
    operation: "stage_transition",

    beforeJson: {
      version: application.version,
      appliedDate: application.appliedDate,
      currentHistoryId: application.currentHistoryId,
      currentStage: application.currentStage,
      currentOutcome: application.currentOutcome,
    },

    afterJson: {
      version: nextVersion,
      appliedDate,
      currentHistoryId: resolved.historyId,
      currentStage: resolved.stage,
      currentOutcome: resolved.outcome,

      recordedHistory: {
        historyId,
        sequenceNo: historyPosition.sequenceNo,
        stage: input.stage,
        outcome: input.outcome,
        effectiveDate: input.effectiveDate,
        effectiveOrder: historyPosition.effectiveOrder,
      },
    },

    reason: input.reason,
    effectiveDate: input.effectiveDate,

    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  });

  const result: TransitionJobApplicationStageResult = {
    applicationId: input.applicationId,

    historyId,
    historySequenceNo: historyPosition.sequenceNo,
    historyEffectiveOrder: historyPosition.effectiveOrder,

    version: nextVersion,

    currentHistoryId: resolved.historyId,
    currentStage: resolved.stage,
    currentOutcome: resolved.outcome,

    appliedDate,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });

  await enforceDeferredCareerConstraints(transaction);

  return result;
}

export async function transitionJobApplicationStageInTransaction(
  transaction: ScopedTransaction,
  input: TransitionJobApplicationStageInput,
): Promise<TransitionJobApplicationStageResult> {
  return executeTransitionJobApplicationStage(
    transaction,
    normalizeTransitionJobApplicationStageInput(input),
  );
}

export async function transitionJobApplicationStage(
  input: TransitionJobApplicationStageInput,
): Promise<TransitionJobApplicationStageResult> {
  const normalizedInput = normalizeTransitionJobApplicationStageInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) =>
      executeTransitionJobApplicationStage(transaction, normalizedInput),
  );
}
