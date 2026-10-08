import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { ReminderControls } from "@/components/calendar/reminder-controls";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import {
  reminderSourceSchema,
  ReminderUnavailableError,
} from "@/modules/time/domain/reminder";
import { getReminder } from "@/modules/time/services/reminders";

export default async function ReminderPage({
  params,
}: {
  params: Promise<{ sourceKind: string; sourceId: string }>;
}) {
  const source = reminderSourceSchema.safeParse(await params);
  if (!source.success) notFound();
  const bootstrap = await resolvePrivateAppBootstrap(await headers());
  if (bootstrap.kind === "unauthorized") redirect("/auth/sign-in");
  if (bootstrap.kind === "unavailable")
    return (
      <Panel
        title="Reminders unavailable"
        description="Your workspace couldn't be loaded."
      >
        <Link href="/calendar">Return to Calendar</Link>
      </Panel>
    );
  const { user, workspace, preference } = bootstrap;
  let view;
  try {
    view = await getReminder(
      { userId: user.id, workspaceId: workspace.id },
      source.data,
    );
  } catch (e) {
    if (e instanceof ReminderUnavailableError) notFound();
  }
  return (
    <AppShell
      pageTitle="Reminder controls"
      activePath="/calendar"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6">
        <Link
          href="/calendar"
          className="inline-flex min-h-11 items-center font-semibold text-link underline"
        >
          Back to Calendar
        </Link>
        <h1 className="text-2xl font-semibold">
          {view?.title ?? "Reminder controls"}
        </h1>
        {view ? (
          <ReminderControls initial={view} />
        ) : (
          <Panel
            title="Reminder state unavailable"
            description="Retry this read before changing reminder settings."
          >
            <Link
              href={`/calendar/reminders/${source.data.sourceKind}/${source.data.sourceId}`}
            >
              Retry reminder read
            </Link>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
