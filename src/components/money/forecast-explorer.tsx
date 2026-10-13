"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { SavingsAvailability } from "./savings-goal-comparison";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { useClientReady } from "@/shared/use-client-ready";
import type { Forecast } from "@/modules/planning/services/get-forecast";
const selectClass =
  "min-h-11 w-full min-w-0 max-w-full rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground";
type Adjustment = {
  label: string;
  date: string;
  direction: "inflow" | "outflow";
  amount: string;
};
export function ForecastExplorer({ initial }: { initial: Forecast }) {
  const id = useId(),
    ready = useClientReady(),
    [data, setData] = useState(initial),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null),
    [start, setStart] = useState(initial.startDate),
    [end, setEnd] = useState(initial.endDate),
    [unassigned, setUnassigned] = useState(false),
    [calendar, setCalendar] = useState(false),
    [independent, setIndependent] = useState(false),
    [cards, setCards] = useState<Record<string, string>>({}),
    [exclusions, setExclusions] = useState<string[]>([]),
    [adjustments, setAdjustments] = useState<Adjustment[]>([]),
    [sourcePage, setSourcePage] = useState(0),
    [dailyPage, setDailyPage] = useState(0);
  const controller = useRef<AbortController | null>(null),
    resultHeading = useRef<HTMLHeadingElement>(null),
    failure = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const money = (v: string) => formatMoneyMinorUnits(data.currency, v);
  async function calculate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/forecasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: c.signal,
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          includeUnassignedRecurring: unassigned,
          useSourceCalendarDates: calendar,
          confirmIndependentRecurring: independent,
          exclusions,
          cards: Object.entries(cards)
            .filter(([, v]) => v !== "none")
            .map(([cardId, value]) =>
              value === "installments"
                ? { cardId, basis: "installments" }
                : { cardId, basis: "statement", statementId: value },
            ),
          adjustments: adjustments.map((a) => ({
            label: a.label,
            date: a.date,
            direction: a.direction,
            amountMinor: parsePhpAmountToMinorUnits(a.amount).toString(),
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Your session expired. Sign in and reload this private forecast."
            : (body.message ??
                body.error?.message ??
                "Check the scenario and reload current evidence."),
        );
      if (!c.signal.aborted) {
        setData(body as Forecast);
        setSourcePage(0);
        setDailyPage(0);
        requestAnimationFrame(() => resultHeading.current?.focus());
      }
    } catch (e) {
      if (!c.signal.aborted) {
        setError(
          e instanceof Error ? e.message : "The forecast could not be loaded.",
        );
        requestAnimationFrame(() => failure.current?.focus());
      }
    } finally {
      if (!c.signal.aborted) setPending(false);
    }
  }
  function updateAdjustment(index: number, patch: Partial<Adjustment>) {
    setAdjustments((rows) =>
      rows.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }
  return (
    <div className="min-w-0 space-y-6">
      <p>
        Known-source cash projection, not a financial transaction. Opening
        actual cash is through {data.today} in {data.timezone}; expected sources
        and optional what-if assumptions remain separate. No money, obligations
        or reservations are changed.
      </p>
      <Panel
        title="Forecast assumptions"
        description="Review cash expectations, card payment basis and optional what-if entries. No scenario is saved."
      >
        <form
          onSubmit={calculate}
          aria-label="Forecast scenario"
          aria-busy={pending}
          className="min-w-0 space-y-4"
        >
          <fieldset disabled={pending || !ready} className="min-w-0 space-y-4">
            <legend className="font-semibold">Date range</legend>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <FormField label="Forecast start date" htmlFor={`${id}-start`}>
                <Input
                  id={`${id}-start`}
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Forecast end date" htmlFor={`${id}-end`}>
                <Input
                  id={`${id}-end`}
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </FormField>
            </div>
            <p className="text-sm">
              Future dates only, within 366 days of today. A later start retains
              a projected bridge from tomorrow.
            </p>
            <details>
              <summary className="min-h-11 cursor-pointer font-semibold">
                Source and payment assumptions
              </summary>
              <div className="space-y-4 py-4">
                {[
                  [
                    "unassigned",
                    "Treat unassigned/archived-account recurring expectations as cash",
                    unassigned,
                    setUnassigned,
                  ],
                  [
                    "calendar",
                    "Use other source calendars' date labels without inventing a time conversion",
                    calendar,
                    setCalendar,
                  ],
                  [
                    "independent",
                    "Recurring expectations are separate from recorded future cash and card repayments",
                    independent,
                    setIndependent,
                  ],
                ].map(([key, label, checked, set]) => (
                  <label
                    key={String(key)}
                    className="flex min-h-11 items-start gap-3"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0"
                      checked={checked as boolean}
                      onChange={(e) =>
                        (set as (v: boolean) => void)(e.target.checked)
                      }
                    />
                    <span>{label as string}</span>
                  </label>
                ))}
                {data.cardOptions.map((c) => (
                  <FormField
                    key={c.id}
                    label={`Payment assumption for ${c.name}`}
                    htmlFor={`${id}-${c.id}`}
                  >
                    <select
                      className={selectClass}
                      id={`${id}-${c.id}`}
                      value={cards[c.id] ?? "none"}
                      onChange={(e) =>
                        setCards({ ...cards, [c.id]: e.target.value })
                      }
                    >
                      <option value="none">
                        Payment policy unconfirmed (excluded)
                      </option>
                      <option value="installments">
                        Pay eligible recorded installment totals on due dates
                      </option>
                      {data.sources
                        .filter(
                          (s) => s.cardId === c.id && s.kind === "statement",
                        )
                        .map((s) => (
                          <option key={s.key} value={s.statementId}>
                            Statement due {s.date}:{" "}
                            {s.amountMinor === null
                              ? "Unknown"
                              : money((-BigInt(s.amountMinor)).toString())}
                          </option>
                        ))}
                    </select>
                    {c.unpaidStatementCount > 1 && (
                      <p>
                        Multiple unpaid snapshots may carry the same balance.
                        Only one can be selected.
                      </p>
                    )}
                  </FormField>
                ))}
                <p>
                  No card minimum-payment, interest, provider allocation order
                  or statement/installment overlap is inferred. Unsupported card
                  sources remain excluded with explanations.
                </p>
              </div>
            </details>
            <details>
              <summary className="min-h-11 cursor-pointer font-semibold">
                Optional what-if adjustments
              </summary>
              <div className="space-y-4 py-4">
                <p>
                  Explicit dated assumptions only; these entries never post or
                  save financial activity.
                </p>
                {adjustments.map((a, i) => (
                  <div
                    key={i}
                    className="min-w-0 space-y-3 rounded-control border border-border p-3"
                  >
                    <FormField
                      label={`Adjustment ${i + 1} label`}
                      htmlFor={`${id}-label-${i}`}
                    >
                      <Input
                        id={`${id}-label-${i}`}
                        value={a.label}
                        maxLength={200}
                        onChange={(e) =>
                          updateAdjustment(i, { label: e.target.value })
                        }
                        required
                      />
                    </FormField>
                    <FormField
                      label={`Adjustment ${i + 1} date`}
                      htmlFor={`${id}-date-${i}`}
                    >
                      <Input
                        id={`${id}-date-${i}`}
                        type="date"
                        value={a.date}
                        onChange={(e) =>
                          updateAdjustment(i, { date: e.target.value })
                        }
                        required
                      />
                    </FormField>
                    <FormField
                      label={`Adjustment ${i + 1} direction`}
                      htmlFor={`${id}-direction-${i}`}
                    >
                      <select
                        className={selectClass}
                        id={`${id}-direction-${i}`}
                        value={a.direction}
                        onChange={(e) =>
                          updateAdjustment(i, {
                            direction: e.target
                              .value as Adjustment["direction"],
                          })
                        }
                      >
                        <option value="outflow">Outflow</option>
                        <option value="inflow">Inflow</option>
                      </select>
                    </FormField>
                    <FormField
                      label={`Adjustment ${i + 1} amount (PHP)`}
                      htmlFor={`${id}-amount-${i}`}
                    >
                      <Input
                        id={`${id}-amount-${i}`}
                        inputMode="decimal"
                        value={a.amount}
                        onChange={(e) =>
                          updateAdjustment(i, { amount: e.target.value })
                        }
                        required
                      />
                    </FormField>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setAdjustments((rows) => rows.filter((_, n) => n !== i))
                      }
                    >
                      Remove adjustment {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={adjustments.length >= 20}
                  onClick={() =>
                    setAdjustments([
                      ...adjustments,
                      {
                        label: "",
                        date: start,
                        direction: "outflow",
                        amount: "",
                      },
                    ])
                  }
                >
                  Add adjustment
                </Button>
              </div>
            </details>
            <Button type="submit">
              {pending ? "Calculating forecast..." : "Calculate forecast"}
            </Button>
          </fieldset>
          {error && (
            <p role="alert" tabIndex={-1} ref={failure}>
              {error}
            </p>
          )}
        </form>
      </Panel>
      <section aria-label="Forecast results" className="min-w-0 space-y-4">
        <h2 tabIndex={-1} ref={resultHeading} className="text-xl font-semibold">
          Projected cash breakdown
        </h2>
        <p>
          Calculated through {data.endDate}; displayed window begins{" "}
          {data.startDate}. Amounts include every supported source, including
          any bridge before the displayed window.
        </p>
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Opening actual liquid cash", data.totals.openingActualMinor],
            [
              "Window opening (projected)",
              data.totals.windowOpeningProjectedMinor,
            ],
            ["Expected inflows", data.totals.expectedInflowsMinor],
            ["Expected outflows", data.totals.expectedOutflowsMinor],
            ["Recorded future cash net", data.totals.recordedFutureNetMinor],
            ["What-if net", data.totals.assumptionNetMinor],
            ["Projected closing cash", data.totals.closingProjectedMinor],
            ["Lowest projected cash", data.totals.minimumProjectedMinor],
            [
              "Closing less current reservations (comparison)",
              data.closingLessReservationsMinor,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="font-semibold">{money(value!)}</dd>
            </div>
          ))}
        </dl>
        {BigInt(data.totals.minimumProjectedMinor) < 0n && (
          <p className="font-semibold text-warning">
            Projected cash shortfall. Negative balances remain visible; missing
            obligations may increase it.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Snapshot {data.generatedAt}; revision {data.financialRevision};{" "}
          {data.definitionVersion}; {data.financialDefinitionVersion}.
        </p>
      </section>
      <Panel
        title="Coverage and uncertainty"
        description="Excluded or unsupported evidence is not confirmed zero."
      >
        <ul className="list-disc space-y-2 pl-5">
          {data.coverage.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-4">
          {data.coverage.excludedSourceCount} excluded sources;{" "}
          {data.coverage.terminalOccurrencesExcluded} terminal recurring
          records; {data.coverage.unknownInstallmentDateCount} installments
          without dates; {data.coverage.reconciliationPlanCount} plans requiring
          reconciliation; {data.coverage.unresolvedStatementCount} statements
          with unresolved reconciliation evidence.
        </p>
      </Panel>
      <Panel
        title="Dated contributing sources"
        description="Every source has a date, source version and inclusion explanation. Exclusions apply only to expectations, never recorded cash."
      >
        <div className="space-y-4">
          <ol className="divide-y divide-border">
            {data.sources
              .slice(sourcePage * 100, (sourcePage + 1) * 100)
              .map((s, i) => (
                <li key={s.key} className="min-w-0 space-y-2 py-3">
                  <Link
                    className="block min-h-11 max-w-full break-words text-link underline"
                    href={s.href}
                  >
                    {s.title}
                  </Link>
                  <p>
                    {s.kind} · {s.date ?? "Date unknown"} ·{" "}
                    {s.amountMinor === null
                      ? "Amount unknown"
                      : money(s.amountMinor)}{" "}
                    ·{" "}
                    {s.included
                      ? "Included expectation/recorded evidence"
                      : s.excludedReason}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {s.provenance}
                    {s.timezone ? `; source calendar ${s.timezone}` : ""}
                  </p>
                  {s.kind !== "recorded_cash" && (
                    <label className="flex min-h-11 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0"
                        disabled={pending}
                        checked={exclusions.includes(s.key)}
                        onChange={(e) =>
                          setExclusions(
                            e.target.checked
                              ? [...exclusions, s.key]
                              : exclusions.filter((k) => k !== s.key),
                          )
                        }
                      />
                      <span>
                        Exclude source {sourcePage * 100 + i + 1} from scenario
                      </span>
                    </label>
                  )}
                </li>
              ))}
          </ol>
          {!data.sources.length && (
            <p>
              No supported dated sources. Unrecorded activity remains unknown.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={sourcePage === 0}
              onClick={() => setSourcePage((p) => p - 1)}
            >
              Previous sources
            </Button>
            <Button
              variant="secondary"
              disabled={(sourcePage + 1) * 100 >= data.sources.length}
              onClick={() => setSourcePage((p) => p + 1)}
            >
              Next sources
            </Button>
          </div>
          {data.scenario.adjustments.map((a, i) => (
            <p key={i}>
              What-if: {a.label}, {a.date}, {a.direction},{" "}
              {money(a.amountMinor)}.
            </p>
          ))}
        </div>
      </Panel>
      <Panel
        title="Daily projected path"
        description="Balances retain negatives and distinguish the bridge from the selected window."
      >
        <ol className="space-y-2">
          {data.daily.slice(dailyPage * 31, (dailyPage + 1) * 31).map((d) => (
            <li key={d.date}>
              {d.date}
              {d.bridge ? " (bridge)" : ""}: movement {money(d.movementMinor)},
              closing {money(d.closingMinor)}
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={dailyPage === 0}
            onClick={() => setDailyPage((p) => p - 1)}
          >
            Previous days
          </Button>
          <Button
            variant="secondary"
            disabled={(dailyPage + 1) * 31 >= data.daily.length}
            onClick={() => setDailyPage((p) => p + 1)}
          >
            Next days
          </Button>
        </div>
      </Panel>
      <Panel
        title="Current savings reservations"
        description="Current supported funding is separate from physical and projected cash. Aggregate comparisons do not allocate future account cash."
      >
        <SavingsAvailability summary={data.savings.summary} />
        <Link
          className="inline-flex min-h-11 items-center text-link underline"
          href="/money/goals"
        >
          Review savings goals
        </Link>
        <p>
          Budget allowances are not expected cash spending.{" "}
          <Link className="text-link underline" href="/money/budgets">
            Review budgets
          </Link>
          .
        </p>
      </Panel>
    </div>
  );
}
