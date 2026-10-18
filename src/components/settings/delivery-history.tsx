"use client";
import { useState } from "react";
import Link from "next/link";
import type { getNotificationSettings } from "@/modules/time/services/notification-preferences";
const reasons: Record<string, string> = {
  predates_opt_in:
    "Scheduled before the current email opt-in; historical mail is suppressed.",
  consent_revoked: "Optional email was disabled.",
  source_or_rule_inactive: "The source was resolved or its reminder changed.",
  consent_or_source_inactive:
    "Consent or the current reminder is no longer active.",
  identity_inactive: "The current verified sign-in email is unavailable.",
  pre_send_revalidation:
    "Preferences, recipient or source changed before sending.",
  provider_rejected: "The provider rejected this attempt. Retries are bounded.",
  provider_uncertain:
    "Provider acceptance could not be confirmed; held for reconciliation.",
  attempt_interrupted: "An attempt was interrupted; held for reconciliation.",
  provider_terminal: "The provider reported a delivery failure.",
  quiet_hours_changed: "Deferred to respect current quiet hours.",
  restore_review: "Held for review after database recovery.",
};
const sourceLabels: Record<string, string> = {
  tracker_entry: "Tracker deadline",
  personal_event: "Calendar event",
  application_event: "Career event",
  debt_installment: "Debt installment",
  card_statement: "Verified card statement",
  card_installment: "Projected card installment",
  expected_occurrence: "Recurring occurrence",
};
export function DeliveryHistory({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getNotificationSettings>>["deliveries"];
}) {
  const [status, setStatus] = useState("all");
  return (
    <div className="space-y-4">
      <label className="grid max-w-md gap-2 text-sm">
        Filter recent delivery evidence
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-11 rounded-control border border-input bg-surface px-3"
        >
          <option value="all">All recent states ({rows.length})</option>
          {[...new Set(rows.map((r) => r.status))].map((value) => (
            <option key={value} value={value}>
              {value} ({rows.filter((r) => r.status === value).length})
            </option>
          ))}
        </select>
      </label>{" "}
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows
          .filter((d) => status === "all" || d.status === status)
          .map((d) => (
            <li
              key={d.id}
              className="space-y-2 rounded-card border border-border bg-surface-subtle p-4"
            >
              <Link
                href={`/calendar/reminders/${d.source_kind}/${d.source_id}`}
                className="action-link"
              >
                {sourceLabels[d.source_kind]} reminder evidence
              </Link>
              <p className="font-medium capitalize">{d.status}</p>
              <p className="break-words text-sm">Scheduled: {d.scheduled_at}</p>
              {d.accepted_at && (
                <p className="break-words text-sm">Accepted: {d.accepted_at}</p>
              )}
              {d.delivered_at && (
                <p className="break-words text-sm">
                  Provider delivery: {d.delivered_at}
                </p>
              )}
              {d.last_error_code && (
                <p className="break-words text-sm text-muted-foreground">
                  {reasons[d.last_error_code] ?? "Held for delivery review."}
                </p>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}
