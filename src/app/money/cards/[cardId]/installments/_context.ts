import { notFound } from "next/navigation";
import { statementIdentifierSchema as id } from "@/modules/finance/domain/card-statement";
import { CardInstallmentUnavailableError } from "@/modules/finance/domain/card-installment";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { debtWorkspace } from "../../../debts/_workspace";
export async function installmentContext(
  params: Promise<{ cardId: string; planId?: string }>,
) {
  const { user, workspace } = await debtWorkspace(),
    raw = await params,
    card = id.safeParse(raw.cardId),
    plan = raw.planId === undefined ? null : id.safeParse(raw.planId);
  if (!card.success || (plan !== null && !plan.success)) notFound();
  return {
    userId: user.id,
    workspaceId: workspace.id,
    cardId: card.data,
    ...(plan?.success ? { planId: plan.data } : {}),
    today: new Intl.DateTimeFormat("en-CA", {
      timeZone: workspace.timezone,
    }).format(new Date()),
  };
}
export function installmentPageError(e: unknown) {
  if (
    e instanceof CardInstallmentUnavailableError ||
    e instanceof CreditCardUnavailableError
  )
    notFound();
}
