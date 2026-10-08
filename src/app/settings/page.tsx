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
export default async function SettingsPage() {
  const b = await getSettingsBootstrap();
  const profile = await getIdentityProfile(b.user.id);
  if (!profile) throw new Error("Profile unavailable");
  return (
    <SettingsShell bootstrap={b} title="Settings" path="/settings">
      <ProfileForm key={profile.version} profile={profile} />
      <Panel
        title="Workspace"
        description={`Verified sign-in email: ${b.user.email}. Theme controls are available in desktop navigation and the mobile menu.`}
      >
        <p className="text-sm text-muted-foreground">
          Timezone changes affect display and future reminders. Financial
          effective dates remain as recorded. Currency is a setup choice and
          becomes fixed when financial structure exists.
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
      <WorkspacePreferencesForm
        key={
          b.workspace.version + ":" + b.modules.map((m) => m.version).join(":")
        }
        workspace={b.workspace}
        modules={b.modules}
        stepState="completed"
        settingsMode
      />
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
          This release provides in-app due indicators. Scheduled email and push
          delivery remain later features.
        </p>
      </Panel>
      <Panel title="Account and help">
        <div className="flex flex-wrap gap-5">
          {[
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
