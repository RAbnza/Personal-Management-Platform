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
      <Link href="/settings" className="text-link underline">
        Back to Settings
      </Link>
      <SessionControls />
      <PasswordChangeForm />
      <p className="text-sm text-muted-foreground">
        Forgot your password? Use{" "}
        <Link href="/auth/forgot-password" className="text-link underline">
          password recovery
        </Link>
        . A successful reset revokes all prior sessions. If you cannot access
        your email, recover the mailbox first; V1 has no informal administrator
        recovery.
      </p>
    </SettingsShell>
  );
}
