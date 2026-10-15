import Link from "next/link";
import { notFound } from "next/navigation";
import { sharingActor } from "../../../_actor";
import { getGroup, getBill } from "@/modules/sharing/services/read-groups";
import { id } from "@/modules/sharing/domain/sharing";
import { getPrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";
import { getAdoptionPreview } from "@/modules/finance/services/adopt-group-expense";
import { SharedBillForm } from "@/components/sharing/bill-form";
import { AdoptionPanel } from "@/components/sharing/adoption-panel";
import { formatMoneyMinorUnits } from "@/shared/money-display";
export default async function BillPage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const { groupId, expenseId } = await params;
  if (!id.safeParse(groupId).success || !id.safeParse(expenseId).success)
    notFound();
  const actor = await sharingActor();
  const [data, history, setup] = await Promise.all([
      getGroup(actor, groupId),
      getBill(actor, groupId, expenseId),
      getPrivateSharingSetup(actor),
    ]),
    current = history[0]!;
  const involved =
    current.contributions.some(
      (p) => p.participantId === data.group.participantId,
    ) ||
    current.shares.some(
      (p) =>
        p.participantId === data.group.participantId &&
        BigInt(p.amountMinor) > 0n,
    );
  const preview = involved
    ? await getAdoptionPreview(actor, groupId, expenseId)
    : null;
  const name = (id: string) =>
    data.participants.find((p) => p.id === id)?.displayName ??
    "Historical participant";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{current.description}</h1>
      <Link href={`/sharing/${groupId}`} className="text-link underline">
        Back to group
      </Link>
      {history.map((b, i) => (
        <section
          key={b.revisionId}
          className="space-y-3 rounded-card border border-border p-4"
        >
          <h2 className="text-xl font-semibold">
            {i === 0 ? "Current bill" : "Historical bill"} · Revision{" "}
            {b.revisionNo}
          </h2>
          <p>
            {b.expenseDate} · {formatMoneyMinorUnits("PHP", b.totalMinor)} ·{" "}
            {b.splitMethod} shares
          </p>
          <h3 className="font-semibold">Payer contributions</h3>
          <ul>
            {b.contributions.map((p) => (
              <li key={p.participantId}>
                {name(p.participantId)}:{" "}
                {formatMoneyMinorUnits("PHP", p.amountMinor)}
              </li>
            ))}
          </ul>
          <h3 className="font-semibold">Participant shares</h3>
          <ul>
            {b.shares.map((p) => (
              <li key={p.participantId}>
                {name(p.participantId)}:{" "}
                {formatMoneyMinorUnits("PHP", p.amountMinor)}
                {p.roundingExtraMinor ? " · extra centavo" : ""}
              </li>
            ))}
          </ul>
          <h3 className="font-semibold">Bill positions</h3>
          <ul>
            {b.positions.map((p) => (
              <li key={p.participantId}>
                {name(p.participantId)}:{" "}
                {formatMoneyMinorUnits("PHP", p.netMinor)} · positive gets back,
                negative owes
              </li>
            ))}
          </ul>
          {b.reason && <p>Revision reason: {b.reason}</p>}
          {b.notes && <p className="whitespace-pre-wrap">{b.notes}</p>}
        </section>
      ))}
      {preview && <AdoptionPanel preview={preview} setup={setup} />}
      {data.group.active &&
        !data.group.archived &&
        current.creatorId === data.group.participantId && (
          <details>
            <summary className="min-h-11 cursor-pointer font-semibold">
              Review a new bill revision
            </summary>
            <p>
              Previously approved private ledgers retain their accepted evidence
              and may need correction.
            </p>
            <SharedBillForm data={data} setup={setup} initial={current} />
          </details>
        )}
    </div>
  );
}
