"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { Profile } from "@/modules/core/services/profile";
import type { ModulePreferenceItem } from "@/modules/core/services/list-module-preferences";

function useSettingsSave(url: string) {
  const router = useRouter();
  const pending = useRef<Record<string, unknown> | null>(null);
  const [state, setState] = useState<
    "idle" | "saving" | "uncertain" | "failed" | "saved"
  >("idle");
  async function save(values: Record<string, unknown>) {
    if (state === "saving" || state === "failed" || state === "saved") return;
    pending.current ??= { clientCommandId: crypto.randomUUID(), ...values };
    setState("saving");
    try {
      const r = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(pending.current),
        cache: "no-store",
      });
      if (r.ok) {
        setState("saved");
        router.refresh();
      } else if (r.status >= 500) setState("uncertain");
      else {
        setState("failed");
        router.refresh();
      }
    } catch {
      setState("uncertain");
    }
  }
  return { save, state, locked: state !== "idle" };
}
function SaveStatus({
  state,
}: {
  state: ReturnType<typeof useSettingsSave>["state"];
}) {
  return state === "uncertain" ? (
    <p role="alert" className="mt-3 text-warning">
      Save outcome unknown. Your entries are locked; retry sends the identical
      command.
    </p>
  ) : state === "failed" ? (
    <div role="alert" className="mt-3 text-danger">
      The change was not accepted. Reload current settings before editing.{" "}
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Reload settings
      </Button>
    </div>
  ) : state === "saved" ? (
    <p role="status" className="mt-3 text-success">
      Saved. Current settings are being refreshed.
    </p>
  ) : null;
}
export function ProfileForm({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.displayName);
  const command = useSettingsSave("/api/v1/settings/profile");
  return (
    <Panel
      title="Profile"
      description="Your display name appears in your private workspace. Your verified sign-in email is managed separately."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void command.save({
            expectedVersion: profile.version,
            displayName: name.trim(),
          });
        }}
        className="space-y-4"
      >
        <label className="block text-sm font-medium" htmlFor="display-name">
          Display name
        </label>
        <Input
          id="display-name"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          disabled={command.locked}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          loading={command.state === "saving"}
          disabled={command.state === "failed" || command.state === "saved"}
        >
          {command.state === "uncertain"
            ? "Retry same profile change"
            : "Save profile"}
        </Button>
        <SaveStatus state={command.state} />
      </form>
    </Panel>
  );
}
const labels = { money: "Money", career: "Career", time: "Calendar" };
export function ModulePreferenceForm({
  module,
}: {
  module: ModulePreferenceItem;
}) {
  const [values, setValues] = useState({
    enabled: module.enabled,
    agendaVisible: module.agendaVisible,
    remindersEnabled: module.remindersEnabled,
  });
  const command = useSettingsSave(
    `/api/v1/module-preferences/${module.moduleKey}`,
  );
  return (
    <fieldset className="rounded-card border border-border p-4">
      <legend className="px-1 font-semibold">{labels[module.moduleKey]}</legend>
      {(["enabled", "agendaVisible", "remindersEnabled"] as const).map(
        (key) => (
          <label key={key} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              className="size-4"
              type="checkbox"
              checked={values[key]}
              disabled={command.locked}
              onChange={(e) =>
                setValues({ ...values, [key]: e.target.checked })
              }
            />
            {key === "enabled"
              ? "Show module in normal access"
              : key === "agendaVisible"
                ? "Show source deadlines in Agenda"
                : "Enable in-app reminders"}
          </label>
        ),
      )}
      <p className="my-3 text-sm text-muted-foreground">
        {values.enabled ? "Visible" : "Hidden; records retained"}. Reports
        retain recorded history. Agenda visibility and reminder eligibility are
        separate controls.
      </p>
      <Button
        variant="secondary"
        loading={command.state === "saving"}
        disabled={command.state === "failed" || command.state === "saved"}
        onClick={() =>
          void command.save({ expectedVersion: module.version, ...values })
        }
      >
        {command.state === "uncertain"
          ? `Retry same ${labels[module.moduleKey]} preferences`
          : `Save ${labels[module.moduleKey]} preferences`}
      </Button>
      <SaveStatus state={command.state} />
    </fieldset>
  );
}
