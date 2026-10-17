import Link from "next/link";
import { SessionControls } from "@/components/settings/session-controls";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { getSettingsBootstrap, SettingsShell } from "../_lib";
export default async function SessionsPage() {
  const b = await getSettingsBootstrap();
  return (
    <SettingsShell
      bootstrap={b}
      title="Sessions and security"
      path="/settings/sessions"
    >
      <Link href="/settings" className="action-link">
        Back to Settings
      </Link>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <SessionControls />
        <PasswordChangeForm />
      </div>
      <p className="text-sm text-muted-foreground">
        Forgot your password? Use{" "}
        <Link href="/auth/forgot-password" className="action-link">
          password recovery
        </Link>
        . A successful reset revokes all prior sessions. If you cannot access
        your email, recover the mailbox first; V1 has no informal administrator
        recovery.
      </p>
    </SettingsShell>
  );
}
