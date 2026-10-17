import styles from "./money-workspace.module.css";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import type { readSavingsGoals } from "@/modules/planning/repositories/savings-goal-repository";
export type SavingsPage = Awaited<ReturnType<typeof readSavingsGoals>>;
export function SavingsGoalComparison({
  goal: g,
}: {
  goal: SavingsPage["items"][number];
}) {
  const bp = BigInt(g.progressBasisPoints),
    health = {
      funded: "Fully funded",
      partial: "Partially funded",
      unfunded: "Unfunded",
      shared_shortfall: "Shared funding uncertain",
    }[g.fundingHealth];
  return (
    <div className="min-w-0 space-y-3 break-words">
      <p>
        {g.status} ·{" "}
        {g.target_date ? `Target date ${g.target_date}` : "No target date"}
      </p>
      <div className={styles.planSummary}>
        <div>
          <span>Reserved</span>
          <strong>{formatMoneyMinorUnits("PHP", g.reservedMinor)}</strong>
          <small>of {formatMoneyMinorUnits("PHP", g.target_minor)}</small>
        </div>
        <div>
          <span>Still to reserve</span>
          <strong>
            {formatMoneyMinorUnits("PHP", g.remainingTargetMinor)}
          </strong>
        </div>
      </div>
      <details className={styles.options}>
        <summary>Funding details</summary>{" "}
        <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Target amount", g.target_minor],
            ["Currently reserved", g.reservedMinor],
            ["Remaining target", g.remainingTargetMinor],
            ["Excess reserved", g.excessReservedMinor],
            ["Minimum supported funding", g.minimumMinor],
            ["Maximum supported funding", g.maximumMinor],
          ].map(([label, amount]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="font-semibold">
                {formatMoneyMinorUnits("PHP", amount!)}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <p className={g.atRisk ? "font-semibold text-warning" : "font-semibold"}>
        {health}
        {g.atRisk ? " · Shared account shortfall or unavailable account" : ""}
      </p>
      <progress
        className="h-3 w-full max-w-full"
        aria-label={`${g.name} reservation progress`}
        max={10000}
        value={Number(bp > 10000n ? 10000n : bp)}
      />
      <p>
        {bp / 100n}.{(bp % 100n).toString().padStart(2, "0")}% of target
        reserved. Reservations are not additional cash.
      </p>
      {g.atRisk && (
        <p>
          Current cash cannot support every reservation on an affected account.
          The supported range does not guess which goal receives the remaining
          cash.
        </p>
      )}
    </div>
  );
}
export function SavingsAvailability({
  summary: s,
}: {
  summary: SavingsPage["summary"];
}) {
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-3 break-words sm:grid-cols-2">
      {[
        ["Positive eligible cash", s.capacityMinor],
        ["All goal reservations", s.reservedMinor],
        ["Unreserved eligible cash", s.availableMinor],
        ["Reservation shortfall", s.shortfallMinor],
        ["Negative tracked cash", s.negativeCashMinor],
      ].map(([label, amount]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="font-semibold">
            {formatMoneyMinorUnits("PHP", amount!)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function SavingsGoalsSurface({
  data,
  today,
}: {
  data: SavingsPage;
  today: string;
}) {
  return (
    <Panel
      className="min-w-0 break-words"
      title="Savings goals"
      descriptionAsHelp
      description={`Current conceptual reservations as of ${today}; separate from reporting-period balances. No funds are moved or added.`}
    >
      <div className="space-y-5">
        <SavingsAvailability summary={data.summary} />
        {data.items.map((g) => (
          <section key={g.id} className="space-y-3 border-b border-border pb-4">
            <h3 className="font-semibold">
              <Link className="action-link" href={`/money/goals/${g.id}`}>
                {g.name}
              </Link>
            </h3>
            <SavingsGoalComparison goal={g} />
          </section>
        ))}
        {!data.items.length && <p>No active or completed savings goals.</p>}
        {data.nextCursor && (
          <p>
            Additional goals are available in goal management. Availability
            totals include every reservation.
          </p>
        )}
        <Link className="action-link" href="/money/goals">
          Manage savings goals
        </Link>
        <p className="text-xs text-muted-foreground">
          {data.definitionVersion}
        </p>
      </div>
    </Panel>
  );
}
