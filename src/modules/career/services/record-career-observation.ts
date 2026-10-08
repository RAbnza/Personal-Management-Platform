import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { careerObservationSchema } from "../domain/career-observation";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { lockJobApplicationForEventCreation } from "../repositories/application-event-repository";
import { enforceDeferredCareerConstraints } from "../repositories/job-application-repository";
import {
  JobApplicationUnavailableError,
  JobApplicationArchivedError,
  JobApplicationVersionConflictError,
} from "../domain/application";
type Input = {
  userId: string;
  workspaceId: string;
  applicationId: string;
  body: z.input<typeof careerObservationSchema>;
};
/** Narrow reporting dependency: actual dated response/offer observations. No
 * fabricated response date, terminal stage or next-action/reminder is created. */
export async function recordCareerObservationInTransaction(
  t: ScopedTransaction,
  input: Input,
) {
  z.object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    applicationId: z.uuid(),
  }).parse(input);
  const body = careerObservationSchema.parse(input.body),
    { clientCommandId, ...intent } = body;
  await lockActivePrivateWorkspace(t, input);
  const receipt = await claimCommandReceipt(t, {
    workspaceId: input.workspaceId,
    clientCommandId,
    commandType: "career.record_observation",
    payloadHash: hashCommandPayload({
      applicationId: input.applicationId,
      ...intent,
    }),
  });
  if (receipt.kind === "replay")
    return receipt.result as { eventId: string; version: number };
  const app = await lockJobApplicationForEventCreation(t, input);
  if (!app) throw new JobApplicationUnavailableError();
  if (app.archived) throw new JobApplicationArchivedError();
  if (app.version !== body.expectedApplicationVersion)
    throw new JobApplicationVersionConflictError(
      body.expectedApplicationVersion,
      app.version,
    );
  const check = await t.db.execute(
    sql`SELECT 1 FROM core.workspace WHERE id=${input.workspaceId}::uuid AND ${body.date}::date<=(transaction_timestamp() AT TIME ZONE timezone)::date`,
  );
  if (!check.rows.length)
    throw new RangeError("Observation date cannot be in the future.");
  const eventId = randomUUID();
  await t.db
    .execute(sql`INSERT INTO career.application_event(id,workspace_id,application_id,event_kind,title,temporal_kind,event_date,status,outcome_notes,completed_at,recorded_by_user_id,actor_kind)
    VALUES(${eventId}::uuid,${input.workspaceId}::uuid,${input.applicationId}::uuid,${body.kind},${body.title},'date',${body.date}::date,'completed',${body.notes || null},clock_timestamp(),${input.userId}::uuid,'user')`);
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "application_event",
    subjectId: eventId,
    subjectVersion: 1,
    operation: "create",
    beforeJson: null,
    afterJson: {
      eventId,
      applicationId: input.applicationId,
      eventKind: body.kind,
      title: body.title,
      eventDate: body.date,
      status: "completed",
      outcomeNotes: body.notes,
    },
    reason: null,
    effectiveDate: body.date,
    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: null,
  });
  const result = { eventId, version: 1 };
  await completeCommandReceipt(t, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredCareerConstraints(t);
  return result;
}
export const recordCareerObservation = (input: Input) =>
  withDomainTransaction(input, (t) =>
    recordCareerObservationInTransaction(t, input),
  );
