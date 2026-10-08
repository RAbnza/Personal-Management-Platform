import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AppShell } from "@/components/shell/app-shell";
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
      userName={b.user.name}
      userEmail={b.user.email}
      workspaceTheme={b.preference.theme}
      workspacePreferenceVersion={b.preference.version}
      gettingStartedDismissed={b.preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </AppShell>
  );
}
