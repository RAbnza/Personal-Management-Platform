import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/panel";
import {
  SavingsGoalForm,
  SavingsReservationForm,
  SavingsReallocationForm,
  SavingsLifecycleForm,
} from "@/components/money/savings-goal-forms";
import {
  SavingsGoalComparison,
  SavingsAvailability,
} from "@/components/money/savings-goal-comparison";
import {
  getSavingsGoal,
  savingsDetailQuerySchema,
} from "@/modules/planning/services/read-savings-goals";
import { SavingsGoalUnavailableError } from "@/modules/planning/domain/savings-goal";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../../debts/_workspace";
export default async function GoalPage({
  params,
  searchParams,
}: {
  params: Promise<{ goalId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { goalId } = await params,
    q = savingsDetailQuerySchema
      .omit({ goalId: true })
      .safeParse(await searchParams);
  if (!z.uuid().safeParse(goalId).success || !q.success) notFound();
  const { user, workspace } = await debtWorkspace();
  let data;
  try {
    data = await getSavingsGoal({
      userId: user.id,
      workspaceId: workspace.id,
      goalId,
      ...q.data,
    });
  } catch (e) {
    if (e instanceof SavingsGoalUnavailableError) notFound();
    throw e;
  }
  const g = data.goal,
    base = `/money/goals/${g.id}`,
    pages = (extra: Record<string, string>) =>
      `${base}?${new URLSearchParams(Object.entries({ ...q.data, ...extra }).filter((entry): entry is [string, string] => entry[0] !== "goalId" && entry[1] !== undefined))}`,
    money = (v: string) => formatMoneyMinorUnits("PHP", v);
  return (
    <div className="space-y-6">
      <Link
        className="inline-flex min-h-11 items-center text-link underline"
        href="/money/goals"
      >
        All savings goals
      </Link>
      <h1 className="text-2xl font-semibold">{g.name} savings goal</h1>
      <Panel
        title="Target and current funding"
        description={`Supported by finalized account cash through ${data.today}. These reservations do not add assets or move money.`}
      >
        <SavingsGoalComparison goal={g} />
        {g.notes && <p className="mt-4">{g.notes}</p>}
      </Panel>
      <Panel
        title="Workspace cash availability"
        description="Every reservation across every goal is included. Negative cash and unavailable accounts are disclosed separately."
      >
        <SavingsAvailability summary={data.summary} />
      </Panel>
      <details className="space-y-4">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Change goal definition
        </summary>
        <SavingsGoalForm key={`${g.id}:${g.version}`} initial={g} />
      </details>
      <Panel
        title="Recorded reservations"
        description="The stored amount is immutable in history. Current supported bounds disclose shared shortfalls without allocating cash by guess."
      >
        <ul className="space-y-4">
          {data.reservations.items.map((r) => (
            <li key={r.id}>
              <Link
                className="text-link underline"
                href={`/money/accounts/${r.financial_account_id}`}
              >
                {r.name}
              </Link>
              <p>
                Reserved {money(r.reserved_minor)} · Supported{" "}
                {money(r.minimumMinor)} through {money(r.maximumMinor)}
              </p>
              <p>
                {r.archived ? "Account or ledger archived · " : ""}
                {r.atRisk
                  ? "Shared account shortfall"
                  : "Current reservation supported"}
              </p>
            </li>
          ))}
        </ul>
        {!data.reservations.items.length && <p>No recorded reservations.</p>}
        {data.reservations.nextCursor && (
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href={pages({ reservationCursor: data.reservations.nextCursor })}
          >
            Next reservations
          </Link>
        )}
      </Panel>
      <details className="space-y-4">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Reserve or release funds
        </summary>
        <SavingsReservationForm
          key={`${g.id}:${g.version}:${data.financialRevision}:${q.data.accountCursor ?? ""}`}
          goal={g}
          accounts={data.accounts.items}
          financialRevision={data.financialRevision}
        />
        <dl className="space-y-4">
          {data.accounts.items.map((a) => (
            <div key={a.financialAccountId}>
              <dt className="font-semibold">
                {a.name}
                {!a.eligible ? " · Unavailable for increases" : ""}
              </dt>
              <dd>
                Cash {money(a.balanceMinor)} · Eligible {money(a.capacityMinor)}{" "}
                · All reservations {money(a.reservedMinor)} · Available{" "}
                {money(a.availableMinor)} · Shortfall {money(a.shortfallMinor)}
              </dd>
            </div>
          ))}
        </dl>
        {data.accounts.nextCursor && (
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href={pages({ accountCursor: data.accounts.nextCursor })}
          >
            Next cash accounts
          </Link>
        )}
      </details>
      <details className="space-y-4">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Reallocate reservations
        </summary>
        <SavingsReallocationForm
          key={`${g.id}:${g.version}:${data.financialRevision}:${q.data.accountCursor ?? ""}:${q.data.targetCursor ?? ""}`}
          goal={g}
          accounts={data.accounts.items}
          targets={data.targets.items}
          financialRevision={data.financialRevision}
        />
        {data.targets.nextCursor && (
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href={pages({ targetCursor: data.targets.nextCursor })}
          >
            Next destination goals
          </Link>
        )}
      </details>
      {(g.status === "active"
        ? ["complete", "archive"]
        : g.status === "completed"
          ? ["reopen", "archive"]
          : ["reopen"]
      ).map((operation) => (
        <details key={operation} className="space-y-4">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            {operation === "complete"
              ? "Complete goal"
              : operation === "archive"
                ? "Archive goal"
                : "Reopen goal"}
          </summary>
          <SavingsLifecycleForm
            key={`${g.id}:${g.version}`}
            goal={g}
            operation={operation as "complete" | "archive" | "reopen"}
          />
        </details>
      ))}
      <Panel
        title="Goal and reservation history"
        description="Immutable attributed management evidence; real financial changes never rewrite it."
      >
        <ol className="space-y-4">
          {data.history.items.map((h) => (
            <li key={h.id}>
              <p className="font-semibold">
                {h.subjectKind === "savings_goal" ? "Goal" : "Reservation"}{" "}
                version {h.version} · {h.createdAt}
              </p>
              <p>{h.reason ?? "Initial goal definition"}</p>
              {"target_minor" in h.after ? (
                <p>
                  {h.after.name} · Target {money(h.after.target_minor)} ·{" "}
                  {h.after.status}
                </p>
              ) : (
                <p>
                  Reserved {money(h.after.reserved_minor)} · Account{" "}
                  {h.after.financial_account_id}
                </p>
              )}
            </li>
          ))}
        </ol>
        {data.history.nextCursor && (
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href={pages({ historyCursor: data.history.nextCursor })}
          >
            Earlier goal history
          </Link>
        )}
      </Panel>
      <p className="text-xs text-muted-foreground">
        Generated {data.generatedAt} · revision {data.financialRevision} ·{" "}
        {data.definitionVersion}
      </p>
    </div>
  );
}
