"use client";
import { useRef, useState } from "react";
import type { GroupDetail } from "@/modules/sharing/services/read-groups";
import { Input } from "@/components/ui/input";
import { CommandForm, Field, selectClass } from "./forms";
export function GroupAdmin({ data }: { data: GroupDetail }) {
  const { group, participants } = data,
    [link, setLink] = useState(""),
    pendingToken = useRef("");
  const base = () => ({
    clientCommandId: crypto.randomUUID(),
    groupId: group.id,
    expectedVersion: group.version,
  });
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">People and group settings</h2>
      <details>
        <summary className="min-h-11 cursor-pointer">
          Membership history
        </summary>
        <p>Latest 100 visible membership intervals.</p>
        <ul className="space-y-3">
          {data.membershipHistory?.map((m) => (
            <li key={m.id}>
              {participants.find((p) => p.id === m.participantId)
                ?.displayName ?? "Historical participant"}{" "}
              · {m.role}
              <p>
                Joined {m.joinedAt}
                {m.leftAt
                  ? ` · ${m.exitKind} ${m.leftAt}`
                  : " · current interval"}
              </p>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer">
          Recorded group changes
        </summary>
        <p>
          Latest 50 authorized changes. Bill evidence and membership intervals
          retain the underlying history.
        </p>
        <ol className="space-y-3">
          {data.changes?.map((c) => (
            <li key={c.id}>
              {c.operation.replaceAll("_", " ")} · Version {c.version} ·{" "}
              {c.actorKind}
              <p>{c.recordedAt}</p>
              {c.before?.role != null && (
                <p>Previous role: {String(c.before.role)}</p>
              )}
              {c.after.operation != null && (
                <p>Change: {String(c.after.operation)}</p>
              )}
            </li>
          ))}
        </ol>
      </details>
      <p>
        Membership changes require password verification in{" "}
        <a href="/settings" className="text-link underline">
          Settings
        </a>{" "}
        within five minutes. Leaving preserves obligations and the bills visible
        at exit.
      </p>
      {group.owner && (
        <>
          <details>
            <summary className="min-h-11 cursor-pointer">
              Add someone recorded manually
            </summary>
            <CommandForm
              label="Add manual participant"
              build={(f) => ({
                ...base(),
                kind: "manual",
                displayName: f.get("displayName"),
              })}
            >
              <Field label="Display name">
                <Input name="displayName" required maxLength={200} />
              </Field>
            </CommandForm>
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer">
              Invite a registered participant or claim a manual identity
            </summary>
            <CommandForm
              label="Create secure invitation"
              build={(f) => {
                const token = Array.from(
                  crypto.getRandomValues(new Uint8Array(32)),
                  (x) => x.toString(16).padStart(2, "0"),
                ).join("");
                const body = {
                  ...base(),
                  kind: "invite",
                  email: f.get("email"),
                  claimParticipantId: f.get("claimParticipantId") || null,
                  token,
                };
                // Show the bearer link only after the invitation command is confirmed.
                pendingToken.current = token;
                return body;
              }}
              onSuccess={() => {
                if (pendingToken.current)
                  setLink(
                    `${location.origin}/sharing/invitations#token=${pendingToken.current}`,
                  );
                pendingToken.current = "";
              }}
            >
              <Field label="Verified email of invited person">
                <Input name="email" type="email" required maxLength={254} />
              </Field>
              <Field label="Identity being invited">
                <select className={selectClass} name="claimParticipantId">
                  <option value="">New participant</option>
                  {participants
                    .filter((p) => p.identityKind === "manual")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} · claim recorded history and balance
                      </option>
                    ))}
                </select>
              </Field>
              <p>
                Share the resulting link privately with the invited person. It
                expires in seven days. The recipient must sign in with the
                verified email and review history before accepting.
              </p>
            </CommandForm>
            {link && (
              <Field label="Secure invitation link">
                <Input
                  value={link}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                />
              </Field>
            )}
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer">
              Change name or archive
            </summary>
            <CommandForm
              build={(f) => ({
                ...base(),
                kind: "settings",
                name: f.get("name"),
                archived: f.get("archived") === "on",
              })}
            >
              <Field label="Group name">
                <Input
                  name="name"
                  defaultValue={group.name}
                  required
                  maxLength={200}
                />
              </Field>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="archived"
                  defaultChecked={group.archived}
                />
                Archive this group
              </label>
              <p>Archival keeps bill history and balances.</p>
            </CommandForm>
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer">
              Manage member roles or remove a member
            </summary>
            <CommandForm
              label="Apply membership change"
              build={(f) => ({
                ...base(),
                kind: "membership",
                participantId: f.get("participantId"),
                operation: f.get("operation"),
              })}
            >
              <Field label="Registered current member">
                <select className={selectClass} name="participantId" required>
                  {participants
                    .filter((p) => p.active)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.displayName} · {p.role}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Change">
                <select className={selectClass} name="operation">
                  <option value="owner">Make owner</option>
                  <option value="member">Make member</option>
                  <option value="remove">Remove from group</option>
                </select>
              </Field>
              <p>An unarchived group must retain an active owner.</p>
            </CommandForm>
          </details>
          <ul className="space-y-3">
            {data.invitations.map((i) => (
              <li key={i.id}>
                <p>
                  {i.email} · {i.state} · expires {i.expiresAt}
                </p>
                {i.state === "pending" && (
                  <CommandForm
                    label="Revoke invitation"
                    build={() => ({
                      ...base(),
                      kind: "revoke",
                      invitationId: i.id,
                    })}
                  >
                    <span className="sr-only">Revoke {i.email}</span>
                  </CommandForm>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {group.active && (
        <details>
          <summary className="min-h-11 cursor-pointer">Leave group</summary>
          <CommandForm
            label="Leave this group"
            build={() => ({
              ...base(),
              kind: "membership",
              participantId: group.participantId,
              operation: "leave",
            })}
          >
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" required />I understand balances and
              historical bills remain.
            </label>
          </CommandForm>
        </details>
      )}
    </section>
  );
}
