import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CardCommandForm } from "@/components/money/card-command-form";
import { getCardCommandSetup } from "@/modules/finance/services/read-card-command-setup";
import {
  statementContext,
  statementOffset,
  statementPageError,
} from "../../statements/_context";
export default async function CardCommandPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ purchaseActionId?: string; offset?: string }>;
}) {
  const scope = await statementContext(params),
    q = await searchParams,
    offset = statementOffset(q.offset);
  if (q.purchaseActionId && !z.uuid().safeParse(q.purchaseActionId).success)
    notFound();
  let setup;
  try {
    setup = await getCardCommandSetup({
      ...scope,
      purchaseActionId: q.purchaseActionId,
      offset,
    });
  } catch (e) {
    statementPageError(e);
    return (
      <p role="alert">Card evidence could not be loaded. Retry this page.</p>
    );
  }
  const base = `/money/cards/${scope.cardId}/commands/new`;
  return (
    <div className="space-y-6 break-words">
      <Link
        href={`/money/cards/${scope.cardId}`}
        className="text-link underline"
      >
        {setup.card.name}
      </Link>
      <h1 className="text-2xl font-semibold">
        Record card payment, charge or refund
      </h1>
      <p>
        Record actual posted evidence. Payments move cash without additional
        spending. Refunds offset spending. No future charge or provider
        allocation is inferred.
      </p>
      <CardCommandForm
        key={q.purchaseActionId ?? "unlinked"}
        setup={setup}
        purchaseActionId={q.purchaseActionId}
      />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          Link a refund to an originating purchase
        </h2>
        <p>Select a purchase, then choose Card purchase refund above.</p>
        <ul>
          {setup.purchases.map((p) => (
            <li key={p.actionId}>
              <Link
                href={`${base}?purchaseActionId=${p.actionId}`}
                className="inline-flex min-h-11 text-link underline"
              >
                {p.description} — provider posted {p.postingDate}
              </Link>
            </li>
          ))}
        </ul>
        {q.purchaseActionId && (
          <Link
            href={base}
            className="inline-flex min-h-11 text-link underline"
          >
            Use confirmed classification without a purchase link
          </Link>
        )}
        {setup.purchasesHaveMore && (
          <Link
            href={`${base}?offset=${offset + 100}`}
            className="inline-flex min-h-11 text-link underline"
          >
            Older purchase choices
          </Link>
        )}
      </section>
    </div>
  );
}
