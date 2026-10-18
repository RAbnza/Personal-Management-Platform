import { WorkspaceViews } from "@/components/ui/workspace-views";
import { BreadcrumbRecords } from "@/components/shell/breadcrumbs";
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
      <BreadcrumbRecords
        path={`/sharing/${groupId}`}
        labels={{ [`/sharing/${groupId}`]: group.name }}
      />
      <header className="rounded-card bg-[var(--teal-surface)] p-5 sm:p-7">
        <p className="text-sm font-semibold text-muted-foreground">
          Shared workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {group.name}
          {group.archived ? " · Archived" : ""}
        </h1>
        {group.active && !group.archived && (
          <Link
            className="action-link mt-3"
            href={`/sharing/${group.id}/expenses/new`}
          >
            Add shared expense
          </Link>
        )}
      </header>
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
      <WorkspaceViews
        label="Group workspace views"
        views={[
          {
            label: "People and balances",
            content: (
              <>
                {" "}
                <section className="space-y-3">
                  <h2 className="text-xl font-semibold">
                    People and bill positions
                  </h2>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {data.participants.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
                      >
                        <Link
                          href={`/sharing/${group.id}/people/${p.id}`}
                          className="text-lg font-semibold text-link"
                        >
                          {p.displayName}
                        </Link>
                        <p>
                          {p.identityKind === "manual"
                            ? "Not registered · recorded manually"
                            : (p.role ?? "Historical participant")}
                        </p>
                        <p>
                          Paid {money(p.paidMinor)} · Share{" "}
                          {money(p.shareMinor)}
                        </p>
                        {data.ledger && (
                          <details className="text-sm text-muted-foreground">
                            <summary className="min-h-11 cursor-pointer">
                              Payment details and pending projection
                            </summary>
                            <p>
                              Confirmed sent{" "}
                              {money(
                                data.ledger.settlements
                                  .filter(
                                    (s) =>
                                      s.state === "confirmed" &&
                                      s.senderId === p.id,
                                  )
                                  .reduce(
                                    (n, s) => n + BigInt(s.amountMinor),
                                    0n,
                                  )
                                  .toString(),
                              )}{" "}
                              · Confirmed received{" "}
                              {money(
                                data.ledger.settlements
                                  .filter(
                                    (s) =>
                                      s.state === "confirmed" &&
                                      s.recipientId === p.id,
                                  )
                                  .reduce(
                                    (n, s) => n + BigInt(s.amountMinor),
                                    0n,
                                  )
                                  .toString(),
                              )}{" "}
                              · Projected net after pending reports{" "}
                              {money(
                                data.ledger.projected.positions.find(
                                  (s) => s.participantId === p.id,
                                )?.netMinor ?? "0",
                              )}
                            </p>
                          </details>
                        )}
                        <p
                          className={`order-first text-2xl font-semibold tabular-nums ${BigInt(p.netMinor) < 0n ? "text-warning" : "text-primary"}`}
                        >
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
              </>
            ),
          },
          {
            label: "Bills",
            content: (
              <>
                {" "}
                <section className="space-y-3">
                  <h2 id="group-bills" className="text-xl font-semibold">
                    Bills
                  </h2>
                  {group.active && !group.archived && (
                    <Link
                      href={`/sharing/${group.id}/expenses/new`}
                      className="inline-flex min-h-11 items-center text-link underline"
                    >
                      Add shared expense
                    </Link>
                  )}
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {data.bills.map((b) => (
                      <li
                        key={b.id}
                        className="rounded-card border border-border bg-surface p-5"
                      >
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
                      href={`/sharing/${group.id}?cursor=${data.nextCursor}#group-bills`}
                      className="text-link underline"
                    >
                      More bills
                    </Link>
                  )}
                </section>
              </>
            ),
          },
          {
            label: `Payments (${data.ledger?.settlements.filter((s) => s.state === "pending").length ?? 0} pending)`,
            content: <SettlementPanel data={data} />,
          },
          { label: "Manage group", content: <GroupAdmin data={data} /> },
        ]}
      />
    </div>
  );
}
