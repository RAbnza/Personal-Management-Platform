import Link from "next/link";
import { notFound } from "next/navigation";
import { sharingActor } from "../_actor";
import { getGroup } from "@/modules/sharing/services/read-groups";
import { id } from "@/modules/sharing/domain/sharing";
import { GroupAdmin } from "@/components/sharing/group-admin";
import { SettlementPanel } from "@/components/sharing/settlements";
import { formatMoneyMinorUnits } from "@/shared/money-display";
const money = (v: string) => formatMoneyMinorUnits("PHP", v);
export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { groupId } = await params,
    { cursor } = await searchParams;
  if (
    !id.safeParse(groupId).success ||
    (cursor && !id.safeParse(cursor).success)
  )
    notFound();
  const data = await getGroup(await sharingActor(), groupId, cursor),
    { group } = data;
  return (
    <div className="min-w-0 space-y-6 break-words">
      <h1 className="text-2xl font-semibold">
        {group.name}
        {group.archived ? " · Archived" : ""}
      </h1>
      <p>
        {group.active
          ? "Confirmed current balances after refunds and confirmed settlements. Positive means gets back; negative means owes."
          : "Historical access: balances below cover only your visible bills and their current revisions. Unrelated later activity is hidden."}
      </p>
      <a
        href={`/api/v1/sharing/export?groupId=${group.id}`}
        className="inline-flex min-h-11 items-center text-link underline"
      >
        Download authorized group history (JSON)
      </a>
      {data.ledger && (
        <p>
          Gross group spending{" "}
          {money(
            data.ledger.sources
              .reduce((n, p) => n + BigInt(p.shareMinor), 0n)
              .toString(),
          )}{" "}
          · Share refunds{" "}
          {money(
            data.ledger.sources
              .reduce((n, p) => n + BigInt(p.refundShareMinor), 0n)
              .toString(),
          )}{" "}
          · Net group spending{" "}
          {money(
            data.ledger.sources
              .reduce(
                (n, p) => n + BigInt(p.shareMinor) - BigInt(p.refundShareMinor),
                0n,
              )
              .toString(),
          )}
          . These group amounts are separate from each person’s private adopted
          spending.
        </p>
      )}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">People and bill positions</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.participants.map((p) => (
            <li key={p.id} className="rounded-card border border-border p-4">
              <Link
                href={`/sharing/${group.id}/people/${p.id}`}
                className="text-link underline"
              >
                {p.displayName}
              </Link>
              <p>
                {p.identityKind === "manual"
                  ? "Not registered · recorded manually"
                  : (p.role ?? "Historical participant")}
              </p>
              <p>
                Paid {money(p.paidMinor)} · Share {money(p.shareMinor)}
              </p>
              {data.ledger && (
                <p>
                  Confirmed sent{" "}
                  {money(
                    data.ledger.settlements
                      .filter(
                        (s) => s.state === "confirmed" && s.senderId === p.id,
                      )
                      .reduce((n, s) => n + BigInt(s.amountMinor), 0n)
                      .toString(),
                  )}{" "}
                  · Confirmed received{" "}
                  {money(
                    data.ledger.settlements
                      .filter(
                        (s) =>
                          s.state === "confirmed" && s.recipientId === p.id,
                      )
                      .reduce((n, s) => n + BigInt(s.amountMinor), 0n)
                      .toString(),
                  )}{" "}
                  · Projected net after pending reports{" "}
                  {money(
                    data.ledger.projected.positions.find(
                      (s) => s.participantId === p.id,
                    )?.netMinor ?? "0",
                  )}
                </p>
              )}
              <p className="font-semibold">
                {BigInt(p.netMinor) > 0n
                  ? "Gets back "
                  : BigInt(p.netMinor) < 0n
                    ? "Owes "
                    : "Balanced "}
                {money(
                  (BigInt(p.netMinor) < 0n
                    ? -BigInt(p.netMinor)
                    : BigInt(p.netMinor)
                  ).toString(),
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Bills</h2>
        {group.active && !group.archived && (
          <Link
            href={`/sharing/${group.id}/expenses/new`}
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Add shared expense
          </Link>
        )}
        <ul className="divide-y divide-border">
          {data.bills.map((b) => (
            <li key={b.id} className="py-3">
              <Link
                href={`/sharing/${group.id}/expenses/${b.id}`}
                className="text-link underline"
              >
                {b.description}
              </Link>
              <p>
                {b.expenseDate} · {money(b.totalMinor)} · Revision{" "}
                {b.revisionNo}
              </p>
            </li>
          ))}
        </ul>
        {data.nextCursor && (
          <Link
            href={`/sharing/${group.id}?cursor=${data.nextCursor}`}
            className="text-link underline"
          >
            More bills
          </Link>
        )}
      </section>
      <SettlementPanel data={data} />
      <GroupAdmin data={data} />
    </div>
  );
}
