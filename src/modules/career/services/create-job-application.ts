import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  CAREER_APPLICATION_OUTCOMES,
  CAREER_APPLICATION_STAGES,
  CAREER_SALARY_PERIODS,
  CAREER_WORK_ARRANGEMENTS,
  PossibleDuplicateJobApplicationError,
  type CareerApplicationOutcome,
  type CareerApplicationStage,
  type CareerSalaryPeriod,
  type CareerWorkArrangement,
} from "@/modules/career/domain/application";
import {
  createInitialApplicationStageHistory,
  createJobApplicationRecord,
  enforceDeferredCareerConstraints,
  findPossibleDuplicateJobApplications,
  lockResumeVersionForApplication,
} from "@/modules/career/repositories/job-application-repository";
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

const CREATE_JOB_APPLICATION_COMMAND_TYPE = "career.create_job_application";

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

const nonNegativeMinorUnitsPattern = /^(?:0|[1-9]\d*)$/;

const applicationStageSchema = z.enum(CAREER_APPLICATION_STAGES);

const applicationOutcomeSchema = z.enum(CAREER_APPLICATION_OUTCOMES);

const workArrangementSchema = z.enum(CAREER_WORK_ARRANGEMENTS);

const salaryPeriodSchema = z.enum(CAREER_SALARY_PERIODS);

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
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

const nullableHttpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isHttpUrl, {
    message: "Posting URL must be a valid HTTP or HTTPS URL.",
  })
  .nullable()
  .optional();

const nullableEmailSchema = z
  .string()
  .trim()
  .max(320)
  .refine((value) => z.email().safeParse(value).success, {
    message: "Contact email must be a valid email address.",
  })
  .nullable()
  .optional();

const salaryMinorSchema = z
  .string()
  .regex(nonNegativeMinorUnitsPattern, {
    message: "Salary must be a non-negative exact minor-unit integer string.",
  })
  .nullable()
  .optional();

const createJobApplicationInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),

    companyName: z.string().trim().min(1).max(200),
    roleTitle: z.string().trim().min(1).max(200),

    postingUrl: nullableHttpUrlSchema,
    sourceName: nullableTrimmedText(200),
    roleDescriptionSnapshot: nullableTrimmedText(20_000),
    location: nullableTrimmedText(500),

    workArrangement: workArrangementSchema.nullable().optional(),

    salaryMinMinor: salaryMinorSchema,
    salaryMaxMinor: salaryMinorSchema,
    salaryCurrency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, {
        message:
          "Salary currency must be a three-letter uppercase currency code.",
      })
      .nullable()
      .optional(),
    salaryPeriod: salaryPeriodSchema.nullable().optional(),

    technologyTags: z
      .array(z.string().trim().min(1).max(100))
      .max(50)
      .default([]),

    contactName: nullableTrimmedText(200),
    contactEmail: nullableEmailSchema,
    contactPhone: nullableTrimmedText(50),

    resumeVersionId: z.uuid().nullable().optional(),

    appliedDate: calendarDateSchema.nullable().optional(),

    initialStage: applicationStageSchema.default("saved"),
    initialOutcome: applicationOutcomeSchema.nullable().optional(),

    initialStageEffectiveDate: calendarDateSchema,
    initialStageReason: nullableTrimmedText(2000),

    notes: nullableTrimmedText(20_000),

    allowPossibleDuplicate: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, context) => {
    const normalizedTechnologyTags = new Set<string>();

    input.technologyTags.forEach((technology, index) => {
      const normalizedTechnology = technology.toLowerCase();

      if (normalizedTechnologyTags.has(normalizedTechnology)) {
        context.addIssue({
          code: "custom",
          path: ["technologyTags", index],
          message:
            "Technology tags must not contain case-insensitive duplicates.",
        });

        return;
      }

      normalizedTechnologyTags.add(normalizedTechnology);
    });

    const hasSalaryMinimum = input.salaryMinMinor != null;
    const hasSalaryMaximum = input.salaryMaxMinor != null;
    const hasSalaryValue = hasSalaryMinimum || hasSalaryMaximum;

    if (hasSalaryValue) {
      if (input.salaryCurrency == null) {
        context.addIssue({
          code: "custom",
          path: ["salaryCurrency"],
          message:
            "Salary currency is required when a salary value is provided.",
        });
      }

      if (input.salaryPeriod == null) {
        context.addIssue({
          code: "custom",
          path: ["salaryPeriod"],
          message: "Salary period is required when a salary value is provided.",
        });
      }
    } else {
      if (input.salaryCurrency != null) {
        context.addIssue({
          code: "custom",
          path: ["salaryCurrency"],
          message: "Salary currency requires at least one salary value.",
        });
      }

      if (input.salaryPeriod != null) {
        context.addIssue({
          code: "custom",
          path: ["salaryPeriod"],
          message: "Salary period requires at least one salary value.",
        });
      }
    }

    if (
      input.salaryMinMinor != null &&
      input.salaryMaxMinor != null &&
      nonNegativeMinorUnitsPattern.test(input.salaryMinMinor) &&
      nonNegativeMinorUnitsPattern.test(input.salaryMaxMinor) &&
      BigInt(input.salaryMinMinor) > BigInt(input.salaryMaxMinor)
    ) {
      context.addIssue({
        code: "custom",
        path: ["salaryMaxMinor"],
        message:
          "Salary maximum must be greater than or equal to salary minimum.",
      });
    }

    for (const [path, value] of [
      ["salaryMinMinor", input.salaryMinMinor],
      ["salaryMaxMinor", input.salaryMaxMinor],
    ] as const) {
      if (
        value != null &&
        nonNegativeMinorUnitsPattern.test(value) &&
        BigInt(value) > POSTGRES_BIGINT_MAX
      ) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: "Salary value exceeds the supported database range.",
        });
      }
    }

    const appliedDate = input.appliedDate ?? null;

    if (input.initialStage === "saved" && appliedDate !== null) {
      context.addIssue({
        code: "custom",
        path: ["appliedDate"],
        message:
          "A saved opportunity is not submitted and must not have an applied date.",
      });
    }

    if (input.initialStage !== "saved" && appliedDate === null) {
      context.addIssue({
        code: "custom",
        path: ["appliedDate"],
        message:
          "Submitted application stages require an explicit applied date.",
      });
    }

    if (
      input.initialStage === "applied" &&
      appliedDate !== null &&
      appliedDate !== input.initialStageEffectiveDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["initialStageEffectiveDate"],
        message:
          "An initial Applied stage must use the explicit applied date as its effective date.",
      });
    }

    if (
      input.initialStage !== "saved" &&
      input.initialStage !== "applied" &&
      appliedDate !== null &&
      isCalendarDate(appliedDate) &&
      isCalendarDate(input.initialStageEffectiveDate) &&
      compareCalendarDates(
        parseCalendarDate(appliedDate),
        parseCalendarDate(input.initialStageEffectiveDate),
      ) > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["initialStageEffectiveDate"],
        message:
          "The initial stage effective date cannot be earlier than the applied date.",
      });
    }

    const outcome = input.initialOutcome ?? null;

    if (input.initialStage === "accepted" && outcome !== "accepted") {
      context.addIssue({
        code: "custom",
        path: ["initialOutcome"],
        message: "The Accepted stage requires the Accepted outcome.",
      });
    }

    if (input.initialStage !== "accepted" && outcome === "accepted") {
      context.addIssue({
        code: "custom",
        path: ["initialOutcome"],
        message: "The Accepted outcome requires the Accepted stage.",
      });
    }
  });

const createJobApplicationResultSchema = z.object({
  applicationId: z.uuid(),
  initialHistoryId: z.uuid(),
  version: z.literal(1),
});

export type CreateJobApplicationInput = z.input<
  typeof createJobApplicationInputSchema
>;

export type CreateJobApplicationResult = z.infer<
  typeof createJobApplicationResultSchema
>;

type NormalizedCreateJobApplicationInput = {
  userId: string;
  workspaceId: string;

  clientCommandId: string;
  requestId: string | null;

  companyName: string;
  roleTitle: string;

  postingUrl: string | null;
  sourceName: string | null;
  roleDescriptionSnapshot: string | null;
  location: string | null;
  workArrangement: CareerWorkArrangement | null;

  salaryMinMinor: bigint | null;
  salaryMaxMinor: bigint | null;
  salaryCurrency: string | null;
  salaryPeriod: CareerSalaryPeriod | null;

  technologyTags: string[];

  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;

  resumeVersionId: string | null;

  appliedDate: CalendarDate | null;

  initialStage: CareerApplicationStage;
  initialOutcome: CareerApplicationOutcome | null;

  initialStageEffectiveDate: CalendarDate;
  initialStageReason: string | null;

  notes: string | null;

  allowPossibleDuplicate: boolean;
};

function parseCareerSalaryMinor(value: string | null): bigint | null {
  if (value === null) {
    return null;
  }

  const parsed = BigInt(value);

  if (parsed < 0n || parsed > POSTGRES_BIGINT_MAX) {
    throw new RangeError("Salary value is outside the supported range.");
  }

  return parsed;
}

function normalizeCreateJobApplicationInput(
  input: CreateJobApplicationInput,
): NormalizedCreateJobApplicationInput {
  const parsed = createJobApplicationInputSchema.parse(input);

  return {
    userId: parsed.userId,
    workspaceId: parsed.workspaceId,

    clientCommandId: parsed.clientCommandId,
    requestId: parsed.requestId ?? null,

    companyName: parsed.companyName,
    roleTitle: parsed.roleTitle,

    postingUrl: parsed.postingUrl ?? null,
    sourceName: parsed.sourceName ?? null,
    roleDescriptionSnapshot: parsed.roleDescriptionSnapshot ?? null,
    location: parsed.location ?? null,
    workArrangement: parsed.workArrangement ?? null,

    salaryMinMinor: parseCareerSalaryMinor(parsed.salaryMinMinor ?? null),
    salaryMaxMinor: parseCareerSalaryMinor(parsed.salaryMaxMinor ?? null),
    salaryCurrency: parsed.salaryCurrency ?? null,
    salaryPeriod: parsed.salaryPeriod ?? null,

    technologyTags: parsed.technologyTags,

    contactName: parsed.contactName ?? null,
    contactEmail: parsed.contactEmail ?? null,
    contactPhone: parsed.contactPhone ?? null,

    resumeVersionId: parsed.resumeVersionId ?? null,

    appliedDate:
      parsed.appliedDate == null ? null : parseCalendarDate(parsed.appliedDate),

    initialStage: parsed.initialStage,
    initialOutcome: parsed.initialOutcome ?? null,

    initialStageEffectiveDate: parseCalendarDate(
      parsed.initialStageEffectiveDate,
    ),
    initialStageReason: parsed.initialStageReason ?? null,

    notes: parsed.notes ?? null,

    allowPossibleDuplicate: parsed.allowPossibleDuplicate,
  };
}

async function executeCreateJobApplication(
  transaction: ScopedTransaction,
  input: NormalizedCreateJobApplicationInput,
): Promise<CreateJobApplicationResult> {
  await lockActivePrivateWorkspace(transaction, {
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const payloadHash = hashCommandPayload({
    companyName: input.companyName,
    roleTitle: input.roleTitle,

    postingUrl: input.postingUrl,
    sourceName: input.sourceName,
    roleDescriptionSnapshot: input.roleDescriptionSnapshot,
    location: input.location,
    workArrangement: input.workArrangement,

    salaryMinMinor:
      input.salaryMinMinor === null ? null : input.salaryMinMinor.toString(),
    salaryMaxMinor:
      input.salaryMaxMinor === null ? null : input.salaryMaxMinor.toString(),
    salaryCurrency: input.salaryCurrency,
    salaryPeriod: input.salaryPeriod,

    technologyTags: input.technologyTags,

    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,

    resumeVersionId: input.resumeVersionId,

    appliedDate: input.appliedDate,

    initialStage: input.initialStage,
    initialOutcome: input.initialOutcome,
    initialStageEffectiveDate: input.initialStageEffectiveDate,
    initialStageReason: input.initialStageReason,

    notes: input.notes,

    allowPossibleDuplicate: input.allowPossibleDuplicate,
  });

  const receipt = await claimCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    clientCommandId: input.clientCommandId,
    commandType: CREATE_JOB_APPLICATION_COMMAND_TYPE,
    payloadHash,
  });

  /*
   * Resolve replay before duplicate detection. The original application now
   * legitimately exists and must not cause its own idempotent replay to look
   * like a new duplicate attempt.
   */
  if (receipt.kind === "replay") {
    return createJobApplicationResultSchema.parse(receipt.result);
  }

  if (!input.allowPossibleDuplicate) {
    const duplicates = await findPossibleDuplicateJobApplications(transaction, {
      workspaceId: input.workspaceId,
      companyName: input.companyName,
      roleTitle: input.roleTitle,
    });

    if (duplicates.length > 0) {
      throw new PossibleDuplicateJobApplicationError(duplicates);
    }
  }

  if (input.resumeVersionId !== null) {
    await lockResumeVersionForApplication(transaction, {
      workspaceId: input.workspaceId,
      resumeVersionId: input.resumeVersionId,
    });
  }

  const applicationId = randomUUID();
  const initialHistoryId = randomUUID();

  await createJobApplicationRecord(transaction, {
    id: applicationId,
    workspaceId: input.workspaceId,

    companyName: input.companyName,
    roleTitle: input.roleTitle,

    postingUrl: input.postingUrl,
    sourceName: input.sourceName,
    roleDescriptionSnapshot: input.roleDescriptionSnapshot,
    location: input.location,
    workArrangement: input.workArrangement,

    salaryMinMinor: input.salaryMinMinor,
    salaryMaxMinor: input.salaryMaxMinor,
    salaryCurrency: input.salaryCurrency,
    salaryPeriod: input.salaryPeriod,

    technologyTags: input.technologyTags,

    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,

    resumeVersionId: input.resumeVersionId,
    appliedDate: input.appliedDate,

    currentStage: input.initialStage,
    currentOutcome: input.initialOutcome,
    currentHistoryId: initialHistoryId,

    notes: input.notes,

    recordedByUserId: input.userId,
    requestId: input.requestId,
  });

  await createInitialApplicationStageHistory(transaction, {
    id: initialHistoryId,
    workspaceId: input.workspaceId,
    applicationId,

    stage: input.initialStage,
    outcome: input.initialOutcome,
    effectiveDate: input.initialStageEffectiveDate,
    reason: input.initialStageReason,

    commandReceiptId: receipt.receiptId,

    recordedByUserId: input.userId,
    requestId: input.requestId,
  });

  await createPrivateRevision(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,

    subjectKind: "job_application",
    subjectId: applicationId,
    subjectVersion: 1,
    operation: "create",

    beforeJson: null,
    afterJson: {
      companyName: input.companyName,
      roleTitle: input.roleTitle,

      postingUrl: input.postingUrl,
      sourceName: input.sourceName,
      roleDescriptionSnapshot: input.roleDescriptionSnapshot,
      location: input.location,
      workArrangement: input.workArrangement,

      salaryMinMinor:
        input.salaryMinMinor === null ? null : input.salaryMinMinor.toString(),
      salaryMaxMinor:
        input.salaryMaxMinor === null ? null : input.salaryMaxMinor.toString(),
      salaryCurrency: input.salaryCurrency,
      salaryPeriod: input.salaryPeriod,

      technologyTags: input.technologyTags,

      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,

      resumeVersionId: input.resumeVersionId,
      appliedDate: input.appliedDate,

      currentStage: input.initialStage,
      currentOutcome: input.initialOutcome,
      currentHistoryId: initialHistoryId,
      nextActionEventId: null,

      initialStageEffectiveDate: input.initialStageEffectiveDate,
      initialStageReason: input.initialStageReason,

      notes: input.notes,
    },

    reason: input.initialStageReason,
    effectiveDate: input.initialStageEffectiveDate,

    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  });

  const result: CreateJobApplicationResult = {
    applicationId,
    initialHistoryId,
    version: 1,
  };

  await completeCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });

  /*
   * Force the deferred same-application current-history check before the
   * service returns instead of discovering a mismatch only at COMMIT.
   */
  await enforceDeferredCareerConstraints(transaction);

  return result;
}

export async function createJobApplicationInTransaction(
  transaction: ScopedTransaction,
  input: CreateJobApplicationInput,
): Promise<CreateJobApplicationResult> {
  return executeCreateJobApplication(
    transaction,
    normalizeCreateJobApplicationInput(input),
  );
}

export async function createJobApplication(
  input: CreateJobApplicationInput,
): Promise<CreateJobApplicationResult> {
  const normalizedInput = normalizeCreateJobApplicationInput(input);

  return withDomainTransaction(
    {
      userId: normalizedInput.userId,
      workspaceId: normalizedInput.workspaceId,
    },
    (transaction) => executeCreateJobApplication(transaction, normalizedInput),
  );
}
