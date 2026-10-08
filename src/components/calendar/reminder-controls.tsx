"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import type {
  ReminderCommand,
  ReminderView,
} from "@/modules/time/domain/reminder";

function displayInstant(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
const inputClass =
  "min-h-11 rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground";
export function ReminderControls({ initial }: { initial: ReminderView }) {
  const router = useRouter();
  const id = useId();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const reviewRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(initial);
  const [mode, setMode] = useState(initial.mode);
  const [offsets, setOffsets] = useState(
    initial.configuration.map((r) => r.offsetDays).join(", "),
  );
  const [localTime, setLocalTime] = useState(
    initial.configuration[0]?.localTime ?? "09:00",
  );
  const [snooze, setSnooze] = useState("");
  const [pending, setPending] = useState<ReminderCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (pending) reviewRef.current?.focus();
  }, [pending]);
  const query = new URLSearchParams(view.target).toString();
  async function reload() {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/reminders?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw Error();
      const next = (await response.json()) as ReminderView;
      setView(next);
      setMode(next.mode);
      setOffsets(next.configuration.map((r) => r.offsetDays).join(", "));
      setLocalTime(next.configuration[0]?.localTime ?? "09:00");
      setStale(false);
      router.refresh();
    } catch {
      setMessage("Reminder state could not be loaded. Try loading it again.");
    } finally {
      setBusy(false);
    }
  }
  async function save(command: ReminderCommand) {
    setBusy(true);
    setMessage("");
    let saved = false;
    try {
      const response = await fetch("/api/v1/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      if (response.status >= 500) throw Error();
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.message ?? "The reminder change was rejected.");
        setStale(response.status === 409 || response.status === 404);
        setPending(null);
        setUncertain(false);
        return;
      }
      if (result.saved !== true) throw Error();
      saved = true;
      setPending(null);
      setUncertain(false);
      setMessage(
        "Reminder change saved. The source deadline and completion/payment state are unchanged.",
      );
      const read = await fetch(`/api/v1/reminders?${query}`, {
        cache: "no-store",
      });
      if (read.ok) {
        const next = (await read.json()) as ReminderView;
        setView(next);
        setMode(next.mode);
        setOffsets(next.configuration.map((r) => r.offsetDays).join(", "));
        setLocalTime(next.configuration[0]?.localTime ?? "09:00");
      } else setStale(true);
      router.refresh();
    } catch {
      if (saved) {
        setPending(null);
        setUncertain(false);
        setStale(true);
        setMessage(
          "Reminder change saved. The updated read is unavailable; reload reminder state before another change.",
        );
      } else {
        setUncertain(true);
        setMessage(
          "Save outcome is uncertain. Retry the same command to safely confirm it. Editing remains locked until the outcome is known.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function prepare(action: ReminderCommand["action"]) {
    setPending({
      target: view.target,
      expectedSnapshot: view.snapshot,
      clientCommandId: crypto.randomUUID(),
      action,
    });
    setMessage("");
  }
  const locked = !hydrated || busy || pending !== null || stale;
  return (
    <Panel
      title={"moduleKey" in view.target ? view.title : "In-app reminders"}
      description="Reminder controls change when you see a reminder. Source deadlines, payments and completion are managed from the source."
    >
      <div className="space-y-5" aria-busy={busy}>
        <p className="text-sm text-muted-foreground">
          Timezone: {view.timezone}.{" "}
          {view.moduleHidden
            ? "Module hidden; reminder preferences are separate. "
            : ""}
          {!view.moduleRemindersEnabled ? "Module reminders are off. " : ""}
          {!view.agendaVisible
            ? "Source is excluded from the mixed Agenda by its module filter. "
            : ""}
        </p>
        {view.sourceRoute ? (
          <Link
            href={view.sourceRoute}
            className="inline-flex min-h-11 items-center font-semibold text-link underline"
          >
            Open source
          </Link>
        ) : null}
        {view.dueDate ? (
          <p>
            Source date: <strong>{view.dueDate}</strong>
            {view.remainingMinor !== null
              ? ` · Contractual amount remaining: ${formatMoneyMinorUnits("PHP", view.remainingMinor)}`
              : ""}
          </p>
        ) : null}
        {!view.eligible ? (
          <p role="status">
            This source is resolved, cancelled, replaced or archived. Its
            reminder history remains available.
          </p>
        ) : (
          <>
            {view.rules.length ? (
              <ul className="space-y-4" aria-label="Reminder occurrences">
                {view.rules.map((rule) => (
                  <li
                    key={rule.key}
                    className="rounded-control border border-border p-4"
                  >
                    <p className="font-medium">
                      {rule.offsetDays === 0
                        ? "On the source date"
                        : `${rule.offsetDays} days before`}{" "}
                      at {rule.localTime}
                    </p>
                    <p className="mt-1 text-sm">
                      {rule.due
                        ? "Due reminder"
                        : rule.state === "dismissed"
                          ? "Dismissed"
                          : rule.state === "snoozed"
                            ? "Snoozed"
                            : rule.state === "cancelled"
                              ? "Cancelled"
                              : "Upcoming reminder"}{" "}
                      · {displayInstant(rule.scheduledFor, view.timezone)}
                    </p>
                    {rule.snoozedUntil ? (
                      <p className="text-sm">
                        Next display:{" "}
                        {displayInstant(rule.snoozedUntil, view.timezone)}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        disabled={locked || !view.moduleRemindersEnabled}
                        onClick={() =>
                          prepare({
                            kind:
                              rule.state === "dismissed" ||
                              rule.state === "snoozed"
                                ? "restore"
                                : "dismiss",
                            ruleKey: rule.key,
                          })
                        }
                      >
                        {rule.state === "dismissed" || rule.state === "snoozed"
                          ? "Restore reminder"
                          : "Dismiss reminder"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={
                          locked || !view.moduleRemindersEnabled || !snooze
                        }
                        onClick={() => {
                          try {
                            const [date, time] = snooze.split("T");
                            const [year, month, day] = date!
                              .split("-")
                              .map(Number);
                            const [hour, minute] = time!.split(":").map(Number);
                            const value = new TZDate(
                              year!,
                              month! - 1,
                              day!,
                              hour!,
                              minute!,
                              view.timezone,
                            );
                            if (!Number.isFinite(value.getTime()))
                              throw Error();
                            prepare({
                              kind: "snooze",
                              ruleKey: rule.key,
                              snoozedUntil: value.toISOString(),
                            });
                          } catch {
                            setMessage("Enter a valid snooze date and time.");
                          }
                        }}
                      >
                        Snooze reminder
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {view.rules.length ? (
              <div>
                <label
                  htmlFor={`${id}-snooze`}
                  className="block text-sm font-medium"
                >
                  Snooze until ({view.timezone})
                </label>
                <input
                  id={`${id}-snooze`}
                  type="datetime-local"
                  value={snooze}
                  disabled={locked}
                  onChange={(e) => setSnooze(e.target.value)}
                  className={`mt-2 ${inputClass}`}
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  Moves the next reminder display, preserving the source date.
                </p>
              </div>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = offsets.trim()
                  ? offsets.split(",").map((s) => Number(s.trim()))
                  : [];
                if (
                  values.some(
                    (n) => !Number.isInteger(n) || n < 0 || n > 365,
                  ) ||
                  values.length > 8 ||
                  new Set(values).size !== values.length ||
                  !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)
                ) {
                  setMessage(
                    "Enter up to eight distinct whole-day offsets from 0 to 365 and a valid time.",
                  );
                  return;
                }
                prepare({
                  kind: "settings",
                  mode,
                  rules:
                    mode === "override"
                      ? values.map((offsetDays) => ({ offsetDays, localTime }))
                      : [],
                });
              }}
              className="space-y-3"
            >
              <fieldset disabled={locked} className="space-y-3">
                <legend className="font-medium">Reminder settings</legend>
                {"sourceId" in view.target ? (
                  <div>
                    <label htmlFor={`${id}-mode`} className="block text-sm">
                      Reminder mode
                    </label>
                    <select
                      id={`${id}-mode`}
                      value={mode}
                      onChange={(e) => setMode(e.target.value as typeof mode)}
                      className={inputClass}
                    >
                      <option value="inherit">Use module defaults</option>
                      <option value="override">Custom reminders</option>
                      <option value="off">Disable source reminders</option>
                    </select>
                  </div>
                ) : null}
                {mode === "override" ? (
                  <>
                    <div>
                      <label
                        htmlFor={`${id}-offsets`}
                        className="block text-sm"
                      >
                        Days before (comma separated)
                      </label>
                      <input
                        id={`${id}-offsets`}
                        value={offsets}
                        onChange={(e) => setOffsets(e.target.value)}
                        className={inputClass}
                      />
                      <p className="text-sm text-muted-foreground">
                        For example: 7, 1, 0. Leave empty for no reminders.
                      </p>
                    </div>
                    <div>
                      <label htmlFor={`${id}-time`} className="block text-sm">
                        Local reminder time
                      </label>
                      <input
                        id={`${id}-time`}
                        type="time"
                        value={localTime}
                        onChange={(e) => setLocalTime(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </>
                ) : null}
                <Button type="submit" variant="secondary">
                  Review reminder settings
                </Button>
              </fieldset>
            </form>
          </>
        )}
        {pending ? (
          <div
            ref={reviewRef}
            tabIndex={-1}
            role="region"
            className="rounded-control border border-border bg-surface-subtle p-4"
            aria-label="Review reminder change"
          >
            <p className="font-semibold">Review reminder change</p>
            <p className="mt-2 text-sm">
              {pending.action.kind === "settings"
                ? `Mode: ${pending.action.mode}. ${pending.action.rules.map((r) => `${r.offsetDays} days before at ${r.localTime}`).join("; ") || "No custom times"}.`
                : pending.action.kind === "snooze"
                  ? `Snooze ${pending.action.ruleKey} until ${displayInstant(pending.action.snoozedUntil, view.timezone)} (${view.timezone}).`
                  : `${pending.action.kind === "dismiss" ? "Dismiss" : "Restore"} ${pending.action.ruleKey}.`}
            </p>
            <p className="mt-2 text-sm">
              The source date and payment/completion state stay unchanged.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button disabled={busy} onClick={() => save(pending)}>
                {busy
                  ? "Saving…"
                  : uncertain
                    ? "Retry same reminder command"
                    : "Confirm reminder change"}
              </Button>
              {!uncertain ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  Cancel review
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {message ? (
          <p
            role={uncertain || stale ? "alert" : "status"}
            className="text-sm leading-6"
          >
            {message}
          </p>
        ) : null}
        {!uncertain ? (
          <Button
            variant="secondary"
            disabled={!hydrated || busy || pending !== null}
            onClick={reload}
          >
            {!hydrated || busy ? "Loading…" : "Reload reminder state"}
          </Button>
        ) : null}
        {view.actions?.length ? (
          <details>
            <summary className="min-h-11 cursor-pointer font-medium">
              Reminder changes ({view.actions.length} latest actions)
            </summary>
            <ol className="space-y-3">
              {view.actions.map((action) => (
                <li
                  key={action.id}
                  className="border-t border-border pt-3 text-sm"
                >
                  {action.operation} ·{" "}
                  {displayInstant(action.recordedAt, view.timezone)}
                  {action.snoozedUntil
                    ? ` · Snoozed until ${displayInstant(action.snoozedUntil, view.timezone)}`
                    : ""}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        {view.history.length ? (
          <details>
            <summary className="min-h-11 cursor-pointer font-medium">
              Reminder history ({view.history.length} latest occurrences)
            </summary>
            <ol className="space-y-3">
              {view.history.map((h) => (
                <li key={h.id} className="border-t border-border pt-3 text-sm">
                  {h.state} · {displayInstant(h.updatedAt, view.timezone)} ·
                  Source generation {h.sourceGeneration}, rule generation{" "}
                  {h.ruleGeneration}
                  <br />
                  {h.cancellationReason ??
                    (h.snoozedUntil
                      ? `Snoozed until ${displayInstant(h.snoozedUntil, view.timezone)}`
                      : `Scheduled for ${displayInstant(h.scheduledFor, view.timezone)}`)}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">
              Material source-date or status changes cancel the previous
              generation; note edits preserve it.
            </p>
          </details>
        ) : null}
      </div>
    </Panel>
  );
}
