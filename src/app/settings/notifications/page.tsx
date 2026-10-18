import { DeliveryHistory } from "@/components/settings/delivery-history";
import Link from "next/link";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { Panel } from "@/components/ui/panel";
import { getNotificationSettings } from "@/modules/time/services/notification-preferences";
import { getSettingsBootstrap, SettingsShell } from "../_lib";
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
          ? data.externalEnabled
            ? "Optional external delivery is enabled for this environment."
            : "Reminder processing is enabled, but external sending is paused in this environment."
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
          <DeliveryHistory rows={data.deliveries} />
        ) : (
          <p>No optional email delivery evidence yet.</p>
        )}
      </Panel>
      <Link href="/calendar" className="action-link">
        Review Agenda and source reminder controls
      </Link>
    </SettingsShell>
  );
}
