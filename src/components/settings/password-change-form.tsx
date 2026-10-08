"use client";
import { useState } from "react";
import { authClient } from "@/platform/auth/client";
import { notifySessionChanged } from "@/platform/auth/session-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
export function PasswordChangeForm() {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [showPasswords, setShowPasswords] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <Panel
      title="Change password"
      description="Verify your current password and choose a passphrase of 12–128 characters. A successful change signs out other devices."
    >
      <form
        className="max-w-xl space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          if (next !== confirm) {
            setMessage("New passwords must match.");
            return;
          }
          setBusy(true);
          setMessage("");
          try {
            const r = await authClient.changePassword({
              currentPassword: current,
              newPassword: next,
              revokeOtherSessions: true,
            });
            if (r.error) throw new Error();
            setCurrent("");
            setNext("");
            setConfirm("");
            notifySessionChanged();
            setMessage("Password changed. Other devices were signed out.");
          } catch {
            setMessage(
              "Password change could not be confirmed. Try signing in with the new password before repeating this change.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm font-medium" htmlFor="current-password">
          Current password
        </label>
        <Input
          id="current-password"
          type={showPasswords ? "text" : "password"}
          autoComplete="current-password"
          required
          maxLength={128}
          disabled={busy}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <label className="block text-sm font-medium" htmlFor="new-password">
          New password
        </label>
        <Input
          id="new-password"
          type={showPasswords ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          disabled={busy}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <label className="block text-sm font-medium" htmlFor="confirm-password">
          Confirm new password
        </label>
        <Input
          id="confirm-password"
          type={showPasswords ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          disabled={busy}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          aria-pressed={showPasswords}
          disabled={busy}
          onClick={() => setShowPasswords(!showPasswords)}
        >
          {showPasswords ? "Hide passwords" : "Show passwords"}
        </Button>
        <Button type="submit" loading={busy}>
          Change password
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </Panel>
  );
}
