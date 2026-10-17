import { BreadcrumbRecords } from "@/components/shell/breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sharingActor } from "../../../_actor";
import { getGroup, getBill } from "@/modules/sharing/services/read-groups";
import { id, SharingUnavailableError } from "@/modules/sharing/domain/sharing";
import { getPrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";
import { getAdoptionPreview } from "@/modules/finance/services/adopt-group-expense";
import { SharedBillForm } from "@/components/sharing/bill-form";
import { AdoptionPanel } from "@/components/sharing/adoption-panel";
import { RefundPanel } from "@/components/sharing/settlements";
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
  const preview = await getAdoptionPreview(actor, groupId, expenseId).catch(
    (e) => {
      if (e instanceof SharingUnavailableError) return null;
      throw e;
    },
  );
  const name = (id: string) =>
    data.participants.find((p) => p.id === id)?.displayName ??
    "Historical participant";
  return (
    <div className="min-w-0 space-y-6 break-words">
      <BreadcrumbRecords
        path={`/sharing/${groupId}/expenses/${expenseId}`}
        labels={{
          [`/sharing/${groupId}`]: data.group.name,
          [`/sharing/${groupId}/expenses/${expenseId}`]: current.description,
        }}
      />
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
          <h3 className="font-semibold">
            Bill positions before refunds and settlements
          </h3>
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
      <RefundPanel
        data={data}
        expenseId={expenseId}
        revisionId={current.revisionId}
        creatorId={current.creatorId}
      />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          Settlement allocations and remaining source positions
        </h2>
        <p>
          These positions explain this bill after refunds and confirmed
          allocations. Reciprocal obligations on other bills may reduce the
          relationship amount due; use the group’s confirmed relationship
          balance before paying.
        </p>
        <ul>
          {data.participants.map((p) => {
            const n = (data.ledger?.edges ?? [])
              .filter((e) => e.expenseId === expenseId)
              .reduce(
                (n, e) =>
                  n +
                  (e.recipientId === p.id
                    ? BigInt(e.amountMinor)
                    : e.senderId === p.id
                      ? -BigInt(e.amountMinor)
                      : 0n),
                0n,
              );
            return n !== 0n ? (
              <li key={p.id}>
                {p.displayName}: {formatMoneyMinorUnits("PHP", n.toString())}
              </li>
            ) : null;
          })}
        </ul>
        <ul>
          {data.ledger?.settlements
            .filter((s) => s.allocations.some((a) => a.expenseId === expenseId))
            .map((s) => (
              <li key={s.id}>
                <Link
                  className="text-link underline"
                  href={`/sharing/${groupId}#settlement-${s.id}`}
                >
                  {s.paymentDate} · {name(s.senderId)} → {name(s.recipientId)} ·{" "}
                  {s.state} ·{" "}
                  {formatMoneyMinorUnits(
                    "PHP",
                    s.allocations.find((a) => a.expenseId === expenseId)!
                      .amountMinor,
                  )}
                </Link>
              </li>
            ))}
        </ul>
      </section>
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
