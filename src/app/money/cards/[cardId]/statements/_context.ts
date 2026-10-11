import { notFound } from "next/navigation";
import { z } from "zod";
import { CreditCardUnavailableError } from "@/modules/finance/domain/credit-card";
import { StatementUnavailableError } from "@/modules/finance/domain/card-statement";
import { debtWorkspace } from "../../../debts/_workspace";
export async function statementContext(
  params: Promise<{ cardId: string; statementId?: string }>,
) {
  const { user, workspace } = await debtWorkspace(),
    p = await params;
  if (
    !z.uuid().safeParse(p.cardId).success ||
    (p.statementId !== undefined && !z.uuid().safeParse(p.statementId).success)
  )
    notFound();
  return { userId: user.id, workspaceId: workspace.id, ...p };
}
export function statementPageError(e: unknown) {
  if (
    e instanceof CreditCardUnavailableError ||
    e instanceof StatementUnavailableError
  )
    notFound();
}
export function statementOffset(value?: string) {
  const p = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .safeParse(value ?? 0);
  if (!p.success) notFound();
  return p.data;
}
