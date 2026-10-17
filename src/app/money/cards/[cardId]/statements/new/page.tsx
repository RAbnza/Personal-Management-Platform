import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { CardStatementForm } from "@/components/money/card-statement-form";
import { getStatementEntrySetup } from "@/modules/finance/services/read-card-statements";
import {
  statementContext,
  statementOffset,
  statementPageError,
} from "../_context";
export default async function NewStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ candidateOffset?: string }>;
}) {
  const scope = await statementContext(params),
    offset = statementOffset((await searchParams).candidateOffset);
  let data;
  try {
    data = await getStatementEntrySetup({ ...scope, offset });
  } catch (e) {
    statementPageError(e);
    return (
      <p role="alert">Statement setup could not be loaded. Retry this page.</p>
    );
  }
  return (
    <div className="space-y-5">
      <Link
        href={`/money/cards/${scope.cardId}/statements`}
        className="text-link underline"
      >
        Statements for {data.card.name}
      </Link>
      <ScreenHeader scope="Money" title="Record verified statement" />
      {data.hasMore && (
        <Link
          href={`?candidateOffset=${offset + 100}`}
          className="text-link underline"
        >
          Load older purchase choices before entering statement
        </Link>
      )}
      <CardStatementForm
        cardId={scope.cardId}
        currency={data.card.currency}
        candidates={data.items}
      />
    </div>
  );
}
