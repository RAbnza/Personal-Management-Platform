import Link from "next/link";
import { notFound } from "next/navigation";
import { statementIdentifierSchema as id } from "@/modules/finance/domain/card-statement";
import { getCardInstallmentSetup } from "@/modules/finance/services/read-card-installments";
import { CardInstallmentPlanForm } from "@/components/money/card-installment-form";
import { statementOffset } from "../../statements/_context";
import { installmentContext, installmentPageError } from "../_context";
export default async function NewInstallmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ purchaseActionId?: string; offset?: string }>;
}) {
  const scope = await installmentContext(params),
    q = await searchParams,
    offset = statementOffset(q.offset),
    parsed = q.purchaseActionId ? id.safeParse(q.purchaseActionId) : null;
  if (parsed !== null && !parsed.success) notFound();
  let setup;
  try {
    setup = await getCardInstallmentSetup({
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      cardId: scope.cardId,
      offset,
      ...(parsed?.success ? { purchaseActionId: parsed.data } : {}),
    });
  } catch (e) {
    installmentPageError(e);
    return (
      <p role="alert">
        Recognized purchase evidence could not be loaded. Retry this page.
      </p>
    );
  }
  const base = `/money/cards/${scope.cardId}/installments`;
  return (
    <div className="space-y-6 break-words">
      <Link className="text-link underline" href={base}>
        Provider installment plans
      </Link>
      <h1 className="text-2xl font-semibold">
        Record provider installment plan
      </h1>
      {parsed?.success ? (
        <CardInstallmentPlanForm
          key={setup.purchases[0]!.actionRevisionId}
          setup={setup}
          purchase={setup.purchases[0]!}
          today={scope.today}
        />
      ) : (
        <>
          <p>
            Select an existing recognized purchase. A regular purchase remains
            the default; installment evidence is optional and never repeats
            spending.
          </p>
          <ul>
            {setup.purchases.map((p) => (
              <li key={p.actionId}>
                <Link
                  className="inline-flex min-h-11 text-link underline"
                  href={`${base}/new?purchaseActionId=${p.actionId}`}
                >
                  {p.description} — provider posted {p.postingDate}
                </Link>
              </li>
            ))}
          </ul>
          {setup.hasMore && (
            <Link
              className="inline-flex min-h-11 text-link underline"
              href={`?offset=${offset + 100}`}
            >
              Older recognized purchase choices
            </Link>
          )}
        </>
      )}
    </div>
  );
}
