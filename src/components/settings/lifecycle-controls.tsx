"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { notifySessionChanged } from "@/platform/auth/session-notice";
import type { DeletionPreview } from "@/modules/core/services/workspace-lifecycle";
import type { DeletionState } from "@/modules/core/repositories/lifecycle-repository";
type Command = {
  clientCommandId: string;
  expectedSnapshot: string;
  confirmation: "DELETE MY WORKSPACE AND ACCOUNT";
};
export function LifecycleControls({
  preview,
  request,
  retention,
  scopeKey,
}: {
  preview: DeletionPreview | null;
  request: DeletionState | null;
  retention: string;
  scopeKey: string;
}) {
  const storageKey = `pmp-deletion-command:${scopeKey}`;
  const [review, setReview] = useState(false),
    [phrase, setPhrase] = useState(""),
    [ack, setAck] = useState(false),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [verified, setVerified] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef<Command | null>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        if (request?.state === "pending" || request?.state === "cancelled") {
          sessionStorage.removeItem(storageKey);
          return;
        }
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const c = JSON.parse(saved);
          if (
            typeof c.clientCommandId === "string" &&
            typeof c.expectedSnapshot === "string" &&
            c.confirmation === "DELETE MY WORKSPACE AND ACCOUNT"
          ) {
            pending.current = c;
            setReview(true);
            setUncertain(true);
            setMessage(
              "An earlier deletion command had an uncertain outcome. Check status, verify your password, then retry the identical command if still needed.",
            );
          }
        }
      } catch {
        /* A new confirmed request is still protected by owner uniqueness. */
      }
    });
    return () => {
      active = false;
    };
  }, [request?.state, storageKey]);
  async function verify() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        cache: "no-store",
      });
      setPassword("");
      if (!r.ok) throw new Error();
      setVerified(true);
      setMessage(
        "Password verified for five minutes. Review and explicitly confirm the action.",
      );
    } catch {
      setVerified(false);
      setMessage(
        "Password could not be verified. Sign in again or retry after the indicated rate limit.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function mutate(cancel: boolean) {
    if (busy || !verified) return;
    setBusy(true);
    setMessage("");
    try {
      if (!cancel) {
        if (!pending.current) {
          if (!preview || !ack || phrase !== "DELETE MY WORKSPACE AND ACCOUNT")
            return;
          pending.current = {
            clientCommandId: crypto.randomUUID(),
            expectedSnapshot: preview.snapshot,
            confirmation: "DELETE MY WORKSPACE AND ACCOUNT",
          };
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(pending.current));
          } catch {
            /* Backend command remains replayable. */
          }
        }
      }
      const r = await fetch("/api/v1/lifecycle", {
        method: cancel ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          cancel ? { requestId: request?.id } : pending.current,
        ),
        cache: "no-store",
      });
      if (r.ok) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        if (!cancel) notifySessionChanged();
        window.location.replace(cancel ? "/settings" : "/settings/lifecycle");
        return;
      }
      if (r.status >= 500) {
        setUncertain(true);
        setMessage(
          "Save outcome unknown. Workspace access may already be blocked. Check status by signing in; retry keeps the identical command.",
        );
      } else {
        setVerified(false);
        setMessage(
          r.status === 403
            ? "Password verification expired. Verify again before retrying."
            : "The action was not accepted. Reload current lifecycle status and review the scope again.",
        );
        if (r.status !== 403) {
          pending.current = null;
          try {
            sessionStorage.removeItem(storageKey);
          } catch {}
        }
      }
    } catch {
      setUncertain(true);
      setMessage(
        "Save outcome unknown. Check lifecycle status before editing or retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const activeRequest =
    request && ["pending", "purging", "failed"].includes(request.state);
  const canCancel =
    request?.state === "pending" && new Date(request.purgeAfter) > new Date();
  const totals = preview?.manifest.records.reduce<Record<string, bigint>>(
    (r, item) => {
      r[item.area] = (r[item.area] ?? 0n) + BigInt(item.count);
      return r;
    },
    {},
  );
  const labels: Record<string, string> = {
    finance: "Money records and accounting evidence",
    career: "Career records and history",
    time: "Calendar and reminder records",
    core: "Preferences, categories and save receipts",
    audit: "Private audit and activity history",
    ops: "CSV export history",
  };
  return (
    <div className="space-y-6">
      <Panel
        title="Account lifecycle"
        description="Workspace deletion also deletes this personal sign-in account after grace. Archive, correction and module hiding are separate actions."
      >
        <p>{retention}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Downloaded CSV files and copies you hold outside this service are
          outside the purge scope. A report export is not a complete workspace
          backup.
        </p>
        <div className="mt-4 flex flex-wrap gap-5">
          <Link href="/reports" className="text-link underline">
            Review CSV export coverage
          </Link>
          <Link href="/help" className="text-link underline">
            Read archive and correction guidance
          </Link>
        </div>
      </Panel>
      {request ? (
        <Panel title={`Deletion status: ${request.state}`}>
          <p>
            Requested {new Date(request.requestedAt).toLocaleString()}. Purge
            eligible after {new Date(request.purgeAfter).toLocaleString()}.
          </p>
          {activeRequest ? (
            <p className="mt-3">
              Ordinary workspace access is blocked.{" "}
              {canCancel
                ? "Cancellation is available only until the grace deadline."
                : "Cancellation is unavailable; the authorized purge process must finish or retry its checkpoint."}
            </p>
          ) : null}
        </Panel>
      ) : null}
      {preview && !activeRequest ? (
        <Panel
          title="Review whole-workspace deletion"
          description="No deletion begins until you review scope, verify your password and enter the explicit confirmation."
        >
          {!review ? (
            <Button variant="danger" onClick={() => setReview(true)}>
              Review deletion scope
            </Button>
          ) : (
            <div>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                {Object.entries(totals ?? {}).map(([area, count]) => (
                  <div key={area} className="contents">
                    <dt>{labels[area] ?? area}</dt>
                    <dd className="font-medium tabular-nums">
                      {count.toString()}
                    </dd>
                  </div>
                ))}
              </dl>
              <details className="mt-4 rounded-control border border-border p-3">
                <summary className="min-h-11 cursor-pointer font-medium">
                  Review counts by record type
                </summary>
                <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm">
                  {preview.manifest.records.map((record) => (
                    <div
                      key={`${record.area}.${record.kind}`}
                      className="contents"
                    >
                      <dt>
                        {record.area}: {record.kind.replaceAll("_", " ")}
                      </dt>
                      <dd className="tabular-nums">{record.count}</dd>
                    </div>
                  ))}
                </dl>
              </details>
              <p className="mt-4">
                Also included: your profile, settings, credentials, recovery
                tokens and every session. No uploaded files or server-stored CSV
                files exist in this V1 release. There is no shared workspace
                history in this release.
              </p>
              <p className="mt-3">
                The seven-day grace period begins when the request commits. All
                ordinary sessions are revoked. After signing in again, only
                lifecycle status and cancellation are available until
                cancellation or purge.
              </p>
              <label className="mt-4 flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={ack}
                  disabled={busy || uncertain}
                  onChange={(e) => setAck(e.target.checked)}
                />
                I reviewed the entire scope and retention statement.
              </label>
              <label className="mt-4 block font-medium" htmlFor="delete-phrase">
                Type DELETE MY WORKSPACE AND ACCOUNT
              </label>
              <Input
                id="delete-phrase"
                autoComplete="off"
                value={phrase}
                disabled={busy || uncertain}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </div>
          )}
        </Panel>
      ) : null}
      {(review && preview && !activeRequest) || canCancel ? (
        <Panel
          title="Recent password verification"
          description="A session refresh does not prove a fresh password check."
        >
          <form
            className="max-w-xl space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <label htmlFor="lifecycle-password" className="block font-medium">
              Current password
            </label>
            <Input
              id="lifecycle-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              maxLength={128}
              required
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              aria-pressed={showPassword}
              disabled={busy}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "Hide password" : "Show password"}
            </Button>
            <Button type="submit" loading={busy}>
              Verify password
            </Button>
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant={canCancel ? "primary" : "danger"}
              loading={busy}
              disabled={
                !verified ||
                (!canCancel &&
                  !uncertain &&
                  (!ack || phrase !== "DELETE MY WORKSPACE AND ACCOUNT"))
              }
              onClick={() => void mutate(!!canCancel)}
            >
              {canCancel
                ? "Confirm cancellation"
                : uncertain
                  ? "Retry same deletion command"
                  : "Confirm whole-workspace deletion"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => window.location.reload()}
            >
              Check current lifecycle status
            </Button>
          </div>
        </Panel>
      ) : null}
      {message ? (
        <p role="alert" className="rounded-control border border-warning p-4">
          {message}
        </p>
      ) : null}
      {uncertain ? (
        <Link
          href="/auth/sign-in"
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Sign in and review lifecycle status
        </Link>
      ) : null}
    </div>
  );
}
