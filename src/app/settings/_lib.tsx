import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AppShell } from "@/components/shell/app-shell";
import { ScreenHeader } from "@/components/patterns/work-area";
export async function getSettingsBootstrap() {
  const b = await resolvePrivateAppBootstrap(await headers());
  if (b.kind === "unauthorized") redirect("/auth/sign-in");
  if (b.kind === "unavailable") {
    if (b.lifecyclePending) redirect("/settings/lifecycle");
    throw new Error("Settings unavailable");
  }
  return b;
}
export function SettingsShell({
  bootstrap: b,
  title,
  path,
  children,
}: {
  bootstrap: Awaited<ReturnType<typeof getSettingsBootstrap>>;
  title: string;
  path: string;
  children: ReactNode;
}) {
  return (
    <AppShell
      pageTitle={title}
      activePath={path}
      modules={b.modules}
      userName={b.user.name}
      userEmail={b.user.email}
      workspaceTheme={b.preference.theme}
      workspacePreferenceVersion={b.preference.version}
      gettingStartedDismissed={b.preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6">
        <ScreenHeader
          title={title}
          scope={path.startsWith("/help") ? "Help" : "Workspace settings"}
          description={
            path.startsWith("/help")
              ? "Task guides, a replayable tour and a support draft you control."
              : "Your preferences and account controls. Shared groups retain their separate permissions."
          }
        />
        {children}
      </div>
    </AppShell>
  );
}
