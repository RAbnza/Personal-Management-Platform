import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { getDebtDetailInTransaction } from "./read-debts";
import {
  readScheduleContext,
  readSchedulePaymentPools,
} from "../repositories/debt-schedule-repository";
import type { ScheduleRevisionSetup } from "../domain/debt-schedule-revision";
export async function getDebtScheduleSetup(input: {
  userId: string;
  workspaceId: string;
  debtId: string;
}): Promise<ScheduleRevisionSetup> {
  const parsed = z
    .object({ userId: z.uuid(), workspaceId: z.uuid(), debtId: z.uuid() })
    .strict()
    .parse(input);
  return withDomainTransaction(
    parsed,
    async (t) => {
      const detail = await getDebtDetailInTransaction(t, parsed);
      if (!detail.debt.scheduleVersionId)
        throw new RangeError("A finalized schedule is required.");
      const context = {
        ...parsed,
        scheduleVersionId: detail.debt.scheduleVersionId,
      };
      const header = await readScheduleContext(t, context);
      const pools = await readSchedulePaymentPools(t, context);
      return { detail, frequency: header.frequency, pools };
    },
    { readOnlySnapshot: true },
  );
}
