import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { readReportContext } from "@/modules/reporting/repositories/report-context-repository";
import { addCalendarDays } from "@/modules/reporting/domain/period";
import { CreditCardUnavailableError } from "../domain/credit-card";
import { readCardSurface } from "../repositories/card-surface-repository";

export async function getCardSurface(input: {
  userId: string;
  workspaceId: string;
  cardId?: string;
}) {
  const i = z
    .object({
      userId: z.uuid(),
      workspaceId: z.uuid(),
      cardId: z.uuid().optional(),
    })
    .strict()
    .parse(input);
  return withDomainTransaction(
    i,
    async (t) => {
      const context = await readReportContext(t, i.workspaceId);
      const surface = await readCardSurface(t, i.workspaceId, {
        today: context.today,
        startDate: context.today,
        endDate: addCalendarDays(context.today, 30),
        ...(i.cardId ? { cardId: i.cardId } : {}),
      });
      if (i.cardId && !surface.cards.length)
        throw new CreditCardUnavailableError();
      return surface;
    },
    { readOnlySnapshot: true },
  );
}
