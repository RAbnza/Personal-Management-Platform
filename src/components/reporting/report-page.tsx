import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import { AuthCard } from "@/components/auth/auth-card";
import { withDomainTransaction } from "@/platform/db";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  getFinancialReport,
  getCareerReport,
  getFinancialDetail,
} from "@/modules/reporting/services/get-reports";
import {
  reportQuerySchema,
  financialDetailQuerySchema,
  financialMetrics,
  reportDates,
  ReportLimitError,
} from "@/modules/reporting/domain/reports";
import { reportSearchParams } from "@/modules/reporting/domain/search-params";
import { readExportHistory } from "@/modules/reporting/repositories/export-repository";
import { PeriodFilterBar } from "./period-filter-bar";
import { CsvExportControl } from "./csv-export-control";
import { FinancialReportView } from "./financial-report-view";
import { CareerReportView } from "./career-report-view";
type Search = Promise<Record<string, string | string[] | undefined>>;
export async function ReportPage({
  view,
  searchParams,
}: {
  view: "financial" | "career" | "detail";
  searchParams: Search;
}) {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());
  if (bootstrap.kind === "unauthorized") redirect("/auth/sign-in");
  if (bootstrap.kind === "unavailable")
    return (
      <AuthCard
        eyebrow="Private workspace"
        title="Reports unavailable"
        description="Private workspace services could not be loaded."
      >
        <Link
          className="inline-flex min-h-11 items-center text-link underline"
          href="/reports"
        >
          Retry Reports
        </Link>
      </AuthCard>
    );
  const { user, workspace, preference, modules } = bootstrap,
    actor = { userId: user.id, workspaceId: workspace.id };
  let financial = null,
    career = null,
    detail = null,
    error: string | null = null;
  try {
    const raw = reportSearchParams(await searchParams);
    if (view === "detail")
      detail = await getFinancialDetail({
        ...actor,
        query: financialDetailQuerySchema.parse(raw),
      });
    else if (view === "career")
      career = await getCareerReport({
        ...actor,
        query: reportQuerySchema.parse(raw),
      });
    else
      financial = await getFinancialReport({
        ...actor,
        query: reportQuerySchema.parse(raw),
      });
  } catch (e) {
    error =
      e instanceof ReportLimitError
        ? "Choose a smaller range (up to 10,000 detail rows)."
        : e instanceof z.ZodError || e instanceof RangeError
          ? "Choose supported filters and valid ordered dates, at most 366 days. Career as-of dates cannot be in the future."
          : "Report sources could not be loaded. Retry to read a fresh snapshot.";
  }
  const data = financial ?? career ?? detail,
    dates = data ? reportDates(data.period, data.asOfDate).toString() : "";
  const detailSelection = detail
    ? new URLSearchParams(detail.selection).toString()
    : "";
  const history =
    view !== "detail" && data
      ? await withDomainTransaction(
          actor,
          (t) => readExportHistory(t, workspace.id),
          { readOnlySnapshot: true },
        ).catch(() => null)
      : null;
  return (
    <AppShell
      pageTitle="Reports"
      activePath="/reports"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6">
        <header>
          <p className="text-sm font-medium text-link">Private workspace</p>
          <h1 className="mt-2 text-2xl font-semibold">
            {view === "career"
              ? "Career report"
              : view === "detail"
                ? "Financial contribution detail"
                : "Financial report"}
          </h1>
          <p className="mt-3 text-muted-foreground">
            Exact source definitions, supporting records and clearly scoped
            exports.
          </p>
          <nav aria-label="Report views" className="mt-3 flex flex-wrap gap-4">
            <Link
              aria-current={view === "financial" ? "page" : undefined}
              className="inline-flex min-h-11 items-center text-link underline"
              href={`/reports/financial${dates ? `?${dates}` : ""}`}
            >
              Financial
            </Link>
            <Link
              aria-current={view === "career" ? "page" : undefined}
              className="inline-flex min-h-11 items-center text-link underline"
              href={`/reports/career${dates ? `?${dates}` : ""}`}
            >
              Career
            </Link>
            <Link
              className="inline-flex min-h-11 items-center text-link underline"
              href="/"
            >
              Dashboard
            </Link>
          </nav>
        </header>
        {modules.some((m) => !m.enabled) && (
          <p className="text-sm text-muted-foreground">
            Module hiding affects navigation. These reports and owned supporting
            sources remain available.
          </p>
        )}
        {view !== "detail" && (
          <PeriodFilterBar
            key={dates}
            path={`/reports/${view}`}
            period={data?.period.kind ?? "month"}
            anchorDate={data?.filters.anchorDate ?? data?.today ?? ""}
            startDate={data?.period.startDate ?? ""}
            endDate={data?.period.endDate ?? ""}
            {...(view === "career" ? { asOfDate: data?.asOfDate ?? "" } : {})}
          />
        )}
        {error && (
          <Panel title="Report unavailable">
            <p role="alert">{error}</p>
            <Link
              className="inline-flex min-h-11 items-center text-link underline"
              href={`/reports/${view === "detail" ? "financial" : view}`}
            >
              Reset filters and retry
            </Link>
          </Panel>
        )}
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.period.startDate} through {data.period.endDate} ·{" "}
            {data.currency} · {data.timezone} · generated {data.generatedAt} ·
            financial revision {data.financialRevision} · definition{" "}
            {data.definitionVersion}
            {view === "career" ? ` · observation cutoff ${data.asOfDate}` : ""}
          </p>
        )}
        {financial && <FinancialReportView data={financial} />}{" "}
        {career && <CareerReportView data={career} />}
        {detail && (
          <Panel
            title={financialMetrics[detail.metric]}
            description="One signed immutable posting contribution per row; original, reversal and replacement evidence all remain visible."
          >
            <p className="font-semibold">
              Exact total:{" "}
              {formatMoneyMinorUnits(detail.currency, detail.amountMinor)} ·{" "}
              {detail.count} posting contributions across all pages.
            </p>
            <p className="mt-2 text-sm">
              {detail.metric.startsWith("opening_")
                ? "Effective dates before period start."
                : [
                      "closing_cash",
                      "closing_liability",
                      "clearing",
                      "tracked_net",
                    ].includes(detail.metric)
                  ? "Effective dates through period end."
                  : "Effective dates within the selected period."}{" "}
              {detail.categoryId
                ? `Category filter: ${detail.categoryId}.`
                : ""}{" "}
              {Object.entries(detail.selection)
                .map(([key, value]) => `${key}: ${value}`)
                .join(" · ")}{" "}
              {detail.coverage.scope}
            </p>
            {detail.coverage.periodBeforeCutoff && (
              <p className="mt-2 text-warning">
                This period reaches an opening cutoff; earlier history coverage
                is incomplete.
              </p>
            )}
            {detail.items.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Exact financial posting contributions
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Effective date",
                        "Source action",
                        "Ledger / classification",
                        "Revision evidence",
                        "Signed contribution",
                      ].map((h) => (
                        <th key={h} scope="col" className="p-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((p) => (
                      <tr key={p.postingId} className="border-t border-border">
                        <td className="p-3">{p.effectiveDate}</td>
                        <th scope="row" className="p-3">
                          <Link
                            href={`/money/actions/${p.actionId}`}
                            className="inline-flex min-h-11 items-center text-link underline"
                          >
                            {p.description}
                          </Link>
                        </th>
                        <td className="p-3">
                          {p.ledgerName} · {p.category ?? "Uncategorized"} ·{" "}
                          {p.expenseClass} / {p.incomeClass} / {p.cashFlowKind}
                          {p.liabilityComponent
                            ? ` / ${p.liabilityComponent}`
                            : ""}
                        </td>
                        <td className="p-3">
                          Revision {p.revisionNo} · {p.journalRole}
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {p.postingId}
                          </span>
                        </td>
                        <td className="p-3 tabular-nums">
                          {formatMoneyMinorUnits(
                            detail.currency,
                            p.amountMinor,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3">No matching supplied contributions.</p>
            )}
            {detail.nextCursor && (
              <Link
                href={`/reports/financial/detail?${dates}&metric=${detail.metric}${detail.categoryId ? `&categoryId=${detail.categoryId}` : ""}&${detailSelection}&after=${detail.nextCursor}`}
                className="inline-flex min-h-11 items-center text-link underline"
              >
                Next contribution page
              </Link>
            )}
          </Panel>
        )}
        {data && view !== "detail" && (
          <Panel
            title="CSV export"
            description="A fresh consistent snapshot using this exact date range; later writes can change its source revision."
          >
            <CsvExportControl dates={dates} />
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer font-medium">
                Recent prepared exports (30-day provenance)
              </summary>
              {history === null ? (
                <p>Export history unavailable. Retry this page to review it.</p>
              ) : history.length ? (
                <ul>
                  {history.map((h) => (
                    <li key={h.exportRunId} className="py-2 text-sm">
                      {h.kind} · {h.generatedAt} · {h.rowCount} data rows ·
                      revision {h.financialRevision} · {h.exportRunId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No CSV prepared in the retained history.</p>
              )}
              <p className="text-sm text-muted-foreground">
                Prepared means CSV generation finished, not browser download
                confirmation. Old files are not stored for redownload.
              </p>
            </details>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
