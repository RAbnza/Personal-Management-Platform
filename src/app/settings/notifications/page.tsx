import Link from "next/link";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { Panel } from "@/components/ui/panel";
import { getNotificationSettings } from "@/modules/time/services/notification-preferences";
import { getSettingsBootstrap, SettingsShell } from "../_lib";
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
  personal_event: "Calendar event",
  application_event: "Career event",
  debt_installment: "Debt installment",
  card_statement: "Verified card statement",
  card_installment: "Projected card installment",
  expected_occurrence: "Recurring occurrence",
};
export default async function NotificationsPage() {
  const b = await getSettingsBootstrap();
  const data = await getNotificationSettings({
    userId: b.user.id,
    workspaceId: b.workspace.id,
  });
  return (
    <SettingsShell
      bootstrap={b}
      title="Notifications"
      path="/settings/notifications"
    >
      <p className="break-words">
        Recipient: your verified sign-in email, {b.user.email}.
      </p>
      <p className="text-sm text-muted-foreground">
        {data.deliveryEnabled
          ? "Optional delivery is enabled for this environment."
          : "Optional delivery is paused for this environment; consent alone does not activate the sender."}{" "}
        Required authentication and security mail remains independent.
      </p>
      <NotificationSettings
        key={data.preferences.version}
        preferences={data.preferences}
      />
      <Panel
        title="Email evidence"
        description="Scheduled is pending work. Attempted or uncertain does not confirm acceptance. Accepted does not mean delivered or read; delivered requires authenticated provider evidence."
      >
        <p className="text-sm text-muted-foreground">
          {data.total} logical deliveries. Showing the most recent 50. Uncertain
          outcomes are held for reconciliation and are never blindly resent.
        </p>
        {data.deliveries.length ? (
          <ul className="divide-y divide-border">
            {data.deliveries.map((d) => (
              <li key={d.id} className="space-y-1 py-3">
                <Link
                  href={`/calendar/reminders/${d.source_kind}/${d.source_id}`}
                  className="inline-block min-h-11 max-w-full break-words text-link underline"
                >
                  {sourceLabels[d.source_kind]} reminder evidence
                </Link>
                <p className="font-medium capitalize">{d.status}</p>
                <p className="break-words text-sm">
                  Scheduled: {d.scheduled_at}
                </p>
                {d.accepted_at && (
                  <p className="break-words text-sm">
                    Accepted: {d.accepted_at}
                  </p>
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
        ) : (
          <p>No optional email delivery evidence yet.</p>
        )}
      </Panel>
      <Link
        href="/calendar"
        className="inline-block min-h-11 max-w-full break-words text-link underline"
      >
        Review Agenda and source reminder controls
      </Link>
    </SettingsShell>
  );
}
