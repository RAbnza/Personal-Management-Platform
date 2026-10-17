import Link from "next/link";
import {
  ProfileForm,
  ModulePreferenceForm,
} from "@/components/settings/settings-forms";
import { WorkspacePreferencesForm } from "@/components/onboarding/workspace-preferences-form";
import { Panel } from "@/components/ui/panel";
import { WorkspaceThemeSelect } from "@/components/theme/workspace-theme-select";
import { getIdentityProfile } from "@/modules/core/services/profile";
import { getSettingsBootstrap, SettingsShell } from "./_lib";
const sections = [
  ["profile", "Profile"],
  ["appearance", "Appearance"],
  ["preferences", "Workspace preferences"],
  ["modules", "Modules and Agenda"],
] as const;
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = (await searchParams).section;
  const section = sections.some(([key]) => key === requested)
    ? requested
    : "profile";
  const b = await getSettingsBootstrap();
  const profile = await getIdentityProfile(b.user.id);
  if (!profile) throw new Error("Profile unavailable");
  return (
    <SettingsShell bootstrap={b} title="Settings" path="/settings">
      <div className="grid min-w-0 items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings categories"
          className="flex flex-wrap gap-1 rounded-panel border border-border bg-surface p-2 md:flex-col"
        >
          {sections.map(([key, label]) => (
            <Link
              key={key}
              href={`/settings?section=${key}`}
              aria-current={section === key ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-control px-3 py-2 text-sm ${section === key ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">
          {section === "profile" && (
            <ProfileForm key={profile.version} profile={profile} />
          )}
          {section === "appearance" && (
            <Panel
              title="Workspace"
              description={`Verified sign-in email: ${b.user.email}. Appearance follows your signed-in workspace preference.`}
            >
              <p className="text-sm text-muted-foreground">
                Timezone changes affect display and future reminders. Financial
                effective dates remain as recorded. Currency is a setup choice
                and becomes fixed when financial structure exists.
              </p>
              <WorkspaceThemeSelect
                className="mt-4 max-w-xs"
                theme={b.preference.theme}
                version={b.preference.version}
                gettingStartedDismissed={
                  b.preference.gettingStartedDismissedAt !== null
                }
              />
            </Panel>
          )}
          {section === "preferences" && (
            <WorkspacePreferencesForm
              key={
                b.workspace.version +
                ":" +
                b.modules.map((m) => m.version).join(":")
              }
              workspace={b.workspace}
              modules={b.modules}
              stepState="completed"
              settingsMode
            />
          )}
          {section === "modules" && (
            <Panel
              title="Modules and due indicators"
              description="Hiding a module retains its records. Re-enable it here to restore normal access. Existing source deadlines can remain in Agenda, with read-only source review and separate reminder controls."
            >
              <div className="grid gap-4 md:grid-cols-3">
                {b.modules.map((m) => (
                  <ModulePreferenceForm
                    key={m.moduleKey + ":" + m.version}
                    module={m}
                  />
                ))}
              </div>
              <Link
                href="/calendar"
                className="mt-4 inline-flex min-h-11 items-center text-link underline"
              >
                Review in-app reminder defaults and source controls
              </Link>
              <p className="text-sm text-muted-foreground">
                In-app reminders remain available independently of optional
                email.
              </p>
            </Panel>
          )}
        </div>
      </div>
      <Panel title="Account and help">
        <div className="flex flex-wrap gap-5">
          {[
            ["/settings/notifications", "Manage optional reminder email"],
            ["/settings/files", "Manage private evidence files"],
            ["/settings/portability", "Import, export and restore workspace"],
            ["/settings/sessions", "Review sessions and security"],
            ["/settings/lifecycle", "Review account deletion"],
            ["/help", "Task guides and replayable tour"],
            ["/onboarding", "Resume Getting Started"],
            ["/help/support", "Support and feedback"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href!}
              className="inline-flex min-h-11 items-center text-link underline"
            >
              {label}
            </Link>
          ))}
        </div>
      </Panel>
    </SettingsShell>
  );
}
