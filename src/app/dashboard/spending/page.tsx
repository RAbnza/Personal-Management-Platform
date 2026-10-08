import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import {
  getSpendingDetail,
  spendingDetailQuerySchema,
} from "@/modules/reporting/services/get-spending-detail";
import { formatMoneyMinorUnits } from "@/shared/money-display";
export default async function SpendingDetail({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());
  if (bootstrap.kind === "unauthorized") redirect("/auth/sign-in");
  if (bootstrap.kind === "unavailable")
    return (
      <p role="alert">
        Private workspace unavailable. <Link href="/">Retry Dashboard</Link>
      </p>
    );
  const { user, workspace, preference } = bootstrap;
  let data = null;
  try {
    data = await getSpendingDetail({
      userId: user.id,
      workspaceId: workspace.id,
      query: spendingDetailQuerySchema.parse(await searchParams),
    });
  } catch {}
  const back = data
    ? `/?${new URLSearchParams({ period: "custom", startDate: data.period.startDate, endDate: data.period.endDate })}`
    : "/";
  return (
    <AppShell
      pageTitle="Spending detail"
      activePath="/"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-5">
        <Link
          className="inline-flex min-h-11 items-center text-link underline"
          href={back}
        >
          Back to Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">Recognized spending detail</h1>
        {data ? (
          <Panel
            title={`${data.period.startDate} through ${data.period.endDate}`}
            description="Signed posting contributions include original, reversal and replacement evidence. Refunds/waivers use their actual dates; cash principal and internal transfers are excluded."
          >
            <p className="font-semibold">
              Gross{" "}
              {formatMoneyMinorUnits(data.currency, data.summary.grossMinor)} ·
              Offsets{" "}
              {formatMoneyMinorUnits(data.currency, data.summary.offsetsMinor)}{" "}
              · Net{" "}
              {formatMoneyMinorUnits(data.currency, data.summary.netMinor)}
            </p>
            <p className="my-3 text-sm text-muted-foreground">
              Tracked records only. Earlier history before account/debt opening
              cutoffs may be missing; consult Dashboard coverage. Financial
              revision {data.financialRevision} · {data.definitionVersion} ·{" "}
              {data.timezone}
            </p>
            {data.coverage.periodBeforeCutoff && (
              <p className="my-3 text-sm font-medium text-warning">
                This period reaches an opening cutoff. Earlier history was not
                supplied; spending coverage is incomplete.
              </p>
            )}
            <details className="my-3">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold">
                Coverage and source cutoffs
              </summary>
              <p className="text-sm">{data.coverage.scope}</p>
              <ul>
                {data.coverage.cutoffs.map((c) => (
                  <li key={`${c.kind}:${c.recordId}`}>
                    <Link
                      className="inline-flex min-h-11 items-center text-sm text-link underline"
                      href={
                        c.kind === "account"
                          ? `/money/accounts/${c.recordId}/history`
                          : `/money/debts/${c.recordId}`
                      }
                    >
                      {c.name} ·{" "}
                      {c.cutoffDate
                        ? `Opening cutoff ${c.cutoffDate}`
                        : "Tracked from origination"}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
            {data.items.length === 0 ? (
              <p>No recognized spending contributions in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Recognized spending posting contributions
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Effective date",
                        "Source",
                        "Classification / category",
                        "Evidence",
                        "Signed amount",
                      ].map((h) => (
                        <th className="p-3" scope="col" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((p) => (
                      <tr key={p.postingId} className="border-t border-border">
                        <td className="p-3 whitespace-nowrap">
                          {p.effectiveDate}
                        </td>
                        <td className="p-3">
                          <Link
                            className="inline-flex min-h-11 items-center text-link underline"
                            href={`/money/actions/${p.actionId}`}
                          >
                            {p.description}
                          </Link>
                        </td>
                        <td className="p-3">
                          {p.expenseClass.replaceAll("_", " ")} ·{" "}
                          {p.category ?? "Uncategorized"}
                        </td>
                        <td className="p-3">
                          {p.journalRole} · revision {p.revisionNo}
                        </td>
                        <td className="p-3 whitespace-nowrap tabular-nums">
                          {formatMoneyMinorUnits(data.currency, p.amountMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.nextCursor && (
              <Link
                className="inline-flex min-h-11 items-center text-link underline"
                href={`/dashboard/spending?${new URLSearchParams({ startDate: data.period.startDate, endDate: data.period.endDate, after: data.nextCursor })}`}
              >
                Next contributions
              </Link>
            )}
          </Panel>
        ) : (
          <Panel title="Spending detail unavailable">
            <p role="alert">
              Check the period dates or retry to read the source records.
            </p>
            <Link href="/" className="text-link underline">
              Return to Dashboard filters
            </Link>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
