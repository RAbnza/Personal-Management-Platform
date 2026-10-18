"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type {
  NotificationCommand,
  NotificationPreferences,
} from "@/modules/time/domain/notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
const subscribe = () => () => {};
export function NotificationSettings({
  preferences: p,
}: {
  preferences: NotificationPreferences;
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const pending = useRef<NotificationCommand | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const [enabled, setEnabled] = useState(p.enabled),
    [timezone, setTimezone] = useState(p.timezone ?? ""),
    [start, setStart] = useState(p.quietStart ?? ""),
    [end, setEnd] = useState(p.quietEnd ?? ""),
    [details, setDetails] = useState(p.includeDueDate);
  const [state, setState] = useState<
    "idle" | "saving" | "uncertain" | "failed" | "saved"
  >("idle");
  async function save() {
    pending.current ??= {
      clientCommandId: crypto.randomUUID(),
      expectedVersion: p.version,
      preferences: {
        enabled,
        timezone: timezone.trim() || null,
        quietStart: start || null,
        quietEnd: end || null,
        includeDueDate: details,
      },
    };
    setState("saving");
    try {
      const r = await fetch("/api/v1/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current),
        cache: "no-store",
      });
      setState(r.ok ? "saved" : r.status >= 500 ? "uncertain" : "failed");
      if (r.ok) router.refresh();
    } catch {
      setState("uncertain");
    }
    feedback.current?.focus();
  }
  const locked = state !== "idle";
  useEffect(() => {
    if (["uncertain", "failed", "saved"].includes(state))
      feedback.current?.focus();
  }, [state]);
  return (
    <Panel
      title="Optional reminder email"
      description="Disabled by default. Only your current verified sign-in email can receive reminders."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <fieldset disabled={locked || !hydrated} className="space-y-4">
          <legend className="sr-only">Email notification preferences</legend>
          <label className="flex min-h-16 items-center justify-between gap-3 rounded-card bg-[var(--blue-surface)] p-4 font-semibold">
            <input
              type="checkbox"
              role="switch"
              className="h-6 w-6 accent-primary"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            I opt in to scheduled reminder email
          </label>
          <p className="text-sm text-muted-foreground">
            Uses your existing reminder rules. No repeated overdue emails.
            Enabling does not send historical reminders. Dismiss, snooze or
            disable reminders from Agenda or their source.
          </p>
          <section className="rounded-card bg-surface-subtle p-4">
            <h3 className="font-semibold">Quiet hours and content</h3>
            <div className="space-y-4 pt-3">
              <label className="block" htmlFor="notification-timezone">
                Quiet-hours timezone (blank uses workspace timezone)
              </label>
              <Input
                id="notification-timezone"
                value={timezone}
                maxLength={100}
                placeholder="Asia/Manila"
                onChange={(e) => setTimezone(e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="notification-start">Quiet hours start</label>
                  <Input
                    id="notification-start"
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="notification-end">Quiet hours end</label>
                  <Input
                    id="notification-end"
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Provide both times, or leave both blank. Quiet hours can cross
                midnight and defer mail without changing the deadline.
              </p>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={details}
                  onChange={(e) => setDetails(e.target.checked)}
                />
                Include the recorded due date in email
              </label>
              <p className="text-sm text-muted-foreground">
                Messages omit amounts, company names, source titles and private
                notes.
              </p>
            </div>
          </section>
        </fieldset>
        <Button
          disabled={
            !hydrated ||
            state === "saving" ||
            state === "failed" ||
            state === "saved"
          }
          type="submit"
        >
          {state === "uncertain"
            ? "Retry identical save"
            : state === "saving"
              ? "Saving…"
              : "Save notification preferences"}
        </Button>
        {state !== "idle" && state !== "saving" && (
          <p
            ref={feedback}
            tabIndex={-1}
            role={state === "saved" ? "status" : "alert"}
          >
            {state === "saved"
              ? "Preferences saved."
              : state === "uncertain"
                ? "Save outcome unknown. Entries are locked; retry sends the identical command."
                : "Preferences could not be saved. Reload and check the timezone, quiet hours and current version."}
          </p>
        )}
        {state === "failed" && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Reload preferences
          </Button>
        )}
      </form>
    </Panel>
  );
}
