import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Wallet,
  Smartphone,
  Landmark,
  Plus,
  CreditCard,
  BriefcaseBusiness,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Layers3,
} from "lucide-react";
import type { DashboardResult } from "@/modules/dashboard/services/get-dashboard";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { spendingHref } from "@/modules/reporting/domain/period";
import { InfoTip } from "@/components/ui/info-tip";
import { DashboardFilters } from "./dashboard-filters";
import { SpendingCharts } from "./spending-charts";
import { FinancialCoverage } from "./financial-coverage";
import { PlanHighlights } from "./plan-highlights";
import { HorizontalCollection } from "@/components/patterns/horizontal-collection";
import styles from "./home.module.css";

export function DashboardView({
  data,
  moduleEnabled,
}: {
  data: DashboardResult;
  moduleEnabled: {
    money: boolean;
    career: boolean;
    time: boolean;
    trackers?: boolean;
  };
}) {
  const f = data.finance,
    money = (v: string) => formatMoneyMinorUnits(data.currency, v);
  const calendar = `/calendar?${new URLSearchParams({ startDate: data.today, endDate: data.horizon, source: data.filters.source })}`;
  const attentionItem = (item: DashboardResult["attention"][number]) => (
    <li key={item.key}>
      <Link href={item.href} className={styles.attentionLink}>
        <CircleAlert size={17} aria-hidden="true" />
        <span>
          {item.title}
          <small>{item.detail}</small>
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </li>
  );
  const activityItem = (item: DashboardResult["activity"][number]) => (
    <li key={item.key}>
      <Link href={item.href} className={styles.activityLink}>
        <span className={styles.activityIcon}>
          <ArrowUpRight size={18} aria-hidden="true" />
        </span>
        <span>
          <strong>{item.title}</strong>
          <small>{item.detail}</small>
        </span>
        <time dateTime={item.recordedAt}>
          {new Intl.DateTimeFormat("en-PH", {
            timeZone: data.timezone,
            month: "short",
            day: "numeric",
          }).format(new Date(item.recordedAt))}
        </time>
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </li>
  );
  return (
    <div className={styles.homeGrid}>
      <div className={styles.toolbar}>
        <p className={styles.eyebrow}>A LITTLE CLARITY, EVERY DAY</p>
        <details className={styles.filters}>
          <summary>
            View:{" "}
            {data.period.kind === "custom"
              ? "Custom dates"
              : `This ${data.period.kind}`}{" "}
            <CalendarDays size={15} />
          </summary>
          <DashboardFilters
            key={`${data.period.kind}:${data.period.startDate}:${data.filters.source}`}
            period={data.period.kind}
            startDate={data.period.startDate}
            endDate={data.period.endDate}
            source={data.filters.source}
          />
        </details>
      </div>
      <div className={styles.balanceCollection}>
        <HorizontalCollection label="account overview" mode="single">
          <section className={styles.balance} aria-labelledby="balance-title">
            <div className={styles.sectionHeading}>
              <span className={styles.iconTile}>
                <Wallet size={22} />
              </span>
              <span className={styles.liveLabel}>Current balances</span>
              <InfoTip title="Available in accounts">
                All tracked cash balances, including archived accounts and
                negative balances. Goal reservations and upcoming bills have not
                been deducted. Credit limits are not cash.
              </InfoTip>
            </div>
            <h2 id="balance-title">Available in accounts</h2>
            <p className={styles.balanceValue}>
              {data.coverage.noAccounts
                ? "No accounts tracked"
                : money(f.liquidMinor)}
            </p>
            <Link className={styles.balanceLink} href="/money/accounts">
              {f.accounts.length} tracked accounts <ArrowUpRight size={17} />
            </Link>
            <div className={styles.balanceFoot}>
              <div>
                <span>
                  Tracked net position{" "}
                  <InfoTip title="Tracked net position">
                    {data.coverage.scope}
                  </InfoTip>
                </span>
                <strong>
                  {data.coverage.noAccounts && data.coverage.noDebts
                    ? "Coverage not established"
                    : money(f.trackedNetMinor)}
                </strong>
              </div>
              <div>
                <span>Debts & cards</span>
                <Link href="/money/debts" className={styles.balanceLink}>
                  {data.coverage.noDebts
                    ? "None tracked"
                    : money(f.liabilitiesMinor)}
                  <ChevronRight size={15} />
                </Link>
              </div>
            </div>
          </section>
          {f.accounts.map((account) => {
            const Icon =
              account.account_type === "e_wallet"
                ? Smartphone
                : account.account_type === "cash"
                  ? Wallet
                  : Landmark;
            return (
              <section
                key={account.account_id}
                className={styles.balance}
                data-account-type={account.account_type}
              >
                <div className={styles.sectionHeading}>
                  <span className={styles.iconTile}>
                    <Icon size={22} />
                  </span>
                  <span className={styles.liveLabel}>
                    {account.archived ? "Archived account" : "Current balance"}
                  </span>
                </div>
                <h2>{account.name}</h2>
                <p className={styles.balanceValue}>
                  {money(account.current_balance_minor)}
                </p>
                <Link
                  className={styles.balanceLink}
                  href={`/money/accounts/${account.account_id}/history`}
                >
                  Account history <ArrowUpRight size={17} />
                </Link>
                <div className={styles.balanceFoot}>
                  <div>
                    <span>
                      {account.institution_name ??
                        account.account_type?.replaceAll("_", " ")}
                    </span>
                    <strong>{account.currency ?? data.currency}</strong>
                  </div>
                  <div>
                    <span>Tracked after</span>
                    <strong>
                      {account.opening_cutoff_date ?? "Unknown cutoff"}
                    </strong>
                  </div>
                </div>
                {BigInt(account.current_balance_minor) < 0n && (
                  <p className="mt-3 text-sm font-semibold">
                    Negative recorded balance
                  </p>
                )}
              </section>
            );
          })}
        </HorizontalCollection>
      </div>
      <section
        className={styles.spending}
        aria-labelledby="period-spending-title"
      >
        <div className={styles.sectionHeading}>
          <span className={styles.iconTile}>
            <ArrowUpRight size={22} />
          </span>
          <InfoTip title="Net spending">
            Gross {money(f.spending.grossMinor)} less offsets{" "}
            {money(f.spending.offsetsMinor)}. Includes posted refunds and
            corrections; excludes transfers and debt principal payments.
          </InfoTip>
        </div>
        <h2 id="period-spending-title">
          Spent this{" "}
          {data.period.kind === "custom" ? "period" : data.period.kind}
        </h2>
        <Link
          className={styles.spendingValue}
          href={spendingHref(data.period)}
          aria-label={`Net recognized spending: ${money(f.spending.netMinor)}`}
        >
          {money(f.spending.netMinor)}
          <ArrowUpRight size={20} />
        </Link>
        <span className={styles.periodLabel}>
          {data.period.startDate} · {data.period.endDate}
        </span>
        <div className={styles.spendingFoot}>
          <span>
            Before offsets <strong>{money(f.spending.grossMinor)}</strong>
          </span>
          <span>
            Refunds & offsets <strong>{money(f.spending.offsetsMinor)}</strong>
          </span>
        </div>
      </section>
      <nav className={styles.actions} aria-label="Home quick actions">
        {moduleEnabled.money && (
          <>
            <Link
              href="/money/transactions?kind=expense"
              className={styles.primaryAction}
            >
              <Plus size={20} />
              Add expense
            </Link>
            <Link href="/money/transactions?kind=income">
              <ArrowDownLeft size={20} />
              Add income
            </Link>
            <Link href="/money/transfers">
              <ArrowRightLeft size={20} />
              Transfer
            </Link>
            <Link href="/money/debts">
              <CreditCard size={20} />
              Pay a debt
            </Link>
          </>
        )}
        {!moduleEnabled.money && (
          <Link href="/onboarding">
            <Wallet size={20} />
            Set up Money
          </Link>
        )}
        <Link href={calendar}>
          <CalendarDays size={20} />
          Calendar
        </Link>
      </nav>
      <div className={styles.coverageWarnings}>
        {!moduleEnabled.money && (
          <p>
            Money is hidden in navigation. Your existing records are included.
          </p>
        )}
        {data.coverage.incompleteLiabilities && (
          <p>
            <CircleAlert size={16} />
            Some debt breakdowns or payments need clarification. This is not a
            complete net worth.
          </p>
        )}
        {data.coverage.periodBeforeCutoff && (
          <p>
            <CircleAlert size={16} />
            Earlier history is missing before an opening balance; spending
            coverage is incomplete.
          </p>
        )}
        {data.coverage.unknownSchedules > 0 && (
          <p>
            <CircleAlert size={16} />
            {data.coverage.unknownSchedules} debt schedule(s) have unknown dues.
          </p>
        )}
      </div>
      <SpendingCharts
        finance={f}
        currency={data.currency}
        period={data.period}
      />
      <section className={styles.attention} aria-labelledby="attention-title">
        <div className={styles.sectionHeading}>
          <h2 id="attention-title">On your radar</h2>
          <span className={styles.count}>{data.attention.length}</span>
        </div>
        {data.attention.length ? (
          <>
            <ul>{data.attention.slice(0, 3).map(attentionItem)}</ul>
            {data.attention.length > 3 && (
              <details className={styles.dataDisclosure}>
                <summary>
                  {data.attention.length - 3} more items to review
                </summary>
                <ul>{data.attention.slice(3).map(attentionItem)}</ul>
              </details>
            )}
          </>
        ) : (
          <div className={styles.quietState}>
            <CheckCheck size={24} />
            <p>
              You&apos;re all caught up.
              <small>No attention items in your tracked records.</small>
            </p>
          </div>
        )}
        {data.overdueHasMore && (
          <Link
            className={styles.smallAction}
            href={`/calendar?startDate=0001-01-01&endDate=${data.today}`}
          >
            All overdue items <ArrowUpRight size={16} />
          </Link>
        )}
      </section>
      <PlanHighlights finance={f} currency={data.currency} />
      <section className={styles.activity} aria-labelledby="activity-title">
        <div className={styles.sectionHeading}>
          <h2 id="activity-title">Recent activity</h2>
          <InfoTip title="Recent activity">
            Latest changes to financial actions and Career/Calendar records.
            Corrections update the original action. Dates are shown in{" "}
            {data.timezone}.
          </InfoTip>
        </div>
        {data.activity.length ? (
          <>
            <ol>{data.activity.slice(0, 5).map(activityItem)}</ol>
            {data.activity.length > 5 && (
              <details className={styles.dataDisclosure}>
                <summary>More recent activity</summary>
                <ol>{data.activity.slice(5).map(activityItem)}</ol>
              </details>
            )}
          </>
        ) : (
          <p className={styles.emptyCopy}>
            Your next step starts the story. Recorded activity will appear here.
          </p>
        )}
        <Link href="/money/actions" className={styles.smallAction}>
          Financial activity <ArrowUpRight size={15} />
        </Link>
      </section>
      <section className={styles.agenda} aria-labelledby="agenda-title">
        <div className={styles.sectionHeading}>
          <h2 id="agenda-title">Coming up</h2>
          <Link className={styles.smallAction} href={calendar}>
            Calendar <ArrowUpRight size={15} />
          </Link>
        </div>
        <p className={styles.periodLabel}>
          {data.today} — {data.horizon} ·{" "}
          {data.filters.source === "all" ? "All sources" : data.filters.source}
        </p>
        <ul>
          {data.agenda.items.slice(0, 4).map((item) => {
            const href =
              data.agenda.sourceRoutes[`${item.sourceKind}:${item.sourceId}`];
            return (
              <li
                key={`${item.sourceKind}:${item.sourceId}:${item.occurrenceKey}`}
                className={styles.agendaItem}
              >
                <span className={styles.dateTile}>
                  {item.agendaDate.slice(8)}
                  <small>
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      timeZone: "UTC",
                    }).format(new Date(`${item.agendaDate}T12:00:00Z`))}
                  </small>
                </span>
                <div>
                  {href ? (
                    <Link href={href} className={styles.smallAction}>
                      {item.title}
                      <ChevronRight size={14} />
                    </Link>
                  ) : (
                    <strong>{item.title}</strong>
                  )}
                  <small>
                    {item.displayModule} · {item.timingState}
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
        {!data.agenda.items.length && (
          <p className={styles.emptyCopy}>
            A little breathing room. No commitments in this range.
          </p>
        )}
        {(data.agenda.items.length > 4 || data.agenda.nextCursor) && (
          <Link className={styles.smallAction} href={calendar}>
            All upcoming commitments <ChevronRight size={14} />
          </Link>
        )}
      </section>
      <div className={styles.modules}>
        <section className={styles.career}>
          <div className={styles.sectionHeading}>
            <BriefcaseBusiness size={21} />
            <Link className={styles.smallAction} href="/career/applications">
              Career <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className={styles.moduleNumbers}>
            <div>
              <strong>{data.career.activeCount}</strong>
              <span>active applications</span>
            </div>
            <div>
              <strong>{data.career.interviews}</strong>
              <span>upcoming interviews</span>
            </div>
          </div>
          <p>
            {data.career.savedCount} saved · {data.career.assessments}{" "}
            assessments · {data.career.followUps} follow-ups
          </p>
          {!moduleEnabled.career && (
            <small>Module hidden · existing records included</small>
          )}
        </section>
        {moduleEnabled.trackers !== false &&
          data.trackers?.enabled &&
          data.filters.source === "all" && (
            <section className={styles.trackers}>
              <div className={styles.sectionHeading}>
                <Layers3 size={21} />
                <Link className={styles.smallAction} href="/trackers">
                  Trackers <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className={styles.moduleNumbers}>
                <div>
                  <strong>{data.trackers.active}</strong>
                  <span>open records</span>
                </div>
                <div>
                  <strong>{data.trackers.completed}</strong>
                  <span>completed</span>
                </div>
              </div>
              <p>{data.trackers.overdue} overdue</p>
            </section>
          )}
      </div>
      <div className={styles.provenance}>
        <FinancialCoverage data={data} />
        <details className={styles.dataDisclosure}>
          <summary>About this snapshot</summary>
          <p>
            {data.currency} · {data.timezone} · Generated {data.generatedAt} ·
            Financial revision {data.financialRevision} · Definition{" "}
            {data.definitionVersion}. Live queries include backdated
            corrections.
          </p>
        </details>
      </div>
    </div>
  );
}
