import Link from "next/link";
import { listCardStatements } from "@/modules/finance/services/read-card-statements";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  statementContext,
  statementOffset,
  statementPageError,
} from "./_context";
export default async function StatementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ offset?: string }>;
}) {
  const scope = await statementContext(params),
    offset = statementOffset((await searchParams).offset);
  let data;
  try {
    data = await listCardStatements({ ...scope, offset });
  } catch (e) {
    statementPageError(e);
    return <p role="alert">Statements could not be loaded. Retry this page.</p>;
  }
  const base = `/money/cards/${scope.cardId}/statements`,
    money = (n: string) => formatMoneyMinorUnits(data.card.currency, n);
  return (
    <div className="space-y-5 break-words">
      <Link
        href={`/money/cards/${scope.cardId}`}
        className="text-link underline"
      >
        {data.card.name}
      </Link>
      <h1 className="text-2xl font-semibold">Provider statements</h1>
      <p>
        Verified historical evidence. Statements do not change spending, cash or
        card liability.
      </p>
      <Link
        href={`${base}/new`}
        className="inline-flex min-h-11 items-center text-link underline"
      >
        Record verified statement
      </Link>
      <ol className="divide-y divide-border">
        {data.items.map((s) => (
          <li key={s.statementId} className="space-y-2 py-4">
            <Link
              href={`${base}/${s.statementId}`}
              className="text-link underline"
            >
              Statement {s.statementDate} · Revision {s.version}
            </Link>
            <p>
              Cycle {s.cycleStart} to {s.cycleEnd}; due {s.dueDate}
            </p>
            <p>
              Historical balance {money(s.balanceMinor)} · Minimum due{" "}
              {money(s.minimumDueMinor)}
            </p>
            {s.providerReference && (
              <p>Provider reference: {s.providerReference}</p>
            )}
          </li>
        ))}
      </ol>
      {!data.items.length && <p>No verified statements recorded.</p>}
      {data.hasMore && (
        <Link href={`?offset=${offset + 25}`} className="text-link underline">
          Older statements
        </Link>
      )}
    </div>
  );
}
