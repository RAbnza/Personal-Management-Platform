import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { SavingsGoalForm } from "@/components/money/savings-goal-forms";
import {
  SavingsGoalComparison,
  SavingsAvailability,
} from "@/components/money/savings-goal-comparison";
import {
  listSavingsGoals,
  savingsListQuerySchema,
} from "@/modules/planning/services/read-savings-goals";
import { debtWorkspace } from "../debts/_workspace";
export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await debtWorkspace(),
    q = savingsListQuerySchema.safeParse(await searchParams);
  if (!q.success)
    return (
      <div>
        <h1 className="text-2xl font-semibold">Check goal filters</h1>
        <Link className="text-link underline" href="/money/goals">
          Return to savings goals
        </Link>
      </div>
    );
  const data = await listSavingsGoals({
    userId: user.id,
    workspaceId: workspace.id,
    ...q.data,
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Savings goals</h1>
      <p>
        Conceptual reservations of existing owned cash, as of {data.today}. They
        do not move money, add assets or freeze accounts.
      </p>
      <Panel
        title="Current cash availability"
        description="Positive eligible account pools, separately from net liquid funds. All goal reservations are included, even when completed."
      >
        <SavingsAvailability summary={data.summary} />
      </Panel>
      <Panel
        title="Recorded goals"
        description="Target progress and current supported funding; historical reservations remain unchanged when real cash changes."
      >
        <div className="space-y-5">
          {data.items.map((g) => (
            <section
              key={g.id}
              className="space-y-3 border-b border-border pb-4"
            >
              <h2 className="text-xl font-semibold">
                <Link
                  className="text-link underline"
                  href={`/money/goals/${g.id}`}
                >
                  {g.name}
                </Link>
              </h2>
              <SavingsGoalComparison goal={g} />
            </section>
          ))}
          {!data.items.length && (
            <p>No matching goals. Create an explicit target below.</p>
          )}
          {data.nextCursor && (
            <Link
              className="inline-flex min-h-11 items-center text-link underline"
              href={`/money/goals?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, String(v)])), cursor: data.nextCursor })}`}
            >
              Next savings goals
            </Link>
          )}
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href={
              q.data.includeArchived === "true"
                ? "/money/goals"
                : "/money/goals?includeArchived=true"
            }
          >
            {q.data.includeArchived === "true"
              ? "Show active and completed goals"
              : "Include archived goals"}
          </Link>
        </div>
      </Panel>
      <Panel
        title="Create savings goal"
        description="Review the exact target and optional date. Reserving funds is a separate explicit command."
      >
        <SavingsGoalForm />
      </Panel>
      <p className="text-xs text-muted-foreground">
        Generated {data.generatedAt} · revision {data.financialRevision} ·{" "}
        {data.definitionVersion}
      </p>
    </div>
  );
}
