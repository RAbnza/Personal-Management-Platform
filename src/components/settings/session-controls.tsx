"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { notifySessionChanged } from "@/platform/auth/session-notice";
type Session = {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
};
type Target = { kind: "all" | "others" } | { kind: "one"; sessionId: string };
export function SessionControls() {
  const [sessions, setSessions] = useState<Session[] | null>(null),
    [error, setError] = useState(""),
    [review, setReview] = useState<Target | null>(null),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/v1/sessions", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setSessions((await r.json()).sessions);
    } catch {
      setError(
        "Sessions could not be loaded. Retry to read current server state.",
      );
    }
  }
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, []);
  async function revoke() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
        cache: "no-store",
      });
      if (!r.ok) throw new Error();
      const result = await r.json();
      if (result.signedOut) {
        notifySessionChanged();
        window.location.replace("/auth/sign-in");
        return;
      }
      setReview(null);
      await load();
    } catch {
      setError(
        "Revocation outcome could not be confirmed. Refresh the session list to check; repeating revocation is safe.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Active sessions"
      description="Database-backed sessions expire after seven days without refresh and at most thirty days after sign-in. Device names are estimates from browser metadata."
    >
      {error ? (
        <p role="alert" className="mb-3 text-danger">
          {error}
        </p>
      ) : null}
      {sessions === null ? (
        <p role="status">Loading active sessions...</p>
      ) : sessions.length === 0 ? (
        <p>No active sessions were returned. Sign in again.</p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-start justify-between gap-3 py-4"
            >
              <div>
                <p className="font-semibold">
                  {s.device}
                  {s.current ? " · Current session" : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  Signed in {new Date(s.createdAt).toLocaleString()}
                  <br />
                  Last active {new Date(s.lastActiveAt).toLocaleString()}
                  <br />
                  Expires {new Date(s.expiresAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setReview({ kind: "one", sessionId: s.id })}
              >
                {s.current ? "Sign out this session" : `Revoke ${s.device}`}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => void load()}>
          Refresh sessions
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !sessions?.length}
          onClick={() => setReview({ kind: "others" })}
        >
          Sign out other devices
        </Button>
        <Button
          variant="danger"
          disabled={busy || !sessions?.length}
          onClick={() => setReview({ kind: "all" })}
        >
          Sign out all devices
        </Button>
      </div>
      {review ? (
        <div
          className="mt-4 rounded-control border border-warning p-4"
          role="region"
          aria-label="Review session revocation"
        >
          <p>
            {review.kind === "all"
              ? "All sessions, including this one, will be revoked."
              : review.kind === "others"
                ? "All other sessions will be revoked; this session stays active."
                : "The selected session will lose access on its next request."}{" "}
            Workspace records remain retained.
          </p>
          <div className="mt-3 flex gap-3">
            <Button loading={busy} onClick={() => void revoke()}>
              Confirm revocation
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
