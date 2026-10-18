"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { HorizontalCollection } from "@/components/patterns/horizontal-collection";
import { InfoTip } from "@/components/ui/info-tip";
import type { DashboardResult } from "@/modules/dashboard/services/get-dashboard";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { budgetEndDate } from "@/modules/planning/domain/budget";
import styles from "./home.module.css";
const progress = (value: string) =>
  Number(
    BigInt(value) < 0n ? 0n : BigInt(value) > 10000n ? 10000n : BigInt(value),
  );

export function PlanHighlights({
  finance,
  currency,
}: {
  finance: DashboardResult["finance"];
  currency: string;
}) {
  const [view, setView] = useState<"budgets" | "goals">("budgets");
  const money = (value: string) => formatMoneyMinorUnits(currency, value);
  return (
    <section className={styles.planning} aria-label="Your plans">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>MAKE ROOM FOR WHAT MATTERS</p>
          <h2>Your plans</h2>
        </div>
        <InfoTip title="Your plans">
          Budgets compare spending over their own labelled period. Savings
          progress shows reservations, not extra cash. Funding can be uncertain
          when accounts are short.
        </InfoTip>
      </div>
      <div className={styles.chartToolbar}>
        <div className={styles.segmented} aria-label="Choose a plan view">
          <button
            type="button"
            aria-pressed={view === "budgets"}
            onClick={() => setView("budgets")}
          >
            Budgets
          </button>
          <button
            type="button"
            aria-pressed={view === "goals"}
            onClick={() => setView("goals")}
          >
            Savings goals
          </button>
        </div>
        <Link className={styles.smallAction} href={`/money/${view}`}>
          Manage <ArrowUpRight size={15} />
        </Link>
      </div>
      {finance.budgets.items.some((b) => b.status === "overspent") && (
        <p className="mb-3 text-sm text-danger">
          A budget in this period is over its limit.
        </p>
      )}
      {(finance.savingsGoals.summary.shortfallMinor !== "0" ||
        finance.savingsGoals.items.some((g) => g.atRisk)) && (
        <p className="mb-3 text-sm text-warning">
          Some savings reservations may not be fully supported by account
          balances. Review goal funding.
        </p>
      )}
      {view === "budgets" ? (
        finance.budgets.items.length ? (
          <HorizontalCollection
            label="budget highlights"
            key="budgets"
            mode="single"
          >
            {finance.budgets.items.map((b) => (
              <article key={b.id} className={styles.planItem}>
                <Link href={`/money/budgets/${b.id}`}>
                  <strong>{b.categoryName}</strong>
                  <ArrowUpRight size={17} />
                </Link>
                <div className={styles.planAmounts}>
                  <span>{money(b.spendingMinor)}</span>
                  <span>of {money(b.limit_minor)}</span>
                </div>
                {b.progressBasisPoints !== null ? (
                  <progress
                    aria-label={`${b.categoryName} budget usage`}
                    max={10000}
                    value={progress(b.progressBasisPoints)}
                  />
                ) : (
                  <p className="text-xs">
                    Zero limit · percentage not applicable
                  </p>
                )}
                <p
                  className={
                    b.status === "overspent" ? "text-sm text-danger" : "text-sm"
                  }
                >
                  {b.status === "overspent"
                    ? `Over by ${money(b.overspentMinor)}`
                    : `${money(b.remainingMinor)} left`}
                </p>
                <small>
                  {b.start_date} — {budgetEndDate(b.end_date_exclusive)} ·{" "}
                  {b.basis} spending
                </small>
              </article>
            ))}
          </HorizontalCollection>
        ) : (
          <p className={styles.emptyCopy}>
            Give your spending a little direction.
            <Link href="/money/budgets" className={styles.smallAction}>
              <Plus size={15} />
              Create a budget
            </Link>
          </p>
        )
      ) : finance.savingsGoals.items.length ? (
        <HorizontalCollection
          label="savings highlights"
          key="goals"
          mode="single"
        >
          {finance.savingsGoals.items.map((g) => (
            <article key={g.id} className={styles.planItem}>
              <Link href={`/money/goals/${g.id}`}>
                <strong>{g.name}</strong>
                <ArrowUpRight size={17} />
              </Link>
              <div className={styles.planAmounts}>
                <span>{money(g.reservedMinor)}</span>
                <span>of {money(g.target_minor)}</span>
              </div>
              <progress
                aria-label={`${g.name} reserved progress`}
                max={10000}
                value={progress(g.progressBasisPoints)}
              />
              <p className={g.atRisk ? "text-sm text-warning" : "text-sm"}>
                {g.atRisk
                  ? "Funding at risk"
                  : `${money(g.remainingTargetMinor)} still to reserve`}
              </p>
              <small>
                {g.status} · {g.target_date ?? "No target date"}
              </small>
            </article>
          ))}
        </HorizontalCollection>
      ) : (
        <p className={styles.emptyCopy}>
          Something to look forward to.
          <Link href="/money/goals" className={styles.smallAction}>
            <Plus size={15} />
            Set a savings goal
          </Link>
        </p>
      )}
      {((view === "budgets" && finance.budgets.nextCursor) ||
        (view === "goals" && finance.savingsGoals.nextCursor)) && (
        <p className="mt-2 text-xs text-muted-foreground">
          More plans are available in Manage.
        </p>
      )}
    </section>
  );
}
