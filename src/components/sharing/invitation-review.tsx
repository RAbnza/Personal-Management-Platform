"use client";
import { useSyncExternalStore, useState } from "react";
import { useRouter } from "next/navigation";
import type { InvitationReview } from "@/modules/sharing/services/read-groups";
import { CommandForm, Field } from "./forms";
import { Input } from "@/components/ui/input";
import { money } from "./bill-form";
const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
const snapshot = () => window.location.hash;
export function InvitationReviewForm() {
  const hash = useSyncExternalStore(subscribe, snapshot, () => ""),
    [enteredToken, setToken] = useState<string | null>(null),
    token =
      enteredToken ?? new URLSearchParams(hash.slice(1)).get("token") ?? "",
    [review, setReview] = useState<
      (InvitationReview & { reviewedToken: string }) | null
    >(null),
    [error, setError] = useState(""),
    router = useRouter();
  async function load() {
    setError("");
    setReview(null);
    try {
      const r = await fetch("/api/v1/sharing/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "review", token }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? "Invitation unavailable.");
      setReview({ ...data, reviewedToken: token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review invitation.");
    }
  }
  return (
    <section className="mx-auto max-w-4xl space-y-5 rounded-card bg-surface-subtle p-5">
      <h1 className="text-2xl font-semibold">Review group invitation</h1>
      <p>
        Sign in with the verified email that received this invitation. Display
        names never establish identity.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Field label="Invitation token">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            pattern="[a-f0-9]{64}"
            autoComplete="off"
          />
        </Field>
        <button type="submit" className="min-h-11 text-link underline">
          Review invitation and balance
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {review && (
        <>
          <h2 className="text-xl font-semibold">{review.groupName}</h2>
          <p>{review.historyNotice}</p>
          {review.claimParticipantId && (
            <p>
              Claiming {review.claimName}: recorded paid{" "}
              {money(review.paidMinor)}, own shares {money(review.shareMinor)},
              net {money(review.netMinor)}. Review these facts before accepting
              this identity.
            </p>
          )}
          <details>
            <summary className="min-h-11 cursor-pointer">
              Review recorded bill history
            </summary>
            <ol className="space-y-3">
              {review.history.map((h) => (
                <li key={h.revisionId}>
                  {h.date} · {h.description} · Revision {h.revisionNo}
                  <p>
                    Paid {money(h.paidMinor)} · Share {money(h.shareMinor)}
                  </p>
                  {h.reason && <p>{h.reason}</p>}
                </li>
              ))}
            </ol>
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer">
              Review recorded refunds and settlements
            </summary>
            <ul>
              {review.refunds?.map((r) => (
                <li key={r.id}>
                  {r.date} · Refund received {money(r.receivedMinor)} · Share
                  credit {money(r.shareCreditMinor)} · {r.reason}
                </li>
              ))}
              {review.settlements?.map((s) => (
                <li key={s.id}>
                  {s.date} ·{" "}
                  {s.senderId === review.claimParticipantId
                    ? "Sent"
                    : "Received"}{" "}
                  {money(s.amountMinor)} · {s.state} · Advance{" "}
                  {money(s.advanceMinor)}
                  <ul>
                    {s.events.map((e) => (
                      <li key={e.version}>
                        {e.fromState ?? "New"} → {e.toState} ·{" "}
                        {e.confirmationType} · {e.reason}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
          <CommandForm
            url="/api/v1/sharing/invitations"
            label="Accept invitation and history"
            onSuccess={() => router.push(`/sharing/${review.groupId}`)}
            build={(f) => ({
              kind: "accept",
              token: review.reviewedToken,
              clientCommandId: crypto.randomUUID(),
              expectedVersion: review.version,
              consent: true,
              displayName: f.get("displayName"),
            })}
          >
            <Field label="Your group display name">
              <Input
                name="displayName"
                required
                maxLength={200}
                defaultValue={review.claimName ?? ""}
              />
            </Field>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" required />I consent to this history policy
              and have reviewed the recorded identity and balance.
            </label>
          </CommandForm>
        </>
      )}
    </section>
  );
}
