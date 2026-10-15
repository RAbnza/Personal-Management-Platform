import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
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
  const rows = await withDomainTransaction(
    actor,
    async (t) =>
      (
        await t.db.execute<{
          id: string;
          description: string;
          date: string;
          paid: string;
          share: string;
        }>(
          sql`SELECT e.id,r.description,r.expense_date::text AS date,coalesce(p.amount_minor,0)::text AS paid,coalesce(s.amount_minor,0)::text AS share FROM sharing.shared_expense e JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id AND r.state='finalized' LEFT JOIN sharing.payer_contribution p ON p.group_id=e.group_id AND p.expense_revision_id=r.id AND p.participant_id=${participantId}::uuid LEFT JOIN sharing.participant_share s ON s.group_id=e.group_id AND s.expense_revision_id=r.id AND s.participant_id=${participantId}::uuid WHERE e.group_id=${groupId}::uuid AND (p.id IS NOT NULL OR s.id IS NOT NULL) ORDER BY r.expense_date DESC,e.id LIMIT 100`,
        )
      ).rows,
    { readOnlySnapshot: true },
  );
  return (
    <div className="space-y-5">
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
          <li key={r.id}>
            <Link
              href={`/sharing/${groupId}/expenses/${r.id}`}
              className="text-link underline"
            >
              {r.description}
            </Link>
            <p>
              {r.date} · Paid {formatMoneyMinorUnits("PHP", r.paid)} · Share{" "}
              {formatMoneyMinorUnits("PHP", r.share)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
