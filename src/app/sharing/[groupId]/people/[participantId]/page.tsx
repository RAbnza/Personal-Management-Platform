import { BreadcrumbRecords } from "@/components/shell/breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sharingActor } from "../../../_actor";
import { getGroup } from "@/modules/sharing/services/read-groups";
import { id } from "@/modules/sharing/domain/sharing";
import { formatMoneyMinorUnits } from "@/shared/money-display";
export default async function PersonPage({
  params,
}: {
  params: Promise<{ groupId: string; participantId: string }>;
}) {
  const { groupId, participantId } = await params;
  if (!id.safeParse(groupId).success || !id.safeParse(participantId).success)
    notFound();
  const actor = await sharingActor(),
    data = await getGroup(actor, groupId),
    person = data.participants.find((p) => p.id === participantId);
  if (!person) notFound();
  const rows = (data.ledger?.sources ?? [])
    .filter((p) => p.participantId === participantId)
    .slice(0, 100);
  return (
    <div className="space-y-5">
      <BreadcrumbRecords
        path={`/sharing/${groupId}/people/${participantId}`}
        labels={{
          [`/sharing/${groupId}`]: data.group.name,
          [`/sharing/${groupId}/people/${participantId}`]: person.displayName,
        }}
      />
      <h1 className="text-2xl font-semibold">{person.displayName}</h1>
      <Link href={`/sharing/${groupId}`} className="text-link underline">
        Back to group
      </Link>
      <p>
        {data.group.active
          ? "Current group bills"
          : "Authorized historical bills"}{" "}
        · Paid {formatMoneyMinorUnits("PHP", person.paidMinor)} · Share{" "}
        {formatMoneyMinorUnits("PHP", person.shareMinor)} · Net{" "}
        {formatMoneyMinorUnits("PHP", person.netMinor)}
      </p>
      <h2 className="text-xl font-semibold">Source bill breakdown</h2>
      <p>
        Latest 100 visible source bills. Totals above include all visible
        effective bills.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.expenseId}>
            <Link
              href={`/sharing/${groupId}/expenses/${r.expenseId}`}
              className="text-link underline"
            >
              {data.bills.find((b) => b.id === r.expenseId)?.description ??
                `Source bill ${r.expenseId}`}
            </Link>
            <p>
              Paid {formatMoneyMinorUnits("PHP", r.paidMinor)} · Share{" "}
              {formatMoneyMinorUnits("PHP", r.shareMinor)} · Refund received{" "}
              {formatMoneyMinorUnits("PHP", r.refundReceivedMinor)} · Share
              credit {formatMoneyMinorUnits("PHP", r.refundShareMinor)}
            </p>
          </li>
        ))}
      </ul>
      <h2 className="text-xl font-semibold">Settlement breakdown</h2>
      <ul>
        {data.ledger?.settlements
          .filter((s) => [s.senderId, s.recipientId].includes(participantId))
          .map((s) => (
            <li key={s.id}>
              <Link
                className="text-link underline"
                href={`/sharing/${groupId}#settlement-${s.id}`}
              >
                {s.paymentDate} ·{" "}
                {s.senderId === participantId ? "Sent" : "Received"}{" "}
                {formatMoneyMinorUnits("PHP", s.amountMinor)} · {s.state}
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
